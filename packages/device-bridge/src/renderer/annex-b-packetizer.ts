import type { StartCode } from "./h264-utils";

export class AnnexBPacketizer {
	private chunks: Uint8Array[] = [];
	private bufferedBytes = 0;
	private parts: Uint8Array[] = [];
	private seenSlice = false;

	constructor(private onAccessUnit: (unit: Uint8Array) => void) {}

	append(chunk: Uint8Array): void {
		if (chunk.byteLength === 0) return;
		this.chunks.push(chunk);
		this.bufferedBytes += chunk.byteLength;

		const starts = this.findBufferedStartCodes();
		if (starts.length < 2) return;

		for (let i = 0; i < starts.length - 1; i++) {
			const start = starts[i];
			const next = starts[i + 1];
			if (!start || !next) continue;
			const nal = this.sliceBuffered(start.index, next.index);
			const type = this.nalTypeAt(start);
			const isSlice = type === 1 || type === 5;
			if (isSlice && this.seenSlice) this.emit();
			this.parts.push(nal);
			if (isSlice) this.seenSlice = true;
		}

		const last = starts[starts.length - 1];
		if (last) this.discardBufferedPrefix(last.index);
	}

	reset(): void {
		this.chunks = [];
		this.bufferedBytes = 0;
		this.parts = [];
		this.seenSlice = false;
	}

	private findBufferedStartCodes(): StartCode[] {
		const positions: StartCode[] = [];
		for (let i = 0; i < this.bufferedBytes - 3; i++) {
			if (this.byteAt(i) !== 0 || this.byteAt(i + 1) !== 0) continue;
			if (this.byteAt(i + 2) === 0 && this.byteAt(i + 3) === 1) {
				positions.push({ index: i, length: 4 });
				i += 3;
			} else if (this.byteAt(i + 2) === 1) {
				positions.push({ index: i, length: 3 });
				i += 2;
			}
		}
		return positions;
	}

	private byteAt(index: number): number | undefined {
		let offset = index;
		for (const chunk of this.chunks) {
			if (offset < chunk.byteLength) return chunk[offset];
			offset -= chunk.byteLength;
		}
		return undefined;
	}

	private nalTypeAt(startCode: StartCode): number {
		return (this.byteAt(startCode.index + startCode.length) ?? 0) & 0x1f;
	}

	private sliceBuffered(start: number, end: number): Uint8Array {
		const result = new Uint8Array(end - start);
		let sourceOffset = 0;
		let targetOffset = 0;
		for (const chunk of this.chunks) {
			const chunkStart = sourceOffset;
			const chunkEnd = sourceOffset + chunk.byteLength;
			if (chunkEnd > start && chunkStart < end) {
				const from = Math.max(start - chunkStart, 0);
				const to = Math.min(end - chunkStart, chunk.byteLength);
				result.set(chunk.subarray(from, to), targetOffset);
				targetOffset += to - from;
			}
			sourceOffset = chunkEnd;
			if (sourceOffset >= end) break;
		}
		return result;
	}

	private discardBufferedPrefix(bytes: number): void {
		let remaining = bytes;
		while (remaining > 0 && this.chunks.length > 0) {
			const first = this.chunks[0];
			if (!first) break;
			if (remaining >= first.byteLength) {
				this.chunks.shift();
				this.bufferedBytes -= first.byteLength;
				remaining -= first.byteLength;
			} else {
				this.chunks[0] = first.subarray(remaining);
				this.bufferedBytes -= remaining;
				remaining = 0;
			}
		}
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
