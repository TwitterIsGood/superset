/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import {
	parseMobileMarkdown,
	parseMobileMarkdownInline,
} from "./mobileMarkdownBlocks";

describe("parseMobileMarkdownInline", () => {
	test("keeps strong and inline code spans as renderable nodes", () => {
		expect(parseMobileMarkdownInline("Use **bold** and `code`.")).toEqual([
			{ type: "text", text: "Use " },
			{ type: "strong", text: "bold" },
			{ type: "text", text: " and " },
			{ type: "code", text: "code" },
			{ type: "text", text: "." },
		]);
	});
});

describe("parseMobileMarkdown", () => {
	test("parses GFM-style tables instead of leaving pipes as plain text", () => {
		const blocks = parseMobileMarkdown(`
你的电脑内存情况：

| 项目 | 数量 | |
|------|------| |
| **总内存** | 约 16 GB | |
| **已使用** | 15 GB | |
`);

		expect(blocks).toEqual([
			{
				type: "paragraph",
				content: [{ type: "text", text: "你的电脑内存情况：" }],
			},
			{
				type: "table",
				headers: [
					[{ type: "text", text: "项目" }],
					[{ type: "text", text: "数量" }],
				],
				rows: [
					[
						[{ type: "strong", text: "总内存" }],
						[{ type: "text", text: "约 16 GB" }],
					],
					[
						[{ type: "strong", text: "已使用" }],
						[{ type: "text", text: "15 GB" }],
					],
				],
			},
		]);
	});

	test("keeps fenced code blocks distinct from prose", () => {
		expect(parseMobileMarkdown("Run:\n\n```sh\nbun test\n```")).toEqual([
			{
				type: "paragraph",
				content: [{ type: "text", text: "Run:" }],
			},
			{ type: "code", text: "bun test", language: "sh" },
		]);
	});

	test("parses headings, thematic breaks, and lists as mobile blocks", () => {
		expect(
			parseMobileMarkdown(`---

## 11) 当前架构的优点和隐患

### 优点
- 架构简单，前端调用 Rust 命令非常直接。
- 所有 provider 数据都复用 \`settings.json\`。

### 隐患
1. \`App.tsx\` 太大。
2. provider 配置字段容易拼错。
`),
		).toEqual([
			{ type: "thematicBreak" },
			{
				type: "heading",
				level: 2,
				content: [{ type: "text", text: "11) 当前架构的优点和隐患" }],
			},
			{
				type: "heading",
				level: 3,
				content: [{ type: "text", text: "优点" }],
			},
			{
				type: "list",
				ordered: false,
				items: [
					{
						content: [
							{
								type: "text",
								text: "架构简单，前端调用 Rust 命令非常直接。",
							},
						],
						level: 0,
					},
					{
						content: [
							{ type: "text", text: "所有 provider 数据都复用 " },
							{ type: "code", text: "settings.json" },
							{ type: "text", text: "。" },
						],
						level: 0,
					},
				],
			},
			{
				type: "heading",
				level: 3,
				content: [{ type: "text", text: "隐患" }],
			},
			{
				type: "list",
				ordered: true,
				items: [
					{
						content: [
							{ type: "code", text: "App.tsx" },
							{ type: "text", text: " 太大。" },
						],
						level: 0,
					},
					{
						content: [{ type: "text", text: "provider 配置字段容易拼错。" }],
						level: 0,
					},
				],
			},
		]);
	});
});
