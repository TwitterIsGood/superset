import type { AppRouter } from "@superset/host-service";
import type { WorkspaceState } from "@superset/panes";
import type { inferRouterInputs } from "@trpc/server";

interface Issue {
	readonly message: string;
	readonly path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
}

interface StandardSchemaV1<Input = unknown, Output = Input> {
	readonly "~standard": {
		readonly version: 1;
		readonly vendor: string;
		readonly types?: {
			readonly input: Input;
			readonly output: Output;
		};
		readonly validate: (
			value: unknown,
		) => { readonly value: Output } | { readonly issues: ReadonlyArray<Issue> };
	};
}

type ParseResult<T> =
	| { success: true; data: T }
	| { success: false; issues: Issue[] };

type LocalStandardSchema<
	Input extends object,
	Output extends object,
> = StandardSchemaV1<Input, Output> & {
	parse: (value: unknown) => Output;
	safeParse: (value: unknown) => ParseResult<Output>;
};

function makeSchema<Input extends object, Output extends object>(
	validate: (value: unknown) => ParseResult<Output>,
): LocalStandardSchema<Input, Output> {
	return {
		"~standard": {
			version: 1,
			vendor: "superset-local",
			validate: (value: unknown) => {
				const result = validate(value);
				return result.success
					? { value: result.data }
					: { issues: result.issues };
			},
		},
		parse: (value: unknown) => {
			const result = validate(value);
			if (result.success) {
				return result.data;
			}
			throw new Error(
				result.issues.map((issue) => issue.message).join("; ") ||
					"Invalid local row",
			);
		},
		safeParse: validate,
	};
}

function issue(path: Issue["path"], message: string): Issue {
	return { path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(
	value: unknown,
	issues: Issue[],
	path: Issue["path"] = [],
): Record<string, unknown> | undefined {
	if (isRecord(value)) {
		return value;
	}
	issues.push(issue(path, "Expected object"));
	return undefined;
}

function requireString(
	value: unknown,
	issues: Issue[],
	path: Issue["path"],
): string {
	if (typeof value === "string") {
		return value;
	}
	issues.push(issue(path, "Expected string"));
	return "";
}

function optionalString(
	value: unknown,
	issues: Issue[],
	path: Issue["path"],
): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	return requireString(value, issues, path);
}

function nullableStringWithDefault(
	value: unknown,
	defaultValue: string | null,
	issues: Issue[],
	path: Issue["path"],
): string | null {
	if (value === undefined) {
		return defaultValue;
	}
	if (value === null) {
		return null;
	}
	return requireString(value, issues, path);
}

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(
	value: unknown,
	issues: Issue[],
	path: Issue["path"],
): string {
	const id = requireString(value, issues, path);
	if (id && !UUID_PATTERN.test(id)) {
		issues.push(issue(path, "Expected UUID"));
	}
	return id;
}

function requireNumber(
	value: unknown,
	issues: Issue[],
	path: Issue["path"],
): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	issues.push(issue(path, "Expected number"));
	return 0;
}

function optionalNumber(
	value: unknown,
	issues: Issue[],
	path: Issue["path"],
): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	return requireNumber(value, issues, path);
}

function intWithDefault(
	value: unknown,
	defaultValue: number,
	issues: Issue[],
	path: Issue["path"],
): number {
	if (value === undefined) {
		return defaultValue;
	}
	const parsed = requireNumber(value, issues, path);
	if (!Number.isInteger(parsed)) {
		issues.push(issue(path, "Expected integer"));
	}
	return parsed;
}

function booleanWithDefault(
	value: unknown,
	defaultValue: boolean,
	issues: Issue[],
	path: Issue["path"],
): boolean {
	if (value === undefined) {
		return defaultValue;
	}
	if (typeof value === "boolean") {
		return value;
	}
	issues.push(issue(path, "Expected boolean"));
	return defaultValue;
}

function optionalBoolean(
	value: unknown,
	issues: Issue[],
	path: Issue["path"],
): boolean | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value === "boolean") {
		return value;
	}
	issues.push(issue(path, "Expected boolean"));
	return undefined;
}

