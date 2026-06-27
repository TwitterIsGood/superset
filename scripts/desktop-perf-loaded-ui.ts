#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DesktopAutomation } from "../packages/desktop-mcp/src/automation/index";
import {
	DEV_EMAIL,
	DEV_PASSWORD,
} from "../packages/shared/src/dev-credentials";
import { getHostName } from "../packages/shared/src/host-info";

const DEFAULT_ARTIFACT_DIR =
	".trellis/tasks/06-25-desktop-perf-architecture-overhaul/artifacts/loaded-ui";
const DEFAULT_PROJECT_TEXT = "Desktop Perf Project 1";
const DEFAULT_TASK_TEXT = "Desktop perf task";
const DEFAULT_FIXTURE_SLUG = "desktop-perf-loaded";
const DEFAULT_FIXTURE_PROJECTS = 10;
const DEFAULT_FIXTURE_WORKSPACES_PER_PROJECT = 20;
const DEFAULT_FIXTURE_TASKS = 300;
const DEFAULT_FIXTURE_HOST_BACKED_WORKSPACES = 1;
const DEFAULT_MAX_WORKSPACE_DOM_NODES = 5000;
const DEFAULT_MAX_TASKS_DOM_NODES = 6000;
export const DASHBOARD_SIDEBAR_WORKSPACE_ROW_SELECTOR = [
	"[data-dashboard-sidebar-workspace-item]",
	"[data-dashboard-sidebar-expanded-workspace-wrapper]",
	"[data-dashboard-sidebar-collapsed-workspace-row]",
].join(", ");

export interface ParsedDesktopPerfLoadedUiOptions {
	artifactDir: string;
	projectText: string;
	taskText: string;
	minWorkspaceRows: number;
	minSidebarWorkspaceRows: number;
	minTaskMentions: number;
	maxWorkspaceDomNodes: number;
	maxTasksDomNodes: number;
	timeoutMs: number;
	skipNavigation: boolean;
	allowConsoleErrors: boolean;
	failOnResourceErrors: boolean;
	autoLoginDev: boolean;
	devEmail: string;
	devPassword: string;
	ensureFixture: boolean;
	fixtureSlug: string;
	fixtureProjects: number;
	fixtureWorkspacesPerProject: number;
	fixtureTasks: number;
	fixtureHostBackedWorkspaces: number;
	fixtureDatabaseUrl?: string;
	fixtureDatabaseUrlUnpooled?: string;
	allowRemoteFixture: boolean;
	json: boolean;
}

interface LoadedViewSummary {
	href: string;
	domNodeCount: number;
	bodyTextLength: number;
	debugActiveOrganizationId?: string | null;
	projectMentions: number;
	taskMentions: number;
	workspaceRowCount: number;
	sidebarWorkspaceRowCount: number;
	sidebarProjectSectionCount: number;
	sidebarOverflowLinkCount: number;
	env: {
		apiUrl?: string;
		electricUrl?: string;
		relayUrl?: string;
	};
	textSample: string;
}

interface LoadedInteractionSummary {
	name: string;
	durationMs: number;
	href: string;
	domNodeCount: number;
	bodyTextSample: string;
}

interface LoadedUiReport {
	startedAt: string;
	completedAt: string;
	workspaceView: LoadedViewSummary;
	tasksView: LoadedViewSummary;
	interactions: LoadedInteractionSummary[];
	screenshots: {
		workspaces: string;
		tasks: string;
		workspaceDetail?: string;
	};
	consoleErrorCount: number;
	consoleResourceErrorCount: number;
	consoleRuntimeErrorCount: number;
	consoleErrors: string[];
	consoleResourceErrors: string[];
	consoleRuntimeErrors: string[];
	auth: {
		autoLoginAttempted: boolean;
		devEmail?: string;
		activeOrganizationId?: string;
		fixtureOrganizationId?: string;
	};
	fixture: {
		ensureAttempted: boolean;
		result?: unknown;
	};
	collections?: unknown;
}

interface FixtureResult {
	organizationId?: unknown;
	hostBackedWorkspaceIds?: unknown;
	seedResult?: {
		hostBackedWorkspaceIds?: unknown;
	};
	before?: {
		hostBackedWorkspaceIds?: unknown;
	};
}

interface DesktopEmailAuthResponse {
	token?: string | null;
	code?: string;
	message?: string;
}

interface DesktopSessionResponse {
	session?: {
		activeOrganizationId?: string | null;
		expiresAt?: string;
		token?: string;
	} | null;
}

interface CollectionsDebugEnvelope<T> {
	available: boolean;
	result?: T;
	error?: string;
}

function loadRootEnv(): void {
	const envPath = resolve(process.cwd(), ".env");
	if (!existsSync(envPath)) return;

	for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const equalsIndex = line.indexOf("=");
		if (equalsIndex <= 0) continue;
		const key = line.slice(0, equalsIndex).trim();
		let value = line.slice(equalsIndex + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		process.env[key] ??= value
			.replaceAll("\\n", "\n")
			.replaceAll('\\"', '"')
			.replaceAll("\\$", "$")
			.replaceAll("\\\\", "\\");
	}
}

function positiveInteger(
	value: string | undefined,
	fallback: number,
	flag: string,
) {
	if (value === undefined) return fallback;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 1) {
		throw new Error(`--${flag} must be a positive integer`);
	}
	return parsed;
}

function nonNegativeInteger(
	value: string | undefined,
	fallback: number,
	flag: string,
) {
	if (value === undefined) return fallback;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(`--${flag} must be 0 or greater`);
	}
	return parsed;
}

function stringFlag(args: string[], flag: string): string | undefined {
	const index = args.indexOf(`--${flag}`);
	if (index < 0) return undefined;
	const value = args[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`missing value for --${flag}`);
	}
	return value;
}

function booleanFlag(args: string[], flag: string): boolean {
	return args.includes(`--${flag}`);
}

