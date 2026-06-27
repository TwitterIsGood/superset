import { Toaster } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import type { Metadata, Viewport } from "next";

// Use CSS fallback fonts instead of next/font/google to avoid runtime
// Google Fonts fetches that fail on offline servers.
const inter = { variable: "--font-inter" };
const ibmPlexMono = { variable: "--font-ibm-plex-mono" };

import "./globals.css";

import { Providers } from "./providers";

export const metadata: Metadata = {
	title: "Superset",
	description: "Run 10+ parallel coding agents on your machine",
	icons: {
		icon: [
			{ url: "/favicon.ico", sizes: "32x32" },
			{ url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
		],
	},
};

export const viewport: Viewport = {
	viewportFit: "cover",
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "white" },
		{ media: "(prefers-color-scheme: dark)", color: "black" },
	],
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className={cn(
					"bg-background text-foreground min-h-screen font-sans antialiased",
					inter.variable,
					ibmPlexMono.variable,
				)}
			>
				<Providers>
					{children}
					<Toaster />
				</Providers>
			</body>
		</html>
	);
}
