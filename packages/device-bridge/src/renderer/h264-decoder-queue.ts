import { extractNalTypes, hasIdrFrame, hasParameterSet } from "./h264-utils";

export interface DecodeRecoveryState {
	waitingForKeyframe: boolean;
	cachedParameterSets: Uint8Array | null;
}

export type DecodeRecoveryDecision =
	| {
			action: "decode";
			data: Uint8Array;
			keyframe: boolean;
			resetDecoder: boolean;
	  }
	| { action: "drop"; waitingForKeyframe: boolean };

export function selectDecodeUnit(
	data: Uint8Array,
	state: DecodeRecoveryState,
	queueSize: number,
	maxQueueSize: number,
): DecodeRecoveryDecision {
	if (hasParameterSet(data)) {
		state.cachedParameterSets = extractNalTypes(data, new Set([7, 8]));
	}
	const keyframe = hasIdrFrame(data);

	if (queueSize > maxQueueSize) {
		state.waitingForKeyframe = true;
		return { action: "drop", waitingForKeyframe: true };
	}

	const resetDecoder = state.waitingForKeyframe && keyframe;
	if (state.waitingForKeyframe) {
		if (!keyframe) return { action: "drop", waitingForKeyframe: true };
		state.waitingForKeyframe = false;
	}

	return {
		action: "decode",
		data: keyframe
			? prependCachedParameterSets(data, state.cachedParameterSets)
			: data,
		keyframe,
		resetDecoder,
	};
}

function prependCachedParameterSets(
	data: Uint8Array,
	cachedParameterSets: Uint8Array | null,
): Uint8Array {
	if (!cachedParameterSets || hasParameterSet(data)) return data;
	const combined = new Uint8Array(cachedParameterSets.length + data.length);
	combined.set(cachedParameterSets);
	combined.set(data, cachedParameterSets.length);
	return combined;
}
