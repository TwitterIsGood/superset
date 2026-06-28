import { inflateSync } from "node:zlib";
import type { ConsoleLogEntry } from "../zod.js";
import type {
	ScreenshotRect,
	WaitForResult,
	WindowInfo,
} from "./desktop-automation.js";

export interface BoundsSnapshot {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface VisualStabilityThresholds {
	maxRemovals: number;
	maxLayoutShiftPx: number;
	maxSizeShiftPx: number;
	maxBlankFrames: number;
	blankThreshold: number;
	maxDomAdded?: number;
	maxDomRemoved?: number;
	failOnConsoleError: boolean;
}

export interface VisualStabilityThresholdInput {
	maxRemovals?: number;
	maxLayoutShiftPx?: number;
	maxSizeShiftPx?: number;
	maxBlankFrames?: number;
	blankThreshold?: number;
	maxDomAdded?: number;
	maxDomRemoved?: number;
	failOnConsoleError?: boolean;
}

export const DEFAULT_VISUAL_STABILITY_THRESHOLDS: VisualStabilityThresholds = {
	maxRemovals: 0,
	maxLayoutShiftPx: 2,
	maxSizeShiftPx: 2,
	maxBlankFrames: 0,
	blankThreshold: 0.985,
	failOnConsoleError: true,
};

export type VisualStabilityAction =
	| {
			kind: "click";
			selector?: string;
			text?: string;
			testId?: string;
			x?: number;
			y?: number;
			index?: number;
			fuzzy?: boolean;
	  }
	| { kind: "navigate"; path?: string; url?: string }
	| { kind: "evaluate-js"; code: string };

export interface VisualStabilityArtifactOptions {
	beforeScreenshotPath?: string;
	afterScreenshotPath?: string;
	failedFrameDir?: string;
}

export interface VisualStabilityOptions {
	action: VisualStabilityAction;
	wait?: {
		selector?: string;
		text?: string;
		testId?: string;
		urlIncludes?: string;
		fuzzy?: boolean;
		timeoutMs?: number;
	};
	persistSelectors: string[];
	measureSelectors: string[];
	churnRootSelectors: string[];
	blankRect?: ScreenshotRect;
	sampleMs: number;
	sampleIntervalMs: number;
	thresholds: VisualStabilityThresholds;
	artifacts?: VisualStabilityArtifactOptions;
}

export interface PersistentRemoval {
	timestampMs: number;
	selector: string;
	summary: string;
}

export interface PersistentSelectorResult {
	selector: string;
	initialCount: number;
	finalCount: number;
	removalCount: number;
	remountCount: number;
	firstRemovalMs?: number;
	removals: PersistentRemoval[];
	failed: boolean;
	reason?: string;
}

export interface LayoutSample {
	timestampMs: number;
	bounds: BoundsSnapshot | null;
}

export interface LayoutSelectorResult {
	selector: string;
	initialBounds: BoundsSnapshot | null;
	finalBounds: BoundsSnapshot | null;
	maxMovementPx: number;
	maxSizeShiftPx: number;
	missingSamples: number;
	samples: LayoutSample[];
	failed: boolean;
	reason?: string;
}

export interface BlankFrameSample {
	index: number;
	timestampMs: number;
	width: number;
	height: number;
	blank: boolean;
	dominantRatio: number;
	dominantColor: { r: number; g: number; b: number };
	artifactPath?: string;
}

export interface BlankFrameResult {
	rect?: ScreenshotRect;
	threshold: number;
	frameCount: number;
	blankFrameCount: number;
	samples: BlankFrameSample[];
	failed: boolean;
	reason?: string;
}

export interface DomChurnResult {
	selector: string;
	addedCount: number;
	removedCount: number;
	largestRemovedSummary?: string;
	failed: boolean;
	reason?: string;
}

export interface VisualStabilityFailure {
	kind:
		| "persistent-missing"
		| "persistent-removal"
		| "layout-shift"
		| "layout-missing"
		| "blank-frame"
		| "dom-churn"
		| "console-error"
		| "observer-lost"
		| "action-error";
	message: string;
	selector?: string;
	timestampMs?: number;
}

export interface VisualStabilityArtifacts {
	reportPath?: string;
	beforeScreenshot?: string;
	afterScreenshot?: string;
	failedFrames?: string[];
}

export interface VisualStabilityReport {
	command: "visual-stability";
	passed: boolean;
	startedAt: string;
	completedAt: string;
	durationMs: number;
	windowInfo: WindowInfo;
	beforeUrl: string;
	afterUrl: string;
	thresholds: VisualStabilityThresholds;
	action: VisualStabilityAction;
	wait?: WaitForResult;
	persistent: PersistentSelectorResult[];
	layout: LayoutSelectorResult[];
	blankFrames: BlankFrameResult;
	domChurn: DomChurnResult[];
	consoleLogs: ConsoleLogEntry[];
	failures: VisualStabilityFailure[];
	artifacts: VisualStabilityArtifacts;
}

export interface BlankFramePixelInput {
	rgba: ArrayLike<number>;
	width: number;
	height: number;
	threshold?: number;
}

export interface DecodedPngImage {
	rgba: Uint8Array;
	width: number;
	height: number;
}

export function normalizeVisualStabilityThresholds(
	input: VisualStabilityThresholdInput = {},
): VisualStabilityThresholds {
	return {
		...DEFAULT_VISUAL_STABILITY_THRESHOLDS,
		...input,
	};
}

const PNG_SIGNATURE = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function paethPredictor(left: number, up: number, upperLeft: number): number {
	const estimate = left + up - upperLeft;
	const leftDistance = Math.abs(estimate - left);
	const upDistance = Math.abs(estimate - up);
	const upperLeftDistance = Math.abs(estimate - upperLeft);
	if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) {
		return left;
	}
	if (upDistance <= upperLeftDistance) return up;
	return upperLeft;
}

