import grpc from "@grpc/grpc-js";
import { createHidClient } from "./grpc-client";

function sendHidEvents(
	client: ReturnType<typeof createHidClient>,
	events: Record<string, unknown>[],
): Promise<void> {
	return new Promise((resolve, reject) => {
		const call = client.hid(
			new grpc.Metadata(),
			(err: grpc.ServiceError | null) => {
				if (err) reject(err);
				else resolve();
			},
		);
		for (const event of events) call.write(event);
		call.end();
	});
}

function sendHidEvent(
	client: ReturnType<typeof createHidClient>,
	event: Record<string, unknown>,
): Promise<void> {
	return sendHidEvents(client, [event]);
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export async function hidTap(
	port: number,
	x: number,
	y: number,
	protoPath?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const client = createHidClient(port, protoPath);
		await sendHidEvent(client, {
			press: { action: { touch: { point: { x, y } } }, direction: "DOWN" },
		});
		await sendHidEvent(client, {
			press: { action: { touch: { point: { x, y } } }, direction: "UP" },
		});
		return { ok: true };
	} catch (error) {
		return { ok: false, error: getErrorMessage(error) };
	}
}

export async function hidSwipe(
	port: number,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	duration?: number,
	protoPath?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const client = createHidClient(port, protoPath);
		await sendHidEvent(client, {
			swipe: {
				start: { x: x1, y: y1 },
				end: { x: x2, y: y2 },
				duration: (duration ?? 300) / 1000,
				delta: 0,
			},
		});
		return { ok: true };
	} catch (error) {
		return { ok: false, error: getErrorMessage(error) };
	}
}

export async function hidHome(
	port: number,
	protoPath?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const client = createHidClient(port, protoPath);
		await sendHidEvent(client, {
			press: { action: { button: { button: "HOME" } }, direction: "DOWN" },
		});
		await sendHidEvent(client, {
			press: { action: { button: { button: "HOME" } }, direction: "UP" },
		});
		return { ok: true };
	} catch (error) {
		return { ok: false, error: getErrorMessage(error) };
	}
}

export async function hidBack(
	port: number,
	protoPath?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const client = createHidClient(port, protoPath);
		await sendHidEvents(client, [
			{ press: { action: { key: { keycode: 227 } }, direction: "DOWN" } },
			{ press: { action: { key: { keycode: 47 } }, direction: "DOWN" } },
			{ press: { action: { key: { keycode: 47 } }, direction: "UP" } },
			{ press: { action: { key: { keycode: 227 } }, direction: "UP" } },
		]);
		return { ok: true };
	} catch (error) {
		return { ok: false, error: getErrorMessage(error) };
	}
}
