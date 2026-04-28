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
		} else if (
			i < bytes.length - 4 &&
			bytes[i + 2] === 0 &&
			bytes[i + 3] === 1
		) {
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
	return (bytes[startCode.index + startCode.length] ?? 0) & 0x1f;
}

export function hasNalType(data: Uint8Array, type: number): boolean {
	return findStartCodes(data).some(
		(startCode) => nalTypeAt(data, startCode) === type,
	);
}

export function extractNalTypes(
	data: Uint8Array,
	types: ReadonlySet<number>,
): Uint8Array | null {
	const starts = findStartCodes(data);
	const selected: Uint8Array[] = [];
	for (let index = 0; index < starts.length; index++) {
		const start = starts[index];
		if (!start || !types.has(nalTypeAt(data, start))) continue;
		const next = starts[index + 1];
		selected.push(data.slice(start.index, next?.index ?? data.length));
	}
	if (selected.length === 0) return null;
	const size = selected.reduce((total, part) => total + part.length, 0);
	const result = new Uint8Array(size);
	let offset = 0;
	for (const part of selected) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
}

export function hasIdrFrame(data: Uint8Array): boolean {
	return hasNalType(data, 5);
}

export function hasParameterSet(data: Uint8Array): boolean {
	return hasNalType(data, 7) || hasNalType(data, 8);
}
