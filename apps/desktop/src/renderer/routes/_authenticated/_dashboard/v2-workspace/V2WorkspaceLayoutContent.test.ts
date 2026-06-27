import { describe, expect, test } from "bun:test";
import {
	extractV2WorkspaceId,
	isDefaultV2WorkspaceRoute,
} from "./V2WorkspaceLayoutContent";

describe("V2WorkspaceLayoutContent route matching", () => {
	test("matches exact workspace routes with or without a trailing slash", () => {
		expect(
			isDefaultV2WorkspaceRoute({
				workspaceId: "workspace-1",
				pathname: "/v2-workspace/workspace-1",
			}),
		).toBe(true);
		expect(
			isDefaultV2WorkspaceRoute({
				workspaceId: "workspace-1",
				pathname: "/v2-workspace/workspace-1/",
			}),
		).toBe(true);
	});

	test("matches hash-router workspace routes after a renderer refresh", () => {
		expect(
			isDefaultV2WorkspaceRoute({
				workspaceId: "workspace-1",
				pathname: "/",
				hash: "#/v2-workspace/workspace-1",
			}),
		).toBe(true);
	});

	test("does not match nested workspace subroutes", () => {
		expect(
			isDefaultV2WorkspaceRoute({
				workspaceId: "workspace-1",
				pathname: "/v2-workspace/workspace-1/chat",
			}),
		).toBe(false);
	});

	test("extracts the workspace id from hash routes when router matching misses", () => {
		expect(
			extractV2WorkspaceId({
				pathname: "/",
				hash: "#/v2-workspace/workspace-1",
			}),
		).toBe("workspace-1");
		expect(
			extractV2WorkspaceId({
				matchedWorkspaceId: "matched-workspace",
				pathname: "/",
				hash: "#/v2-workspace/hash-workspace",
			}),
		).toBe("matched-workspace");
	});
});
