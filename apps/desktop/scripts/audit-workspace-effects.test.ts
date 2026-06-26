import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const desktopDir = resolve(import.meta.dirname, "..");
const rootDir = resolve(desktopDir, "../..");

const workspaceEffectAuditRoots = [
	resolve(
		desktopDir,
		"src/renderer/routes/_authenticated/_dashboard/v2-workspace",
	),
	resolve(
		desktopDir,
		"src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView",
	),
];

const cleanupSensitiveCalls = new Set([
	"addEventListener",
	"requestAnimationFrame",
	"setInterval",
	"setTimeout",
	"subscribe",
]);

const cleanupSensitiveConstructors = new Set([
	"IntersectionObserver",
	"MutationObserver",
	"ResizeObserver",
	"WebSocket",
]);

interface EffectCleanupIssue {
	file: string;
	line: number;
	reasons: string[];
}

function listSourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		const stat = statSync(path);
		if (stat.isDirectory()) return listSourceFiles(path);
		if (!/\.(ts|tsx|js|jsx)$/.test(name)) return [];
		if (/\.(test|spec|stories)\./.test(name)) return [];
		return [path];
	});
}

function getSourceFile(path: string): ts.SourceFile {
	const sourceText = readFileSync(path, "utf8");
	return ts.createSourceFile(
		path,
		sourceText,
		ts.ScriptTarget.Latest,
		true,
		path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);
}

function isUseEffectCall(node: ts.Node): node is ts.CallExpression {
	return (
		ts.isCallExpression(node) &&
		ts.isIdentifier(node.expression) &&
		node.expression.text === "useEffect"
	);
}

function isFunctionLike(node: ts.Node): boolean {
	return (
		ts.isArrowFunction(node) ||
		ts.isFunctionDeclaration(node) ||
		ts.isFunctionExpression(node) ||
		ts.isMethodDeclaration(node)
	);
}

function collectCleanupSensitiveReasons(node: ts.Node): string[] {
	const reasons = new Set<string>();

	function visit(current: ts.Node) {
		if (ts.isCallExpression(current)) {
			const expression = current.expression;
			if (
				ts.isIdentifier(expression) &&
				cleanupSensitiveCalls.has(expression.text)
			) {
				reasons.add(expression.text);
			}
			if (
				ts.isPropertyAccessExpression(expression) &&
				cleanupSensitiveCalls.has(expression.name.text)
			) {
				reasons.add(expression.name.text);
			}
		}

		if (
			ts.isNewExpression(current) &&
			ts.isIdentifier(current.expression) &&
			cleanupSensitiveConstructors.has(current.expression.text)
		) {
			reasons.add(current.expression.text);
		}

		ts.forEachChild(current, visit);
	}

	visit(node);
	return [...reasons].sort();
}

function effectHasCleanupReturn(callback: ts.Expression): boolean {
	if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) {
		return false;
	}

	if (!ts.isBlock(callback.body)) {
		return true;
	}

	let found = false;
	function visit(current: ts.Node) {
		if (found) return;
		if (current !== callback && isFunctionLike(current)) return;
		if (ts.isReturnStatement(current)) {
			found = true;
			return;
		}
		ts.forEachChild(current, visit);
	}

	visit(callback.body);
	return found;
}

function findEffectCleanupIssues(): EffectCleanupIssue[] {
	const issues: EffectCleanupIssue[] = [];

	for (const file of workspaceEffectAuditRoots.flatMap(listSourceFiles)) {
		const sourceFile = getSourceFile(file);

		function visit(node: ts.Node) {
			if (isUseEffectCall(node)) {
				const callback = node.arguments[0];
				if (callback) {
					const reasons = collectCleanupSensitiveReasons(callback);
					if (
						reasons.length > 0 &&
						!effectHasCleanupReturn(callback as ts.Expression)
					) {
						const { line } = sourceFile.getLineAndCharacterOfPosition(
							node.getStart(sourceFile),
						);
						issues.push({
							file: relative(rootDir, file),
							line: line + 1,
							reasons,
						});
					}
				}
			}

			ts.forEachChild(node, visit);
		}

		visit(sourceFile);
	}

	return issues;
}

describe("workspace effect cleanup audit", () => {
	test("cleanup-sensitive workspace effects return a cleanup function", () => {
		expect(findEffectCleanupIssues()).toEqual([]);
	});
});