function persistedDate(
	value: unknown,
	issues: Issue[],
	path: Issue["path"],
): Date {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value;
	}
	if (typeof value === "string") {
		return new Date(value);
	}
	issues.push(issue(path, "Expected Date or date string"));
	return new Date(Number.NaN);
}

function stringArrayWithDefault(
	value: unknown,
	defaultValue: string[],
	issues: Issue[],
	path: Issue["path"],
): string[] {
	if (value === undefined) {
		return defaultValue;
	}
	if (!Array.isArray(value)) {
		issues.push(issue(path, "Expected string array"));
		return defaultValue;
	}
	return value.map((item, index) =>
		requireString(item, issues, [...(path ?? []), index]),
	);
}

function enumValue<T extends string>(
	value: unknown,
	allowed: readonly T[],
	defaultValue: T | undefined,
	issues: Issue[],
	path: Issue["path"],
): T {
	if (value === undefined && defaultValue !== undefined) {
		return defaultValue;
	}
	if (typeof value === "string" && allowed.includes(value as T)) {
		return value as T;
	}
	issues.push(issue(path, `Expected one of: ${allowed.join(", ")}`));
	return defaultValue ?? allowed[0];
}

export interface DashboardSidebarProjectInput {
	projectId: string;
	createdAt: string | Date;
	isCollapsed?: boolean;
	tabOrder?: number;
	defaultOpenInApp?: string | null;
}

export interface DashboardSidebarProjectRow {
	projectId: string;
	createdAt: Date;
	isCollapsed: boolean;
	tabOrder: number;
	defaultOpenInApp: string | null;
}

export const dashboardSidebarProjectSchema = makeSchema<
	DashboardSidebarProjectInput,
	DashboardSidebarProjectRow
>((value) => {
	const issues: Issue[] = [];
	const row = requireRecord(value, issues);
	if (!row) {
		return { success: false, issues };
	}
	const data: DashboardSidebarProjectRow = {
		projectId: requireUuid(row.projectId, issues, ["projectId"]),
		createdAt: persistedDate(row.createdAt, issues, ["createdAt"]),
		isCollapsed: booleanWithDefault(row.isCollapsed, false, issues, [
			"isCollapsed",
		]),
		tabOrder: intWithDefault(row.tabOrder, 0, issues, ["tabOrder"]),
		defaultOpenInApp: nullableStringWithDefault(
			row.defaultOpenInApp,
			null,
			issues,
			["defaultOpenInApp"],
		),
	};
	return issues.length ? { success: false, issues } : { success: true, data };
});

export type ChangesFilter =
	| { kind: "all" }
	| { kind: "uncommitted" }
	| { kind: "commit"; hash: string }
	| { kind: "range"; fromHash: string; toHash: string };

export type ChangesViewMode = "folders" | "tree";
export type WorkspaceSidebarActiveTab =
	| "changes"
	| "files"
	| "review"
	| "models";
export type WorkspaceRunState =
	| "running"
	| "stopped-by-user"
	| "stopped-by-exit";

function parseChangesFilter(value: unknown): ParseResult<ChangesFilter> {
	const issues: Issue[] = [];
	if (!isRecord(value) || typeof value.kind !== "string") {
		return {
			success: false,
			issues: [issue(["changesFilter"], "Expected changes filter")],
		};
	}

	switch (value.kind) {
		case "all":
		case "uncommitted":
			return { success: true, data: { kind: value.kind } };
		case "commit":
			return {
				success: true,
				data: {
					kind: "commit",
					hash: requireString(value.hash, issues, ["hash"]),
				},
			};
		case "range":
			return {
				success: true,
				data: {
					kind: "range",
					fromHash: requireString(value.fromHash, issues, ["fromHash"]),
					toHash: requireString(value.toHash, issues, ["toHash"]),
				},
			};
		default:
			return {
				success: false,
				issues: [issue(["kind"], "Expected known changes filter kind")],
			};
	}
}

function safeParseWithDefault<T>(
	parse: (value: unknown) => ParseResult<T>,
	value: unknown,
	defaultValue: T,
): T {
	const parsed = parse(value);
	return parsed.success ? parsed.data : defaultValue;
}