function getPngBytesPerPixel(colorType: number): number {
	switch (colorType) {
		case 0:
			return 1;
		case 2:
			return 3;
		case 4:
			return 2;
		case 6:
			return 4;
		default:
			throw new Error(`Unsupported PNG color type: ${colorType}`);
	}
}

function copyScanlineToRgba(input: {
	source: Uint8Array;
	target: Uint8Array;
	width: number;
	row: number;
	colorType: number;
	bytesPerPixel: number;
}): void {
	const { source, target, width, row, colorType, bytesPerPixel } = input;
	for (let x = 0; x < width; x += 1) {
		const sourceOffset = x * bytesPerPixel;
		const targetOffset = (row * width + x) * 4;
		if (colorType === 0) {
			const gray = source[sourceOffset] ?? 0;
			target[targetOffset] = gray;
			target[targetOffset + 1] = gray;
			target[targetOffset + 2] = gray;
			target[targetOffset + 3] = 255;
			continue;
		}
		if (colorType === 4) {
			const gray = source[sourceOffset] ?? 0;
			target[targetOffset] = gray;
			target[targetOffset + 1] = gray;
			target[targetOffset + 2] = gray;
			target[targetOffset + 3] = source[sourceOffset + 1] ?? 255;
			continue;
		}
		target[targetOffset] = source[sourceOffset] ?? 0;
		target[targetOffset + 1] = source[sourceOffset + 1] ?? 0;
		target[targetOffset + 2] = source[sourceOffset + 2] ?? 0;
		target[targetOffset + 3] =
			colorType === 6 ? (source[sourceOffset + 3] ?? 255) : 255;
	}
}

