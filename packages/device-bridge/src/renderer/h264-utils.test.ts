import { describe, expect, test } from "bun:test";
import { findStartCodes, hasIdrFrame, nalTypeAt } from "./h264-utils";

describe("findStartCodes", () => {
	test("finds 3-byte start codes", () => {
		const data = new Uint8Array([0xff, 0x00, 0x00, 0x01, 0x65, 0x88]);
		const codes = findStartCodes(data);
		expect(codes.length).toBe(1);
		expect(codes[0]).toEqual({ index: 1, length: 3 });
	});

	test("finds 4-byte start codes", () => {
		const data = new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x67, 0x42]);
		const codes = findStartCodes(data);
		expect(codes.length).toBe(1);
		expect(codes[0]).toEqual({ index: 0, length: 4 });
	});

	test("finds multiple start codes", () => {
		const data = new Uint8Array([
			0x00, 0x00, 0x00, 0x01, 0x67, 0x42, 0x00, 0x00, 0x01, 0x65, 0x88,
		]);
		const codes = findStartCodes(data);
		expect(codes.length).toBe(2);
	});

	test("returns empty for no start codes", () => {
		const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
		const codes = findStartCodes(data);
		expect(codes.length).toBe(0);
	});
});

describe("nalTypeAt", () => {
	test("extracts NAL type", () => {
		const data = new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x67]);
		const sc = { index: 0, length: 4 as const };
		expect(nalTypeAt(data, sc)).toBe(7); // SPS
	});
});

describe("hasIdrFrame", () => {
	test("detects IDR frame (type 5)", () => {
		const data = new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x65]);
		expect(hasIdrFrame(data)).toBe(true);
	});

	test("returns false for non-IDR slice (type 1)", () => {
		const data = new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x21]);
		expect(hasIdrFrame(data)).toBe(false);
	});

	test("returns false for no start codes", () => {
		const data = new Uint8Array([0x01, 0x02, 0x03]);
		expect(hasIdrFrame(data)).toBe(false);
	});
});
