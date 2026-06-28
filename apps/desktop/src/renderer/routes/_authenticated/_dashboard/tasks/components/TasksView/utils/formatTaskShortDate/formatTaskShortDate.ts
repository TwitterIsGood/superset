const taskShortDateFormatter = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	month: "short",
});

export function formatTaskShortDate(value: Date | string | number): string {
	return taskShortDateFormatter.format(new Date(value));
}
