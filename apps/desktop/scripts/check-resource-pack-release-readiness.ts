import { execFileSync } from "node:child_process";

interface ReadinessArgs {
	allowLocalBaseUrl: boolean;
	githubRepo?: string;
	requireFastRunnerVariable: boolean;
}

interface ReadinessResult {
	baseUrl: string;
	bucket: string;
	endpoint: string;
	githubActions?: GitHubActionsReadinessResult;
	region: string;
}

const REQUIRED_ENV_VARS = [
	"SUPERSET_OBJECT_STORAGE_ENDPOINT",
	"SUPERSET_OBJECT_STORAGE_BUCKET",
	"SUPERSET_OBJECT_STORAGE_ACCESS_KEY",
	"SUPERSET_OBJECT_STORAGE_SECRET_KEY",
	"SUPERSET_RESOURCE_PACK_BASE_URL",
] as const;

const REQUIRED_ACTIONS_SECRETS = [
	"SUPERSET_OBJECT_STORAGE_ENDPOINT",
	"SUPERSET_OBJECT_STORAGE_BUCKET",
	"SUPERSET_OBJECT_STORAGE_REGION",
	"SUPERSET_OBJECT_STORAGE_ACCESS_KEY",
	"SUPERSET_OBJECT_STORAGE_SECRET_KEY",
	"SUPERSET_RESOURCE_PACK_BASE_URL",
] as const;

const FAST_CANARY_RUNNER_VARIABLE = "DESKTOP_CANARY_MACOS_RUNNER";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function fail(message: string): never {
	console.error(`[check:resource-pack-release-readiness] ${message}`);
	process.exit(1);
}

export function parseResourcePackReadinessArgs(argv: string[]): ReadinessArgs {
	const parsed: ReadinessArgs = {
		allowLocalBaseUrl: false,
		requireFastRunnerVariable: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		switch (arg) {
			case "--allow-local-base-url":
				parsed.allowLocalBaseUrl = true;
				break;
			case "--github-repo": {
				const value = argv[index + 1];
				if (!value) fail("--github-repo requires a value");
				parsed.githubRepo = value;
				index += 1;
				break;
			}
			case "--require-fast-runner-variable":
				parsed.requireFastRunnerVariable = true;
				break;
			default:
				fail(`Unknown argument: ${arg}`);
		}
	}

	return parsed;
}

export interface GitHubActionsReadinessResult {
	invalidRequiredVariables: string[];
	missingRequiredSecrets: string[];
	missingRequiredVariables: string[];
	presentSecrets: string[];
	presentVariables: string[];
	repository: string;
}

export function checkGitHubActionsResourcePackReadiness(args: {
	repository: string;
	secretNames: readonly string[];
	variableNames: readonly string[];
	variableValues?: Readonly<Record<string, string>>;
	requireFastRunnerVariable?: boolean;
}): GitHubActionsReadinessResult {
	const requiredVariables = args.requireFastRunnerVariable
		? [FAST_CANARY_RUNNER_VARIABLE]
		: [];
	const secretSet = new Set(args.secretNames);
	const variableSet = new Set(args.variableNames);
	const invalidRequiredVariables = requiredVariables.filter((variable) => {
		if (!variableSet.has(variable)) return false;
		return !isFastCanaryRunnerValue(args.variableValues?.[variable]);
	});
	return {
		invalidRequiredVariables,
		missingRequiredSecrets: REQUIRED_ACTIONS_SECRETS.filter(
			(secret) => !secretSet.has(secret),
		),
		missingRequiredVariables: requiredVariables.filter(
			(variable) => !variableSet.has(variable),
		),
		presentSecrets: REQUIRED_ACTIONS_SECRETS.filter((secret) =>
			secretSet.has(secret),
		),
		presentVariables: requiredVariables.filter((variable) =>
			variableSet.has(variable),
		),
		repository: args.repository,
	};
}

function isFastCanaryRunnerValue(value: string | undefined): boolean {
	const normalized = value?.trim().toLowerCase();
	if (!normalized) return false;
	return !new Set(["macos-latest", "macos-13", "macos-14", "macos-15"]).has(
		normalized,
	);
}

