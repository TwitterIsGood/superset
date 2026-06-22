import { describe, expect, it } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import {
	buildGeneratedCliPackage,
	buildGeneratedSkillPackage,
} from "./package-builder";

function filesFromPackage(fileData: string) {
	const base64 = fileData.replace(/^data:application\/zip;base64,/, "");
	const archive = Buffer.from(base64, "base64");
	return Object.fromEntries(
		Object.entries(unzipSync(archive)).map(([path, data]) => [
			path,
			strFromU8(data),
		]),
	);
}

describe("control chat package builder", () => {
	it("builds a valid Skill package archive shape", () => {
		const pkg = buildGeneratedSkillPackage({
			name: "Research Method",
			description: "Reusable research workflow.",
			instruction: "Gather sources, compare them, and summarize tradeoffs.",
			sourceRef: "https://example.com/source",
		});

		const files = filesFromPackage(pkg.fileData);
		const manifest = JSON.parse(files["superset.capability.json"] ?? "{}");

		expect(pkg.filename).toMatch(/^research-method-1\.0\.\d+\.zip$/);
		expect(pkg.sourceRef).toBe("https://example.com/source");
		expect(manifest).toMatchObject({
			id: "research-method",
			type: "skill",
			name: "Research Method",
			entry: "skill",
			skill: {
				entryFile: "SKILL.md",
				targets: ["codex"],
			},
		});
		expect(files["skill/SKILL.md"]).toContain("Gather sources");
	});

	it("builds a valid CLI package archive shape", () => {
		const pkg = buildGeneratedCliPackage({
			name: "Website Scraper",
			description: "Fetch and summarize website content.",
			instruction: "Fetch the URL and print a structured summary.",
			sourceUrl: "https://example.com",
		});

		const files = filesFromPackage(pkg.fileData);
		const manifest = JSON.parse(files["superset.capability.json"] ?? "{}");

		expect(pkg.filename).toMatch(/^website-scraper-1\.0\.\d+\.zip$/);
		expect(pkg.sourceRef).toBe("https://example.com");
		expect(manifest).toMatchObject({
			id: "website-scraper",
			type: "cli",
			name: "Website Scraper",
			entry: "tool",
			cli: {
				network: true,
			},
		});
		expect(files["tool/package.json"]).toContain("website-scraper");
		expect(files["tool/bin/website-scraper.mjs"]).toContain(
			"https://example.com",
		);
	});
});
