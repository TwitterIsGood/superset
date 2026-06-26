const CACHE_KEY_SEPARATOR = "\0";

interface GitQueryCacheEntry<T> {
	expiresAt: number;
	promise: Promise<T>;
}

export class GitQueryCache {
	private readonly entries = new Map<string, GitQueryCacheEntry<unknown>>();
	private readonly now: () => number;

	constructor({ now = () => Date.now() }: { now?: () => number } = {}) {
		this.now = now;
	}

	run<T>({
		workspaceId,
		requestKey,
		ttlMs,
		run,
	}: {
		workspaceId: string;
		requestKey: string;
		ttlMs: number;
		run: () => Promise<T>;
	}): Promise<T> {
		const cacheKey = toCacheKey(workspaceId, requestKey);
		const now = this.now();
		const existing = this.entries.get(cacheKey);
		if (existing && existing.expiresAt > now) {
			return existing.promise as Promise<T>;
		}

		const promise = Promise.resolve().then(run);
		this.entries.set(cacheKey, {
			expiresAt: now + Math.max(0, ttlMs),
			promise,
		});
		promise.catch(() => {
			const current = this.entries.get(cacheKey);
			if (current?.promise === promise) {
				this.entries.delete(cacheKey);
			}
		});
		return promise;
	}

	clearWorkspace(workspaceId: string): void {
		const prefix = `${workspaceId}${CACHE_KEY_SEPARATOR}`;
		for (const key of this.entries.keys()) {
			if (key.startsWith(prefix)) {
				this.entries.delete(key);
			}
		}
	}

	clear(): void {
		this.entries.clear();
	}
}

export const gitQueryCache = new GitQueryCache();

function toCacheKey(workspaceId: string, requestKey: string): string {
	return `${workspaceId}${CACHE_KEY_SEPARATOR}${requestKey}`;
}
