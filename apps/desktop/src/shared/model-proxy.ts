export type ModelProviderProtocol = "anthropic" | "openai";

export interface ModelProviderModel {
	id: string;
	displayName?: string;
	providerId: string;
	lastFetchedAt?: string;
}

export interface ModelProviderSummary {
	id: string;
	name: string;
	protocol: ModelProviderProtocol;
	baseUrl: string;
	proxyUrl?: string;
	enabled: boolean;
	hasSecret: boolean;
	models: ModelProviderModel[];
	createdAt: string;
	updatedAt: string;
}

export interface UpsertModelProviderInput {
	id?: string;
	name: string;
	protocol: ModelProviderProtocol;
	baseUrl: string;
	proxyUrl?: string;
	enabled: boolean;
	secret?: string;
	models?: string[];
}

export interface ModelProxyStatus {
	running: boolean;
	baseUrl: string | null;
	port: number | null;
	tokenConfigured: boolean;
	enabledProviderCount: number;
	aggregatedModelCount: number;
	lastError?: string;
}

export interface SaveWorkspaceModelSettingsInput {
	workspaceId: string;
	haikuModel: string;
	sonnetModel: string;
	opusModel: string;
}

export interface SaveWorkspaceModelSettingsResult {
	settingsPath: string;
	createdClaudeDirectory: boolean;
	createdSettingsFile: boolean;
	replacedInvalidJson: boolean;
	replacedNonObjectEnv: boolean;
	preservedEnvKeys: string[];
	writtenEnvKeys: string[];
}
