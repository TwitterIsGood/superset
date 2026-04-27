export interface StartCode {
	index: number;
	length: 3 | 4;
}

export function findStartCodes(bytes: Uint8Array): StartCode[] {
	const positions: StartCode[] = [];
	for (let i = 0; i < bytes.length - 3; i++) {
		if (bytes[i] !== 0 || bytes[i + 1] !== 0) continue;
		if (bytes[i + 2] === 1) {
			positions.push({ index: i, length: 3 });
			i += 2;
		} else if (i < bytes.length - 4 && bytes[i + 2] === 0 && bytes[i + 3] === 1) {
			positions.push({ index: i, length: 4 });
			i += 3;
		}
	}
	return positions;
}

export function _testStartCode(index: number, length: number): StartCode {
	return { index, length: length as 3 | 4 };
}

export function nalTypeAt(bytes: Uint8Array, startCode: StartCode): number {
	return bytes[startCode.index + startCode.length]! & 0x1f;
}

export function hasIdrFrame(data: Uint8Array): boolean {
	for (let i = 0; i < data.length - 4; i++) {
		const start3 = data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1;
		const start4 = data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1;
		if (!start3 && !start4) continue;
		const offset = i + (start3 ? 3 : 4);
		if ((data[offset]! & 0x1f) === 5) return true;
	}
	return false;
}
