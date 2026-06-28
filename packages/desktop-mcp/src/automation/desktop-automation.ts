import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { KeyInput, Page } from "puppeteer-core";
import { ConnectionManager } from "../mcp/connection/index.js";
import { DOM_INSPECTOR_SCRIPT } from "../mcp/dom-inspector/index.js";
import { resolveScreenshotPath } from "../mcp/tools/take-screenshot/take-screenshot.js";
import type { ConsoleLogEntry } from "../zod.js";
import {
	type BlankFrameResult,
	type BlankFrameSample,
	buildVisualStabilityFailures,
	classifyBlankFramePixels,
	classifyDomChurn,
	classifyLayoutSelector,
	classifyPersistentSelector,
	type DomChurnResult,
	decodePngToRgba,
	type LayoutSample,
	type LayoutSelectorResult,
	normalizeVisualStabilityThresholds,
	type PersistentRemoval,
	type PersistentSelectorResult,
	type VisualStabilityAction,
	type VisualStabilityArtifacts,
	type VisualStabilityOptions,
	type VisualStabilityReport,
} from "./visual-stability.js";

export interface ScreenshotRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ScreenshotResult {
	image: string;
	path?: string;
	width: number;
	height: number;
}

export interface DomElement {
	tag: string;
	id?: string;
	classes: string[];
	text: string;
	selector: string;
	bounds: { x: number; y: number; width: number; height: number };
	role?: string;
	testId?: string;
	interactive: boolean;
	disabled: boolean;
	checked?: boolean;
	focused: boolean;
	visible: boolean;
}

export interface WindowInfo {
	title: string;
	url: string;
	viewportWidth: number;
	viewportHeight: number;
	focused: boolean;
}

export interface ClickOptions {
	selector?: string;
	text?: string;
	testId?: string;
	x?: number;
	y?: number;
	index?: number;
	fuzzy?: boolean;
}

export interface ClickResult {
	message: string;
	element?: {
		tag: string;
		text: string;
		selector?: string;
		x: number;
		y: number;
	};
}

export interface TypeTextOptions {
	text: string;
	selector?: string;
	clearFirst?: boolean;
}

export interface SendKeysOptions {
	keys: string[];
}

export interface ConsoleLogsOptions {
	level?: "debug" | "log" | "info" | "warn" | "error";
	limit?: number;
	clear?: boolean;
}

export interface NavigateOptions {
	url?: string;
	path?: string;
}

export interface WaitForOptions {
	selector?: string;
	text?: string;
	testId?: string;
	urlIncludes?: string;
	fuzzy?: boolean;
	absent?: boolean;
	timeoutMs?: number;
}

export interface WaitForResult {
	kind: string;
	text?: string;
	url?: string;
	selector?: string;
	tag?: string;
}

interface RawPersistentSelectorState {
	selector: string;
	initialCount: number;
	finalCount: number;
	removals: PersistentRemoval[];
}

interface RawDomChurnState {
	selector: string;
	addedCount: number;
	removedCount: number;
	largestRemovedSummary?: string;
}

interface RawVisualStabilityObserverSnapshot {
	persistent: RawPersistentSelectorState[];
	layout: Array<{
		selector: string;
		samples: LayoutSample[];
	}>;
	domChurn: RawDomChurnState[];
}

const ROUTER_HISTORY_STORAGE_KEY = "router-history";
const MAX_ROUTER_HISTORY_ENTRIES = 100;