export function parseDesktopPerfLoadedUiArgs(
	args: string[],
): ParsedDesktopPerfLoadedUiOptions | "help" {
	if (args.includes("--help") || args.includes("-h") || args.includes("help")) {
		return "help";
	}

	for (let index = 0; index < args.length; index += 1) {
		const token = args[index];
		if (!token.startsWith("--")) {
			throw new Error(`unexpected argument: ${token}`);
		}
		const key = token.slice(2);
		if (
			key === "skip-navigation" ||
			key === "allow-console-errors" ||
			key === "fail-on-resource-errors" ||
			key === "auto-login-dev" ||
			key === "ensure-fixture" ||
			key === "allow-remote-fixture" ||
			key === "json"
		) {
			continue;
		}
		index += 1;
		if (!args[index] || args[index].startsWith("--")) {
			throw new Error(`missing value for --${key}`);
		}
	}

	return {
		artifactDir: stringFlag(args, "artifact-dir") ?? DEFAULT_ARTIFACT_DIR,
		projectText: stringFlag(args, "project-text") ?? DEFAULT_PROJECT_TEXT,
		taskText: stringFlag(args, "task-text") ?? DEFAULT_TASK_TEXT,
		minWorkspaceRows: positiveInteger(
			stringFlag(args, "min-workspace-rows"),
			20,
			"min-workspace-rows",
		),
		minSidebarWorkspaceRows: nonNegativeInteger(
			stringFlag(args, "min-sidebar-workspace-rows"),
			0,
			"min-sidebar-workspace-rows",
		),
		minTaskMentions: positiveInteger(
			stringFlag(args, "min-task-mentions"),
			10,
			"min-task-mentions",
		),
		maxWorkspaceDomNodes: positiveInteger(
			stringFlag(args, "max-workspace-dom-nodes"),
			DEFAULT_MAX_WORKSPACE_DOM_NODES,
			"max-workspace-dom-nodes",
		),
		maxTasksDomNodes: positiveInteger(
			stringFlag(args, "max-tasks-dom-nodes"),
			DEFAULT_MAX_TASKS_DOM_NODES,
			"max-tasks-dom-nodes",
		),
		timeoutMs: positiveInteger(
			stringFlag(args, "timeout-ms"),
			30_000,
			"timeout-ms",
		),
		skipNavigation: booleanFlag(args, "skip-navigation"),
		allowConsoleErrors: booleanFlag(args, "allow-console-errors"),
		failOnResourceErrors: booleanFlag(args, "fail-on-resource-errors"),
		autoLoginDev: booleanFlag(args, "auto-login-dev"),
		devEmail: stringFlag(args, "dev-email") ?? DEV_EMAIL,
		devPassword: stringFlag(args, "dev-password") ?? DEV_PASSWORD,
		ensureFixture: booleanFlag(args, "ensure-fixture"),
		fixtureSlug: stringFlag(args, "fixture-slug") ?? DEFAULT_FIXTURE_SLUG,
		fixtureProjects: positiveInteger(
			stringFlag(args, "fixture-projects"),
			DEFAULT_FIXTURE_PROJECTS,
			"fixture-projects",
		),
		fixtureWorkspacesPerProject: positiveInteger(
			stringFlag(args, "fixture-workspaces-per-project"),
			DEFAULT_FIXTURE_WORKSPACES_PER_PROJECT,
			"fixture-workspaces-per-project",
		),
		fixtureTasks: positiveInteger(
			stringFlag(args, "fixture-tasks"),
			DEFAULT_FIXTURE_TASKS,
			"fixture-tasks",
		),
		fixtureHostBackedWorkspaces: nonNegativeInteger(
			stringFlag(args, "fixture-host-backed-workspaces"),
			DEFAULT_FIXTURE_HOST_BACKED_WORKSPACES,
			"fixture-host-backed-workspaces",
		),
		fixtureDatabaseUrl:
			stringFlag(args, "fixture-database-url") ??
			process.env.DESKTOP_PERF_FIXTURE_DATABASE_URL,
		fixtureDatabaseUrlUnpooled:
			stringFlag(args, "fixture-database-url-unpooled") ??
			process.env.DESKTOP_PERF_FIXTURE_DATABASE_URL_UNPOOLED,
		allowRemoteFixture: booleanFlag(args, "allow-remote-fixture"),
		json: booleanFlag(args, "json"),
	};
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTextMatcherScript(text: string): string {
	return `((document.body?.innerText ?? "").includes(${JSON.stringify(text)}))`;
}

async function waitForRendererExpression(
	automation: DesktopAutomation,
	expression: string,
	options: ParsedDesktopPerfLoadedUiOptions,
	description: string,
): Promise<void> {
	const deadline = Date.now() + options.timeoutMs;
	let lastValue: unknown = null;
	while (Date.now() < deadline) {
		lastValue = await automation.evaluateJs(`(() => Boolean(${expression}))()`);
		if (lastValue === true) return;
		await sleep(250);
	}
	throw new Error(
		`Timed out waiting for ${description} after ${options.timeoutMs}ms; last value ${JSON.stringify(lastValue)}`,
	);
}

async function summarizeInteraction(
	automation: DesktopAutomation,
	name: string,
	startedAtMs: number,
): Promise<LoadedInteractionSummary> {
	const raw = await automation.evaluateJs(`(() => JSON.stringify({
  href: location.href,
  domNodeCount: document.querySelectorAll("*").length,
  bodyTextSample: (document.body?.innerText ?? "").slice(0, 1000),
}))()`);
	if (typeof raw !== "string") {
		throw new Error(`Interaction summary "${name}" did not return JSON`);
	}
	const parsed = JSON.parse(raw) as Omit<
		LoadedInteractionSummary,
		"name" | "durationMs"
	>;
	return {
		name,
		durationMs: Date.now() - startedAtMs,
		...parsed,
	};
}

async function runLoadedInteraction(
	automation: DesktopAutomation,
	name: string,
	action: () => Promise<void>,
): Promise<LoadedInteractionSummary> {
	const startedAtMs = Date.now();
	try {
		await action();
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`Loaded interaction "${name}" failed: ${detail}`);
	}
	return summarizeInteraction(automation, name, startedAtMs);
}

async function clickButtonByAriaLabel(
	automation: DesktopAutomation,
	label: string,
	index = 0,
): Promise<void> {
	await automation.evaluateJs(`(() => {
  const buttons = [...document.querySelectorAll("button")].filter((button) => button.getAttribute("aria-label") === ${JSON.stringify(label)});
  const button = buttons[${index}];
  if (!button) {
    throw new Error(${JSON.stringify(`Could not find button with aria-label ${label} at index ${index}`)});
  }
  button.scrollIntoView({ block: "nearest", inline: "nearest" });
  button.click();
  return true;
})()`);
}

async function clickButtonByTitle(
	automation: DesktopAutomation,
	title: string,
): Promise<void> {
	await automation.evaluateJs(`(() => {
  const button = [...document.querySelectorAll("button")].find((candidate) => candidate.getAttribute("title") === ${JSON.stringify(title)});
  if (!button) {
    throw new Error(${JSON.stringify(`Could not find button with title ${title}`)});
  }
  button.scrollIntoView({ block: "nearest", inline: "nearest" });
  button.click();
  return true;
})()`);
}

async function clickFirstWorkspaceRow(
	automation: DesktopAutomation,
	options: ParsedDesktopPerfLoadedUiOptions,
	preferredWorkspaceId?: string,
): Promise<void> {
	if (preferredWorkspaceId) {
		await automation.navigate({
			path: `/v2-workspace/${preferredWorkspaceId}`,
		});
		await automation.waitFor({
			urlIncludes: `#/v2-workspace/${preferredWorkspaceId}`,
			timeoutMs: options.timeoutMs,
		});
		await waitForV2WorkspaceDetailShell(
			automation,
			options,
			preferredWorkspaceId,
		);
		return;
	}

	const localHostName = getHostName();
	await automation.evaluateJs(`(() => {
  const rows = [...document.querySelectorAll("[data-v2-workspace-row]")];
  const preferredRow = rows.find((candidate) => (candidate.textContent || "").includes(${JSON.stringify(localHostName)}));
  const row = (preferredRow ?? rows[0])?.querySelector("[role='button']");
  if (!row) throw new Error("Could not find a v2 workspace row to open");
  row.scrollIntoView({ block: "nearest" });
  row.click();
  return true;
})()`);
	await automation.waitFor({
		urlIncludes: "#/v2-workspace",
		timeoutMs: options.timeoutMs,
	});
	await waitForV2WorkspaceDetailShell(automation, options);
}

