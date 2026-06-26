import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import type {
	AuthStorageCredential,
	AuthStorageLike,
	OAuthLoginCallbacks,
} from "./auth-storage-types";

const MASTRACODE_IMPORT_PATH_ENV = "SUPERSET_MASTRACODE_RUNTIME_IMPORT_PATH";

export type ResolveMastracodeAuthStorageImport = () => Promise<string | null>;

interface SupersetAuthStorageOptions {
	authPath?: string;
	resolveMastracodeImportPath?: ResolveMastracodeAuthStorageImport;
}

type MastracodeAuthStorageModule = {
	createAuthStorage: () => AuthStorageLike;
};

function getAppDataDir(): string {
	const currentPlatform = platform();
	const baseDir =
		currentPlatform === "darwin"
			? join(homedir(), "Library", "Application Support")
			: currentPlatform === "win32"
				? (process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"))
				: (process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"));
	const appDir = join(baseDir, "mastracode");
	if (!existsSync(appDir)) {
		mkdirSync(appDir, { recursive: true, mode: 0o700 });
	}
	return appDir;
}

function defaultAuthPath(): string {
	return join(getAppDataDir(), "auth.json");
}

function toDynamicImportSpecifier(pathOrSpecifier: string): string {
	if (pathOrSpecifier.startsWith("file:")) return pathOrSpecifier;
	if (isAbsolute(pathOrSpecifier)) return pathToFileURL(pathOrSpecifier).href;
	return pathOrSpecifier;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseCredential(value: unknown): AuthStorageCredential | undefined {
	if (!isObjectRecord(value)) return undefined;
	if (value.type === "api_key" && typeof value.key === "string") {
		return { type: "api_key", key: value.key };
	}
	if (value.type === "oauth" && typeof value.access === "string") {
		const credential: AuthStorageCredential = {
			type: "oauth",
			access: value.access,
			expires: typeof value.expires === "number" ? value.expires : 0,
		};
		if (typeof value.refresh === "string") credential.refresh = value.refresh;
		if (typeof value.accountId === "string") {
			credential.accountId = value.accountId;
		}
		return credential;
	}
	return undefined;
}

function readAuthData(authPath: string): Record<string, AuthStorageCredential> {
	if (!existsSync(authPath)) return {};
	try {
		const raw = JSON.parse(readFileSync(authPath, "utf-8"));
		if (!isObjectRecord(raw)) return {};
		const data: Record<string, AuthStorageCredential> = {};
		for (const [provider, value] of Object.entries(raw)) {
			const credential = parseCredential(value);
			if (credential) data[provider] = credential;
		}
		return data;
	} catch {
		return {};
	}
}

export class SupersetAuthStorage implements AuthStorageLike {
	private data: Record<string, AuthStorageCredential> = {};
	private readonly authPath: string;
	private readonly resolveMastracodeImportPath:
		| ResolveMastracodeAuthStorageImport
		| undefined;

	constructor(options?: SupersetAuthStorageOptions) {
		this.authPath = options?.authPath ?? defaultAuthPath();
		this.resolveMastracodeImportPath = options?.resolveMastracodeImportPath;
		this.reload();
	}

	reload(): void {
		this.data = readAuthData(this.authPath);
	}

	save(): void {
		const dir = dirname(this.authPath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true, mode: 0o700 });
		}
		writeFileSync(this.authPath, JSON.stringify(this.data, null, 2), "utf-8");
		chmodSync(this.authPath, 0o600);
	}

	get(provider: string): AuthStorageCredential | undefined {
		return this.data[provider];
	}

	set(provider: string, credential: AuthStorageCredential): void {
		this.data[provider] = credential;
		this.save();
	}

	remove(provider: string): void {
		delete this.data[provider];
		this.save();
	}

	list(): string[] {
		return Object.keys(this.data);
	}

	has(provider: string): boolean {
		return provider in this.data;
	}

	isLoggedIn(provider: string): boolean {
		return this.data[provider]?.type === "oauth";
	}

	hasStoredApiKey(provider: string): boolean {
		return Boolean(this.getStoredApiKey(provider));
	}

	getStoredApiKey(provider: string): string | undefined {
		const credential = this.data[`apikey:${provider}`];
		return credential?.type === "api_key" && credential.key.length > 0
			? credential.key
			: undefined;
	}

	setStoredApiKey(provider: string, key: string, envVar?: string): void {
		this.set(`apikey:${provider}`, { type: "api_key", key });
		if (envVar) process.env[envVar] = key;
	}

	loadStoredApiKeysIntoEnv(providerEnvVars: Record<string, string>): void {
		for (const [key, credential] of Object.entries(this.data)) {
			if (!key.startsWith("apikey:") || credential.type !== "api_key") {
				continue;
			}
			const provider = key.slice("apikey:".length);
			const envVar = providerEnvVars[provider];
			if (envVar && !process.env[envVar]) {
				process.env[envVar] = credential.key;
			}
		}
	}

	async login(
		providerId: string,
		callbacks: OAuthLoginCallbacks,
	): Promise<void> {
		const delegate = await this.createDelegateAuthStorage();
		await delegate.login(providerId, callbacks);
		this.reload();
	}

	logout(provider: string): void {
		this.remove(provider);
	}

	async getApiKey(providerId: string): Promise<string | undefined> {
		const credential = this.data[providerId];
		if (credential?.type === "api_key") return credential.key;
		if (credential?.type !== "oauth") return undefined;
		if (Date.now() < credential.expires) return credential.access;

		const delegate = await this.createDelegateAuthStorage();
		const key = await delegate.getApiKey(providerId);
		this.reload();
		return key;
	}

	private async createDelegateAuthStorage(): Promise<AuthStorageLike> {
		const override = await this.resolveMastracodeImportPath?.();
		const specifier = toDynamicImportSpecifier(
			override?.trim() ||
				process.env[MASTRACODE_IMPORT_PATH_ENV]?.trim() ||
				"mastracode",
		);
		try {
			const module = (await import(specifier)) as MastracodeAuthStorageModule;
			return module.createAuthStorage();
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			throw new Error(
				`MastraCode auth runtime is unavailable for OAuth flow: ${reason}`,
			);
		}
	}
}

export function createSupersetAuthStorage(
	options?: SupersetAuthStorageOptions,
): AuthStorageLike {
	return new SupersetAuthStorage(options);
}
