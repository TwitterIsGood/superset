/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

const source = await Bun.file(
	new URL("./NewProjectModal.tsx", import.meta.url),
).text();

describe("NewProjectModal clone progress wiring", () => {
	test("subscribes to project clone progress and passes a request id", () => {
		expect(source).toContain('"project:create-progress"');
		expect(source).toContain("progressRequestId");
		expect(source).toContain("getEventBus(activeHostUrl");
		expect(source).toContain("getHostServiceWsToken(activeHostUrl)");
	});

	test("renders clone progress and lets the dialog hide while work continues", () => {
		expect(source).toContain("formatProgressPercent(progress)");
		expect(source).toContain('aria-live="polite"');
		expect(source).toContain('{working ? "Hide" : "Cancel"}');
	});

	test("wires Stop to project create cancellation without treating it as a failure", () => {
		expect(source).toContain("client.project.cancelCreate.mutate");
		expect(source).toContain("Clone stopped");
		expect(source).toContain("isCloneCancelable(progress)");
		expect(source).toContain('label: "Stop"');
		expect(source).toContain("cloneWasCanceled");
		expect(source).not.toContain('onError?.("Clone stopped")');
	});

	test("only marks progress as canceling after the backend accepts Stop", () => {
		const acceptedStopIndex = source.indexOf(
			'if (result.status === "canceling")',
		);
		const cancelingProgressIndex = source.indexOf(
			'stage: "canceling"',
			acceptedStopIndex,
		);
		const notFoundIndex = source.indexOf('if (result.status === "not_found")');

		expect(acceptedStopIndex).toBeGreaterThan(-1);
		expect(cancelingProgressIndex).toBeGreaterThan(acceptedStopIndex);
		expect(notFoundIndex).toBeGreaterThan(cancelingProgressIndex);
	});

	test("leaves the success toast to the parent modal owner", () => {
		expect(source).not.toContain('toast.success("Project created"');
		expect(source).toContain("onSuccess?.({ projectId: result.projectId })");
	});
});
