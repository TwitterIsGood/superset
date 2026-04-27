import { describe, expect, test } from "bun:test";
import { parseIdbPhysicalDevices, parseIosDevices } from "./devices";

describe("parseIosDevices", () => {
	test("parses simctl JSON output", () => {
		const json = JSON.stringify({
			devices: {
				"com.apple.CoreSimulator.SimRuntime.iOS-18-4": [
					{
						udid: "abc-123",
						name: "iPhone 16 Pro",
						state: "Booted",
						isAvailable: true,
					},
					{
						udid: "def-456",
						name: "iPad Air",
						state: "Shutdown",
						isAvailable: true,
					},
				],
			},
		});

		const devices = parseIosDevices(json);
		expect(devices.length).toBe(2);
		expect(devices[0]).toEqual({
			id: "abc-123",
			name: "iPhone 16 Pro",
			runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-4",
			state: "Booted",
			isAvailable: true,
			pointScale: 3,
			kind: "simulator",
		});
	});

	test("returns empty for invalid JSON", () => {
		expect(parseIosDevices("not json")).toEqual([]);
	});

	test("respects custom pointScale", () => {
		const json = JSON.stringify({
			devices: {
				runtime: [{ udid: "a", name: "X", state: "Booted", isAvailable: true }],
			},
		});
		const devices = parseIosDevices(json, 2);
		expect(devices[0].pointScale).toBe(2);
	});

	test("parses physical devices from idb companion output", () => {
		const devices = parseIdbPhysicalDevices(
			'{"model":"iPhone 16 Pro","udid":"0000","os_version":"iOS 18.5","type":"Device","state":"Booted","name":"Phone"}\n',
		);
		expect(devices).toEqual([
			{
				id: "0000",
				name: "Phone",
				runtime: "iOS 18.5",
				state: "Booted",
				isAvailable: true,
				pointScale: 3,
				kind: "device",
			},
		]);
	});
});