export function normalizeHashPath(path: string): string {
	const trimmed = path.trim();
	if (!trimmed) return "/";
	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function buildRouterHistoryStateForPath(
	path: string,
	rawState: string | null,
): string {
	let entries = ["/"];
	let index = 0;

	try {
		if (rawState) {
			const parsed = JSON.parse(rawState) as {
				entries?: unknown;
				index?: unknown;
			};
			if (
				Array.isArray(parsed.entries) &&
				parsed.entries.every(
					(entry) => typeof entry === "string" && entry.length > 0,
				)
			) {
				entries = parsed.entries;
				index =
					typeof parsed.index === "number"
						? Math.min(Math.max(parsed.index, 0), entries.length - 1)
						: entries.length - 1;
			}
		}
	} catch {}

	const nextEntries = entries.slice(0, index + 1);
	if (nextEntries[nextEntries.length - 1] !== path) {
		nextEntries.push(path);
	}
	const cappedEntries =
		nextEntries.length > MAX_ROUTER_HISTORY_ENTRIES
			? nextEntries.slice(nextEntries.length - MAX_ROUTER_HISTORY_ENTRIES)
			: nextEntries;

	return JSON.stringify({
		entries: cappedEntries,
		index: cappedEntries.length - 1,
	});
}

const FIND_ELEMENT_SCRIPT = `(opts) => {
	const { selector, text, testId, index, fuzzy } = opts;
	let el;

	if (selector) {
		el = document.querySelectorAll(selector)[index];
	} else if (testId) {
		el = document.querySelectorAll('[data-testid="' + testId + '"]')[index];
	} else if (text) {
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		const matches = [];
		let node;
		while (node = walker.nextNode()) {
			const content = node.textContent.trim();
			if (fuzzy
				? content.toLowerCase().includes(text.toLowerCase())
				: content === text) {
				matches.push(node.parentElement);
			}
		}
		el = matches[index];
	}

	if (!el) return null;

	el.scrollIntoView({ block: 'nearest' });
	const rect = el.getBoundingClientRect();
	return {
		tag: el.tagName.toLowerCase(),
		text: (el.textContent || '').trim().slice(0, 100),
		selector: el.id ? '#' + CSS.escape(el.id) : undefined,
		x: rect.x + rect.width / 2,
		y: rect.y + rect.height / 2,
	};
}`;

const LEVEL_MAP: Record<string, number> = {
	debug: 0,
	log: 1,
	info: 1,
	warn: 2,
	error: 3,
};

const KEY_MAP: Record<string, string> = {
	meta: "Meta",
	cmd: "Meta",
	command: "Meta",
	ctrl: "Control",
	control: "Control",
	alt: "Alt",
	option: "Alt",
	shift: "Shift",
	enter: "Enter",
	return: "Enter",
	escape: "Escape",
	esc: "Escape",
	tab: "Tab",
	backspace: "Backspace",
	delete: "Delete",
	space: " ",
	arrowup: "ArrowUp",
	arrowdown: "ArrowDown",
	arrowleft: "ArrowLeft",
	arrowright: "ArrowRight",
	up: "ArrowUp",
	down: "ArrowDown",
	left: "ArrowLeft",
	right: "ArrowRight",
};

const MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "Shift"]);

function normalizeKey(key: string): string {
	return KEY_MAP[key.toLowerCase()] ?? key;
}

function evaluateWaitForCondition(opts: {
	selector: string | null;
	text: string | null;
	testId: string | null;
	urlIncludes: string | null;
	fuzzy: boolean;
	absent: boolean;
}): WaitForResult | false {
	const { selector, text, testId, urlIncludes, fuzzy, absent } = opts;

	const isVisible = (el: Element | null): el is HTMLElement => {
		if (!(el instanceof HTMLElement)) return false;
		const rect = el.getBoundingClientRect();
		const style = window.getComputedStyle(el);
		return (
			(rect.width > 0 || rect.height > 0) &&
			style.display !== "none" &&
			style.visibility !== "hidden" &&
			Number.parseFloat(style.opacity || "1") !== 0
		);
	};

	let match: WaitForResult | null = null;

	if (urlIncludes) {
		match = window.location.href.includes(urlIncludes)
			? { kind: "url", url: window.location.href }
			: null;
	}

	if (!match && selector) {
		const el = Array.from(document.querySelectorAll(selector)).find(isVisible);
		match = el
			? {
					kind: "element",
					tag: el.tagName.toLowerCase(),
					text: (el.textContent || "").trim().slice(0, 100),
					selector,
				}
			: null;
	}

	if (!match && testId) {
		const testIdSelector = `[data-testid="${testId}"]`;
		const el = Array.from(document.querySelectorAll(testIdSelector)).find(
			isVisible,
		);
		match = el
			? {
					kind: "element",
					tag: el.tagName.toLowerCase(),
					text: (el.textContent || "").trim().slice(0, 100),
					selector: testIdSelector,
				}
			: null;
	}

	if (!match && text) {
		const walker = document.createTreeWalker(
			document.body,
			NodeFilter.SHOW_TEXT,
		);
		let node = walker.nextNode();
		while (node) {
			const content = (node.textContent || "").trim();
			const matchesText = fuzzy
				? content.toLowerCase().includes(text.toLowerCase())
				: content === text;
			if (matchesText && isVisible(node.parentElement)) {
				const el = node.parentElement;
				match = {
					kind: "element",
					tag: el.tagName.toLowerCase(),
					text: content.slice(0, 100),
					selector: el.id ? `#${CSS.escape(el.id)}` : el.tagName.toLowerCase(),
				};
				break;
			}
			node = walker.nextNode();
		}
	}

	if (absent) return match ? false : { kind: "absent" };
	return match || false;
}