function sanitizeWorkspacePaneLayout(
	value: WorkspaceState<unknown>,
): WorkspaceState<unknown> {
	if (!isRecord(value) || !Array.isArray(value.tabs)) {
		return value;
	}

	let changed = false;
	const tabs = value.tabs.map((tab) => {
		if (!isRecord(tab) || !isRecord(tab.panes)) {
			return tab;
		}

		let tabChanged = false;
		const panes = Object.fromEntries(
			Object.entries(tab.panes).map(([paneId, pane]) => {
				if (!isRecord(pane) || !isRecord(pane.data)) {
					return [paneId, pane];
				}
				const launchConfig = pane.data.launchConfig;
				if (
					!isRecord(launchConfig) ||
					!Array.isArray(launchConfig.initialFiles)
				) {
					return [paneId, pane];
				}

				tabChanged = true;
				changed = true;
				const { initialFiles: _initialFiles, ...nextLaunchConfig } =
					launchConfig;
				return [
					paneId,
					{
						...pane,
						data: {
							...pane.data,
							launchConfig: nextLaunchConfig,
						},
					},
				];
			}),
		);

		return tabChanged ? { ...tab, panes } : tab;
	});

	return changed ? { ...value, tabs } : value;
}

export interface WorkspaceRunTerminalState {
	terminalId: string;
	workspaceId: string;
	state: WorkspaceRunState;
	command: string;
	definitionSource: "project-config" | "terminal-preset";
	definitionId?: string;
	startedAt: number;
	stoppedAt?: number;
	exitCode?: number;
	signal?: number;
	stopRequestedAt?: number;
}

export interface WorkspaceLocalStateInput {
	workspaceId: string;
	createdAt: string | Date;
	sidebarState: {
		projectId: string;
		tabOrder?: number;
		sectionId?: string | null;
		changesFilter?: ChangesFilter;
		changesViewMode?: ChangesViewMode;
		activeTab?: WorkspaceSidebarActiveTab;
		isHidden?: boolean;
	};
	paneLayout: WorkspaceState<unknown>;
	viewedFiles?: string[];
	recentlyViewedFiles?: Array<{
		relativePath: string;
		absolutePath: string;
		lastAccessedAt: number;
	}>;
	workspaceRunTerminals?: Record<string, WorkspaceRunTerminalState>;
}

export interface WorkspaceLocalStateRow {
	workspaceId: string;
	createdAt: Date;
	sidebarState: {
		projectId: string;
		tabOrder: number;
		sectionId: string | null;
		changesFilter: ChangesFilter;
		changesViewMode: ChangesViewMode;
		activeTab: WorkspaceSidebarActiveTab;
		isHidden: boolean;
	};
	paneLayout: WorkspaceState<unknown>;
	viewedFiles: string[];
	recentlyViewedFiles: Array<{
		relativePath: string;
		absolutePath: string;
		lastAccessedAt: number;
	}>;
	workspaceRunTerminals: Record<string, WorkspaceRunTerminalState>;
}

const SIDEBAR_STATE_DEFAULTS = {
	tabOrder: 0,
	sectionId: null,
	changesFilter: { kind: "all" },
	changesViewMode: "folders",
	activeTab: "changes",
	isHidden: false,
} as const satisfies Omit<WorkspaceLocalStateRow["sidebarState"], "projectId">;

const WORKSPACE_LOCAL_STATE_OPTIONAL_DEFAULTS = {
	viewedFiles: [] as string[],
	recentlyViewedFiles: [] as WorkspaceLocalStateRow["recentlyViewedFiles"],
	workspaceRunTerminals: {} as Record<string, WorkspaceRunTerminalState>,
};

