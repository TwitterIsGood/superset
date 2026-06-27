import { lazy, Suspense, useEffect, useState } from "react";
import type { GatedFeature } from "./constants";

export type PaywallOptions = {
	feature: GatedFeature;
	context?: Record<string, unknown>;
};

const paywallListeners = new Set<(options: PaywallOptions) => void>();
let pendingPaywallOptions: PaywallOptions | null = null;

const LazyPaywallContent = lazy(() =>
	import("./PaywallContent").then((module) => ({
		default: module.PaywallContent,
	})),
);

export const Paywall = () => {
	const [paywallOptions, setPaywallOptions] = useState<PaywallOptions | null>(
		pendingPaywallOptions,
	);

	useEffect(() => {
		const listener = (options: PaywallOptions) => {
			pendingPaywallOptions = options;
			setPaywallOptions(options);
		};
		paywallListeners.add(listener);
		if (pendingPaywallOptions) {
			setPaywallOptions(pendingPaywallOptions);
		}
		return () => {
			paywallListeners.delete(listener);
		};
	}, []);

	if (!paywallOptions) return null;

	return (
		<Suspense fallback={null}>
			<LazyPaywallContent
				paywallOptions={paywallOptions}
				onClose={() => {
					pendingPaywallOptions = null;
					setPaywallOptions(null);
				}}
			/>
		</Suspense>
	);
};

export const paywall = (
	feature: GatedFeature,
	context?: Record<string, unknown>,
) => {
	const options = { feature, context };
	pendingPaywallOptions = options;
	if (paywallListeners.size === 0) {
		return;
	}
	for (const listener of paywallListeners) {
		listener(options);
	}
};
