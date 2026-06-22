import { useMemo } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import {
	type MobileMarkdownBlock,
	type MobileMarkdownInline,
	parseMobileMarkdown,
} from "./utils/mobileMarkdownBlocks";

interface MobileMarkdownProps {
	children: string;
	className?: string;
}

function renderInline(
	parts: MobileMarkdownInline[],
	options: { tone?: "body" | "table" } = {},
) {
	return parts.map((part, index) => {
		const key = `${part.type}-${index}-${part.text}`;
		switch (part.type) {
			case "strong":
				return (
					<Text
						key={key}
						className={cn(
							"font-semibold",
							options.tone === "table" ? "text-[#f2f2f4]" : "text-[#e6e6ec]",
						)}
					>
						{part.text}
					</Text>
				);
			case "code":
				return (
					<Text
						key={key}
						className="rounded bg-[#24242b] px-1 font-mono text-[#f2c66d]"
					>
						{part.text}
					</Text>
				);
			case "text":
				return <Text key={key}>{part.text}</Text>;
		}
		return null;
	});
}

function renderParagraph(
	block: Extract<MobileMarkdownBlock, { type: "paragraph" }>,
) {
	return (
		<Text className="text-[16px] leading-6 text-[#d9d9df]">
			{renderInline(block.content)}
		</Text>
	);
}

function headingClassName(level: number) {
	if (level <= 1) {
		return "text-[22px] font-semibold leading-8 text-[#f4f4f6]";
	}
	if (level === 2) {
		return "text-[20px] font-semibold leading-7 text-[#f2f2f4]";
	}
	if (level === 3) {
		return "text-[18px] font-semibold leading-7 text-[#ececf1]";
	}
	return "text-[16px] font-semibold leading-6 text-[#e6e6ec]";
}

function renderHeading(
	block: Extract<MobileMarkdownBlock, { type: "heading" }>,
) {
	return (
		<Text className={headingClassName(block.level)}>
			{renderInline(block.content)}
		</Text>
	);
}

function renderThematicBreak() {
	return <View className="h-px bg-[#2a2a32]" />;
}

function renderList(block: Extract<MobileMarkdownBlock, { type: "list" }>) {
	return (
		<View className="gap-1.5">
			{block.items.map((item, index) => (
				<View
					key={`item-${index}-${item.content.map((part) => `${part.type}:${part.text}`).join(",")}`}
					className="flex-row items-start gap-2"
					style={{ paddingLeft: Math.min(item.level, 3) * 12 }}
				>
					<Text className="w-5 shrink-0 text-right text-[16px] leading-6 text-[#8b8b96]">
						{block.ordered ? `${index + 1}.` : "•"}
					</Text>
					<Text className="min-w-0 flex-1 text-[16px] leading-6 text-[#d9d9df]">
						{renderInline(item.content)}
					</Text>
				</View>
			))}
		</View>
	);
}

function renderCode(block: Extract<MobileMarkdownBlock, { type: "code" }>) {
	return (
		<View className="rounded-md border border-[#2d2d36] bg-[#09090d] px-3 py-2">
			{block.language ? (
				<Text className="mb-1 text-[11px] uppercase text-[#666672]">
					{block.language}
				</Text>
			) : null}
			<Text className="font-mono text-[12px] leading-5 text-[#c8c8d0]">
				{block.text}
			</Text>
		</View>
	);
}

function inlineDisplayWidth(parts: MobileMarkdownInline[]): number {
	return parts.reduce((total, part) => {
		const width = Array.from(part.text).reduce((sum, character) => {
			const codePoint = character.codePointAt(0) ?? 0;
			return sum + (codePoint > 255 ? 2 : 1);
		}, 0);
		return total + width;
	}, 0);
}

function clampColumnWeight(value: number): number {
	return Math.min(Math.max(value, 3), 18);
}

function isIsoDateColumn(values: string[]): boolean {
	const nonEmptyValues = values.filter((value) => value.length > 0);
	return (
		nonEmptyValues.length > 0 &&
		nonEmptyValues.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
	);
}