function parseRecentFiles(
	value: unknown,
	issues: Issue[],
	path: Issue["path"],
): WorkspaceLocalStateRow["recentlyViewedFiles"] {
	if (value === undefined) {
		return WORKSPACE_LOCAL_STATE_OPTIONAL_DEFAULTS.recentlyViewedFiles;
	}
	if (!Array.isArray(value)) {
		issues.push(issue(path, "Expected recently viewed files array"));
		return [];
	}
	return value.map((item, index) => {
		const itemPath = [...(path ?? []), index];
		const row = requireRecord(item, issues, itemPath) ?? {};
		return {
			relativePath: requireString(row.relativePath, issues, [
				...itemPath,
				"relativePath",
			]),
			absolutePath: requireString(row.absolutePath, issues, [
				...itemPath,
				"absolutePath",
			]),
			lastAccessedAt: requireNumber(row.lastAccessedAt, issues, [
				...itemPath,
				"lastAccessedAt",
			]),
		};
	});
}

function parseWorkspaceRunTerminalState(
	value: unknown,
	issues: Issue[],
	path: Issue["path"],
): WorkspaceRunTerminalState {
	const row = requireRecord(value, issues, path) ?? {};
	return {
		terminalId: requireString(row.terminalId, issues, [
			...(path ?? []),
			"terminalId",
		]),
		workspaceId: requireUuid(row.workspaceId, issues, [
			...(path ?? []),
			"workspaceId",
		]),
		state: enumValue(
			row.state,
			["running", "stopped-by-user", "stopped-by-exit"] as const,
			undefined,
			issues,
			[...(path ?? []), "state"],
		),
		command: requireString(row.command, issues, [...(path ?? []), "command"]),
		definitionSource: enumValue(
			row.definitionSource,
			["project-config", "terminal-preset"] as const,
			undefined,
			issues,
			[...(path ?? []), "definitionSource"],
		),
		definitionId: optionalString(row.definitionId, issues, [
			...(path ?? []),
			"definitionId",
		]),
		startedAt: requireNumber(row.startedAt, issues, [
			...(path ?? []),
			"startedAt",
		]),
		stoppedAt: optionalNumber(row.stoppedAt, issues, [
			...(path ?? []),
			"stoppedAt",
		]),
		exitCode: optionalNumber(row.exitCode, issues, [
			...(path ?? []),
			"exitCode",
		]),
		signal: optionalNumber(row.signal, issues, [...(path ?? []), "signal"]),
		stopRequestedAt: optionalNumber(row.stopRequestedAt, issues, [
			...(path ?? []),
			"stopRequestedAt",
		]),
	};
}

function parseTerminalStates(
	value: unknown,
	issues: Issue[],
	path: Issue["path"],
): Record<string, WorkspaceRunTerminalState> {
	if (value === undefined) {
		return WORKSPACE_LOCAL_STATE_OPTIONAL_DEFAULTS.workspaceRunTerminals;
	}
	const record = requireRecord(value, issues, path);
	if (!record) {
		return {};
	}
	return Object.fromEntries(
		Object.entries(record).map(([key, terminal]) => [
			key,
			parseWorkspaceRunTerminalState(terminal, issues, [...(path ?? []), key]),
		]),
	);
}

export const workspaceRunTerminalStateSchema = makeSchema<
	WorkspaceRunTerminalState,
	WorkspaceRunTerminalState
>((value) => {
	const issues: Issue[] = [];
	const data = parseWorkspaceRunTerminalState(value, issues, []);
	return issues.length ? { success: false, issues } : { success: true, data };
});

export const workspaceLocalStateSchema = makeSchema<
	WorkspaceLocalStateInput,
	WorkspaceLocalStateRow
