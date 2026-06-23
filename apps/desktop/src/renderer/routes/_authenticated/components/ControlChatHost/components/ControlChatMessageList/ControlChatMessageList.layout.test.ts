import { describe, expect, it } from "bun:test";

async function readSibling(relativePath: string) {
	return await Bun.file(new URL(relativePath, import.meta.url)).text();
}

describe("Control Chat floating layout", () => {
	it("keeps long message content inside the floating panel", async () => {
		const source = await readSibling("./ControlChatMessageList.tsx");

		expect(source).toContain("[overflow-wrap:anywhere]");
		expect(source).toContain("flex min-w-0 max-w-full flex-col gap-1");
		expect(source).toContain("min-w-0 max-w-[88%] space-y-2 overflow-hidden");
		expect(source).toContain(
			'ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden"',
		);
		expect(source).toContain("boundedPartClassName");
	});

	it("keeps header and composer controls clickable when content is long", async () => {
		const windowSource = await readSibling(
			"../ControlChatWindow/ControlChatWindow.tsx",
		);
		const composerSource = await readSibling(
			"../ControlChatComposer/ControlChatComposer.tsx",
		);

		expect(windowSource).toContain("flex min-h-0 min-w-0 flex-1 flex-col");
		expect(windowSource).toContain("flex h-12 min-w-0 shrink-0 items-center");
		expect(windowSource).toContain("size-7 shrink-0");
		expect(composerSource).toContain("min-w-0 overflow-hidden border-t");
		expect(composerSource).toContain("min-h-20 min-w-0 flex-1 resize-none");
		expect(composerSource).toContain("flex shrink-0 flex-col gap-2");
	});
});