async function waitForV2WorkspaceDetailShell(
	automation: DesktopAutomation,
	options: ParsedDesktopPerfLoadedUiOptions,
	expectedWorkspaceId?: string,
): Promise<void> {
	await waitForRendererExpression(
		automation,
		`location.hash.startsWith("#/v2-workspace/") && (
  Boolean(document.querySelector("[data-workspace-id]")) ||
  Boolean(document.querySelector("[data-testid='workspace-right-sidebar-toggle']")) ||
  (document.body?.innerText ?? "").includes(${JSON.stringify(options.projectText)})
)`,
		options,
		"v2 workspace detail shell",
	);
	if (!expectedWorkspaceId) return;
	await waitForRendererExpression(
		automation,
		`document.querySelector("[data-workspace-id]")?.getAttribute("data-workspace-id") === ${JSON.stringify(expectedWorkspaceId)}`,
		options,
		"host-backed workspace detail id",
	);
}

async function ensureV2WorkspaceRightSidebarOpen(
	automation: DesktopAutomation,
	options: ParsedDesktopPerfLoadedUiOptions,
): Promise<void> {
	await automation.waitFor({
		testId: "workspace-right-sidebar-toggle",
		timeoutMs: options.timeoutMs,
	});
	const deadline = Date.now() + options.timeoutMs;
	while (Date.now() < deadline) {
		const isOpen = await automation.evaluateJs(
			"(() => Boolean(document.querySelector(\"#workspace-right-sidebar-slot [aria-label='Files'], #workspace-right-sidebar-slot [aria-label^='Changes']\") || (document.querySelector('#workspace-right-sidebar-slot')?.innerText ?? '').length > 0))()",
		);
		if (isOpen === true) return;
		await automation.evaluateJs(`(() => {
  const button = document.querySelector("[data-testid='workspace-right-sidebar-toggle']");
  if (!button) throw new Error("Could not find workspace right sidebar toggle");
  if (button.getAttribute("aria-label") !== "Close workspace sidebar") {
    button.click();
  }
  return true;
})()`);
		await sleep(500);
	}
	throw new Error(
		`Timed out waiting for workspace right sidebar content after ${options.timeoutMs}ms`,
	);
}

