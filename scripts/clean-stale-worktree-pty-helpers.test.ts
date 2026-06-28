import { describe, expect, test } from "bun:test";
import {
	isStaleWorktreePtyHelper,
	type ProcessRow,
	parseElapsedSeconds,
	parsePsOutput,
} from "./clean-stale-worktree-pty-helpers";

const rootDir = "/Users/example/worktrees/superset";

function row(overrides: Partial<ProcessRow> = {}): ProcessRow {
	return {
		pid: 123,
		ppid: 1,
		pgid: 123,
		rssKiB: 544,
		elapsedSeconds: 60 * 60,
		command: `${rootDir}/node_modules/.bun/node-pty@1.1.0/node_modules/node-pty/build/Release/spawn-helper ${rootDir} /bin/sh -i`,
		...overrides,
	};
}

describe("clean stale worktree pty helpers", () => {
	test("parses ps elapsed time formats", () => {
		expect(parseElapsedSeconds("00:09")).toBe(9);
		expect(parseElapsedSeconds("02:03")).toBe(123);
		expect(parseElapsedSeconds("01:02:03")).toBe(3723);
		expect(parseElapsedSeconds("1-01:02:03")).toBe(90_123);
		expect(parseElapsedSeconds("not-time")).toBeNull();
	});

	test("parses ps output rows with commands containing spaces", () => {
		const rows = parsePsOutput(
			` 31067     1 31067    544 01-00:24:35 ${rootDir}/node_modules/.bun/node-pty@1.1.0/node_modules/node-pty/build/Release/spawn-helper ${rootDir} /bin/bash -c sleep 60\n`,
		);

		expect(rows).toEqual([
			{
				pid: 31067,
				ppid: 1,
				pgid: 31067,
				rssKiB: 544,
				elapsedSeconds: 87_875,
				command: `${rootDir}/node_modules/.bun/node-pty@1.1.0/node_modules/node-pty/build/Release/spawn-helper ${rootDir} /bin/bash -c sleep 60`,
			},
		]);
	});

	test("matches only orphaned old node-pty spawn helpers in this worktree", () => {
		expect(
			isStaleWorktreePtyHelper(row(), {
				rootDir,
				minAgeMinutes: 30,
			}),
		).toBe(true);

		expect(
			isStaleWorktreePtyHelper(row({ ppid: 999 }), {
				rootDir,
				minAgeMinutes: 30,
			}),
		).toBe(false);
		expect(
			isStaleWorktreePtyHelper(row({ elapsedSeconds: 60 }), {
				rootDir,
				minAgeMinutes: 30,
			}),
		).toBe(false);
		expect(
			isStaleWorktreePtyHelper(
				row({ command: row().command.replaceAll(rootDir, "/other/repo") }),
				{
					rootDir,
					minAgeMinutes: 30,
				},
			),
		).toBe(false);
		expect(
			isStaleWorktreePtyHelper(
				row({
					command: `${rootDir}/node_modules/.bun/node-pty@1.1.0/node_modules/node-pty/build/Release/not-helper`,
				}),
				{
					rootDir,
					minAgeMinutes: 30,
				},
			),
		).toBe(false);
	});
});