>((value) => {
	const issues: Issue[] = [];
	const row = requireRecord(value, issues);
	if (!row) {
		return { success: false, issues };
	}
	const sidebar =
		requireRecord(row.sidebarState, issues, ["sidebarState"]) ?? {};
	const filter = safeParseWithDefault(
		parseChangesFilter,
		sidebar.changesFilter,
		SIDEBAR_STATE_DEFAULTS.changesFilter,
	);
	const data: WorkspaceLocalStateRow = {
		workspaceId: requireUuid(row.workspaceId, issues, ["workspaceId"]),
		createdAt: persistedDate(row.createdAt, issues, ["createdAt"]),
		sidebarState: {
			projectId: requireUuid(sidebar.projectId, issues, [
				"sidebarState",
				"projectId",
			]),
			tabOrder: intWithDefault(sidebar.tabOrder, 0, issues, [
				"sidebarState",
				"tabOrder",
			]),
			sectionId: nullableStringWithDefault(sidebar.sectionId, null, issues, [
				"sidebarState",
				"sectionId",
			]),
			changesFilter: filter,
			changesViewMode: enumValue(
				sidebar.changesViewMode,
				["folders", "tree"] as const,
				"folders",
				issues,
				["sidebarState", "changesViewMode"],
			),
			activeTab: enumValue(
				sidebar.activeTab,
				["changes", "files", "review", "models"] as const,
				"changes",
				issues,
				["sidebarState", "activeTab"],
			),
			isHidden: booleanWithDefault(sidebar.isHidden, false, issues, [
				"sidebarState",
				"isHidden",
			]),
		},
		paneLayout: sanitizeWorkspacePaneLayout(
			row.paneLayout as WorkspaceState<unknown>,
		),
		viewedFiles: stringArrayWithDefault(row.viewedFiles, [], issues, [
			"viewedFiles",
		]),
		recentlyViewedFiles: parseRecentFiles(row.recentlyViewedFiles, issues, [
			"recentlyViewedFiles",
		]),
		workspaceRunTerminals: parseTerminalStates(
			row.workspaceRunTerminals,
			issues,
			["workspaceRunTerminals"],
		),
	};
	return issues.length ? { success: false, issues } : { success: true, data };
});

export interface DashboardSidebarSectionInput {
	sectionId: string;
	projectId: string;
	name: string;
	createdAt: string | Date;
	tabOrder?: number;
	isCollapsed?: boolean;
	color?: string | null;
}

export interface DashboardSidebarSectionRow {
	sectionId: string;
	projectId: string;
	name: string;
	createdAt: Date;
	tabOrder: number;
	isCollapsed: boolean;
	color: string | null;
}

export const dashboardSidebarSectionSchema = makeSchema<
	DashboardSidebarSectionInput,
	DashboardSidebarSectionRow
>((value) => {
	const issues: Issue[] = [];
	const row = requireRecord(value, issues);
	if (!row) {
		return { success: false, issues };
	}
	const name = requireString(row.name, issues, ["name"]).trim();
	if (!name) {
		issues.push(issue(["name"], "Expected non-empty string"));
	}
	const data: DashboardSidebarSectionRow = {
		sectionId: requireUuid(row.sectionId, issues, ["sectionId"]),
		projectId: requireUuid(row.projectId, issues, ["projectId"]),
		name,
		createdAt: persistedDate(row.createdAt, issues, ["createdAt"]),
		tabOrder: intWithDefault(row.tabOrder, 0, issues, ["tabOrder"]),
		isCollapsed: booleanWithDefault(row.isCollapsed, false, issues, [
			"isCollapsed",
		]),
		color: nullableStringWithDefault(row.color, null, issues, ["color"]),
	};
	return issues.length ? { success: false, issues } : { success: true, data };
});

type V2ExecutionMode =
	| "split-pane"
	| "new-tab"
	| "new-tab-split-pane"
	| "sequential";

export interface V2TerminalPresetInput {
	id: string;
	name: string;
	description?: string;
	cwd?: string;
	commands?: string[];
	projectIds?: string[] | null;
	pinnedToBar?: boolean;
	useAsWorkspaceRun?: boolean;
	applyOnWorkspaceCreated?: boolean;
	applyOnNewTab?: boolean;
	executionMode?: V2ExecutionMode;
	tabOrder?: number;
	createdAt: string | Date;
	agentId?: string;
}

export interface V2TerminalPresetRow {
	id: string;
	name: string;
	description?: string;
	cwd: string;
	commands: string[];
	projectIds: string[] | null;
	pinnedToBar?: boolean;
	useAsWorkspaceRun?: boolean;
	applyOnWorkspaceCreated?: boolean;
	applyOnNewTab?: boolean;
	executionMode: V2ExecutionMode;
	tabOrder: number;
	createdAt: Date;
	agentId?: string;
}

export const v2TerminalPresetSchema = makeSchema<
	V2TerminalPresetInput,
	V2TerminalPresetRow