async function switchV2WorkspaceSidebarTab(
	automation: DesktopAutomation,
	options: ParsedDesktopPerfLoadedUiOptions,
	label: "Files" | "Changes" | "Review" | "Models",
): Promise<void> {
	await automation.evaluateJs(`(() => {
  const slot = document.querySelector("#workspace-right-sidebar-slot");
  const button = [...(slot?.querySelectorAll("button") ?? [])].find((candidate) => {
    const aria = candidate.getAttribute("aria-label") || "";
    const text = candidate.textContent || "";
    return aria === ${JSON.stringify(label)} || aria.startsWith(${JSON.stringify(`${label} (`)}) || text.trim() === ${JSON.stringify(label)};
  });
  if (!button) throw new Error(${JSON.stringify(`Could not find workspace sidebar tab ${label}`)});
  button.scrollIntoView({ block: "nearest", inline: "nearest" });
  button.click();
  return true;
})()`);
	await waitForRendererExpression(
		automation,
		`document.querySelector("#workspace-right-sidebar-slot")?.innerText?.includes(${JSON.stringify(label)})`,
		options,
		`${label} sidebar tab text`,
	);
}

async function openTerminalPaneFromEmptyWorkspace(
	automation: DesktopAutomation,
	options: ParsedDesktopPerfLoadedUiOptions,
): Promise<void> {
	const clickedEmptyStateButton = await automation
		.evaluateJs(`(() => {
  const button = [...document.querySelectorAll("button")].find((candidate) => (candidate.innerText || "").trim().includes("Open Terminal"));
  if (!button) return false;
  button.scrollIntoView({ block: "nearest", inline: "nearest" });
  button.click();
  return true;
})()`)
		.then((value) => value === true);
	if (!clickedEmptyStateButton) {
		const addTabTriggerPoint = (await automation.evaluateJs(`(() => {
  const trigger = [...document.querySelectorAll("button[data-slot='dropdown-menu-trigger']")].find((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return rect.top >= 45 && rect.bottom <= 90 && rect.width >= 24 && rect.width <= 40;
  });
  if (!trigger) return null;
  trigger.scrollIntoView({ block: "nearest", inline: "nearest" });
  const rect = trigger.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
})()`)) as { x: number; y: number } | null;
		if (addTabTriggerPoint) {
			await automation.click(addTabTriggerPoint);
			await waitForRendererExpression(
				automation,
				`[...document.querySelectorAll("[role='menuitem']")].some((candidate) => (candidate.textContent || "").trim().includes("Terminal"))`,
				options,
				"terminal add-tab menu item",
			);
			const terminalMenuItemPoint = (await automation.evaluateJs(`(() => {
  const item = [...document.querySelectorAll("[role='menuitem']")].find((candidate) => (candidate.textContent || "").trim().includes("Terminal"));
  const element = item instanceof HTMLElement ? item : item?.parentElement;
  if (!element) return null;
  element.scrollIntoView({ block: "nearest", inline: "nearest" });
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
})()`)) as { x: number; y: number } | null;
			if (!terminalMenuItemPoint) {
				throw new Error("Could not find Terminal add-tab menu item");
			}
			await automation.click(terminalMenuItemPoint);
		} else {
			await automation.sendKeys({ keys: ["Meta", "t"] });
		}
	}
	await waitForRendererExpression(
		automation,
		`Boolean(document.querySelector("[role='application'] .xterm, [aria-label='Terminal sessions'], .xterm"))`,
		options,
		"terminal pane attached",
	);
}

async function openChatPaneFromEmptyWorkspace(
	automation: DesktopAutomation,
	options: ParsedDesktopPerfLoadedUiOptions,
): Promise<void> {
	const clickedEmptyStateButton = await automation
		.evaluateJs(`(() => {
  const button = [...document.querySelectorAll("button")].find((candidate) => (candidate.innerText || "").trim().includes("Open Chat"));
  if (!button) return false;
  button.scrollIntoView({ block: "nearest", inline: "nearest" });
  button.click();
  return true;
})()`)
		.then((value) => value === true);
	if (!clickedEmptyStateButton) {
		await automation.sendKeys({ keys: ["Meta", "Shift", "t"] });
	}
	await waitForRendererExpression(
		automation,
		`Boolean(document.querySelector(".tiptap-chat-input, [data-slot='input-group-control']"))`,
		options,
		"chat composer mounted",
	);
}

async function sendWorkspaceChatProbe(
	automation: DesktopAutomation,
	options: ParsedDesktopPerfLoadedUiOptions,
): Promise<void> {
	const probeText = `Loaded UI perf probe ${Date.now()}`;
	await automation.evaluateJs(`(() => {
  const editor = document.querySelector(".tiptap-chat-input, [data-slot='input-group-control']");
  if (!(editor instanceof HTMLElement)) {
    throw new Error("Could not find workspace chat editor");
  }
  editor.focus();
  document.execCommand("insertText", false, ${JSON.stringify(probeText)});
  const form = editor.closest("form");
  if (!form) {
    throw new Error("Could not find workspace chat form");
  }
  form.requestSubmit();
  return true;
})()`);
	await waitForRendererExpression(
		automation,
		`(document.body?.innerText ?? "").includes(${JSON.stringify(probeText)}) || /(provider|model|not configured|sign in|API key|authentication|failed|error)/i.test(document.body?.innerText ?? "")`,
		options,
		"chat first send user message or local credential feedback",
	);
}

async function openFilePaneFromFilesSidebar(
	automation: DesktopAutomation,
	options: ParsedDesktopPerfLoadedUiOptions,
): Promise<void> {
	await ensureV2WorkspaceRightSidebarOpen(automation, options);
	await switchV2WorkspaceSidebarTab(automation, options, "Files");
	await waitForRendererExpression(
		automation,
		`Boolean(document.querySelector("#workspace-right-sidebar-slot")?.textContent?.includes("Explorer"))`,
		options,
		"workspace file explorer",
	);
	await automation.evaluateJs(`(() => {
  const visited = new Set();
  const roots = [document];
  for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index];
    if (!root || visited.has(root)) continue;
    visited.add(root);
    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) roots.push(element.shadowRoot);
    }
    const fileRow = [...root.querySelectorAll("[data-item-path]")].find((candidate) => {
      const path = candidate.getAttribute("data-item-path") || "";
      return path.length > 0 && !path.endsWith("/");
    });
    if (fileRow instanceof HTMLElement) {
      fileRow.scrollIntoView({ block: "nearest", inline: "nearest" });
      fileRow.click();
      return true;
    }
  }
  throw new Error("Could not find a file row in the workspace Files sidebar");
})()`);
	await waitForRendererExpression(
		automation,
		`Boolean(document.querySelector("[data-testid='code-editor'], .cm-editor, [data-slot='file-viewer']"))`,
		options,
		"file pane editor mounted",
	);
}

async function verifyTasksPopover(
	automation: DesktopAutomation,
	options: ParsedDesktopPerfLoadedUiOptions,
	label: string,
	index: number,
	expectedText: string,
): Promise<void> {
	await clickButtonByAriaLabel(automation, label, index);
	await waitForRendererExpression(
		automation,
		getTextMatcherScript(expectedText),
		options,
		`${label} menu text "${expectedText}"`,
	);
	await automation.sendKeys({ keys: ["Escape"] });
	await sleep(100);
}

async function isOnSignInRoute(
	automation: DesktopAutomation,
): Promise<boolean> {
	const info = await automation.getWindowInfo();
	return info.url.includes("#/sign-in") || info.url.endsWith("/sign-in");
}

async function waitForWorkspaceLoadedOrSignIn(
	automation: DesktopAutomation,
	options: ParsedDesktopPerfLoadedUiOptions,
	organizationId?: string,
): Promise<"loaded" | "sign-in"> {
	const deadline = Date.now() + options.timeoutMs;
	let recoveryAttempted = false;
	while (Date.now() < deadline) {
		if (await isOnSignInRoute(automation)) return "sign-in";
		const summary = await collectSummary(automation, options).catch(() => null);
		if (
			summary?.href.includes("#/v2-workspaces") &&
			summary.projectMentions > 0
		) {
			return "loaded";
		}
		if (
			!recoveryAttempted &&
			summary?.href.includes("#/v2-workspaces") &&
			summary.projectMentions === 0
		) {
			const recovered = await recoverPartialCollectionsIfNeeded(
				automation,
				options,
				organizationId,
			);
			recoveryAttempted = recovered;
			if (recovered) continue;
		}
		await sleep(500);
	}
	const health = await getCollectionsDebugHealth(automation).catch((error) => ({
		available: false,
		error: error instanceof Error ? error.message : String(error),
	}));
	throw new Error(
		[
			`Timed out waiting for loaded /v2-workspaces data or sign-in route after ${options.timeoutMs}ms`,
			`Collection health: ${JSON.stringify(health)}`,
		].join("\n"),
	);
}

async function autoLoginDevIfNeeded(
	automation: DesktopAutomation,
	options: ParsedDesktopPerfLoadedUiOptions,
): Promise<{ attempted: boolean; devEmail?: string }> {
	if (!(await isOnSignInRoute(automation))) {
		return { attempted: false };
	}
	if (!options.autoLoginDev) {
		throw new Error(
			[
				"Desktop is on the sign-in route, so loaded UI data cannot be verified yet.",
				"Sign in with the local dev account or rerun with --auto-login-dev after starting the loaded worktree profile.",
			].join("\n"),
		);
	}

	await automation.waitFor({
		selector: "#email",
		timeoutMs: options.timeoutMs,
	});
	await automation.typeText({
		selector: "#email",
		text: options.devEmail,
		clearFirst: true,
	});
	await automation.typeText({
		selector: "#password",
		text: options.devPassword,
		clearFirst: true,
	});
	await automation.click({ selector: 'form button[type="submit"]' });
	await automation.waitFor({
		urlIncludes: "#/v2-workspaces",
		timeoutMs: options.timeoutMs,
	});
	return { attempted: true, devEmail: options.devEmail };
}

function getFixtureOrganizationId(fixtureResult: unknown): string | undefined {
	if (!fixtureResult || typeof fixtureResult !== "object") return undefined;
	const organizationId = (fixtureResult as FixtureResult).organizationId;
	return typeof organizationId === "string" && organizationId.length > 0
		? organizationId
		: undefined;
}

function getFixtureHostBackedWorkspaceId(
	fixtureResult: unknown,
): string | undefined {
	if (!fixtureResult || typeof fixtureResult !== "object") return undefined;
	const result = fixtureResult as FixtureResult;
	const candidates = [
		result.hostBackedWorkspaceIds,
		result.seedResult?.hostBackedWorkspaceIds,
		result.before?.hostBackedWorkspaceIds,
	];
	for (const candidate of candidates) {
		if (!Array.isArray(candidate)) continue;
		const workspaceId = candidate.find((value) => typeof value === "string");
		if (typeof workspaceId === "string" && workspaceId.length > 0) {
			return workspaceId;
		}
	}
	return undefined;
}

function normalizeBearerToken(token: string | null): string | null {
	if (!token) return null;
	const [bareToken] = token.split(".");
	return bareToken && bareToken.length > 0 ? bareToken : token;
}

async function postJson<T>(
	url: string,
	body: Record<string, unknown>,
	headers: Record<string, string> = {},
): Promise<{ response: Response; data: T }> {
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...headers,
		},
		body: JSON.stringify(body),
	});
	const data = (await response.json().catch(() => ({}))) as T;
	return { response, data };
}

