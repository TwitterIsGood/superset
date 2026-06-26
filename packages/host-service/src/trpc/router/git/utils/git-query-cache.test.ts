import { describe, expect, test } from "bun:test";
import { GitQueryCache } from "./git-query-cache";

describe("GitQueryCache", () => {
	test("coalesces duplicate workspace queries during the TTL window", async () => {
		let now = 1_000;
		let runs = 0;
		const cache = new GitQueryCache({ now: () => now });

		const first = cache.run({
			workspaceId: "workspace-1",
			requestKey: "branches",
			ttlMs: 1_000,
			run: async () => {
				runs++;
				return "first";
			},
		});
		const second = cache.run({
			workspaceId: "workspace-1",
			requestKey: "branches",
			ttlMs: 1_000,
			run: async () => {
				runs++;
				return "second";
			},
		});

		expect(second).toBe(first);
		await expect(first).resolves.toBe("first");
		await expect(second).resolves.toBe("first");
		expect(runs).toBe(1);

		now = 2_001;
		await expect(
			cache.run({
				workspaceId: "workspace-1",
				requestKey: "branches",
				ttlMs: 1_000,
				run: async () => {
					runs++;
					return "after-expiry";
				},
			}),
		).resolves.toBe("after-expiry");
		expect(runs).toBe(2);
	});

	test("keeps workspaces and request keys isolated", async () => {
		const cache = new GitQueryCache({ now: () => 1_000 });
		let runs = 0;
		const run = async () => {
			runs++;
			return runs;
		};

		await expect(
			cache.run({
				workspaceId: "workspace-1",
				requestKey: "branches",
				ttlMs: 1_000,
				run,
			}),
		).resolves.toBe(1);
		await expect(
			cache.run({
				workspaceId: "workspace-2",
				requestKey: "branches",
				ttlMs: 1_000,
				run,
			}),
		).resolves.toBe(2);
		await expect(
			cache.run({
				workspaceId: "workspace-1",
				requestKey: "commits",
				ttlMs: 1_000,
				run,
			}),
		).resolves.toBe(3);
		expect(runs).toBe(3);
	});

	test("evicts rejected queries", async () => {
		const cache = new GitQueryCache({ now: () => 1_000 });
		let runs = 0;

		await expect(
			cache.run({
				workspaceId: "workspace-1",
				requestKey: "status",
				ttlMs: 1_000,
				run: async () => {
					runs++;
					throw new Error("git failed");
				},
			}),
		).rejects.toThrow("git failed");

		await expect(
			cache.run({
				workspaceId: "workspace-1",
				requestKey: "status",
				ttlMs: 1_000,
				run: async () => {
					runs++;
					return "fresh";
				},
			}),
		).resolves.toBe("fresh");
		expect(runs).toBe(2);
	});

	test("clears all entries for a workspace", async () => {
		const cache = new GitQueryCache({ now: () => 1_000 });
		let runs = 0;
		const run = async () => {
			runs++;
			return runs;
		};

		await cache.run({
			workspaceId: "workspace-1",
			requestKey: "branches",
			ttlMs: 1_000,
			run,
		});
		await cache.run({
			workspaceId: "workspace-2",
			requestKey: "branches",
			ttlMs: 1_000,
			run,
		});

		cache.clearWorkspace("workspace-1");

		await expect(
			cache.run({
				workspaceId: "workspace-1",
				requestKey: "branches",
				ttlMs: 1_000,
				run,
			}),
		).resolves.toBe(3);
		await expect(
			cache.run({
				workspaceId: "workspace-2",
				requestKey: "branches",
				ttlMs: 1_000,
				run,
			}),
		).resolves.toBe(2);
		expect(runs).toBe(3);
	});
});
