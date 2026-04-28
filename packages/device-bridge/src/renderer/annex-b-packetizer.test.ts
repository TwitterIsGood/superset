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

	test("finds start codes split across chunks", () => {
		const units: Uint8Array[] = [];
		const p = new AnnexBPacketizer((unit) => units.push(unit));
		const slice1 = makeNal(1, 2);
		const slice2 = makeNal(1, 2);
		const slice3 = makeNal(1, 2);
		const stream = new Uint8Array([...slice1, ...slice2, ...slice3]);

		p.append(stream.slice(0, slice1.length + 2));
		p.append(stream.slice(slice1.length + 2, slice1.length + 4));
		p.append(stream.slice(slice1.length + 4));

		expect(units.length).toBe(1);
		expect(Array.from(units[0] ?? [])).toEqual(Array.from(slice1));
	});
});
