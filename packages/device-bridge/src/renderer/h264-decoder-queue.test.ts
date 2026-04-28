import { describe, expect, test } from "bun:test";
import {
	type DecodeRecoveryState,
	selectDecodeUnit,
} from "./h264-decoder-queue";

const sps = new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x67]);
const pps = new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x68]);
const delta = new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x21]);
const idr = new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x65]);

describe("selectDecodeUnit", () => {
	test("enters recovery when decode queue is over limit", () => {
		const state: DecodeRecoveryState = {
			waitingForKeyframe: false,
			cachedParameterSets: null,
		};

		expect(selectDecodeUnit(delta, state, 9, 8)).toEqual({
			action: "drop",
			waitingForKeyframe: true,
		});
		expect(state.waitingForKeyframe).toBe(true);
	});

	test("drops deltas during recovery until a keyframe arrives", () => {
		const state: DecodeRecoveryState = {
			waitingForKeyframe: true,
			cachedParameterSets: null,
		};

		expect(selectDecodeUnit(delta, state, 0, 8)).toEqual({
			action: "drop",
			waitingForKeyframe: true,
		});
		const decision = selectDecodeUnit(idr, state, 0, 8);
		expect(decision).toMatchObject({
			action: "decode",
			keyframe: true,
			resetDecoder: true,
		});
		expect(state.waitingForKeyframe).toBe(false);
	});

	test("prepends cached parameter sets to recovery keyframe", () => {
		const state: DecodeRecoveryState = {
			waitingForKeyframe: true,
			cachedParameterSets: null,
		};
		selectDecodeUnit(new Uint8Array([...sps, ...pps]), state, 0, 8);

		const decision = selectDecodeUnit(idr, state, 0, 8);
		expect(decision.action).toBe("decode");
		if (decision.action === "decode") {
			expect(Array.from(decision.data)).toEqual(
				Array.from(new Uint8Array([...sps, ...pps, ...idr])),
			);
		}
	});

	test("caches only parameter sets from mixed access units", () => {
		const state: DecodeRecoveryState = {
			waitingForKeyframe: true,
			cachedParameterSets: null,
		};
		selectDecodeUnit(new Uint8Array([...sps, ...pps, ...idr]), state, 9, 8);

		const decision = selectDecodeUnit(idr, state, 0, 8);
		expect(decision.action).toBe("decode");
		if (decision.action === "decode") {
			expect(Array.from(decision.data)).toEqual(
				Array.from(new Uint8Array([...sps, ...pps, ...idr])),
			);
		}
	});
});