>((value) => {
	const issues: Issue[] = [];
	const row = requireRecord(value, issues);
	if (!row) {
		return { success: false, issues };
	}
	const data: V2TerminalPresetRow = {
		id: requireUuid(row.id, issues, ["id"]),
		name: requireString(row.name, issues, ["name"]),
		description: optionalString(row.description, issues, ["description"]),
		cwd: row.cwd === undefined ? "" : requireString(row.cwd, issues, ["cwd"]),
		commands: stringArrayWithDefault(row.commands, [], issues, ["commands"]),
		projectIds:
			row.projectIds === undefined || row.projectIds === null
				? null
				: stringArrayWithDefault(row.projectIds, [], issues, ["projectIds"]),
		pinnedToBar: optionalBoolean(row.pinnedToBar, issues, ["pinnedToBar"]),
		useAsWorkspaceRun: optionalBoolean(row.useAsWorkspaceRun, issues, [
			"useAsWorkspaceRun",
		]),
		applyOnWorkspaceCreated: optionalBoolean(
			row.applyOnWorkspaceCreated,
			issues,
			["applyOnWorkspaceCreated"],
		),
		applyOnNewTab: optionalBoolean(row.applyOnNewTab, issues, [
			"applyOnNewTab",
		]),
		executionMode: enumValue(
			row.executionMode,
			["split-pane", "new-tab", "new-tab-split-pane", "sequential"] as const,
			"new-tab",
			issues,
			["executionMode"],
		),
		tabOrder: intWithDefault(row.tabOrder, 0, issues, ["tabOrder"]),
		createdAt: persistedDate(row.createdAt, issues, ["createdAt"]),
		agentId: optionalString(row.agentId, issues, ["agentId"]),
	};
	return issues.length ? { success: false, issues } : { success: true, data };
});

const LINK_ACTIONS = ["pane", "newTab", "external"] as const;
export type LinkAction = (typeof LINK_ACTIONS)[number];

export interface LinkTierMap {
	plain: LinkAction | null;
	shift: LinkAction | null;
	meta: LinkAction | null;
	metaShift: LinkAction | null;
}

export type LinkTier = keyof LinkTierMap;

const DEFAULT_LINK_TIER_MAP: LinkTierMap = {
	plain: null,
	shift: null,
	meta: "pane",
	metaShift: "external",
};

const LEGACY_SIDEBAR_FILE_LINKS: LinkTierMap = {
	plain: "pane",
	shift: "newTab",
	meta: "external",
	metaShift: "external",
};

const DEFAULT_SIDEBAR_FILE_LINKS: LinkTierMap = {
	plain: "pane",
	shift: "newTab",
	meta: "pane",
	metaShift: "external",
};

function parseLinkAction(
	value: unknown,
	issues: Issue[],
	path: Issue["path"],
): LinkAction | null {
	if (value === null) {
		return null;
	}
	return enumValue(value, LINK_ACTIONS, undefined, issues, path);
}

function parseLinkTierMap(
	value: unknown,
	defaultValue: LinkTierMap,
	issues: Issue[],
	path: Issue["path"],
): LinkTierMap {
	if (value === undefined) {
		return defaultValue;
	}
	const row = requireRecord(value, issues, path) ?? {};
	return {
		plain: parseLinkAction(row.plain, issues, [...(path ?? []), "plain"]),
		shift: parseLinkAction(row.shift, issues, [...(path ?? []), "shift"]),
		meta: parseLinkAction(row.meta, issues, [...(path ?? []), "meta"]),
		metaShift: parseLinkAction(row.metaShift, issues, [
			...(path ?? []),
			"metaShift",
		]),
	};
}

function isSameLinkTierMap(a: LinkTierMap, b: LinkTierMap): boolean {
	return (
		a.plain === b.plain &&
		a.shift === b.shift &&
		a.meta === b.meta &&
		a.metaShift === b.metaShift
	);
}

function isCompleteLinkTierMap(
	value: Partial<LinkTierMap>,
): value is LinkTierMap {
	return (
		"plain" in value &&
		"shift" in value &&
		"meta" in value &&
		"metaShift" in value
	);
}