export function decodePngToRgba(buffer: Buffer): DecodedPngImage {
	if (
		buffer.length < PNG_SIGNATURE.length ||
		!buffer.subarray(0, 8).equals(PNG_SIGNATURE)
	) {
		throw new Error("Screenshot is not a PNG image");
	}

	let offset = PNG_SIGNATURE.length;
	let width = 0;
	let height = 0;
	let bitDepth = 0;
	let colorType = 0;
	let interlaceMethod = 0;
	const idatChunks: Buffer[] = [];

	while (offset < buffer.length) {
		if (offset + 8 > buffer.length) {
			throw new Error("PNG chunk header is truncated");
		}
		const length = buffer.readUInt32BE(offset);
		const type = buffer.toString("ascii", offset + 4, offset + 8);
		const dataStart = offset + 8;
		const dataEnd = dataStart + length;
		if (dataEnd + 4 > buffer.length) {
			throw new Error(`PNG chunk ${type} is truncated`);
		}
		const data = buffer.subarray(dataStart, dataEnd);
		if (type === "IHDR") {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			bitDepth = data[8] ?? 0;
			colorType = data[9] ?? 0;
			interlaceMethod = data[12] ?? 0;
		} else if (type === "IDAT") {
			idatChunks.push(data);
		} else if (type === "IEND") {
			break;
		}
		offset = dataEnd + 4;
	}

	if (width <= 0 || height <= 0) {
		throw new Error("PNG image has invalid dimensions");
	}
	if (bitDepth !== 8) {
		throw new Error(`Unsupported PNG bit depth: ${bitDepth}`);
	}
	if (interlaceMethod !== 0) {
		throw new Error("Interlaced PNG screenshots are not supported");
	}
	if (idatChunks.length === 0) {
		throw new Error("PNG image has no pixel data");
	}

	const bytesPerPixel = getPngBytesPerPixel(colorType);
	const rowBytes = width * bytesPerPixel;
	const inflated = inflateSync(Buffer.concat(idatChunks));
	const expectedBytes = height * (rowBytes + 1);
	if (inflated.length < expectedBytes) {
		throw new Error("PNG pixel data is truncated");
	}

	const rgba = new Uint8Array(width * height * 4);
	let sourceOffset = 0;
	let previousRow = new Uint8Array(rowBytes);

	for (let row = 0; row < height; row += 1) {
		const filter = inflated[sourceOffset] ?? 0;
		sourceOffset += 1;
		const rawRow = inflated.subarray(sourceOffset, sourceOffset + rowBytes);
		sourceOffset += rowBytes;
		const reconstructed = new Uint8Array(rowBytes);

		for (let index = 0; index < rowBytes; index += 1) {
			const value = rawRow[index] ?? 0;
			const left =
				index >= bytesPerPixel
					? (reconstructed[index - bytesPerPixel] ?? 0)
					: 0;
			const up = previousRow[index] ?? 0;
			const upperLeft =
				index >= bytesPerPixel ? (previousRow[index - bytesPerPixel] ?? 0) : 0;
			switch (filter) {
				case 0:
					reconstructed[index] = value;
					break;
				case 1:
					reconstructed[index] = (value + left) & 0xff;
					break;
				case 2:
					reconstructed[index] = (value + up) & 0xff;
					break;
				case 3:
					reconstructed[index] = (value + Math.floor((left + up) / 2)) & 0xff;
					break;
				case 4:
					reconstructed[index] =
						(value + paethPredictor(left, up, upperLeft)) & 0xff;
					break;
				default:
					throw new Error(`Unsupported PNG filter: ${filter}`);
			}
		}

		copyScanlineToRgba({
			source: reconstructed,
			target: rgba,
			width,
			row,
			colorType,
			bytesPerPixel,
		});
		previousRow = reconstructed;
	}

	return { rgba, width, height };
}

export function classifyBlankFramePixels({
	rgba,
	width,
	height,
	threshold = DEFAULT_VISUAL_STABILITY_THRESHOLDS.blankThreshold,
}: BlankFramePixelInput): Omit<
	BlankFrameSample,
	"index" | "timestampMs" | "artifactPath"
> {
	if (width <= 0 || height <= 0) {
		throw new Error("Blank frame dimensions must be positive");
	}
	const totalPixels = Math.floor(rgba.length / 4);
	if (totalPixels === 0) {
		throw new Error("Blank frame data is empty");
	}

	const maxSamples = 50_000;
	const stride = Math.max(1, Math.floor(totalPixels / maxSamples));
	const buckets = new Map<
		string,
		{ count: number; r: number; g: number; b: number }
	>();
	let sampledPixels = 0;

	for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex += stride) {
		const offset = pixelIndex * 4;
		const alpha = rgba[offset + 3] ?? 255;
		if (alpha < 16) continue;
		const r = rgba[offset] ?? 0;
		const g = rgba[offset + 1] ?? 0;
		const b = rgba[offset + 2] ?? 0;
		const qr = Math.round(r / 16) * 16;
		const qg = Math.round(g / 16) * 16;
		const qb = Math.round(b / 16) * 16;
		const key = `${qr},${qg},${qb}`;
		const bucket = buckets.get(key) ?? { count: 0, r: qr, g: qg, b: qb };
		bucket.count += 1;
		buckets.set(key, bucket);
		sampledPixels += 1;
	}

	if (sampledPixels === 0) {
		throw new Error("Blank frame data has no opaque pixels");
	}

	let dominant = { count: 0, r: 0, g: 0, b: 0 };
	for (const bucket of buckets.values()) {
		if (bucket.count > dominant.count) {
			dominant = bucket;
		}
	}
	const dominantRatio = dominant.count / sampledPixels;

	return {
		width,
		height,
		blank: dominantRatio >= threshold,
		dominantRatio,
		dominantColor: {
			r: dominant.r,
			g: dominant.g,
			b: dominant.b,
		},
	};
}

