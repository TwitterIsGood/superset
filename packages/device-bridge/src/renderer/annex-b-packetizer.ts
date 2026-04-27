import { findStartCodes, nalTypeAt, type StartCode } from "./h264-utils";

export class AnnexBPacketizer {
	private buffer = new Uint8Array(0);
	private parts: Uint8Array[] = [];
	private seenSlice = false;

	constructor(private onAccessUnit: (unit: Uint8Array) => void) {}

	append(chunk: Uint8Array): void {
		const next = new Uint8Array(this.buffer.length + chunk.length);
		next.set(this.buffer);
		next.set(chunk, this.buffer.length);
		this.buffer = next;

		const starts = findStartCodes(this.buffer);
		if (starts.length < 2) return;

		for (let i = 0; i < starts.length - 1; i++) {
			const start = starts[i]!;
			const end = starts[i + 1]!.index;
			const nal = this.buffer.slice(start.index, end);
			const type = nalTypeAt(this.buffer, start);
			const isSlice = type === 1 || type === 5;
			if (isSlice && this.seenSlice) this.emit();
			this.parts.push(nal);
			if (isSlice) this.seenSlice = true;
		}
		this.buffer = this.buffer.slice(starts[starts.length - 1]!.index);
	}

	reset(): void {
		this.buffer = new Uint8Array(0);
		this.parts = [];
		this.seenSlice = false;
	}

	private emit(): void {
		if (this.parts.length === 0) return;
		const size = this.parts.reduce((total, part) => total + part.length, 0);
		const unit = new Uint8Array(size);
		let offset = 0;
		for (const part of this.parts) {
			unit.set(part, offset);
			offset += part.length;
		}
		this.parts = [];
		this.seenSlice = false;
		this.onAccessUnit(unit);
	}
}
