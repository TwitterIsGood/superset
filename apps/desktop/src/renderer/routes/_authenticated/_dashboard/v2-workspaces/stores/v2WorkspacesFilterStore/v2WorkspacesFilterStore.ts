import { create } from "zustand";

export const DEVICE_FILTER_ALL = "all";
export const DEVICE_FILTER_THIS_DEVICE = "this-device";
export const PROJECT_FILTER_ALL = "all";

export type V2WorkspacesDeviceFilter = string;
export type V2WorkspacesProjectFilter = string;

interface V2WorkspacesFilterState {
	searchQuery: string;
	deviceFilter: V2WorkspacesDeviceFilter;
	projectFilter: V2WorkspacesProjectFilter;
	setSearchQuery: (searchQuery: string) => void;
	setDeviceFilter: (deviceFilter: V2WorkspacesDeviceFilter) => void;
	setProjectFilter: (projectFilter: V2WorkspacesProjectFilter) => void;
	reset: () => void;
}

export const useV2WorkspacesFilterStore = create<V2WorkspacesFilterState>()(
	(set) => ({
		searchQuery: "",
		deviceFilter: DEVICE_FILTER_ALL,
		projectFilter: PROJECT_FILTER_ALL,
		setSearchQuery: (searchQuery) =>
			set((state) =>
				state.searchQuery === searchQuery ? state : { searchQuery },
			),
		setDeviceFilter: (deviceFilter) =>
			set((state) =>
				state.deviceFilter === deviceFilter ? state : { deviceFilter },
			),
		setProjectFilter: (projectFilter) =>
			set((state) =>
				state.projectFilter === projectFilter ? state : { projectFilter },
			),
		reset: () =>
			set((state) => {
				if (
					state.searchQuery === "" &&
					state.deviceFilter === DEVICE_FILTER_ALL &&
					state.projectFilter === PROJECT_FILTER_ALL
				) {
					return state;
				}
				return {
					searchQuery: "",
					deviceFilter: DEVICE_FILTER_ALL,
					projectFilter: PROJECT_FILTER_ALL,
				};
			}),
	}),
);