async function getPageSize(page: Page, rect?: ScreenshotRect) {
	if (rect) return { width: rect.width, height: rect.height };
	return page.evaluate(() => ({
		width: window.innerWidth,
		height: window.innerHeight,
	}));
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function writeScreenshotArtifact(
	path: string,
	base64Png: string,
): Promise<string> {
	const resolvedPath = resolveScreenshotPath(path);
	await mkdir(dirname(resolvedPath), { recursive: true });
	await writeFile(resolvedPath, Buffer.from(base64Png, "base64"));
	return resolvedPath;
}

function getFailedFramePath(dir: string, index: number): string {
	const normalizedDir = dir.endsWith("/") ? dir.slice(0, -1) : dir;
	return `${normalizedDir}/blank-frame-${String(index).padStart(3, "0")}.png`;
}

function installVisualStabilityObserver({
	persistSelectors,
	measureSelectors,
	churnRootSelectors,
	sampleIntervalMs,
}: {
	persistSelectors: string[];
	measureSelectors: string[];
	churnRootSelectors: string[];
	sampleIntervalMs: number;
}): RawVisualStabilityObserverSnapshot {
	type TrackedPersistentSelector = {
		selector: string;
		nodes: Array<{ node: Element; removed: boolean }>;
		removals: PersistentRemoval[];
	};
	type TrackedLayoutSelector = {
		selector: string;
		samples: LayoutSample[];
	};
	type TrackedDomChurnRoot = {
		selector: string;
		addedCount: number;
		removedCount: number;
		largestRemovedSummary?: string;
		largestRemovedSize: number;
	};
	type VisualStabilityState = {
		collect: () => RawVisualStabilityObserverSnapshot;
		cleanup: () => RawVisualStabilityObserverSnapshot;
	};
	type VisualStabilityWindow = typeof window & {
		__supersetVisualStability?: VisualStabilityState;
	};

	const stabilityWindow = window as VisualStabilityWindow;
	stabilityWindow.__supersetVisualStability?.cleanup();

	const startedAt = performance.now();
	const timestamp = () => performance.now() - startedAt;
	const summarizeElement = (node: Node): string => {
		if (!(node instanceof Element))
			return node.textContent?.trim().slice(0, 120) ?? "";
		const tag = node.tagName.toLowerCase();
		const id = node.id ? `#${node.id}` : "";
		const className =
			node.classList.length > 0
				? `.${Array.from(node.classList).slice(0, 3).join(".")}`
				: "";
		const text = (node.textContent ?? "")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 120);
		return `${tag}${id}${className}${text ? ` "${text}"` : ""}`;
	};
	const elementCount = (node: Node): number => {
		if (!(node instanceof Element)) return 0;
		return 1 + node.querySelectorAll("*").length;
	};
	const nodeContainsTrackedElement = (
		node: Node,
		trackedNode: Element,
	): boolean =>
		node === trackedNode ||
		(node instanceof Element && node.contains(trackedNode));
	const rootContainsMutationTarget = (
		selector: string,
		target: Node,
	): boolean => {
		const root = document.querySelector(selector);
		return Boolean(root && (root === target || root.contains(target)));
	};

	const persistent = persistSelectors.map<TrackedPersistentSelector>(
		(selector) => ({
			selector,
			nodes: Array.from(document.querySelectorAll(selector)).map((node) => ({
				node,
				removed: false,
			})),
			removals: [],
		}),
	);
	const layout = measureSelectors.map<TrackedLayoutSelector>((selector) => ({
		selector,
		samples: [],
	}));
	const domChurn = churnRootSelectors.map<TrackedDomChurnRoot>((selector) => ({
		selector,
		addedCount: 0,
		removedCount: 0,
		largestRemovedSize: 0,
	}));

	const sampleLayout = () => {
		for (const entry of layout) {
			const element = document.querySelector(entry.selector);
			if (!(element instanceof HTMLElement)) {
				entry.samples.push({ timestampMs: timestamp(), bounds: null });
				continue;
			}
			const rect = element.getBoundingClientRect();
			entry.samples.push({
				timestampMs: timestamp(),
				bounds: {
					x: rect.x,
					y: rect.y,
					width: rect.width,
					height: rect.height,
				},
			});
		}
	};

	sampleLayout();

	const observer = new MutationObserver((records) => {
		for (const record of records) {
			const addedElements = Array.from(record.addedNodes).reduce(
				(sum, node) => sum + elementCount(node),
				0,
			);
			for (const churnRoot of domChurn) {
				if (!rootContainsMutationTarget(churnRoot.selector, record.target)) {
					continue;
				}
				churnRoot.addedCount += addedElements;
				for (const node of Array.from(record.removedNodes)) {
					const removedSize = elementCount(node);
					churnRoot.removedCount += removedSize;
					if (removedSize > churnRoot.largestRemovedSize) {
						churnRoot.largestRemovedSize = removedSize;
						churnRoot.largestRemovedSummary = summarizeElement(node);
					}
				}
			}

			for (const node of Array.from(record.removedNodes)) {
				for (const tracked of persistent) {
					for (const trackedNode of tracked.nodes) {
						if (trackedNode.removed) continue;
						if (!nodeContainsTrackedElement(node, trackedNode.node)) continue;
						trackedNode.removed = true;
						tracked.removals.push({
							timestampMs: timestamp(),
							selector: tracked.selector,
							summary: summarizeElement(trackedNode.node),
						});
					}
				}
			}
		}
	});

	observer.observe(document.documentElement, {
		childList: true,
		subtree: true,
	});
	const interval = window.setInterval(sampleLayout, sampleIntervalMs);

	const collect = (): RawVisualStabilityObserverSnapshot => ({
		persistent: persistent.map((entry) => ({
			selector: entry.selector,
			initialCount: entry.nodes.length,
			finalCount: document.querySelectorAll(entry.selector).length,
			removals: entry.removals,
		})),
		layout: layout.map((entry) => ({
			selector: entry.selector,
			samples: entry.samples,
		})),
		domChurn: domChurn.map((entry) => ({
			selector: entry.selector,
			addedCount: entry.addedCount,
			removedCount: entry.removedCount,
			...(entry.largestRemovedSummary
				? { largestRemovedSummary: entry.largestRemovedSummary }
				: {}),
		})),
	});

	stabilityWindow.__supersetVisualStability = {
		collect,
		cleanup: () => {
			window.clearInterval(interval);
			observer.disconnect();
			sampleLayout();
			const snapshot = collect();
			delete stabilityWindow.__supersetVisualStability;
			return snapshot;
		},
	};

	return collect();
}

