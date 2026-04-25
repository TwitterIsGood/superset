import { describe, expect, test } from "bun:test";
import { aggregateModels, ModelRoundRobinRouter } from "./aggregation";

const providers = [
	{
		id: "a",
		enabled: true,
		models: [{ id: "shared", providerId: "a" }, { id: "only-a", providerId: "a" }],
	},
	{
		id: "b",
		enabled: true,
		models: [{ id: "shared", providerId: "b" }],
	},
	{
		id: "c",
		enabled: false,
		models: [{ id: "disabled", providerId: "c" }],
	},
];

describe("model aggregation", () => {
	test("deduplicates enabled provider model IDs", () => {
		expect(aggregateModels(providers).map((model) => model.id)).toEqual([
			"only-a",
			"shared",
		]);
	});

	test("round-robins duplicate models", () => {
		const router = new ModelRoundRobinRouter();
		expect(router.routeForModel(providers, "shared")).toBe("a");
		expect(router.routeForModel(providers, "shared")).toBe("b");
		expect(router.routeForModel(providers, "shared")).toBe("a");
	});
});
