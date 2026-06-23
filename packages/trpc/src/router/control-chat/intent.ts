export function hasControlChatListOrCountIntent(message: string) {
	const lower = message.toLowerCase();
	return (
		lower.includes("list") ||
		lower.includes("show") ||
		lower.includes("count") ||
		lower.includes("how many") ||
		lower.includes("all") ||
		message.includes("列出") ||
		message.includes("有哪些") ||
		message.includes("多少") ||
		message.includes("几个") ||
		message.includes("数量") ||
		message.includes("总数") ||
		message.includes("所有") ||
		message.includes("看一下") ||
		message.includes("查看")
	);
}

export function getControlChatIntentFlags(message: string) {
	const lower = message.toLowerCase();
	return {
		asksAutomation:
			lower.includes("automation") ||
			lower.includes("automations") ||
			message.includes("自动化") ||
			message.includes("定时任务"),
		asksCapability:
			lower.includes("capability") ||
			lower.includes("capabilities") ||
			lower.includes("skill") ||
			lower.includes("skills") ||
			lower.includes("cli") ||
			lower.includes("tool") ||
			lower.includes("tools & skills") ||
			lower.includes("tools and skills") ||
			message.includes("技能") ||
			message.includes("工具"),
	};
}