function collectVisualStabilityObserver(): RawVisualStabilityObserverSnapshot | null {
	type VisualStabilityWindow = typeof window & {
		__supersetVisualStability?: {
			collect: () => RawVisualStabilityObserverSnapshot;
		};
	};
	return (
		(window as VisualStabilityWindow).__supersetVisualStability?.collect() ??
		null
	);
}

function cleanupVisualStabilityObserver(): RawVisualStabilityObserverSnapshot | null {
	type VisualStabilityWindow = typeof window & {
		__supersetVisualStability?: {
			cleanup: () => RawVisualStabilityObserverSnapshot;
		};
	};
	return (
		(window as VisualStabilityWindow).__supersetVisualStability?.cleanup() ??
		null
	);
}

export class DesktopAutomation {
	constructor(private readonly connection = new ConnectionManager()) {}

	disconnect(): void {
		this.connection.disconnect();
	}

	async getWindowInfo(): Promise<WindowInfo> {
		const page = await this.connection.getPage();
		const info = (await page.evaluate(() => ({
			title: document.title,
			url: window.location.href,
			viewportWidth: window.innerWidth,
			viewportHeight: window.innerHeight,
			focused: document.hasFocus(),
		}))) as WindowInfo;
		const viewport = page.viewport();
		return {
			...info,
			viewportWidth: viewport?.width ?? info.viewportWidth,
			viewportHeight: viewport?.height ?? info.viewportHeight,
		};
	}

