import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseDesktopPerfFixtureArgs } from "./desktop-perf-fixture";
import { assertSafeDatabaseUrl } from "./e2e-workspace-fixture";

describe("desktop perf fixture helpers", () => {
	test("parses dense seed options", () => {
		expect(
			parseDesktopPerfFixtureArgs([
				"seed",
				"--slug",
				"desktop-perf-loaded",
				"--projects",
				"10",
				"--workspaces-per-project",
				"20",
				"--tasks",
				"300",
				"--host-backed-workspaces",
				"1",
			]),
		).toEqual({
			command: "seed",
			options: {
				slug: "desktop-perf-loaded",
				projects: "10",
				"workspaces-per-project": "20",
				tasks: "300",
				"host-backed-workspaces": "1",
			},
		});
	});

	test("parses stats and ensure commands for loaded validation", () => {
		expect(
			parseDesktopPerfFixtureArgs([
				"stats",
				"--slug",
				"desktop-perf-loaded",
				"--projects",
				"10",
			]),
		).toEqual({
			command: "stats",
			options: {
				slug: "desktop-perf-loaded",
				projects: "10",
			},
		});
		expect(
			parseDesktopPerfFixtureArgs([
				"ensure",
				"--slug",
				"desktop-perf-loaded",
				"--tasks",
				"300",
			]),
		).toEqual({
			command: "ensure",
			options: {
				slug: "desktop-perf-loaded",
				tasks: "300",
			},
		});
	});

	test("keeps the local database safety gate available", () => {
		expect(() =>
			assertSafeDatabaseUrl("postgres://user:pass@production.example.com/main"),
		).toThrow(/Refusing to touch non-local DATABASE_URL/);
		expect(() =>
			assertSafeDatabaseUrl("postgres://postgres:postgres@localhost:3290/main"),
		).not.toThrow();
	});

	test("loaded fixture package script includes a host-backed workspace", () => {
		const packageJson = readFileSync("package.json", "utf8");

		expect(packageJson).toContain(
			'"desktop:perf-fixture:loaded": "bun run desktop:perf-fixture -- ensure --slug desktop-perf-loaded --projects 10 --workspaces-per-project 20 --tasks 300 --host-backed-workspaces 1"',
		);
	});

	test("loaded stats require matching local host-service workspace rows", () => {
		const source = readFileSync("scripts/desktop-perf-fixture.ts", "utf8");

		expect(source).toContain("hasLocalHostFixtureTables");
		expect(source).toContain("name in ('projects', 'workspaces')");
		expect(source).toContain("countLocalHostFixtureWorkspaces");
		expect(source).toContain("localHostBackedWorkspaceCount");
		expect(source).toContain("hostBackedWorkspaceIds");
		expect(source).toContain(
			"localHostBackedWorkspaceCount >= expectedHostBackedWorkspaces",
		);
	});
});
