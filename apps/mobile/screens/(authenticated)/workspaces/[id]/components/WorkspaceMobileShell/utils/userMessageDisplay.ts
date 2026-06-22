const embeddedFileBlockPattern =
	/(?:^|\n+)\[File:\s*([^\]\n]+)\]\s*```[\s\S]*?```/g;

export function embeddedFileLabelsFromText(text: string): string[] {
	const labels: string[] = [];
	for (const match of text.matchAll(embeddedFileBlockPattern)) {
		const label = match[1]?.trim();
		if (label && !labels.includes(label)) {
			labels.push(label);
		}
	}
	return labels;
}

export function stripEmbeddedFilePayloads(text: string): string {
	return text
		.replace(embeddedFileBlockPattern, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