export interface V2UserPreferencesInput {
	id: typeof V2_USER_PREFERENCES_ID;
	fileLinks?: LinkTierMap;
	urlLinks?: LinkTierMap;
	sidebarFileLinks?: LinkTierMap;
	terminalPresetsInitialized?: boolean;
	rightSidebarOpen?: boolean;
	rightSidebarTab?: "changes" | "files";
	rightSidebarWidth?: number;
	deleteLocalBranch?: boolean;
	showPresetsBar?: boolean;
}

export interface V2UserPreferencesRow {
	id: typeof V2_USER_PREFERENCES_ID;
	fileLinks: LinkTierMap;
	urlLinks: LinkTierMap;
	sidebarFileLinks: LinkTierMap;
	terminalPresetsInitialized: boolean;
	rightSidebarOpen: boolean;
	rightSidebarTab: "changes" | "files";
	rightSidebarWidth: number;
	deleteLocalBranch: boolean;
	showPresetsBar: boolean;
}

export const V2_USER_PREFERENCES_ID = "preferences" as const;

export const DEFAULT_V2_USER_PREFERENCES: V2UserPreferencesRow = {
	id: V2_USER_PREFERENCES_ID,
	fileLinks: DEFAULT_LINK_TIER_MAP,
	urlLinks: DEFAULT_LINK_TIER_MAP,
	sidebarFileLinks: DEFAULT_SIDEBAR_FILE_LINKS,
	terminalPresetsInitialized: false,
	rightSidebarOpen: false,
	rightSidebarTab: "changes",
	rightSidebarWidth: 340,
	deleteLocalBranch: false,
	showPresetsBar: true,
};

export const v2UserPreferencesSchema = makeSchema<
	V2UserPreferencesInput,
	V2UserPreferencesRow
>((value) => {
	const issues: Issue[] = [];
	const row = requireRecord(value, issues);
	if (!row) {
		return { success: false, issues };
	}
	const id = requireString(row.id, issues, ["id"]);
	if (id !== V2_USER_PREFERENCES_ID) {
		issues.push(issue(["id"], "Expected preferences id"));
	}
	const data: V2UserPreferencesRow = {
		id: V2_USER_PREFERENCES_ID,
		fileLinks: parseLinkTierMap(row.fileLinks, DEFAULT_LINK_TIER_MAP, issues, [
			"fileLinks",
		]),
		urlLinks: parseLinkTierMap(row.urlLinks, DEFAULT_LINK_TIER_MAP, issues, [
			"urlLinks",
		]),
		sidebarFileLinks: parseLinkTierMap(
			row.sidebarFileLinks,
			DEFAULT_SIDEBAR_FILE_LINKS,
			issues,
			["sidebarFileLinks"],
		),
		terminalPresetsInitialized: booleanWithDefault(
			row.terminalPresetsInitialized,
			false,
			issues,
			["terminalPresetsInitialized"],
		),
		rightSidebarOpen: booleanWithDefault(row.rightSidebarOpen, false, issues, [
			"rightSidebarOpen",
		]),
		rightSidebarTab: enumValue(
			row.rightSidebarTab,
			["changes", "files"] as const,
			"changes",
			issues,
			["rightSidebarTab"],
		),
		rightSidebarWidth:
			row.rightSidebarWidth === undefined
				? 340
				: requireNumber(row.rightSidebarWidth, issues, ["rightSidebarWidth"]),
		deleteLocalBranch: booleanWithDefault(
			row.deleteLocalBranch,
			false,
			issues,
			["deleteLocalBranch"],
		),
		showPresetsBar: booleanWithDefault(row.showPresetsBar, true, issues, [
			"showPresetsBar",
		]),
	};
	return issues.length ? { success: false, issues } : { success: true, data };
});

