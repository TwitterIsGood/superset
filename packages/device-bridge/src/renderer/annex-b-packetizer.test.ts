import { describe, expect, test } from "bun:test";
import { AnnexBPacketizer } from "./annex-b-packetizer";

function makeNal(type: number, payloadSize: number): Uint8Array {
	const sc = new Uint8Array([0x00, 0x00, 0x00, 0x01, type & 0x1f]);
	const payload = new Uint8Array(payloadSize).fill(0xaa);
	const result = new Uint8Array(sc.length + payload.length);
	result.set(sc);
	result.set(payload, sc.length);
	return result;
}

describe("AnnexBPacketizer", () => {
	test("emits access unit when a third slice triggers boundary", () => {
		const units: Uint8Array[] = [];
		const p = new AnnexBPacketizer((unit) => units.push(unit));

		// SPS + PPS + IDR1 + IDR2 + IDR3
		// Loop processes SPS, PPS, IDR1 (keeps IDR2 as trailing buffer)
		// Then appends IDR3 → processes IDR2, IDR2 is slice + seenSlice → emit
		const sps = makeNal(7, 4);
		const pps = makeNal(8, 2);
		const idr1 = makeNal(5, 10);
		const idr2 = makeNal(5, 10);
		const idr3 = makeNal(5, 10);

		p.append(new Uint8Array([...sps, ...pps, ...idr1, ...idr2, ...idr3]));

		expect(units.length).toBe(1);
		expect(units[0]?.length).toBe(sps.length + pps.length + idr1.length);
	});

	test("buffers data until enough start codes accumulate", () => {
		const units: Uint8Array[] = [];
		const p = new AnnexBPacketizer((unit) => units.push(unit));

		// Need 3 slices total for emit:
		// append 1 → 1 start code, not enough
		// append 2 → 2 start codes, processes slice1, keeps slice2 in buffer
		// append 3 → 3 start codes in buffer (prev + new), processes slice2, triggers emit
		const slice1 = makeNal(1, 5);
		p.append(slice1);
		expect(units.length).toBe(0);

		const slice2 = makeNal(1, 5);
		p.append(slice2);
		expect(units.length).toBe(0);

		const slice3 = makeNal(1, 5);
		p.append(slice3);
		expect(units.length).toBe(1);
	});
});