function getAuthFailureMessage(data: DesktopEmailAuthResponse, status: number) {
	return data.message ?? data.code ?? `Authentication failed (${status})`;
}

async function callElectronTrpc<T>(
	automation: DesktopAutomation,
	path: string,
	type: "query" | "mutation",
	input?: unknown,
): Promise<T> {
	const code = `(() => new Promise((resolve, reject) => {
  const id = Math.floor(Math.random() * 1000000000);
  const timeout = setTimeout(() => reject(new Error("Timed out waiting for Electron tRPC ${path}")), 5000);
  window.electronTRPC.onMessage((message) => {
    if (!message || message.id !== id) return;
    clearTimeout(timeout);
    if (message.error) {
      reject(new Error(message.error.message || "Electron tRPC ${path} failed"));
      return;
    }
    resolve(JSON.stringify(message.result?.data?.json ?? message.result?.data ?? null));
  });
  window.electronTRPC.sendMessage({
    method: "request",
    operation: {
      id,
      type: ${JSON.stringify(type)},
      path: ${JSON.stringify(path)},
      input: ${input === undefined ? "undefined" : JSON.stringify({ json: input })},
    },
  });
}))()`;
	const raw = await automation.evaluateJs(code);
	if (typeof raw !== "string") {
		throw new Error(`Electron tRPC ${path} did not return JSON`);
	}
	return JSON.parse(raw) as T;
}

async function callCollectionsDebug<T>(
	automation: DesktopAutomation,
	method:
		| "getActiveOrganizationId"
		| "switchActiveOrganization"
		| "getV2WorkspaceGraphHealth"
		| "recoverPartialV2WorkspaceGraphCache",
	organizationId?: string,
): Promise<CollectionsDebugEnvelope<T>> {
	const code = `(() => Promise.resolve()
  .then(async () => {
    const debug = window.__supersetCollectionsDebug;
    if (!debug || typeof debug[${JSON.stringify(method)}] !== "function") {
      return JSON.stringify({ available: false });
    }
    const result = await debug[${JSON.stringify(method)}](${JSON.stringify(
			organizationId,
		)});
    return JSON.stringify({ available: true, result });
  })
  .catch((error) => JSON.stringify({
    available: true,
    error: error instanceof Error ? error.message : String(error),
  })))()`;
	const raw = await automation.evaluateJs(code);
	if (typeof raw !== "string") {
		throw new Error(`Collections debug ${method} did not return JSON`);
	}
	return JSON.parse(raw) as CollectionsDebugEnvelope<T>;
}

function isPartialCollectionHealth(result: unknown): boolean {
	return (
		typeof result === "object" &&
		result !== null &&
		"isPartial" in result &&
		(result as { isPartial?: unknown }).isPartial === true
	);
}

function isRecoveredCollectionHealth(result: unknown): boolean {
	return (
		typeof result === "object" &&
		result !== null &&
		"recovered" in result &&
		(result as { recovered?: unknown }).recovered === true
	);
}

async function getCollectionsDebugHealth(
	automation: DesktopAutomation,
	organizationId?: string,
): Promise<CollectionsDebugEnvelope<unknown>> {
	return callCollectionsDebug(
		automation,
		"getV2WorkspaceGraphHealth",
		organizationId,
	);
}

async function getRendererActiveOrganizationId(
	automation: DesktopAutomation,
): Promise<CollectionsDebugEnvelope<string | null>> {
	return callCollectionsDebug(automation, "getActiveOrganizationId");
}

async function switchRendererActiveOrganization(
	automation: DesktopAutomation,
	organizationId: string,
): Promise<
	CollectionsDebugEnvelope<{
		requestedOrganizationId: string;
		activeOrganizationId: string | null;
	}>
> {
	return callCollectionsDebug(
		automation,
		"switchActiveOrganization",
		organizationId,
	);
}

async function waitForRendererFixtureOrganization(
	automation: DesktopAutomation,
	options: ParsedDesktopPerfLoadedUiOptions,
	fixtureOrganizationId: string,
): Promise<string> {
	const deadline = Date.now() + options.timeoutMs;
	let switchAttempted = false;
	let lastState: unknown = null;

	while (Date.now() < deadline) {
		const active = await getRendererActiveOrganizationId(automation).catch(
			(error) => ({
				available: false,
				error: error instanceof Error ? error.message : String(error),
			}),
		);
		lastState = active;

		if (active.available && active.result === fixtureOrganizationId) {
			return fixtureOrganizationId;
		}

		if (!switchAttempted && active.available) {
			const switched = await switchRendererActiveOrganization(
				automation,
				fixtureOrganizationId,
			);
			lastState = switched;
			if (switched.error) {
				throw new Error(
					`Could not switch renderer to fixture organization: ${switched.error}`,
				);
			}
			if (switched.result?.activeOrganizationId === fixtureOrganizationId) {
				return fixtureOrganizationId;
			}
			switchAttempted = true;
		}

		await sleep(500);
	}

	throw new Error(
		[
			`Timed out waiting for renderer active organization ${fixtureOrganizationId} after ${options.timeoutMs}ms`,
			`Last renderer organization state: ${JSON.stringify(lastState)}`,
		].join("\n"),
	);
}

async function recoverPartialCollectionsIfNeeded(
	automation: DesktopAutomation,
	options: ParsedDesktopPerfLoadedUiOptions,
	organizationId?: string,
): Promise<boolean> {
	const health = await getCollectionsDebugHealth(automation, organizationId);
	if (
		!health.available ||
		health.error ||
		!isPartialCollectionHealth(health.result)
	) {
		return false;
	}

	const recovery = await callCollectionsDebug(
		automation,
		"recoverPartialV2WorkspaceGraphCache",
		organizationId,
	);
	if (
		!recovery.available ||
		recovery.error ||
		!isRecoveredCollectionHealth(recovery.result)
	) {
		return false;
	}

	await automation.evaluateJs("location.reload();");
	await automation.waitFor({
		urlIncludes: "#/",
		timeoutMs: options.timeoutMs,
	});
	return true;
}

