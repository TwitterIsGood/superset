import { Toaster } from "@superset/ui/sonner";

interface ThemedSonnerToasterProps {
	theme: "dark" | "light" | "system";
}

export function ThemedSonnerToaster({ theme }: ThemedSonnerToasterProps) {
	return <Toaster expand theme={theme} />;
}