export function healWorkspaceLocalState(raw: unknown): WorkspaceLocalStateRow {
	const r = (
		raw && typeof raw === "object" ? raw : {}
	) as Partial<WorkspaceLocalStateRow>;
	const sidebar = (
		r.sidebarState && typeof r.sidebarState === "object" ? r.sidebarState : {}
	) as Partial<WorkspaceLocalStateRow["sidebarState"]>;
	return {
		...r,
		paneLayout: sanitizeWorkspacePaneLayout(
			r.paneLayout as WorkspaceState<unknown>,
		),
		viewedFiles:
			r.viewedFiles ?? WORKSPACE_LOCAL_STATE_OPTIONAL_DEFAULTS.viewedFiles,
		recentlyViewedFiles:
			r.recentlyViewedFiles ??
			WORKSPACE_LOCAL_STATE_OPTIONAL_DEFAULTS.recentlyViewedFiles,
		workspaceRunTerminals:
			r.workspaceRunTerminals ??
			WORKSPACE_LOCAL_STATE_OPTIONAL_DEFAULTS.workspaceRunTerminals,
		sidebarState: {
			...SIDEBAR_STATE_DEFAULTS,
			...sidebar,
			changesFilter: safeParseWithDefault(
				parseChangesFilter,
				sidebar.changesFilter,
				SIDEBAR_STATE_DEFAULTS.changesFilter,
			),
			changesViewMode: enumValue(
				sidebar.changesViewMode,
				["folders", "tree"] as const,
				SIDEBAR_STATE_DEFAULTS.changesViewMode,
				[],
				["changesViewMode"],
			),
			activeTab: enumValue(
				sidebar.activeTab,
				["changes", "files", "review", "models"] as const,
				SIDEBAR_STATE_DEFAULTS.activeTab,
				[],
				["activeTab"],
			),
		} as WorkspaceLocalStateRow["sidebarState"],
	} as WorkspaceLocalStateRow;
}

export function healV2UserPreferences(raw: unknown): V2UserPreferencesRow {
	const r = (
		raw && typeof raw === "object" ? raw : {}
	) as Partial<V2UserPreferencesRow>;
	const sidebarFileLinks = r.sidebarFileLinks
		? {
				...DEFAULT_V2_USER_PREFERENCES.sidebarFileLinks,
				...r.sidebarFileLinks,
			}
		: DEFAULT_V2_USER_PREFERENCES.sidebarFileLinks;
	const shouldMigrateLegacySidebarFileLinks =
		r.sidebarFileLinks &&
		isCompleteLinkTierMap(r.sidebarFileLinks) &&
		isSameLinkTierMap(r.sidebarFileLinks, LEGACY_SIDEBAR_FILE_LINKS);
	return {
		...DEFAULT_V2_USER_PREFERENCES,
		...r,
		fileLinks: { ...DEFAULT_V2_USER_PREFERENCES.fileLinks, ...r.fileLinks },
		urlLinks: { ...DEFAULT_V2_USER_PREFERENCES.urlLinks, ...r.urlLinks },
		sidebarFileLinks: shouldMigrateLegacySidebarFileLinks
			? DEFAULT_V2_USER_PREFERENCES.sidebarFileLinks
			: sidebarFileLinks,
	};
}

export type WorkspacesCreateInput =
	inferRouterInputs<AppRouter>["workspaces"]["create"];

export interface FailedWorkspaceCreateInput {
	id: string;
	hostId: string;
	input: WorkspacesCreateInput;
	error: string;
	failedAt: string | Date;
}

export interface FailedWorkspaceCreateRow {
	id: string;
	hostId: string;
	input: WorkspacesCreateInput;
	error: string;
	failedAt: Date;
}

export const failedWorkspaceCreateSchema = makeSchema<
	FailedWorkspaceCreateInput,
	FailedWorkspaceCreateRow
>((value) => {
	const issues: Issue[] = [];
	const row = requireRecord(value, issues);
	if (!row) {
		return { success: false, issues };
	}
	const data: FailedWorkspaceCreateRow = {
		id: requireUuid(row.id, issues, ["id"]),
		hostId: requireString(row.hostId, issues, ["hostId"]),
		input: row.input as WorkspacesCreateInput,
		error: requireString(row.error, issues, ["error"]),
		failedAt: persistedDate(row.failedAt, issues, ["failedAt"]),
	};
	return issues.length ? { success: false, issues } : { success: true, data };
});