async function forceDevLoginForFixtureOrganization(
	automation: DesktopAutomation,
	options: ParsedDesktopPerfLoadedUiOptions,
	fixtureOrganizationId: string,
): Promise<{
	attempted: boolean;
	devEmail: string;
	activeOrganizationId: string;
	fixtureOrganizationId: string;
}> {
	const windowInfo = await automation.getWindowInfo();
	const origin = new URL(windowInfo.url).origin;
	const signIn = await postJson<DesktopEmailAuthResponse>(
		`${origin}/api/auth/sign-in/email`,
		{
			email: options.devEmail,
			password: options.devPassword,
		},
	);

	if (!signIn.response.ok) {
		throw new Error(
			`Could not sign in loaded UI dev account: ${getAuthFailureMessage(
				signIn.data,
				signIn.response.status,
			)}`,
		);
	}

	const signInToken = normalizeBearerToken(signIn.data.token ?? null);
	if (!signInToken) {
		throw new Error("Loaded UI dev sign-in did not return a bearer token.");
	}

	const token = signInToken;
	const sessionResponse = await fetch(`${origin}/api/auth/get-session`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	const session = (await sessionResponse
		.json()
		.catch(() => null)) as DesktopSessionResponse | null;
	await callElectronTrpc(automation, "auth.persistToken", "mutation", {
		token,
		expiresAt:
			session?.session?.expiresAt ??
			new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
		organizationId: fixtureOrganizationId,
	});
	await automation.evaluateJs(
		`localStorage.setItem("active_organization_id", ${JSON.stringify(
			fixtureOrganizationId,
		)}); location.reload();`,
	);
	await automation.waitFor({
		urlIncludes: "#/",
		timeoutMs: options.timeoutMs,
	});
	const activeOrganizationId = await waitForRendererFixtureOrganization(
		automation,
		options,
		fixtureOrganizationId,
	);

	return {
		attempted: true,
		devEmail: options.devEmail,
		activeOrganizationId,
		fixtureOrganizationId,
	};
}

function buildSummaryScript(projectText: string, taskText: string): string {
	return `(() => {
  const text = document.body?.innerText ?? "";
  const countText = (needle) => needle ? text.split(needle).length - 1 : 0;
  const debugActiveOrganizationId = window.__supersetCollectionsDebug?.getActiveOrganizationId?.() ?? localStorage.getItem("active_organization_id");
  return JSON.stringify({
    href: location.href,
    domNodeCount: document.querySelectorAll("*").length,
    bodyTextLength: text.length,
    debugActiveOrganizationId,
    projectMentions: countText(${JSON.stringify(projectText)}),
    taskMentions: countText(${JSON.stringify(taskText)}),
    workspaceRowCount: document.querySelectorAll("[data-v2-workspace-row]").length,
    sidebarWorkspaceRowCount: document.querySelectorAll(${JSON.stringify(DASHBOARD_SIDEBAR_WORKSPACE_ROW_SELECTOR)}).length,
    sidebarProjectSectionCount: document.querySelectorAll("[data-dashboard-sidebar-project-section]").length,
    sidebarOverflowLinkCount: document.querySelectorAll("[data-dashboard-sidebar-overflow-link]").length,
    env: {
      apiUrl: process.env.NEXT_PUBLIC_API_URL,
      electricUrl: process.env.NEXT_PUBLIC_ELECTRIC_URL,
      relayUrl: process.env.NEXT_PUBLIC_RELAY_URL,
    },
    textSample: text.slice(0, 1200),
  });
})()`;
}

async function collectSummary(
	automation: DesktopAutomation,
	options: ParsedDesktopPerfLoadedUiOptions,
): Promise<LoadedViewSummary> {
	const raw = await automation.evaluateJs(
		buildSummaryScript(options.projectText, options.taskText),
	);
	if (typeof raw !== "string") {
		throw new Error("Desktop summary script did not return JSON");
	}
	return JSON.parse(raw) as LoadedViewSummary;
}

async function openWorkspaceSidebarForDensityCheck(
	automation: DesktopAutomation,
	options: ParsedDesktopPerfLoadedUiOptions,
): Promise<void> {
	if (options.minSidebarWorkspaceRows <= 0) return;

	await automation.evaluateJs(`(() => {
  const key = "workspace-sidebar-store";
  const fallbackState = {
    isOpen: true,
    width: 280,
    lastExpandedWidth: 280,
    collapsedProjectIds: [],
  };
  const parsed = (() => {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  })();
  const state = {
    ...fallbackState,
    ...(parsed && typeof parsed === "object" && parsed.state && typeof parsed.state === "object" ? parsed.state : {}),
    isOpen: true,
    width: 280,
    lastExpandedWidth: 280,
  };
  localStorage.setItem(key, JSON.stringify({ state, version: 2 }));
  location.reload();
})()`);
	await automation.waitFor({
		urlIncludes: "#/v2-workspaces",
		timeoutMs: options.timeoutMs,
	});
	await automation.waitFor({
		text: options.projectText,
		timeoutMs: options.timeoutMs,
	});
	await automation.waitFor({
		selector: DASHBOARD_SIDEBAR_WORKSPACE_ROW_SELECTOR,
		timeoutMs: options.timeoutMs,
	});
}

function ensureLoadedFixture(
	options: ParsedDesktopPerfLoadedUiOptions,
): unknown {
	if (!options.ensureFixture) return undefined;

	const args = [
		"run",
		"desktop:perf-fixture",
		"--",
		"ensure",
		"--slug",
		options.fixtureSlug,
		"--projects",
		String(options.fixtureProjects),
		"--workspaces-per-project",
		String(options.fixtureWorkspacesPerProject),
		"--tasks",
		String(options.fixtureTasks),
		"--host-backed-workspaces",
		String(options.fixtureHostBackedWorkspaces),
		"--email",
		options.devEmail,
		...(options.allowRemoteFixture ? ["--allow-remote"] : []),
	];

	try {
		const output = execFileSync(process.execPath, args, {
			cwd: process.cwd(),
			encoding: "utf8",
			env: {
				...process.env,
				...(options.fixtureDatabaseUrl
					? { DATABASE_URL: options.fixtureDatabaseUrl }
					: {}),
				...(options.fixtureDatabaseUrlUnpooled
					? { DATABASE_URL_UNPOOLED: options.fixtureDatabaseUrlUnpooled }
					: {}),
				NODE_ENV: process.env.NODE_ENV ?? "development",
			},
			stdio: ["ignore", "pipe", "pipe"],
		});
		return JSON.parse(output);
	} catch (error) {
		const detail =
			error instanceof Error && "stderr" in error
				? String((error as { stderr?: unknown }).stderr ?? error.message)
				: error instanceof Error
					? error.message
					: String(error);
		throw new Error(
			[
				"Could not ensure the loaded desktop performance fixture.",
				detail.trim(),
				"Start the local loaded profile with: bun run dev:worktree:start:loaded",
			]
				.filter(Boolean)
				.join("\n"),
		);
	}
}

function assertLoadedViews(
	report: LoadedUiReport,
	options: ParsedDesktopPerfLoadedUiOptions,
): void {
	const failures: string[] = [];
	if (report.workspaceView.workspaceRowCount < options.minWorkspaceRows) {
		failures.push(
			`workspace view rendered ${report.workspaceView.workspaceRowCount} main workspace rows; expected at least ${options.minWorkspaceRows}`,
		);
	}
	if (
		report.workspaceView.sidebarWorkspaceRowCount <
		options.minSidebarWorkspaceRows
	) {
		failures.push(
			`workspace view rendered ${report.workspaceView.sidebarWorkspaceRowCount} sidebar workspace rows; expected at least ${options.minSidebarWorkspaceRows}`,
		);
	}
	if (report.workspaceView.projectMentions < 1) {
		failures.push(
			`workspace view did not contain fixture project text "${options.projectText}"`,
		);
	}
	if (report.tasksView.taskMentions < options.minTaskMentions) {
		failures.push(
			`tasks view rendered ${report.tasksView.taskMentions} visible fixture task mentions; expected at least ${options.minTaskMentions}`,
		);
	}
	if (report.workspaceView.domNodeCount > options.maxWorkspaceDomNodes) {
		failures.push(
			`workspace view rendered ${report.workspaceView.domNodeCount} DOM nodes; expected at most ${options.maxWorkspaceDomNodes}`,
		);
	}
	if (report.tasksView.domNodeCount > options.maxTasksDomNodes) {
		failures.push(
			`tasks view rendered ${report.tasksView.domNodeCount} DOM nodes; expected at most ${options.maxTasksDomNodes}`,
		);
	}
	const blockingConsoleErrorCount = options.failOnResourceErrors
		? report.consoleErrorCount
		: report.consoleRuntimeErrorCount;
	if (!options.allowConsoleErrors && blockingConsoleErrorCount > 0) {
		failures.push(
			`renderer logged ${blockingConsoleErrorCount} blocking console error(s) during loaded UI verification`,
		);
	}
	if (
		report.auth.fixtureOrganizationId &&
		report.auth.activeOrganizationId !== report.auth.fixtureOrganizationId
	) {
		failures.push(
			`renderer active organization is ${report.auth.activeOrganizationId ?? "missing"}; expected fixture organization ${report.auth.fixtureOrganizationId}`,
		);
	}

	if (failures.length === 0) return;

	throw new Error(
		[
			"Loaded desktop UI verification failed:",
			...failures.map((failure) => `- ${failure}`),
			`Workspace URL: ${report.workspaceView.href}`,
			`Tasks URL: ${report.tasksView.href}`,
			`Workspace text sample: ${report.workspaceView.textSample}`,
			`Tasks text sample: ${report.tasksView.textSample}`,
		].join("\n"),
	);
}

async function writeJsonArtifact(path: string, report: LoadedUiReport) {
	const resolved = resolve(process.cwd(), path);
	await mkdir(dirname(resolved), { recursive: true });
	await writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`);
	return resolved;
}

function isBrowserResourceError(message: string): boolean {
	return message.startsWith("Failed to load resource:");
}

async function runLoadedUiVerification(
	options: ParsedDesktopPerfLoadedUiOptions,
): Promise<LoadedUiReport & { reportPath: string }> {
	loadRootEnv();
	const fixtureResult = ensureLoadedFixture(options);
	const fixtureOrganizationId = getFixtureOrganizationId(fixtureResult);
	const fixtureHostBackedWorkspaceId =
		getFixtureHostBackedWorkspaceId(fixtureResult);
	const automation = new DesktopAutomation();
	const startedAt = new Date().toISOString();
	const workspacesScreenshot = `${options.artifactDir}/loaded-workspaces-ui.png`;
	const tasksScreenshot = `${options.artifactDir}/loaded-tasks-ui.png`;
	const workspaceDetailScreenshot = `${options.artifactDir}/loaded-workspace-detail-ui.png`;
	const reportArtifact = `${options.artifactDir}/loaded-ui-report.json`;

	try {
		await automation.getConsoleLogs({
			level: "error",
			limit: 200,
			clear: true,
		});

		const authResult =
			options.autoLoginDev && fixtureOrganizationId
				? await forceDevLoginForFixtureOrganization(
						automation,
						options,
						fixtureOrganizationId,
					)
				: { attempted: false };

		if (!options.skipNavigation) {
			await automation.navigate({ path: "/v2-workspaces" });
		}
		const workspaceState = await waitForWorkspaceLoadedOrSignIn(
			automation,
			options,
			fixtureOrganizationId,
		);
		const fallbackAuthResult =
			workspaceState === "sign-in"
				? await autoLoginDevIfNeeded(automation, options)
				: authResult;
		if (workspaceState === "sign-in" && !options.skipNavigation) {
			await automation.navigate({ path: "/v2-workspaces" });
		}
		await automation.waitFor({
			urlIncludes: "#/v2-workspaces",
			timeoutMs: options.timeoutMs,
		});
		await automation.waitFor({
			text: options.projectText,
			timeoutMs: options.timeoutMs,
		});
		await openWorkspaceSidebarForDensityCheck(automation, options);
		await automation.takeScreenshot({ path: workspacesScreenshot });
		const workspaceView = await collectSummary(automation, options);
		const interactions: LoadedInteractionSummary[] = [];
		interactions.push(
			await runLoadedInteraction(
				automation,
				"open-v2-workspace-detail",
				async () => {
					await clickFirstWorkspaceRow(
						automation,
						options,
						fixtureHostBackedWorkspaceId,
					);
				},
			),
		);
		interactions.push(
			await runLoadedInteraction(
				automation,
				"open-v2-workspace-right-sidebar",
				async () => {
					await ensureV2WorkspaceRightSidebarOpen(automation, options);
				},
			),
		);
		for (const label of ["Files", "Changes", "Review", "Models"] as const) {
			interactions.push(
				await runLoadedInteraction(
					automation,
					`switch-v2-workspace-sidebar-${label.toLowerCase()}`,
					async () => {
						await switchV2WorkspaceSidebarTab(automation, options, label);
					},
				),
			);
		}
		interactions.push(
			await runLoadedInteraction(
				automation,
				"open-workspace-chat-pane",
				async () => {
					await openChatPaneFromEmptyWorkspace(automation, options);
				},
			),
		);
		interactions.push(
			await runLoadedInteraction(
				automation,
				"workspace-chat-first-send",
				async () => {
					await sendWorkspaceChatProbe(automation, options);
				},
			),
		);
		interactions.push(
			await runLoadedInteraction(
				automation,
				"open-workspace-terminal-pane",
				async () => {
					await openTerminalPaneFromEmptyWorkspace(automation, options);
				},
			),
		);
		interactions.push(
			await runLoadedInteraction(
				automation,
				"open-workspace-file-pane",
				async () => {
					await openFilePaneFromFilesSidebar(automation, options);
				},
			),
		);
		await automation.takeScreenshot({ path: workspaceDetailScreenshot });

		await automation.navigate({ path: "/tasks" });
		await automation.waitFor({
			urlIncludes: "#/tasks",
			timeoutMs: options.timeoutMs,
		});
		await automation.waitFor({
			text: options.taskText,
			timeoutMs: options.timeoutMs,
		});
		interactions.push(
			await runLoadedInteraction(automation, "open-tasks-project-filter", () =>
				verifyTasksPopover(automation, options, "All tasks", 0, "No project"),
			),
		);
		interactions.push(
			await runLoadedInteraction(automation, "open-tasks-status-filter", () =>
				verifyTasksPopover(automation, options, "All tasks", 1, "Backlog"),
			),
		);
		interactions.push(
			await runLoadedInteraction(automation, "open-tasks-assignee-filter", () =>
				verifyTasksPopover(automation, options, "Assignee", 0, "Unassigned"),
			),
		);
		interactions.push(
			await runLoadedInteraction(
				automation,
				"switch-tasks-board-view",
				async () => {
					await clickButtonByTitle(automation, "Board view");
					await waitForRendererExpression(
						automation,
						getTextMatcherScript(options.taskText),
						options,
						"board view fixture task text",
					);
				},
			),
		);
		interactions.push(
			await runLoadedInteraction(
				automation,
				"switch-tasks-table-view",
				async () => {
					await clickButtonByTitle(automation, "Table view");
					await waitForRendererExpression(
						automation,
						getTextMatcherScript(options.taskText),
						options,
						"table view fixture task text",
					);
				},
			),
		);
		for (const typeTab of ["PRs", "Issues", "Tasks"] as const) {
			interactions.push(
				await runLoadedInteraction(
					automation,
					`switch-tasks-type-${typeTab.toLowerCase()}`,
					async () => {
						await automation.click({ text: typeTab, fuzzy: false });
						await waitForRendererExpression(
							automation,
							getTextMatcherScript(typeTab),
							options,
							`${typeTab} task type tab`,
						);
					},
				),
			);
		}
		await automation.takeScreenshot({ path: tasksScreenshot });
		const tasksView = await collectSummary(automation, options);
		const rendererActiveOrganization = await getRendererActiveOrganizationId(
			automation,
		).catch(() => null);
		const rendererActiveOrganizationId = rendererActiveOrganization?.result;
		const consoleErrors = await automation.getConsoleLogs({
			level: "error",
			limit: 50,
		});
		const consoleErrorMessages = consoleErrors.map((entry) => entry.message);
		const consoleResourceErrors = consoleErrorMessages.filter(
			isBrowserResourceError,
		);
		const consoleRuntimeErrors = consoleErrorMessages.filter(
			(message) => !isBrowserResourceError(message),
		);
		const collectionHealth = await getCollectionsDebugHealth(
			automation,
			fixtureOrganizationId,
		).catch((error) => ({
			available: false,
			error: error instanceof Error ? error.message : String(error),
		}));
		const report: LoadedUiReport = {
			startedAt,
			completedAt: new Date().toISOString(),
			workspaceView,
			tasksView,
			interactions,
			screenshots: {
				workspaces: resolve(process.cwd(), workspacesScreenshot),
				tasks: resolve(process.cwd(), tasksScreenshot),
				workspaceDetail: resolve(process.cwd(), workspaceDetailScreenshot),
			},
			consoleErrorCount: consoleErrorMessages.length,
			consoleResourceErrorCount: consoleResourceErrors.length,
			consoleRuntimeErrorCount: consoleRuntimeErrors.length,
			consoleErrors: consoleErrorMessages,
			consoleResourceErrors,
			consoleRuntimeErrors,
			auth: {
				autoLoginAttempted: fallbackAuthResult.attempted,
				...(fallbackAuthResult.devEmail
					? { devEmail: fallbackAuthResult.devEmail }
					: {}),
				...("activeOrganizationId" in fallbackAuthResult &&
				fallbackAuthResult.activeOrganizationId
					? { activeOrganizationId: fallbackAuthResult.activeOrganizationId }
					: rendererActiveOrganizationId
						? { activeOrganizationId: rendererActiveOrganizationId }
						: {}),
				...(fixtureOrganizationId ? { fixtureOrganizationId } : {}),
			},
			fixture: {
				ensureAttempted: options.ensureFixture,
				...(fixtureResult !== undefined ? { result: fixtureResult } : {}),
			},
			collections: collectionHealth,
		};
		assertLoadedViews(report, options);
		return {
			...report,
			reportPath: await writeJsonArtifact(reportArtifact, report),
		};
	} finally {
		automation.disconnect();
	}
}

function printHelp() {
	console.log(`Usage: bun run desktop:perf-loaded-ui -- [options]

Verifies that the currently running Electron desktop window is pointed at a
loaded desktop performance fixture, not an empty authenticated shell.

Options:
  --artifact-dir <dir>                 Where screenshots/report are written
  --project-text <text>                Fixture project text to wait for
  --task-text <text>                   Fixture task text to wait for
  --min-workspace-rows <count>         Minimum visible main workspace rows
  --min-sidebar-workspace-rows <count> Minimum visible sidebar workspace rows
  --min-task-mentions <count>          Minimum visible task text mentions
  --max-workspace-dom-nodes <count>    Maximum DOM nodes on /v2-workspaces
  --max-tasks-dom-nodes <count>        Maximum DOM nodes on /tasks
  --timeout-ms <ms>                    Wait timeout per UI condition
  --skip-navigation                    Validate the current route first
  --allow-console-errors               Do not fail on renderer console errors
  --fail-on-resource-errors            Treat browser resource fetch errors as failures
  --auto-login-dev                     If routed to sign-in, log in as the local dev account
  --dev-email <email>                  Local dev email for --auto-login-dev
  --dev-password <password>            Local dev password for --auto-login-dev
  --ensure-fixture                     Ensure dense local fixture rows before UI verification
  --fixture-slug <slug>                Fixture slug prefix (default ${DEFAULT_FIXTURE_SLUG})
  --fixture-projects <count>           Dense fixture project count
  --fixture-workspaces-per-project <n> Dense fixture workspaces per project
  --fixture-tasks <count>              Dense fixture task count
  --fixture-host-backed-workspaces <n> Dense fixture rows backed by this local host
  --allow-remote-fixture               Permit fixture seed on disposable non-production remote DBs
  --json                               Print the full report as JSON
  --help                               Show this help
`);
}

if (import.meta.main) {
	const parsed = parseDesktopPerfLoadedUiArgs(Bun.argv.slice(2));
	if (parsed === "help") {
		printHelp();
		process.exit(0);
	}

	runLoadedUiVerification(parsed)
		.then((report) => {
			if (parsed.json) {
				console.log(JSON.stringify(report, null, 2));
				return;
			}
			console.log(
				[
					"Loaded desktop UI verified",
					`  workspaces: ${report.workspaceView.workspaceRowCount} visible main rows, ${report.workspaceView.sidebarWorkspaceRowCount} sidebar rows`,
					`  DOM: ${report.workspaceView.domNodeCount} workspace nodes, ${report.tasksView.domNodeCount} task nodes`,
					`  tasks: ${report.tasksView.taskMentions} visible fixture task mentions`,
					`  interactions: ${report.interactions.length} loaded interaction checks`,
					`  auth: ${report.auth.autoLoginAttempted ? `auto-login-dev (${report.auth.devEmail})` : "existing session"}`,
					`  fixture: ${report.fixture.ensureAttempted ? "ensured before verification" : "existing data only"}`,
					`  screenshots: ${report.screenshots.workspaces}, ${report.screenshots.workspaceDetail}, ${report.screenshots.tasks}`,
					`  report: ${report.reportPath}`,
				].join("\n"),
			);
		})
		.catch((error) => {
			console.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		});
}