	async inspectDom({
		selector,
		interactiveOnly = false,
	}: {
		selector?: string;
		interactiveOnly?: boolean;
	} = {}): Promise<DomElement[]> {
		const page = await this.connection.getPage();
		return page.evaluate(
			`(${DOM_INSPECTOR_SCRIPT})(${JSON.stringify({ selector, interactiveOnly })})`,
		) as Promise<DomElement[]>;
	}

	async takeScreenshot({
		rect,
		path,
	}: {
		rect?: ScreenshotRect;
		path?: string;
	} = {}): Promise<ScreenshotResult> {
		const page = await this.connection.getPage();
		const image = (await page.screenshot({
			encoding: "base64",
			type: "png",
			clip: rect,
		})) as string;
		const size = await getPageSize(page, rect);
		if (!path) return { image, ...size };

		const resolvedPath = resolveScreenshotPath(path);
		await mkdir(dirname(resolvedPath), { recursive: true });
		await writeFile(resolvedPath, Buffer.from(image, "base64"));
		return { image, path: resolvedPath, ...size };
	}

	async click(options: ClickOptions): Promise<ClickResult> {
		const page = await this.connection.getPage();

		if (options.x !== undefined && options.y !== undefined) {
			await page.mouse.click(options.x, options.y);
			return { message: `Clicked at (${options.x}, ${options.y})` };
		}

		const hasTarget = Boolean(
			options.selector || options.text || options.testId,
		);
		if (!hasTarget) {
			throw new Error(
				"Must provide selector, text, testId, or x/y coordinates",
			);
		}

		const result = (await page.evaluate(
			`(${FIND_ELEMENT_SCRIPT})(${JSON.stringify({
				selector: options.selector ?? null,
				text: options.text ?? null,
				testId: options.testId ?? null,
				index: options.index ?? 0,
				fuzzy: options.fuzzy ?? true,
			})})`,
		)) as {
			tag: string;
			text: string;
			selector?: string;
			x: number;
			y: number;
		} | null;

		if (!result) throw new Error("Element not found");

		await page.mouse.click(result.x, result.y);
		return {
			message: `Clicked <${result.tag}> "${result.text}"`,
			element: result,
		};
	}

	async typeText({
		text,
		selector,
		clearFirst = false,
	}: TypeTextOptions): Promise<{ message: string }> {
		const page = await this.connection.getPage();
		if (selector) await page.click(selector);
		if (clearFirst) {
			await page.keyboard.down("Meta");
			await page.keyboard.press("a");
			await page.keyboard.up("Meta");
		}
		await page.keyboard.type(text);
		return { message: `Typed "${text}"` };
	}

	async sendKeys({ keys }: SendKeysOptions): Promise<{ message: string }> {
		const page = await this.connection.getPage();
		const normalizedKeys = keys.map(normalizeKey);
		const modifiers = normalizedKeys.filter((key) => MODIFIER_KEYS.has(key));
		const nonModifiers = normalizedKeys.filter(
			(key) => !MODIFIER_KEYS.has(key),
		);

		for (const modifier of modifiers) {
			await page.keyboard.down(modifier as KeyInput);
		}
		if (nonModifiers.length > 0) {
			for (const key of nonModifiers) {
				await page.keyboard.press(key as KeyInput);
			}
		} else if (modifiers.length > 0) {
			await page.keyboard.press(modifiers[modifiers.length - 1] as KeyInput);
		}
		for (const modifier of modifiers.reverse()) {
			await page.keyboard.up(modifier as KeyInput);
		}

		return { message: `Sent keys: ${keys.join("+")}` };
	}

