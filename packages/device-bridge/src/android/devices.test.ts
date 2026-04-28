import { describe, expect, test } from "bun:test";
import { parseAdbDevices } from "./devices";

describe("parseAdbDevices", () => {
	test("parses device list", () => {
		const output = `List of devices attached
emulator-5554	device
abc123	unauthorized
`;
		const devices = parseAdbDevices(output);
		expect(devices.length).toBe(2);
		expect(devices[0]).toEqual({
			id: "emulator-5554",
			state: "device",
			kind: "emulator",
		});
		expect(devices[1]).toEqual({
			id: "abc123",
			state: "unauthorized",
			kind: "device",
		});
	});

	test("returns empty for header-only output", () => {
		expect(parseAdbDevices("List of devices attached\n")).toEqual([]);
	});
});