function readGitHubNames(args: {
	kind: "secret" | "variable";
	repository: string;
}): string[] {
	const output = execFileSync(
		"gh",
		[args.kind, "list", "--repo", args.repository],
		{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
	);
	return output
		.split(/\r?\n/)
		.map((line) => line.trim().split(/\s+/)[0])
		.filter((name): name is string => Boolean(name));
}

function readGitHubVariables(repository: string): Record<string, string> {
	const output = execFileSync(
		"gh",
		["variable", "list", "--repo", repository, "--json", "name,value"],
		{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
	);
	const rows = JSON.parse(output) as Array<{ name?: string; value?: string }>;
	return Object.fromEntries(
		rows
			.filter(
				(row): row is { name: string; value: string } =>
					typeof row.name === "string" && typeof row.value === "string",
			)
			.map((row) => [row.name, row.value]),
	);
}

function requiredEnvValue(
	env: NodeJS.ProcessEnv,
	key: (typeof REQUIRED_ENV_VARS)[number],
): string {
	const value = env[key]?.trim();
	if (!value) {
		throw new Error(`Missing required environment variable: ${key}`);
	}
	return value;
}

function parseHttpUrl(name: string, value: string): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${name} must be a valid absolute URL`);
	}

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error(`${name} must use http or https`);
	}

	return url;
}

function assertResourcePackBaseUrlShape(url: URL): void {
	if (url.search || url.hash) {
		throw new Error(
			"SUPERSET_RESOURCE_PACK_BASE_URL must not include query parameters or a hash fragment.",
		);
	}

	const pathname = url.pathname.replace(/\/+$/, "");
	if (!pathname.endsWith("/packs")) {
		throw new Error(
			"SUPERSET_RESOURCE_PACK_BASE_URL must point at the public packs prefix, for example https://downloads.superset.sh/packs or https://host/bucket/packs.",
		);
	}
}

export function checkResourcePackReleaseReadiness(args: {
	allowLocalBaseUrl?: boolean;
	env: NodeJS.ProcessEnv;
	githubActions?: GitHubActionsReadinessResult;
}): ReadinessResult {
	const endpoint = requiredEnvValue(
		args.env,
		"SUPERSET_OBJECT_STORAGE_ENDPOINT",
	);
	const bucket = requiredEnvValue(args.env, "SUPERSET_OBJECT_STORAGE_BUCKET");
	requiredEnvValue(args.env, "SUPERSET_OBJECT_STORAGE_ACCESS_KEY");
	requiredEnvValue(args.env, "SUPERSET_OBJECT_STORAGE_SECRET_KEY");
	const baseUrl = requiredEnvValue(args.env, "SUPERSET_RESOURCE_PACK_BASE_URL");
	const region = args.env.SUPERSET_OBJECT_STORAGE_REGION?.trim() || "us-east-1";

	parseHttpUrl("SUPERSET_OBJECT_STORAGE_ENDPOINT", endpoint);
	const parsedBaseUrl = parseHttpUrl(
		"SUPERSET_RESOURCE_PACK_BASE_URL",
		baseUrl,
	);
	assertResourcePackBaseUrlShape(parsedBaseUrl);

	if (!args.allowLocalBaseUrl && LOCAL_HOSTS.has(parsedBaseUrl.hostname)) {
		throw new Error(
			"SUPERSET_RESOURCE_PACK_BASE_URL must be a public download URL for release builds; pass --allow-local-base-url only for local MinIO validation.",
		);
	}

	return {
		baseUrl,
		bucket,
		endpoint,
		...(args.githubActions ? { githubActions: args.githubActions } : {}),
		region,
	};
}

async function main() {
	const args = parseResourcePackReadinessArgs(process.argv.slice(2));
	const githubActions = args.githubRepo
		? (() => {
				const variableValues = readGitHubVariables(args.githubRepo);
				return checkGitHubActionsResourcePackReadiness({
					repository: args.githubRepo,
					secretNames: readGitHubNames({
						kind: "secret",
						repository: args.githubRepo,
					}),
					variableNames: Object.keys(variableValues),
					variableValues,
					requireFastRunnerVariable: args.requireFastRunnerVariable,
				});
			})()
		: undefined;
	if (githubActions?.missingRequiredSecrets.length) {
		throw new Error(
			`GitHub Actions repository ${githubActions.repository} is missing required resource-pack secrets: ${githubActions.missingRequiredSecrets.join(", ")}`,
		);
	}
	if (githubActions?.missingRequiredVariables.length) {
		throw new Error(
			`GitHub Actions repository ${githubActions.repository} is missing required performance variables: ${githubActions.missingRequiredVariables.join(", ")}`,
		);
	}
	if (githubActions?.invalidRequiredVariables.length) {
		throw new Error(
			`GitHub Actions repository ${githubActions.repository} has invalid performance variable values: ${githubActions.invalidRequiredVariables.join(", ")} must point at an enabled faster macOS runner label, not macos-latest or another standard macOS runner.`,
		);
	}
	const result = checkResourcePackReleaseReadiness({
		allowLocalBaseUrl: args.allowLocalBaseUrl,
		env: process.env,
		...(githubActions ? { githubActions } : {}),
	});

	console.log("# Resource Pack Release Readiness");
	console.log(`- Object storage endpoint: ${result.endpoint}`);
	console.log(`- Object storage bucket: ${result.bucket}`);
	console.log(`- Object storage region: ${result.region}`);
	console.log(`- Public base URL: ${result.baseUrl}`);
	if (result.githubActions) {
		console.log(`- GitHub repository: ${result.githubActions.repository}`);
		console.log(
			`- GitHub resource-pack secrets: ${result.githubActions.presentSecrets.length}/${REQUIRED_ACTIONS_SECRETS.length}`,
		);
		if (args.requireFastRunnerVariable) {
			console.log(
				`- GitHub fast Canary runner variable: ${result.githubActions.presentVariables.length}/1`,
			);
		}
	}
}

if (import.meta.main) {
	void main().catch((error) => {
		fail(error instanceof Error ? error.message : String(error));
	});
}
