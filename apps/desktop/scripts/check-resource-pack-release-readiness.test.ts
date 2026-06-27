import { describe, expect, it } from "bun:test";
import {
	checkGitHubActionsResourcePackReadiness,
	checkResourcePackReleaseReadiness,
	parseResourcePackReadinessArgs,
} from "./check-resource-pack-release-readiness";

const COMPLETE_ENV = {
	SUPERSET_OBJECT_STORAGE_ACCESS_KEY: "access",
	SUPERSET_OBJECT_STORAGE_BUCKET: "superset-artifacts",
	SUPERSET_OBJECT_STORAGE_ENDPOINT: "https://s3.us-east-1.amazonaws.com",
	SUPERSET_OBJECT_STORAGE_REGION: "us-east-1",
	SUPERSET_OBJECT_STORAGE_SECRET_KEY: "secret",
	SUPERSET_RESOURCE_PACK_BASE_URL: "https://cdn.superset.sh/packs",
};

describe("parseResourcePackReadinessArgs", () => {
	it("parses the local-base-url escape hatch", () => {
		expect(parseResourcePackReadinessArgs(["--allow-local-base-url"])).toEqual({
			allowLocalBaseUrl: true,
			requireFastRunnerVariable: false,
		});
	});

	it("parses GitHub Actions repository and fast-runner requirements", () => {
		expect(
			parseResourcePackReadinessArgs([
				"--github-repo",
				"TwitterIsGood/superset",
				"--require-fast-runner-variable",
			]),
		).toEqual({
			allowLocalBaseUrl: false,
			githubRepo: "TwitterIsGood/superset",
			requireFastRunnerVariable: true,
		});
	});
});

describe("checkResourcePackReleaseReadiness", () => {
	it("accepts a complete public object-storage configuration", () => {
		expect(
			checkResourcePackReleaseReadiness({ env: COMPLETE_ENV }),
		).toMatchObject({
			baseUrl: "https://cdn.superset.sh/packs",
			bucket: "superset-artifacts",
			endpoint: "https://s3.us-east-1.amazonaws.com",
			region: "us-east-1",
		});
	});

	it("reports the first missing required value", () => {
		expect(() =>
			checkResourcePackReleaseReadiness({
				env: {
					...COMPLETE_ENV,
					SUPERSET_RESOURCE_PACK_BASE_URL: "",
				},
			}),
		).toThrow("SUPERSET_RESOURCE_PACK_BASE_URL");
	});

	it("rejects localhost public base URLs for release builds", () => {
		expect(() =>
			checkResourcePackReleaseReadiness({
				env: {
					...COMPLETE_ENV,
					SUPERSET_RESOURCE_PACK_BASE_URL: "http://localhost:9000/packs",
				},
			}),
		).toThrow("public download URL");
	});

	it("rejects public base URLs that do not point at the packs prefix", () => {
		expect(() =>
			checkResourcePackReleaseReadiness({
				env: {
					...COMPLETE_ENV,
					SUPERSET_RESOURCE_PACK_BASE_URL: "https://cdn.superset.sh/",
				},
			}),
		).toThrow("public packs prefix");
		expect(() =>
			checkResourcePackReleaseReadiness({
				env: {
					...COMPLETE_ENV,
					SUPERSET_RESOURCE_PACK_BASE_URL:
						"https://cdn.superset.sh/superset-artifacts",
				},
			}),
		).toThrow("public packs prefix");
	});

	it("rejects public base URLs with query strings or fragments", () => {
		expect(() =>
			checkResourcePackReleaseReadiness({
				env: {
					...COMPLETE_ENV,
					SUPERSET_RESOURCE_PACK_BASE_URL:
						"https://cdn.superset.sh/packs?token=abc",
				},
			}),
		).toThrow("query parameters");
		expect(() =>
			checkResourcePackReleaseReadiness({
				env: {
					...COMPLETE_ENV,
					SUPERSET_RESOURCE_PACK_BASE_URL: "https://cdn.superset.sh/packs#v1",
				},
			}),
		).toThrow("query parameters");
	});

	it("allows localhost only for explicit local MinIO validation", () => {
		expect(
			checkResourcePackReleaseReadiness({
				allowLocalBaseUrl: true,
				env: {
					...COMPLETE_ENV,
					SUPERSET_RESOURCE_PACK_BASE_URL: "http://127.0.0.1:9000/packs",
				},
			}),
		).toMatchObject({
			baseUrl: "http://127.0.0.1:9000/packs",
		});
	});
});

describe("checkGitHubActionsResourcePackReadiness", () => {
	const requiredSecretNames = [
		"SUPERSET_OBJECT_STORAGE_ENDPOINT",
		"SUPERSET_OBJECT_STORAGE_BUCKET",
		"SUPERSET_OBJECT_STORAGE_REGION",
		"SUPERSET_OBJECT_STORAGE_ACCESS_KEY",
		"SUPERSET_OBJECT_STORAGE_SECRET_KEY",
		"SUPERSET_RESOURCE_PACK_BASE_URL",
	];

	it("reports missing required resource-pack secrets", () => {
		const result = checkGitHubActionsResourcePackReadiness({
			repository: "TwitterIsGood/superset",
			secretNames: ["NEXT_PUBLIC_API_URL"],
			variableNames: [],
		});

		expect(result.missingRequiredSecrets).toEqual(requiredSecretNames);
		expect(result.presentSecrets).toEqual([]);
	});

	it("requires the fast Canary runner variable only when requested", () => {
		expect(
			checkGitHubActionsResourcePackReadiness({
				repository: "TwitterIsGood/superset",
				secretNames: requiredSecretNames,
				variableNames: [],
			}).missingRequiredVariables,
		).toEqual([]);
		expect(
			checkGitHubActionsResourcePackReadiness({
				repository: "TwitterIsGood/superset",
				secretNames: requiredSecretNames,
				variableNames: [],
				requireFastRunnerVariable: true,
			}).missingRequiredVariables,
		).toEqual(["DESKTOP_CANARY_MACOS_RUNNER"]);
	});

	it("rejects standard macOS runners for the fast Canary runner variable", () => {
		const result = checkGitHubActionsResourcePackReadiness({
			repository: "TwitterIsGood/superset",
			secretNames: requiredSecretNames,
			variableNames: ["DESKTOP_CANARY_MACOS_RUNNER"],
			variableValues: {
				DESKTOP_CANARY_MACOS_RUNNER: "macos-latest",
			},
			requireFastRunnerVariable: true,
		});

		expect(result.missingRequiredVariables).toEqual([]);
		expect(result.invalidRequiredVariables).toEqual([
			"DESKTOP_CANARY_MACOS_RUNNER",
		]);
	});

	it("passes when required secrets and variables are present", () => {
		const result = checkGitHubActionsResourcePackReadiness({
			repository: "TwitterIsGood/superset",
			secretNames: requiredSecretNames,
			variableNames: ["DESKTOP_CANARY_MACOS_RUNNER"],
			variableValues: {
				DESKTOP_CANARY_MACOS_RUNNER: "macos-14-xlarge",
			},
			requireFastRunnerVariable: true,
		});

		expect(result.missingRequiredSecrets).toEqual([]);
		expect(result.missingRequiredVariables).toEqual([]);
		expect(result.invalidRequiredVariables).toEqual([]);
		expect(result.presentVariables).toEqual(["DESKTOP_CANARY_MACOS_RUNNER"]);
	});
});
