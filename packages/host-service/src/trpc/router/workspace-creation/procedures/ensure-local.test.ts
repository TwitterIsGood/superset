import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "ensure-local.ts"), "utf8");
const ROUTER_SOURCE = readFileSync(
	join(import.meta.dir, "../workspace-creation.ts"),
	"utf8",
);

describe("workspaceCreation.ensureLocal", () => {
	test("recovers missing local workspace rows from the cloud workspace", () => {
		expect(SOURCE).toContain("ctx.api.v2Workspace.getFromHost.query");
		expect(SOURCE).toContain("verifiedCloudWorkspace");
		expect(SOURCE).toContain("cloud.hostId !== currentHostId");
		expect(SOURCE).toContain("cloud.organizationId !== ctx.organizationId");
		expect(SOURCE).toContain("ensureLocalProject");
		expect(SOURCE).toContain("ensureMainWorkspaceStrict");
		expect(SOURCE).toContain("adoptExistingWorktree");
		expect(SOURCE).toContain("existingWorkspaceId: cloud.id");
		expect(SOURCE).toContain("verifiedExistingWorkspace: cloud");
		expect(SOURCE).not.toContain("requireLocalProject");
	});

	test("is mounted on the host-service workspaceCreation router", () => {
		expect(ROUTER_SOURCE).toContain("ensureLocal");
		expect(ROUTER_SOURCE).toContain("workspaceCreationRouter = router");
	});
});
