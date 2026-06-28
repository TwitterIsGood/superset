import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import {
	type BlankFrameResult,
	buildVisualStabilityFailures,
	classifyBlankFramePixels,
	classifyDomChurn,
	classifyLayoutSelector,
	classifyPersistentSelector,
	decodePngToRgba,
	formatVisualStabilityReport,
	normalizeVisualStabilityThresholds,
	type VisualStabilityReport,
} from "./visual-stability";

function rgbaPixels(
	colors: Array<[number, number, number, number]>,
): Uint8Array {
	const pixels = new Uint8Array(colors.length * 4);
	colors.forEach(([r, g, b, a], index) => {
		const offset = index * 4;
		pixels[offset] = r;
		pixels[offset + 1] = g;
		pixels[offset + 2] = b;
		pixels[offset + 3] = a;
	});
	return pixels;
}

function chunk(type: string, data: Buffer): Buffer {
	const output = Buffer.alloc(8 + data.length + 4);
	output.writeUInt32BE(data.length, 0);
	output.write(type, 4, 4, "ascii");
	data.copy(output, 8);
	return output;
}

function pngRgba(width: number, height: number, rgba: Uint8Array): Buffer {
	const signature = Buffer.from([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8;
	ihdr[9] = 6;
	const scanlines = Buffer.alloc(height * (width * 4 + 1));
	for (let row = 0; row < height; row += 1) {
		const sourceStart = row * width * 4;
		const targetStart = row * (width * 4 + 1);
		scanlines[targetStart] = 0;
		Buffer.from(rgba.subarray(sourceStart, sourceStart + width * 4)).copy(
			scanlines,
			targetStart + 1,
		);
	}
	return Buffer.concat([
		signature,
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(scanlines)),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

describe("decodePngToRgba", () => {
	test("decodes 8-bit RGBA PNG screenshots", () => {
		const source = rgbaPixels([
			[255, 255, 255, 255],
			[0, 0, 0, 255],
		]);
		const decoded = decodePngToRgba(pngRgba(2, 1, source));

		expect(decoded.width).toBe(2);
		expect(decoded.height).toBe(1);
		expect(Array.from(decoded.rgba)).toEqual(Array.from(source));
	});
});

describe("classifyBlankFramePixels", () => {
	test("marks a uniform frame as blank", () => {
		const result = classifyBlankFramePixels({
			rgba: rgbaPixels(Array.from({ length: 100 }, () => [248, 248, 248, 255])),
			width: 10,
			height: 10,
			threshold: 0.98,
		});

		expect(result.blank).toBe(true);
		expect(result.dominantRatio).toBe(1);
	});

	test("does not mark mixed content as blank", () => {
		const result = classifyBlankFramePixels({
			rgba: rgbaPixels([
				...Array.from(
					{ length: 50 },
					() => [255, 255, 255, 255] as [number, number, number, number],
				),
				...Array.from(
					{ length: 50 },
					() => [10, 20, 30, 255] as [number, number, number, number],
				),
			]),
			width: 10,
			height: 10,
			threshold: 0.98,
		});

		expect(result.blank).toBe(false);
		expect(result.dominantRatio).toBe(0.5);
	});
});

describe("visual stability classifiers", () => {
	const thresholds = normalizeVisualStabilityThresholds();

	test("fails persistent selectors that were removed", () => {
		const result = classifyPersistentSelector({
			selector: "[data-shell]",
			initialCount: 1,
			finalCount: 1,
			removals: [
				{
					selector: "[data-shell]",
					timestampMs: 42,
					summary: "div[data-shell]",
				},
			],
			thresholds,
		});

		expect(result.failed).toBe(true);
		expect(result.removalCount).toBe(1);
		expect(result.firstRemovalMs).toBe(42);
	});

	test("fails measured selectors that move beyond the threshold", () => {
		const result = classifyLayoutSelector({
			selector: "[data-sidebar]",
			samples: [
				{ timestampMs: 0, bounds: { x: 0, y: 0, width: 200, height: 600 } },
				{ timestampMs: 50, bounds: { x: 0, y: 8, width: 200, height: 600 } },
			],
			thresholds,
		});

		expect(result.failed).toBe(true);
		expect(result.maxMovementPx).toBe(8);
		expect(result.reason).toContain("moved");
	});

	test("fails measured selectors that disappear during sampling", () => {
		const result = classifyLayoutSelector({
			selector: "[data-sidebar]",
			samples: [
				{ timestampMs: 0, bounds: { x: 0, y: 0, width: 200, height: 600 } },
				{ timestampMs: 50, bounds: null },
			],
			thresholds,
		});

		expect(result.failed).toBe(true);
		expect(result.missingSamples).toBe(1);
		expect(result.reason).toContain("missing");
	});

	test("reports DOM churn by default and fails when configured thresholds are exceeded", () => {
		const result = classifyDomChurn({
			selector: "body",
			addedCount: 12,
			removedCount: 3,
			thresholds: normalizeVisualStabilityThresholds({ maxDomAdded: 10 }),
		});

		expect(result.failed).toBe(true);
		expect(result.reason).toContain("added 12");
	});
});

describe("buildVisualStabilityFailures", () => {
	test("combines failed metrics into actionable failures", () => {
		const thresholds = normalizeVisualStabilityThresholds();
		const blankFrames: BlankFrameResult = {
			threshold: thresholds.blankThreshold,
			frameCount: 2,
			blankFrameCount: 1,
			samples: [
				{
					index: 0,
					timestampMs: 25,
					width: 10,
					height: 10,
					blank: true,
					dominantRatio: 1,
					dominantColor: { r: 255, g: 255, b: 255 },
				},
			],
			failed: true,
			reason: "1 blank frame",
		};

		const failures = buildVisualStabilityFailures({
			persistent: [
				classifyPersistentSelector({
					selector: "[data-shell]",
					initialCount: 0,
					finalCount: 0,
					removals: [],
					thresholds,
				}),
			],
			layout: [],
			blankFrames,
			domChurn: [],
			consoleLogs: [
				{
					level: 3,
					message: "boom",
					source: "console",
					line: 0,
					timestamp: Date.now(),
				},
			],
			observerLost: false,
			thresholds,
		});

		expect(failures.map((failure) => failure.kind)).toEqual([
			"persistent-missing",
			"blank-frame",
			"console-error",
		]);
	});

	test("formats pass and fail summaries", () => {
		const report: VisualStabilityReport = {
			command: "visual-stability",
			passed: false,
			startedAt: "2026-06-28T00:00:00.000Z",
			completedAt: "2026-06-28T00:00:01.000Z",
			durationMs: 1000,
			windowInfo: {
				title: "Superset",
				url: "http://localhost:3000",
				viewportWidth: 1200,
				viewportHeight: 800,
				focused: true,
			},
			beforeUrl: "http://localhost:3000/#/a",
			afterUrl: "http://localhost:3000/#/b",
			thresholds: normalizeVisualStabilityThresholds(),
			action: { kind: "click", text: "Workspaces" },
			persistent: [],
			layout: [],
			blankFrames: {
				threshold: 0.985,
				frameCount: 0,
				blankFrameCount: 0,
				samples: [],
				failed: false,
			},
			domChurn: [],
			consoleLogs: [],
			failures: [
				{
					kind: "persistent-removal",
					selector: "[data-shell]",
					timestampMs: 10,
					message: "shell removed",
				},
			],
			artifacts: { reportPath: "/tmp/report.json" },
		};

		expect(formatVisualStabilityReport(report)).toContain(
			"[persistent-removal] [data-shell] at 10ms",
		);
		report.passed = true;
		report.failures = [];
		expect(formatVisualStabilityReport(report)).toContain(
			"Visual stability passed",
		);
	});
});
