import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import {
	chmod,
	mkdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import semver from "semver";
import {
	PACK_CACHE_DIR_NAME,
	type PackFileManifest,
	type PackInstallState,
	type PackManifest,
	type PackManifestIndex,
	type PackProgress,
	type PackResolution,
	type PackStatus,
	packManifestIndexSchema,
	packManifestSchema,
} from "./types";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type StatusListener = (status: PackStatus) => void;

interface PackManagerOptions {
	homeDir: string;
	manifestIndex: PackManifestIndex;
	appVersion?: string;
	fetchImpl?: FetchLike;
	now?: () => number;
}

interface VerifyResult {
	ok: boolean;
	issue: string | null;
}

const PACK_MANIFEST_CACHE_FILE = ".pack-manifest.json";

function ensureTrailingSlash(value: string): string {
	return value.endsWith("/") ? value : `${value}/`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch (error) {
		if (
			error instanceof Error &&
			"code" in error &&
			(error.code === "ENOENT" || error.code === "ENOTDIR")
		) {
			return false;
		}
		throw error;
	}
}

async function fileSize(path: string): Promise<number> {
	try {
		return (await stat(path)).size;
	} catch (error) {
		if (
			error instanceof Error &&
			"code" in error &&
			(error.code === "ENOENT" || error.code === "ENOTDIR")
		) {
			return 0;
		}
		throw error;
	}
}

async function sha256File(path: string): Promise<string> {
	const hash = createHash("sha256");
	await new Promise<void>((resolvePromise, reject) => {
		const stream = createReadStream(path);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("error", reject);
		stream.on("end", resolvePromise);
	});
	return hash.digest("hex");
}

function createStatus(args: {
	packId: string;
	version: string | null;
	status: PackInstallState;
	installedPath: string | null;
	progress?: PackProgress | null;
	error?: string | null;
	now: () => number;
}): PackStatus {
	return {
		packId: args.packId,
		version: args.version,
		status: args.status,
		installedPath: args.installedPath,
		progress: args.progress ?? null,
		error: args.error ?? null,
		updatedAt: args.now(),
	};
}

export class PackManager {
	private readonly cacheRoot: string;
	private readonly fetchImpl: FetchLike;
	private readonly now: () => number;
	private readonly manifestIndex: PackManifestIndex;
	private readonly appVersion: string | undefined;
	private readonly emitter = new EventEmitter();
	private readonly statuses = new Map<string, PackStatus>();
	private readonly inFlightResolves = new Map<
		string,
		Promise<PackResolution>
	>();

	constructor(options: PackManagerOptions) {
		const manifestIndex = packManifestIndexSchema.parse(options.manifestIndex);
		this.cacheRoot = join(options.homeDir, PACK_CACHE_DIR_NAME);
		this.fetchImpl = options.fetchImpl ?? fetch;
		this.now = options.now ?? Date.now;
		this.manifestIndex = manifestIndex;
		this.appVersion = options.appVersion;
	}

	onStatusChange(listener: StatusListener): () => void {
		this.emitter.on("status", listener);
		return () => {
			this.emitter.off("status", listener);
		};
	}

	async getStatus(packId: string): Promise<PackStatus> {
		const current = this.statuses.get(packId);
		if (
			current?.status === "downloading" ||
			current?.status === "verifying" ||
			current?.status === "error"
		) {
			return current;
		}

		const manifest = this.selectManifest(packId);
		if (!manifest) {
			return this.setStatus(
				createStatus({
					packId,
					version: null,
					status: "not_configured",
					installedPath: null,
					error: `Pack "${packId}" is not configured for this app build.`,
					now: this.now,
				}),
			);
		}

		const packRoot = this.getPackRoot(manifest);
		const verifyResult = await this.verifyPack(manifest);
		if (verifyResult.ok) {
			return this.setStatus(
				createStatus({
					packId,
					version: manifest.version,
					status: "installed",
					installedPath: packRoot,
					now: this.now,
				}),
			);
		}

		return this.setStatus(
			createStatus({
				packId,
				version: manifest.version,
				status: "missing",
				installedPath: null,
				error: verifyResult.issue,
				now: this.now,
			}),
		);
	}

	resolvePack(packId: string): Promise<PackResolution> {
		const inFlight = this.inFlightResolves.get(packId);
		if (inFlight) return inFlight;

		const promise = this.resolvePackInternal(packId).finally(() => {
			this.inFlightResolves.delete(packId);
		});
		this.inFlightResolves.set(packId, promise);
		return promise;
	}

	getPackPath(packId: string): string | null {
		const status = this.statuses.get(packId);
		return status?.status === "installed" ? status.installedPath : null;
	}

	private async resolvePackInternal(packId: string): Promise<PackResolution> {
		const manifest = this.selectManifest(packId);
		if (!manifest) {
			const status = this.setStatus(
				createStatus({
					packId,
					version: null,
					status: "not_configured",
					installedPath: null,
					error: `Pack "${packId}" is not configured for this app build.`,
					now: this.now,
				}),
			);
			return {
				ok: false,
				status,
				error: status.error ?? "Pack not configured",
			};
		}

		const packRoot = this.getPackRoot(manifest);
		try {
			this.setStatus(
				createStatus({
					packId,
					version: manifest.version,
					status: "verifying",
					installedPath: null,
					progress: {
						phase: "verifying",
						filePath: null,
						fileIndex: 0,
						fileCount: manifest.files.length,
						bytesDownloaded: 0,
						totalBytes: this.totalBytes(manifest),
					},
					now: this.now,
				}),
			);

			const cached = await this.verifyPack(manifest);
			if (!cached.ok) {
				await this.downloadPack(manifest);
			}

			const verified = await this.verifyPack(manifest);
			if (!verified.ok) {
				throw new Error(verified.issue ?? "Pack verification failed");
			}

			const status = this.setStatus(
				createStatus({
					packId,
					version: manifest.version,
					status: "installed",
					installedPath: packRoot,
					now: this.now,
				}),
			);
			return {
				ok: true,
				status,
				path: packRoot,
				executeHint: manifest.executeHint ?? null,
			};
		} catch (error) {
			const status = this.setStatus(
				createStatus({
					packId,
					version: manifest.version,
					status: "error",
					installedPath: null,
					error: errorMessage(error),
					now: this.now,
				}),
			);
			return {
				ok: false,
				status,
				error: status.error ?? "Pack resolve failed",
			};
		}
	}

	private selectManifest(packId: string): PackManifest | null {
		const manifests = this.manifestIndex.packs[packId] ?? [];
		const compatible = manifests.filter((manifest) => {
			if (manifest.packId !== packId) return false;
			if (!semver.valid(manifest.version)) return false;
			if (!this.appVersion || !semver.valid(this.appVersion)) return true;
			if (
				manifest.minAppVersion &&
				semver.valid(manifest.minAppVersion) &&
				semver.lt(this.appVersion, manifest.minAppVersion)
			) {
				return false;
			}
			if (
				manifest.appVersionRange &&
				!semver.satisfies(this.appVersion, manifest.appVersionRange, {
					includePrerelease: true,
				})
			) {
				return false;
			}
			return true;
		});

		compatible.sort((left, right) =>
			semver.rcompare(left.version, right.version),
		);
		return compatible[0] ?? null;
	}

	private setStatus(status: PackStatus): PackStatus {
		this.statuses.set(status.packId, status);
		this.emitter.emit("status", status);
		return status;
	}

	private getPackRoot(manifest: PackManifest): string {
		return join(this.cacheRoot, manifest.packId, manifest.version);
	}

	private getManifestFilePath(manifest: PackManifest): string {
		return join(this.getPackRoot(manifest), PACK_MANIFEST_CACHE_FILE);
	}

	private getPackFilePath(
		manifest: PackManifest,
		file: PackFileManifest,
	): string {
		const packRoot = this.getPackRoot(manifest);
		const target = resolve(packRoot, file.path);
		const rootWithSeparator = packRoot.endsWith(sep)
			? packRoot
			: `${packRoot}${sep}`;
		if (target !== packRoot && !target.startsWith(rootWithSeparator)) {
			throw new Error(`Pack file escapes cache root: ${file.path}`);
		}
		return target;
	}

	private totalBytes(manifest: PackManifest): number {
		return manifest.files.reduce((total, file) => total + file.size, 0);
	}

	private async verifyPack(manifest: PackManifest): Promise<VerifyResult> {
		for (const file of manifest.files) {
			const result = await this.verifyFile(manifest, file);
			if (!result.ok) return result;
		}

		const cachedManifestPath = this.getManifestFilePath(manifest);
		if (await fileExists(cachedManifestPath)) {
			const cachedManifest = packManifestSchema.safeParse(
				JSON.parse(await readFile(cachedManifestPath, "utf8")),
			);
			if (!cachedManifest.success) {
				return {
					ok: false,
					issue: "Cached pack manifest is invalid.",
				};
			}
			if (
				cachedManifest.data.packId !== manifest.packId ||
				cachedManifest.data.version !== manifest.version
			) {
				return {
					ok: false,
					issue: "Cached pack manifest does not match the selected pack.",
				};
			}
		}

		return { ok: true, issue: null };
	}

	private async verifyFile(
		manifest: PackManifest,
		file: PackFileManifest,
	): Promise<VerifyResult> {
		const targetPath = this.getPackFilePath(manifest, file);
		let stats: Awaited<ReturnType<typeof stat>>;
		try {
			stats = await stat(targetPath);
		} catch (error) {
			if (
				error instanceof Error &&
				"code" in error &&
				(error.code === "ENOENT" || error.code === "ENOTDIR")
			) {
				return { ok: false, issue: `Pack file is missing: ${file.path}` };
			}
			throw error;
		}

		if (!stats.isFile()) {
			return { ok: false, issue: `Pack path is not a file: ${file.path}` };
		}
		if (stats.size !== file.size) {
			return {
				ok: false,
				issue: `Pack file size mismatch: ${file.path}`,
			};
		}

		const digest = await sha256File(targetPath);
		if (digest.toLowerCase() !== file.sha256.toLowerCase()) {
			return {
				ok: false,
				issue: `Pack file hash mismatch: ${file.path}`,
			};
		}
		return { ok: true, issue: null };
	}

	private async downloadPack(manifest: PackManifest): Promise<void> {
		await mkdir(this.getPackRoot(manifest), { recursive: true, mode: 0o700 });
		const totalBytes = this.totalBytes(manifest);
		let completedBytes = 0;

		for (const [index, file] of manifest.files.entries()) {
			const currentFile = await this.verifyFile(manifest, file);
			if (currentFile.ok) {
				completedBytes += file.size;
				continue;
			}

			const targetPath = this.getPackFilePath(manifest, file);
			await mkdir(dirname(targetPath), { recursive: true, mode: 0o700 });
			await this.downloadFile({
				manifest,
				file,
				targetPath,
				fileIndex: index + 1,
				fileCount: manifest.files.length,
				completedBytes,
				totalBytes,
			});
			completedBytes += file.size;
		}

		await writeFile(
			this.getManifestFilePath(manifest),
			`${JSON.stringify(manifest, null, 2)}\n`,
			{ mode: 0o600 },
		);
	}

	private async downloadFile(args: {
		manifest: PackManifest;
		file: PackFileManifest;
		targetPath: string;
		fileIndex: number;
		fileCount: number;
		completedBytes: number;
		totalBytes: number;
	}): Promise<void> {
		const tempPath = `${args.targetPath}.download`;
		let resumeOffset = await fileSize(tempPath);
		if (resumeOffset >= args.file.size) {
			await rm(tempPath, { force: true });
			resumeOffset = 0;
		}

		const headers = new Headers();
		if (resumeOffset > 0) {
			headers.set("range", `bytes=${resumeOffset}-`);
		}

		const response = await this.fetchImpl(this.fileDownloadUrl(args), {
			headers,
		});
		if (!response.ok) {
			throw new Error(
				`Pack file download failed for ${args.file.path} with HTTP ${response.status}.`,
			);
		}

		let writeMode: "append" | "replace" = "replace";
		if (resumeOffset > 0 && response.status === 206) {
			writeMode = "append";
		} else if (resumeOffset > 0) {
			await rm(tempPath, { force: true });
			resumeOffset = 0;
		}

		await this.writeResponseToFile({
			response,
			tempPath,
			writeMode,
			baseBytes: resumeOffset,
			file: args.file,
			fileIndex: args.fileIndex,
			fileCount: args.fileCount,
			completedBytes: args.completedBytes,
			totalBytes: args.totalBytes,
			packId: args.manifest.packId,
			version: args.manifest.version,
		});

		const tempStats = await stat(tempPath);
		if (tempStats.size !== args.file.size) {
			throw new Error(`Downloaded pack file size mismatch: ${args.file.path}`);
		}
		const digest = await sha256File(tempPath);
		if (digest.toLowerCase() !== args.file.sha256.toLowerCase()) {
			throw new Error(`Downloaded pack file hash mismatch: ${args.file.path}`);
		}

		await rm(args.targetPath, { force: true });
		await rename(tempPath, args.targetPath);
		if (args.file.executable) {
			await chmod(args.targetPath, 0o755);
		}
	}

	private fileDownloadUrl(args: {
		manifest: PackManifest;
		file: PackFileManifest;
	}): string {
		if (args.file.downloadUrl) return args.file.downloadUrl;
		return new URL(
			args.file.path,
			ensureTrailingSlash(args.manifest.downloadUrl),
		).href;
	}

	private async writeResponseToFile(args: {
		response: Response;
		tempPath: string;
		writeMode: "append" | "replace";
		baseBytes: number;
		file: PackFileManifest;
		fileIndex: number;
		fileCount: number;
		completedBytes: number;
		totalBytes: number;
		packId: string;
		version: string;
	}): Promise<void> {
		if (!args.response.body) {
			const body = new Uint8Array(await args.response.arrayBuffer());
			await writeFile(args.tempPath, body, {
				flag: args.writeMode === "append" ? "a" : "w",
			});
			this.emitDownloadProgress({
				...args,
				fileBytesDownloaded: args.baseBytes + body.byteLength,
			});
			return;
		}

		const writer = createWriteStream(args.tempPath, {
			flags: args.writeMode === "append" ? "a" : "w",
			mode: 0o600,
		});
		const reader = args.response.body.getReader();
		let fileBytesDownloaded = args.baseBytes;

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (!value) continue;
				await new Promise<void>((resolvePromise, reject) => {
					writer.write(value, (error) => {
						if (error) reject(error);
						else resolvePromise();
					});
				});
				fileBytesDownloaded += value.byteLength;
				this.emitDownloadProgress({
					...args,
					fileBytesDownloaded,
				});
			}
		} finally {
			reader.releaseLock();
			await new Promise<void>((resolvePromise, reject) => {
				writer.end((error: Error | null | undefined) => {
					if (error) reject(error);
					else resolvePromise();
				});
			});
		}
	}

	private emitDownloadProgress(args: {
		packId: string;
		version: string;
		file: PackFileManifest;
		fileIndex: number;
		fileCount: number;
		completedBytes: number;
		fileBytesDownloaded: number;
		totalBytes: number;
	}): void {
		this.setStatus(
			createStatus({
				packId: args.packId,
				version: args.version,
				status: "downloading",
				installedPath: null,
				progress: {
					phase: "downloading",
					filePath: args.file.path,
					fileIndex: args.fileIndex,
					fileCount: args.fileCount,
					bytesDownloaded: Math.min(
						args.completedBytes + args.fileBytesDownloaded,
						args.totalBytes,
					),
					totalBytes: args.totalBytes,
				},
				now: this.now,
			}),
		);
	}
}
