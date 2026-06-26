import type { StartupPerformanceReport } from "shared/startup-performance";
import { track } from ".";

export const DESKTOP_PERFORMANCE_TELEMETRY_EVENT =
	"desktop_performance_snapshot";

export interface DesktopPerformanceTelemetryInput {
	source: "startup" | "idle" | "memory-gate";
	startupTotalMs?: number;
	peakMemoryBytes?: number;
	idleMemoryBytes?: number;
	childProcessCount?: number;
}

type DesktopPerformanceTelemetryPayload = {
	source: DesktopPerformanceTelemetryInput["source"];
	startup_total_ms?: number;
	peak_memory_bytes?: number;
	idle_memory_bytes?: number;
	child_process_count?: number;
};

function sanitizeNonNegativeInteger(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		return undefined;
	}
	return Math.round(value);
}

export function getStartupTotalMs(
	report: StartupPerformanceReport,
): number | undefined {
	const preferredMark =
		report.marks.find((mark) => mark.name === "main:window-setup-end") ??
		report.marks.find((mark) => mark.name === "main:app-ready-complete");

	return sanitizeNonNegativeInteger(preferredMark?.elapsedMs);
}

export function buildDesktopPerformanceTelemetryPayload(
	input: DesktopPerformanceTelemetryInput,
): DesktopPerformanceTelemetryPayload {
	const payload: DesktopPerformanceTelemetryPayload = {
		source: input.source,
	};

	const startupTotalMs = sanitizeNonNegativeInteger(input.startupTotalMs);
	if (startupTotalMs !== undefined) {
		payload.startup_total_ms = startupTotalMs;
	}

	const peakMemoryBytes = sanitizeNonNegativeInteger(input.peakMemoryBytes);
	if (peakMemoryBytes !== undefined) {
		payload.peak_memory_bytes = peakMemoryBytes;
	}

	const idleMemoryBytes = sanitizeNonNegativeInteger(input.idleMemoryBytes);
	if (idleMemoryBytes !== undefined) {
		payload.idle_memory_bytes = idleMemoryBytes;
	}

	const childProcessCount = sanitizeNonNegativeInteger(input.childProcessCount);
	if (childProcessCount !== undefined) {
		payload.child_process_count = childProcessCount;
	}

	return payload;
}

export function trackDesktopPerformanceTelemetry(
	input: DesktopPerformanceTelemetryInput,
): void {
	track(
		DESKTOP_PERFORMANCE_TELEMETRY_EVENT,
		buildDesktopPerformanceTelemetryPayload(input),
	);
}
