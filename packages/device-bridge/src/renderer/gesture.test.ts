import { describe, expect, test } from "bun:test";
import { classifyGesture } from "./gesture";

describe("classifyGesture", () => {
	test("classifies small movement as one tap", () => {
		expect(
			classifyGesture(
				{ x: 100, y: 200, timestamp: 10 },
				{ x: 106, y: 204 },
				50,
			),
		).toEqual({ type: "tap", x: 106, y: 204 });
	});

	test("classifies movement beyond threshold as one swipe", () => {
		expect(
			classifyGesture({ x: 10, y: 20, timestamp: 100 }, { x: 10, y: 80 }, 350),
		).toEqual({
			type: "swipe",
			x1: 10,
			y1: 20,
			x2: 10,
			y2: 80,
			duration: 250,
		});
	});

	test("caps swipe duration for adb input", () => {
		expect(
			classifyGesture({ x: 10, y: 20, timestamp: 0 }, { x: 120, y: 20 }, 5000),
		).toMatchObject({ type: "swipe", duration: 1000 });
	});
});
