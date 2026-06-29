import { execFileSync } from "node:child_process";

interface PackageJson {
	version: string;
}

const DAEMON_PACKAGE_JSON = "packages/pty-daemon/package.json";

function git(args: string[], options?: { allowFailure?: boolean }): string {
	try {
		return execFileSync("git", args, {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
	} catch (error) {
		if (options?.allowFailure) return "";
		throw error;
	}
}

function remoteMainRef(): string | null {
	if (git(["rev-parse", "--verify", "origin/main"], { allowFailure: true })) {
		return "origin/main";
	}
	if (!process.env.GITHUB_BASE_REF) return null;
	git([
		"fetch",
		"--no-tags",
		"--depth=1",
		"origin",
		process.env.GITHUB_BASE_REF,
	]);
	const fetchedRef = `origin/${process.env.GITHUB_BASE_REF}`;
	return git(["rev-parse", "--verify", fetchedRef], { allowFailure: true })
		? fetchedRef
		: null;
}

function changedFilesAgainst(baseRef: string): string[] {
	return git(["diff", "--name-only", baseRef])
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

function isDaemonImplementationFile(file: string): boolean {
	if (!file.startsWith("packages/pty-daemon/src/")) return false;
	if (file.endsWith(".test.ts")) return false;
	if (file.endsWith(".test.tsx")) return false;
	return true;
}

function packageVersionAt(ref: string): string | null {
	const raw = git(["show", `${ref}:${DAEMON_PACKAGE_JSON}`], {
		allowFailure: true,
	});
	if (!raw) return null;
	return (JSON.parse(raw) as PackageJson).version;
}

function compareSemver(a: string, b: string): number {
	const aParts = a.split(".").map((part) => Number.parseInt(part, 10));
	const bParts = b.split(".").map((part) => Number.parseInt(part, 10));
	for (let index = 0; index < Math.max(aParts.length, bParts.length); index++) {
		const left = aParts[index] ?? 0;
		const right = bParts[index] ?? 0;
		if (left !== right) return left - right;
	}
	return 0;
}

const baseRef = process.env.PTY_DAEMON_VERSION_BUMP_BASE ?? remoteMainRef();

if (!baseRef) {
	console.log(
		"[check-pty-daemon-version-bump] skipped: no origin/main or GitHub base ref",
	);
	process.exit(0);
}

const changedFiles = changedFilesAgainst(baseRef);
const changedDaemonFiles = changedFiles.filter(isDaemonImplementationFile);

if (changedDaemonFiles.length === 0) {
	process.exit(0);
}

const baseVersion = packageVersionAt(baseRef);
if (!baseVersion) {
	console.log(
		`[check-pty-daemon-version-bump] skipped: ${DAEMON_PACKAGE_JSON} is missing at ${baseRef}`,
	);
	process.exit(0);
}

const currentVersion = (
	await import(`../${DAEMON_PACKAGE_JSON}`, {
		with: { type: "json" },
	})
).default.version as string;

if (compareSemver(currentVersion, baseVersion) <= 0) {
	console.error(
		[
			"[check-pty-daemon-version-bump] packages/pty-daemon runtime changed without a version bump.",
			`Base version: ${baseVersion}`,
			`Current version: ${currentVersion}`,
			"Changed runtime files:",
			...changedDaemonFiles.map((file) => `  - ${file}`),
			`Bump ${DAEMON_PACKAGE_JSON} so host-service can replace stale packaged daemons.`,
		].join("\n"),
	);
	process.exit(1);
}
