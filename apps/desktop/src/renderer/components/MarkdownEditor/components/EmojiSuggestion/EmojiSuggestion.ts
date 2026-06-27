import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, {
	type SuggestionKeyDownProps,
	type SuggestionProps,
} from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
	EmojiSuggestionList,
	type EmojiSuggestionListRef,
} from "./components/EmojiSuggestionList";

const MAX_RESULTS = 10;
export const emojiSuggestionKey = new PluginKey(
	"markdownEditorEmojiSuggestion",
);

export interface EmojiItem {
	emoji: string;
	name: string;
	shortcodes: string[];
	tags: string[];
}

const COMMON_EMOJIS: EmojiItem[] = [
	{
		emoji: "😀",
		name: "grinning face",
		shortcodes: ["grinning"],
		tags: ["smile"],
	},
	{ emoji: "😄", name: "smiling face", shortcodes: ["smile"], tags: ["happy"] },
	{
		emoji: "😂",
		name: "face with tears of joy",
		shortcodes: ["joy"],
		tags: ["laugh"],
	},
	{
		emoji: "🙂",
		name: "slightly smiling face",
		shortcodes: ["slightly_smiling_face"],
		tags: ["smile"],
	},
	{
		emoji: "😍",
		name: "smiling face with heart eyes",
		shortcodes: ["heart_eyes"],
		tags: ["love"],
	},
	{
		emoji: "🤔",
		name: "thinking face",
		shortcodes: ["thinking"],
		tags: ["think"],
	},
	{
		emoji: "👍",
		name: "thumbs up",
		shortcodes: ["thumbsup", "+1"],
		tags: ["approve", "yes"],
	},
	{
		emoji: "👎",
		name: "thumbs down",
		shortcodes: ["thumbsdown", "-1"],
		tags: ["reject", "no"],
	},
	{
		emoji: "👏",
		name: "clapping hands",
		shortcodes: ["clap"],
		tags: ["applause"],
	},
	{
		emoji: "🙏",
		name: "folded hands",
		shortcodes: ["pray"],
		tags: ["thanks", "please"],
	},
	{ emoji: "❤️", name: "red heart", shortcodes: ["heart"], tags: ["love"] },
	{ emoji: "🔥", name: "fire", shortcodes: ["fire"], tags: ["hot"] },
	{ emoji: "✨", name: "sparkles", shortcodes: ["sparkles"], tags: ["magic"] },
	{
		emoji: "🎉",
		name: "party popper",
		shortcodes: ["tada"],
		tags: ["celebrate"],
	},
	{
		emoji: "🚀",
		name: "rocket",
		shortcodes: ["rocket"],
		tags: ["ship", "launch"],
	},
	{
		emoji: "✅",
		name: "check mark button",
		shortcodes: ["white_check_mark"],
		tags: ["done", "success"],
	},
	{
		emoji: "❌",
		name: "cross mark",
		shortcodes: ["x"],
		tags: ["fail", "error"],
	},
	{ emoji: "⚠️", name: "warning", shortcodes: ["warning"], tags: ["caution"] },
	{ emoji: "🐛", name: "bug", shortcodes: ["bug"], tags: ["issue"] },
	{ emoji: "💡", name: "light bulb", shortcodes: ["bulb"], tags: ["idea"] },
	{ emoji: "📝", name: "memo", shortcodes: ["memo"], tags: ["note"] },
	{
		emoji: "🔧",
		name: "wrench",
		shortcodes: ["wrench"],
		tags: ["fix", "tool"],
	},
	{ emoji: "📌", name: "pushpin", shortcodes: ["pushpin"], tags: ["pin"] },
	{ emoji: "👀", name: "eyes", shortcodes: ["eyes"], tags: ["look", "watch"] },
	{
		emoji: "💯",
		name: "hundred points",
		shortcodes: ["100"],
		tags: ["perfect"],
	},
];

function matchEmoji(item: EmojiItem, query: string): boolean {
	const q = query.toLowerCase();
	return (
		item.shortcodes.some((s) => s.toLowerCase().includes(q)) ||
		item.tags.some((t) => t.toLowerCase().includes(q)) ||
		item.name.toLowerCase().includes(q)
	);
}

export const EmojiSuggestion = Extension.create({
	name: "emojiSuggestion",

	addProseMirrorPlugins() {
		return [
			Suggestion<EmojiItem>({
				editor: this.editor,
				pluginKey: emojiSuggestionKey,
				char: ":",
				items: ({ query }) => {
					if (!query) return [];
					return COMMON_EMOJIS.filter((item) => matchEmoji(item, query)).slice(
						0,
						MAX_RESULTS,
					);
				},
				command: ({ editor, range, props }) => {
					editor.chain().focus().insertContentAt(range, props.emoji).run();
				},
				render: () => {
					let component: ReactRenderer<
						EmojiSuggestionListRef,
						SuggestionProps<EmojiItem>
					> | null = null;
					let popup: TippyInstance[] | null = null;

					return {
						onStart: (props: SuggestionProps<EmojiItem>) => {
							component = new ReactRenderer(EmojiSuggestionList, {
								props,
								editor: props.editor,
							});

							if (!props.clientRect) return;

							const clientRect = props.clientRect;
							popup = tippy("body", {
								getReferenceClientRect: () => clientRect?.() ?? new DOMRect(),
								appendTo: () => document.body,
								content: component.element,
								showOnCreate: !!props.query,
								interactive: true,
								trigger: "manual",
								placement: "bottom-start",
							});
						},
						onUpdate: (props: SuggestionProps<EmojiItem>) => {
							component?.updateProps(props);
							if (!props.clientRect) return;
							const getClientRect = props.clientRect;
							popup?.[0]?.setProps({
								getReferenceClientRect: () => getClientRect() ?? new DOMRect(),
							});
							if (props.query) popup?.[0]?.show();
							else popup?.[0]?.hide();
						},
						onKeyDown: (props: SuggestionKeyDownProps) => {
							if (props.event.key === "Escape") {
								props.event.preventDefault();
								props.event.stopPropagation();
								popup?.[0]?.hide();
								return true;
							}
							return component?.ref?.onKeyDown(props) ?? false;
						},
						onExit: () => {
							popup?.[0]?.destroy();
							component?.destroy();
						},
					};
				},
			}),
		];
	},
});
