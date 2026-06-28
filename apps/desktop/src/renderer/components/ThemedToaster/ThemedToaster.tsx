import { lazy, Suspense, useEffect, useState } from "react";
import { SONNER_TOASTER_REQUESTED_EVENT } from "renderer/lib/toast";
import { useTheme } from "renderer/stores/theme/store";

const ThemedSonnerToaster = lazy(async () => ({
	default: (await import("./ThemedSonnerToaster")).ThemedSonnerToaster,
}));

export function ThemedToaster() {
	const theme = useTheme();
	const [shouldMountToaster, setShouldMountToaster] = useState(false);

	useEffect(() => {
		const handleToastRequested = () => {
			setShouldMountToaster(true);
		};
		window.addEventListener(
			SONNER_TOASTER_REQUESTED_EVENT,
			handleToastRequested,
		);
		return () => {
			window.removeEventListener(
				SONNER_TOASTER_REQUESTED_EVENT,
				handleToastRequested,
			);
		};
	}, []);

	if (!shouldMountToaster) {
		return null;
	}

	return (
		<Suspense fallback={null}>
			<ThemedSonnerToaster theme={theme?.type ?? "dark"} />
		</Suspense>
	);
}