export function classifyPersistentSelector(input: {
	selector: string;
	initialCount: number;
	finalCount: number;
	removals: PersistentRemoval[];
	thresholds: VisualStabilityThresholds;
}): PersistentSelectorResult {
	const removalCount = input.removals.length;
	const remountCount = removalCount > 0 && input.finalCount > 0 ? 1 : 0;
	const failedMissing = input.initialCount === 0;
	const failedRemoval = removalCount > input.thresholds.maxRemovals;
	const firstRemoval = input.removals[0];

	return {
		selector: input.selector,
		initialCount: input.initialCount,
		finalCount: input.finalCount,
		removalCount,
		remountCount,
		...(firstRemoval ? { firstRemovalMs: firstRemoval.timestampMs } : {}),
		removals: input.removals,
		failed: failedMissing || failedRemoval,
		...(failedMissing
			? { reason: "selector was not present before the action" }
			: failedRemoval
				? {
						reason: `removed ${removalCount} time(s), maximum allowed is ${input.thresholds.maxRemovals}`,
					}
				: {}),
	};
}

export function classifyLayoutSelector(input: {
	selector: string;
	samples: LayoutSample[];
	thresholds: VisualStabilityThresholds;
}): LayoutSelectorResult {
	const initialSample = input.samples.find((sample) => sample.bounds);
	const finalSample = [...input.samples]
		.reverse()
		.find((sample) => sample.bounds);
	const initialBounds = initialSample?.bounds ?? null;
	const finalBounds = finalSample?.bounds ?? null;
	let maxMovementPx = 0;
	let maxSizeShiftPx = 0;
	let missingSamples = 0;

	if (initialBounds) {
		for (const sample of input.samples) {
			if (!sample.bounds) {
				missingSamples += 1;
				continue;
			}
			maxMovementPx = Math.max(
				maxMovementPx,
				Math.abs(sample.bounds.x - initialBounds.x),
				Math.abs(sample.bounds.y - initialBounds.y),
			);
			maxSizeShiftPx = Math.max(
				maxSizeShiftPx,
				Math.abs(sample.bounds.width - initialBounds.width),
				Math.abs(sample.bounds.height - initialBounds.height),
			);
		}
	} else {
		missingSamples = input.samples.length;
	}

	const failedMissing = !initialBounds || missingSamples > 0;
	const failedShift = maxMovementPx > input.thresholds.maxLayoutShiftPx;
	const failedSize = maxSizeShiftPx > input.thresholds.maxSizeShiftPx;

	return {
		selector: input.selector,
		initialBounds,
		finalBounds,
		maxMovementPx,
		maxSizeShiftPx,
		missingSamples,
		samples: input.samples,
		failed: failedMissing || failedShift || failedSize,
		...(failedMissing
			? { reason: "selector was missing during one or more samples" }
			: failedShift
				? {
						reason: `moved ${maxMovementPx}px, maximum allowed is ${input.thresholds.maxLayoutShiftPx}px`,
					}
				: failedSize
					? {
							reason: `resized ${maxSizeShiftPx}px, maximum allowed is ${input.thresholds.maxSizeShiftPx}px`,
						}
					: {}),
	};
}

