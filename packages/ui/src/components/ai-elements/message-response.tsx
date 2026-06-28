"use client";

import type { ComponentProps } from "react";
import { memo } from "react";
import { Streamdown } from "streamdown";
import { cn } from "../../lib/utils";

const defaultMessageAnimation = {
	animation: "blurIn",
	sep: "char",
	duration: 180,
	easing: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

/**
 * Compact Tailwind overrides for MessageResponse used inside tool call content.
 * Apply this className to any MessageResponse rendered inside a collapsible
 * tool call body so all markdown elements scale down to xs context.
 */
export const TOOL_CALL_MD_CLASSNAME =
	// Headings
	"[&_h1]:text-sm [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-0.5 " +
	"[&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-0.5 " +
	"[&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-0 " +
	"[&_h4]:text-xs [&_h4]:font-semibold " +
	"[&_h5]:text-xs [&_h5]:font-medium " +
	"[&_h6]:text-xs [&_h6]:font-medium " +
	// Inline code
	"[&_:not(pre)>code]:text-xs " +
	// Lists
	"[&_li>p:first-child]:mt-0";

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

export const MessageResponse = memo(
	({ className, animated, isAnimating, ...props }: MessageResponseProps) => (
		<Streamdown
			animated={animated ?? defaultMessageAnimation}
			className={cn(
				"text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_ol]:list-outside [&_ol]:pl-6 [&_ul]:list-outside [&_ul]:pl-6 [&_li]:break-words [&_li]:whitespace-pre-wrap [&_p]:break-words [&_p]:whitespace-pre-wrap [&_:not(pre)>code]:break-all [&_[data-streamdown=table-wrapper]]:overflow-hidden [&_[data-streamdown=table-wrapper]]:bg-transparent [&_[data-streamdown=table-wrapper]]:p-0 [&_[data-streamdown=table-wrapper]]:gap-0 [&_[data-streamdown=table-wrapper]>div]:border-0 [&_[data-streamdown=table-wrapper]>div]:bg-transparent [&_[data-streamdown=table-wrapper]>div]:rounded-none [&_thead]:bg-muted/50",
				className,
			)}
			controls={{ table: false }}
			isAnimating={isAnimating}
			linkSafety={{ enabled: false }}
			mode="streaming"
			{...props}
		/>
	),
	(prevProps, nextProps) =>
		prevProps.children === nextProps.children &&
		prevProps.isAnimating === nextProps.isAnimating &&
		prevProps.mermaid?.config?.theme === nextProps.mermaid?.config?.theme,
);

MessageResponse.displayName = "MessageResponse";
