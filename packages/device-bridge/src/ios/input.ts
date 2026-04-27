import { createHidClient } from "./grpc-client";
import grpc from "@grpc/grpc-js";

export async function hidTap(
	port: number,
	udid: string,
	x: number,
	y: number,
	protoPath?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const client = createHidClient(port, protoPath);
		await new Promise<void>((resolve, reject) => {
			const call = client.hid(new grpc.Metadata(), (err: any) => {
				if (err) reject(err);
				else resolve();
			});
			call.write({ press: { action: { touch: { point: { x, y } } }, direction: "DOWN" } });
			call.write({ press: { action: { touch: { point: { x, y } } }, direction: "UP" } });
			call.end();
		});
		return { ok: true };
	} catch (error: any) {
		return { ok: false, error: error.message };
	}
}

export async function hidSwipe(
	port: number,
	udid: string,
	x1: number, y1: number, x2: number, y2: number, duration?: number,
	protoPath?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const client = createHidClient(port, protoPath);
		await new Promise<void>((resolve, reject) => {
			const call = client.hid(new grpc.Metadata(), (err: any) => {
				if (err) reject(err);
				else resolve();
			});
			call.write({
				swipe: {
					start: { x: x1, y: y1 },
					end: { x: x2, y: y2 },
					duration: (duration ?? 300) / 1000,
					delta: 0,
				},
			});
			call.end();
		});
		return { ok: true };
	} catch (error: any) {
		return { ok: false, error: error.message };
	}
}
