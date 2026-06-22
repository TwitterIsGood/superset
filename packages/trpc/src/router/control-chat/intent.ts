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
