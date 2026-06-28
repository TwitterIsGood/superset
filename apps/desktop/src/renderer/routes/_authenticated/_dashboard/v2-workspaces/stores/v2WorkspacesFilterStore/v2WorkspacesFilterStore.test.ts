import { describe, expect, test } from "bun:test";
import {
	DEVICE_FILTER_ALL,
	PROJECT_FILTER_ALL,
	useV2WorkspacesFilterStore,
} from "./v2WorkspacesFilterStore";

describe("v2WorkspacesFilterStore", () => {
	test("keeps no-op filter updates from replacing state", () => {
		useV2WorkspacesFilterStore.setState({
			searchQuery: "",
			deviceFilter: DEVICE_FILTER_ALL,
			projectFilter: PROJECT_FILTER_ALL,
		});

		const initialState = useV2WorkspacesFilterStore.getState();

		initialState.setSearchQuery("");
		expect(useV2WorkspacesFilterStore.getState()).toBe(initialState);

		initialState.setDeviceFilter(DEVICE_FILTER_ALL);
		expect(useV2WorkspacesFilterStore.getState()).toBe(initialState);

		initialState.setProjectFilter(PROJECT_FILTER_ALL);
		expect(useV2WorkspacesFilterStore.getState()).toBe(initialState);

		initialState.reset();
		expect(useV2WorkspacesFilterStore.getState()).toBe(initialState);
	});

	test("replaces state when a filter changes", () => {
		useV2WorkspacesFilterStore.setState({
			searchQuery: "",
			deviceFilter: DEVICE_FILTER_ALL,
			projectFilter: PROJECT_FILTER_ALL,
		});

		const initialState = useV2WorkspacesFilterStore.getState();

		initialState.setSearchQuery("alpha");

		expect(useV2WorkspacesFilterStore.getState()).not.toBe(initialState);
		expect(useV2WorkspacesFilterStore.getState().searchQuery).toBe("alpha");
	});
});
