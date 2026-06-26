import type { UniqueIdentifier } from "@dnd-kit/core";

const WORKSPACE_ID_PREFIX = "ws::";
const SECTION_ID_PREFIX = "sec::";

export const wsId = (id: string) => `${WORKSPACE_ID_PREFIX}${id}`;
export const secId = (id: string) => `${SECTION_ID_PREFIX}${id}`;
export const isSec = (id: UniqueIdentifier) =>
	String(id).startsWith(SECTION_ID_PREFIX);

export const parseId = (id: UniqueIdentifier) => {
	const value = String(id);
	if (value.startsWith(WORKSPACE_ID_PREFIX)) {
		return {
			type: "workspace" as const,
			realId: value.slice(WORKSPACE_ID_PREFIX.length),
		};
	}
	if (value.startsWith(SECTION_ID_PREFIX)) {
		return {
			type: "section" as const,
			realId: value.slice(SECTION_ID_PREFIX.length),
		};
	}
	return null;
};
