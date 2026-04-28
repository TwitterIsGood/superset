export interface DevicePoint {
	x: number;
	y: number;
}

export type AndroidInputGesture =
	| { type: "tap"; x: number; y: number }
	| {
			type: "swipe";
			x1: number;
			y1: number;
			x2: number;
			y2: number;
			duration: number;
	  };

export interface GestureStart extends DevicePoint {
	timestamp: number;
}

export interface ClassifyGestureOptions {
	tapThreshold?: number;
	maxSwipeDuration?: number;
	minSwipeDuration?: number;
}

const DEFAULT_TAP_THRESHOLD = 10;
const DEFAULT_MAX_SWIPE_DURATION = 1000;
const DEFAULT_MIN_SWIPE_DURATION = 1;

export function classifyGesture(
	start: GestureStart,
	end: DevicePoint,
	endTimestamp: number,
	options: ClassifyGestureOptions = {},
): AndroidInputGesture {
	const tapThreshold = options.tapThreshold ?? DEFAULT_TAP_THRESHOLD;
	const maxSwipeDuration =
		options.maxSwipeDuration ?? DEFAULT_MAX_SWIPE_DURATION;
	const minSwipeDuration =
		options.minSwipeDuration ?? DEFAULT_MIN_SWIPE_DURATION;
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const distance = Math.sqrt(dx * dx + dy * dy);

	if (distance <= tapThreshold) {
		return { type: "tap", x: end.x, y: end.y };
	}

	const elapsed = Math.max(minSwipeDuration, endTimestamp - start.timestamp);
	return {
		type: "swipe",
		x1: start.x,
		y1: start.y,
		x2: end.x,
		y2: end.y,
		duration: Math.min(elapsed, maxSwipeDuration),
	};
}