export function classifyDomChurn(input: {
	selector: string;
	addedCount: number;
	removedCount: number;
	largestRemovedSummary?: string;
	thresholds: VisualStabilityThresholds;
}): DomChurnResult {
	const failedAdded =
		input.thresholds.maxDomAdded !== undefined &&
		input.addedCount > input.thresholds.maxDomAdded;
	const failedRemoved =
		input.thresholds.maxDomRemoved !== undefined &&
		input.removedCount > input.thresholds.maxDomRemoved;

	return {
		selector: input.selector,
		addedCount: input.addedCount,
		removedCount: input.removedCount,
		...(input.largestRemovedSummary
			? { largestRemovedSummary: input.largestRemovedSummary }
			: {}),
		failed: failedAdded || failedRemoved,
		...(failedAdded
			? {
					reason: `added ${input.addedCount} element(s), maximum allowed is ${input.thresholds.maxDomAdded}`,
				}
			: failedRemoved
				? {
						reason: `removed ${input.removedCount} element(s), maximum allowed is ${input.thresholds.maxDomRemoved}`,
					}
				: {}),
	};
}

export function buildVisualStabilityFailures(input: {
	persistent: PersistentSelectorResult[];
	layout: LayoutSelectorResult[];
	blankFrames: BlankFrameResult;
	domChurn: DomChurnResult[];
	consoleLogs: ConsoleLogEntry[];
	observerLost: boolean;
	actionError?: string;
	thresholds: VisualStabilityThresholds;
}): VisualStabilityFailure[] {
	const failures: VisualStabilityFailure[] = [];

	if (input.actionError) {
		failures.push({
			kind: "action-error",
			message: input.actionError,
		});
	}

	if (input.observerLost) {
		failures.push({
			kind: "observer-lost",
			message: "visual stability observer was lost during the interaction",
		});
	}

	for (const result of input.persistent) {
		if (!result.failed) continue;
		failures.push({
			kind:
				result.initialCount === 0 ? "persistent-missing" : "persistent-removal",
			selector: result.selector,
			timestampMs: result.firstRemovalMs,
			message: `${result.selector}: ${result.reason ?? "persistent selector failed"}`,
		});
	}

	for (const result of input.layout) {
		if (!result.failed) continue;
		failures.push({
			kind: result.missingSamples > 0 ? "layout-missing" : "layout-shift",
			selector: result.selector,
			message: `${result.selector}: ${result.reason ?? "layout selector failed"}`,
		});
	}

	if (input.blankFrames.failed) {
		const firstBlank = input.blankFrames.samples.find((sample) => sample.blank);
		failures.push({
			kind: "blank-frame",
			timestampMs: firstBlank?.timestampMs,
			message:
				input.blankFrames.reason ??
				`${input.blankFrames.blankFrameCount} blank frame(s) detected`,
		});
	}

	for (const result of input.domChurn) {
		if (!result.failed) continue;
		failures.push({
			kind: "dom-churn",
			selector: result.selector,
			message: `${result.selector}: ${result.reason ?? "DOM churn threshold exceeded"}`,
		});
	}

	if (input.thresholds.failOnConsoleError) {
		for (const log of input.consoleLogs.filter((entry) => entry.level >= 3)) {
			failures.push({
				kind: "console-error",
				message: log.message,
			});
		}
	}

	return failures;
}

export function formatVisualStabilityReport(
	report: VisualStabilityReport,
): string {
	const route = `${report.beforeUrl} -> ${report.afterUrl}`;
	if (report.passed) {
		return [
			`Visual stability passed: ${route}`,
			`Persistent removals: ${report.persistent.reduce((sum, item) => sum + item.removalCount, 0)}`,
			`Blank frames: ${report.blankFrames.blankFrameCount}/${report.blankFrames.frameCount}`,
			`Console logs: ${report.consoleLogs.length}`,
			...(report.artifacts.reportPath
				? [`Report: ${report.artifacts.reportPath}`]
				: []),
		].join("\n");
	}

	const lines = [
		`Visual stability failed: ${report.failures.length} failure(s)`,
	];
	for (const failure of report.failures.slice(0, 10)) {
		const selector = failure.selector ? ` ${failure.selector}` : "";
		const time =
			failure.timestampMs !== undefined
				? ` at ${Math.round(failure.timestampMs)}ms`
				: "";
		lines.push(`- [${failure.kind}]${selector}${time}: ${failure.message}`);
	}
	if (report.failures.length > 10) {
		lines.push(`- ... ${report.failures.length - 10} more failure(s)`);
	}
	if (report.artifacts.reportPath)
		lines.push(`Report: ${report.artifacts.reportPath}`);
	return lines.join("\n");
}