function inlinePlainText(parts: MobileMarkdownInline[]): string {
	return parts.map((part) => part.text).join("");
}

function tableColumnFlexWeights(
	block: Extract<MobileMarkdownBlock, { type: "table" }>,
	columns: number[],
): number[] {
	return columns.map((columnIndex) => {
		const cells = [
			block.headers[columnIndex] ?? [],
			...block.rows.map((row) => row[columnIndex] ?? []),
		];
		const values = cells.map(inlinePlainText);
		const widths = cells.map(inlineDisplayWidth);
		const dateColumnFloor = isIsoDateColumn(values.slice(1)) ? 13 : 0;
		return clampColumnWeight(Math.max(...widths, dateColumnFloor));
	});
}

function renderTable(block: Extract<MobileMarkdownBlock, { type: "table" }>) {
	const columnCount = Math.max(
		block.headers.length,
		...block.rows.map((row) => row.length),
	);
	const columns = Array.from({ length: columnCount }, (_, index) => index);
	const columnWeights = tableColumnFlexWeights(block, columns);
	const isDenseTable = columnCount >= 4;
	const rowKey = (row: MobileMarkdownInline[][]) =>
		row
			.map((cell) => cell.map((part) => `${part.type}:${part.text}`).join(","))
			.join("|");
	const cellClassName = () =>
		cn(
			"min-w-0 border-[#2d2d36] border-r py-2 last:border-r-0",
			isDenseTable ? "px-1" : "px-2.5",
		);
	const cellStyle = (columnIndex: number) => ({
		flexBasis: 0,
		flexGrow: columnWeights[columnIndex] ?? 1,
		flexShrink: 1,
	});

	return (
		<View className="-mx-0.5">
			<View className="w-full overflow-hidden rounded-md border border-[#2d2d36]">
				<View className="flex-row bg-[#19191f]">
					{columns.map((columnIndex) => (
						<View
							key={`header-${columnIndex}`}
							className={cellClassName()}
							style={cellStyle(columnIndex)}
						>
							<Text
								className={cn(
									"font-semibold text-[#f2f2f4]",
									isDenseTable ? "text-[11px] leading-4" : "text-[13px]",
								)}
								numberOfLines={2}
							>
								{renderInline(block.headers[columnIndex] ?? [], {
									tone: "table",
								})}
							</Text>
						</View>
					))}
				</View>
				{block.rows.map((row, rowIndex) => (
					<View
						key={`row-${rowIndex}-${rowKey(row)}`}
						className="flex-row border-[#2d2d36] border-t bg-[#111116]"
					>
						{columns.map((columnIndex) => (
							<View
								key={`cell-${rowIndex}-${rowKey(row)}-${columnIndex}`}
								className={cellClassName()}
								style={cellStyle(columnIndex)}
							>
								<Text
									className={cn(
										"leading-5 text-[#d9d9df]",
										isDenseTable ? "text-[11px]" : "text-[13px]",
									)}
									numberOfLines={2}
								>
									{renderInline(row[columnIndex] ?? [], { tone: "table" })}
								</Text>
							</View>
						))}
					</View>
				))}
			</View>
		</View>
	);
}

function renderBlock(block: MobileMarkdownBlock, index: number) {
	const key = `${block.type}-${index}`;
	switch (block.type) {
		case "paragraph":
			return <View key={key}>{renderParagraph(block)}</View>;
		case "heading":
			return <View key={key}>{renderHeading(block)}</View>;
		case "thematicBreak":
			return <View key={key}>{renderThematicBreak()}</View>;
		case "list":
			return <View key={key}>{renderList(block)}</View>;
		case "code":
			return <View key={key}>{renderCode(block)}</View>;
		case "table":
			return <View key={key}>{renderTable(block)}</View>;
	}
	return null;
}

export function MobileMarkdown({ children, className }: MobileMarkdownProps) {
	const blocks = useMemo(() => parseMobileMarkdown(children), [children]);
	if (blocks.length === 0) return null;

	return (
		<View className={cn("gap-3", className)}>{blocks.map(renderBlock)}</View>
	);
}
