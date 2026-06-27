const pierreDiffsWorkerUrl = new URL(
	"@pierre/diffs/worker/worker.js",
	import.meta.url,
);

export const createPierreWorker = (): Worker =>
	new Worker(pierreDiffsWorkerUrl, { type: "module" });
