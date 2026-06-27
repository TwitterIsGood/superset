import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	Camera,
	Clock,
	Copy,
	Ellipsis,
	ExternalLink,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpcClient } from "renderer/lib/trpc-client";

interface BrowserOverflowMenuProps {
	paneId: string;
	currentUrl: string;
	hasPage: boolean;
}

export function BrowserOverflowMenu({
	paneId,
	currentUrl,
	hasPage,
}: BrowserOverflowMenuProps) {
	const { copyToClipboard } = useCopyToClipboard();

	const handleScreenshot = () => {
		electronTrpcClient.browser.screenshot.mutate({ paneId }).catch(() => {});
	};

	const handleHardReload = () => {
		electronTrpcClient.browser.reload
			.mutate({ paneId, hard: true })
			.catch(() => {});
	};

	const handleCopyUrl = () => {
		if (currentUrl) {
			copyToClipboard(currentUrl);
		}
	};

	const handleOpenExternal = () => {
		if (currentUrl) {
			electronTrpcClient.external.openUrl.mutate(currentUrl).catch(() => {});
		}
	};

	const handleClearCookies = () => {
		electronTrpcClient.browser.clearBrowsingData
			.mutate({ type: "cookies" })
			.catch(() => {});
	};

	const handleClearHistory = () => {
		electronTrpcClient.browserHistory.clear.mutate().catch(() => {});
	};

	const handleClearAllData = () => {
		electronTrpcClient.browser.clearBrowsingData
			.mutate({ type: "all" })
			.catch(() => {});
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
				>
					<Ellipsis className="size-3.5" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem
					onClick={handleScreenshot}
					disabled={!hasPage}
					className="gap-2"
				>
					<Camera className="size-4" />
					Take Screenshot
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={handleHardReload}
					disabled={!hasPage}
					className="gap-2"
				>
					<RefreshCw className="size-4" />
					Hard Reload
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={handleCopyUrl}
					disabled={!hasPage}
					className="gap-2"
				>
					<Copy className="size-4" />
					Copy URL
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={handleOpenExternal}
					disabled={!hasPage}
					className="gap-2"
				>
					<ExternalLink className="size-4" />
					Open in Browser
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={handleClearHistory} className="gap-2">
					<Clock className="size-4" />
					Clear Browsing History
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleClearCookies} className="gap-2">
					<Trash2 className="size-4" />
					Clear Cookies
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleClearAllData} className="gap-2">
					<Trash2 className="size-4" />
					Clear All Data
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
