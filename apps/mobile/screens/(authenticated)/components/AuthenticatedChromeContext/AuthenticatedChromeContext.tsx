import { type ReactNode, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let tabBarHidden = false;

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function getSnapshot() {
	return tabBarHidden;
}

function setTabBarHidden(hidden: boolean) {
	if (tabBarHidden === hidden) return;
	tabBarHidden = hidden;
	for (const listener of listeners) {
		listener();
	}
}

export function AuthenticatedChromeProvider({
	children,
}: {
	children: ReactNode;
}) {
	return children;
}

export function useAuthenticatedChrome() {
	const isTabBarHidden = useSyncExternalStore(
		subscribe,
		getSnapshot,
		getSnapshot,
	);

	return {
		isTabBarHidden,
		setTabBarHidden,
	};
}
