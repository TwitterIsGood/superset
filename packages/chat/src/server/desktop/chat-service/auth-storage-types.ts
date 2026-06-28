export type AuthMethod = "api_key" | "oauth" | "env" | null;
export type AuthSource = "external" | "managed" | null;
export type AuthIssue = "expired" | null;

export interface AuthStatus {
	authenticated: boolean;
	method: AuthMethod;
	source: AuthSource;
	issue: AuthIssue;
	hasManagedOAuth?: boolean;
}

export interface ApiKeyCredential {
	type: "api_key";
	key: string;
}

export interface OAuthCredential {
	type: "oauth";
	access: string;
	refresh?: string;
	expires: number;
	accountId?: string;
}

export type AuthStorageCredential = ApiKeyCredential | OAuthCredential;

export interface OAuthAuthInfo {
	url: string;
	instructions?: string;
}

export interface OAuthLoginCallbacks {
	onAuth: (info: OAuthAuthInfo) => void;
	onPrompt: (prompt: { message: string }) => Promise<string>;
	onProgress?: (message: string) => void;
	onManualCodeInput?: () => Promise<string>;
	signal?: AbortSignal;
}

export interface AuthStorageLike {
	reload(): void;
	save?(): void;
	get(provider: string): AuthStorageCredential | undefined;
	set(provider: string, credential: AuthStorageCredential): void;
	remove(provider: string): void;
	list?(): string[];
	has?(provider: string): boolean;
	isLoggedIn?(provider: string): boolean;
	hasStoredApiKey(provider: string): boolean;
	getStoredApiKey(provider: string): string | undefined;
	setStoredApiKey(provider: string, key: string, envVar?: string): void;
	loadStoredApiKeysIntoEnv?(providerEnvVars: Record<string, string>): void;
	login(providerId: string, callbacks: OAuthLoginCallbacks): Promise<void>;
	logout?(provider: string): void;
	getApiKey(providerId: string): Promise<string | undefined>;
}

export type StoredOAuthCredential = OAuthCredential;