	async getConsoleLogs({
		level,
		limit,
		clear = false,
	}: ConsoleLogsOptions = {}): Promise<ConsoleLogEntry[]> {
		await this.connection.getPage();
		const logs = this.connection.consoleCapture.getLogs({
			level: level ? LEVEL_MAP[level] : undefined,
			limit,
		});
		if (clear) this.connection.consoleCapture.clear();
		return logs;
	}

	async evaluateJs(code: string): Promise<unknown> {
		const page = await this.connection.getPage();
		return page.evaluate(code);
	}

	async navigate({ url, path }: NavigateOptions): Promise<{ url: string }> {
		const page = await this.connection.getPage();
		if (url) {
			await page.goto(url);
		} else if (path) {
			const normalizedPath = normalizeHashPath(path);
			const nextHistoryState = buildRouterHistoryStateForPath(
				normalizedPath,
				await page.evaluate(
					(historyKey) => localStorage.getItem(historyKey),
					ROUTER_HISTORY_STORAGE_KEY,
				),
			);
			await page.evaluate(
				({ historyKey, historyState, targetPath }) => {
					localStorage.setItem(historyKey, historyState);
					window.location.hash = `#${targetPath}`;
					window.location.reload();
				},
				{
					historyKey: ROUTER_HISTORY_STORAGE_KEY,
					historyState: nextHistoryState,
					targetPath: normalizedPath,
				},
			);
			await page
				.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10_000 })
				.catch(() => {});
		} else {
			throw new Error("Must provide url or path");
		}
		return { url: page.url() };
	}

	async runVisualStabilityCheck(
		options: VisualStabilityOptions,
	): Promise<VisualStabilityReport> {
		const page = await this.connection.getPage();
		const thresholds = normalizeVisualStabilityThresholds(options.thresholds);
		const startedAtDate = new Date();
		const startedAtMs = Date.now();
		const beforeUrl = page.url();
		const windowInfo = await this.getWindowInfo();
		const artifacts: VisualStabilityArtifacts = {};
		const failedFramePaths: string[] = [];
		let wait: WaitForResult | undefined;
		let actionError: string | undefined;
		let observerLost = false;
		const blankFrameSamples: BlankFrameSample[] = [];

		this.connection.consoleCapture.clear();

		if (options.artifacts?.beforeScreenshotPath) {
			const screenshot = await this.takeScreenshot({
				path: options.artifacts.beforeScreenshotPath,
			});
			artifacts.beforeScreenshot = screenshot.path;
		}

		await page.evaluate(installVisualStabilityObserver, {
			persistSelectors: options.persistSelectors,
			measureSelectors: options.measureSelectors,
			churnRootSelectors:
				options.churnRootSelectors.length > 0
					? options.churnRootSelectors
					: ["body"],
			sampleIntervalMs: Math.max(25, options.sampleIntervalMs),
		});

		const sampleBlankFrame = async (index: number): Promise<void> => {
			const image = (await page.screenshot({
				encoding: "base64",
				type: "png",
				clip: options.blankRect,
			})) as string;
			const decoded = decodePngToRgba(Buffer.from(image, "base64"));
			const classified = classifyBlankFramePixels({
				rgba: decoded.rgba,
				width: decoded.width,
				height: decoded.height,
				threshold: thresholds.blankThreshold,
			});
			let artifactPath: string | undefined;
			if (classified.blank && options.artifacts?.failedFrameDir) {
				artifactPath = await writeScreenshotArtifact(
					getFailedFramePath(options.artifacts.failedFrameDir, index),
					image,
				);
				failedFramePaths.push(artifactPath);
			}
			blankFrameSamples.push({
				...classified,
				index,
				timestampMs: Date.now() - startedAtMs,
				...(artifactPath ? { artifactPath } : {}),
			});
		};

		const executeAction = async (action: VisualStabilityAction) => {
			switch (action.kind) {
				case "click": {
					const { kind: _kind, ...clickOptions } = action;
					await this.click(clickOptions);
					return;
				}
				case "navigate": {
					const { kind: _kind, ...navigateOptions } = action;
					await this.navigate(navigateOptions);
					return;
				}
				case "evaluate-js":
					await this.evaluateJs(action.code);
					return;
				default:
					action satisfies never;
			}
		};

		let actionSettled = false;
		const actionPromise = (async () => {
			try {
				await executeAction(options.action);
				if (options.wait) {
					wait = await this.waitFor(options.wait);
				}
			} catch (error) {
				actionError = errorMessage(error);
			} finally {
				actionSettled = true;
			}
		})();

		const sampleIntervalMs = Math.max(25, options.sampleIntervalMs);
		let frameIndex = 0;
		do {
			await sampleBlankFrame(frameIndex);
			frameIndex += 1;
			if (Date.now() - startedAtMs >= options.sampleMs) break;
			await sleep(
				Math.min(
					sampleIntervalMs,
					Math.max(0, options.sampleMs - (Date.now() - startedAtMs)),
				),
			);
		} while (Date.now() - startedAtMs < options.sampleMs);

		await actionPromise;
		if (!actionSettled) {
			await actionPromise;
		}

		let snapshot = await page
			.evaluate(cleanupVisualStabilityObserver)
			.catch(() => null);
		if (!snapshot) {
			observerLost = true;
			snapshot = await page
				.evaluate(collectVisualStabilityObserver)
				.catch(() => null);
		}

		if (options.artifacts?.afterScreenshotPath) {
			const screenshot = await this.takeScreenshot({
				path: options.artifacts.afterScreenshotPath,
			});
			artifacts.afterScreenshot = screenshot.path;
		}
		if (failedFramePaths.length > 0) {
			artifacts.failedFrames = failedFramePaths;
		}

		const persistent: PersistentSelectorResult[] = (
			snapshot?.persistent ?? []
		).map((entry) =>
			classifyPersistentSelector({
				...entry,
				thresholds,
			}),
		);
		const layout: LayoutSelectorResult[] = (snapshot?.layout ?? []).map(
			(entry) =>
				classifyLayoutSelector({
					selector: entry.selector,
					samples: entry.samples,
					thresholds,
				}),
		);
		const blankFrameCount = blankFrameSamples.filter(
			(sample) => sample.blank,
		).length;
		const blankFrames: BlankFrameResult = {
			...(options.blankRect ? { rect: options.blankRect } : {}),
			threshold: thresholds.blankThreshold,
			frameCount: blankFrameSamples.length,
			blankFrameCount,
			samples: blankFrameSamples,
			failed: blankFrameCount > thresholds.maxBlankFrames,
			...(blankFrameCount > thresholds.maxBlankFrames
				? {
						reason: `${blankFrameCount} blank frame(s), maximum allowed is ${thresholds.maxBlankFrames}`,
					}
				: {}),
		};
		const domChurn: DomChurnResult[] = (snapshot?.domChurn ?? []).map((entry) =>
			classifyDomChurn({
				...entry,
				thresholds,
			}),
		);
		const consoleLogs = await this.getConsoleLogs();
		const failures = buildVisualStabilityFailures({
			persistent,
			layout,
			blankFrames,
			domChurn,
			consoleLogs,
			observerLost,
			actionError,
			thresholds,
		});
		const completedAt = new Date();

		return {
			command: "visual-stability",
			passed: failures.length === 0,
			startedAt: startedAtDate.toISOString(),
			completedAt: completedAt.toISOString(),
			durationMs: completedAt.getTime() - startedAtDate.getTime(),
			windowInfo,
			beforeUrl,
			afterUrl: page.url(),
			thresholds,
			action: options.action,
			...(wait ? { wait } : {}),
			persistent,
			layout,
			blankFrames,
			domChurn,
			consoleLogs,
			failures,
			artifacts,
		};
	}

	async waitFor(options: WaitForOptions): Promise<WaitForResult> {
		const page = await this.connection.getPage();
		const hasTarget = Boolean(
			options.selector || options.text || options.testId || options.urlIncludes,
		);
		if (!hasTarget) {
			throw new Error("Must provide selector, text, testId, or urlIncludes");
		}

		const handle = await page.waitForFunction(
			evaluateWaitForCondition,
			{ timeout: options.timeoutMs ?? 10_000 },
			{
				selector: options.selector ?? null,
				text: options.text ?? null,
				testId: options.testId ?? null,
				urlIncludes: options.urlIncludes ?? null,
				absent: options.absent ?? false,
				fuzzy: options.fuzzy ?? true,
			},
		);
		return (await handle.jsonValue()) as WaitForResult;
	}
}
