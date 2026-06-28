import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Github, ImagePlus, Trash2, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { toast } from "renderer/lib/toast";

const ACCEPTED_MIME_TYPES = "image/png,image/jpeg,image/webp";
const MAX_SIZE_MB = 4.5;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

interface IconUploadFieldProps {
	projectId: string;
	iconUrl: string | null;
	hasGitHubRepo: boolean;
}

export function IconUploadField({
	projectId,
	iconUrl,
	hasGitHubRepo,
}: IconUploadFieldProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isPending, setIsPending] = useState(false);

	const handleClickUpload = useCallback(() => {
		if (!fileInputRef.current) return;
		fileInputRef.current.value = "";
		fileInputRef.current.click();
	}, []);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			e.target.value = "";
			if (!file) return;

			if (file.size > MAX_SIZE_BYTES) {
				const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
				toast.error(
					`File too large (${sizeInMB}MB). Maximum size is ${MAX_SIZE_MB}MB`,
				);
				return;
			}

			setIsPending(true);
			const reader = new FileReader();
			reader.onerror = () => {
				toast.error("Could not read selected file");
				setIsPending(false);
			};
			reader.onabort = () => {
				setIsPending(false);
			};
			reader.onload = async () => {
				const fileData = reader.result;
				if (typeof fileData !== "string") {
					toast.error("Could not read selected file");
					setIsPending(false);
					return;
				}
				try {
					await apiTrpcClient.v2Project.uploadIcon.mutate({
						id: projectId,
						fileData,
						fileName: file.name,
						mimeType: file.type,
					});
				} catch (err) {
					const message =
						err instanceof Error ? err.message : "Failed to upload icon";
					toast.error(message);
				} finally {
					setIsPending(false);
				}
			};
			reader.readAsDataURL(file);
		},
		[projectId],
	);

	const handleUseGitHub = useCallback(async () => {
		setIsPending(true);
		try {
			await apiTrpcClient.v2Project.resetIconToGitHub.mutate({ id: projectId });
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to fetch GitHub icon";
			toast.error(message);
		} finally {
			setIsPending(false);
		}
	}, [projectId]);

	const handleRemove = useCallback(async () => {
		setIsPending(true);
		try {
			await apiTrpcClient.v2Project.removeIcon.mutate({ id: projectId });
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to remove icon";
			toast.error(message);
		} finally {
			setIsPending(false);
		}
	}, [projectId]);

	const hasSecondaryActions = hasGitHubRepo || Boolean(iconUrl);

	const Thumbnail = (
		<button
			type="button"
			onClick={hasSecondaryActions ? undefined : handleClickUpload}
			disabled={isPending}
			aria-label={
				hasSecondaryActions
					? "Project icon options"
					: iconUrl
						? "Replace icon"
						: "Upload icon"
			}
			className="size-9 rounded-md border overflow-hidden flex items-center justify-center text-muted-foreground transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
		>
			{iconUrl ? (
				<img
					src={iconUrl}
					alt="Project icon"
					className="size-full object-cover"
				/>
			) : (
				<ImagePlus className="size-4" />
			)}
		</button>
	);

	return (
		<>
			{hasSecondaryActions ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>{Thumbnail}</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-48">
						<DropdownMenuItem onSelect={handleClickUpload}>
							<Upload className="size-4" />
							Upload image…
						</DropdownMenuItem>
						{hasGitHubRepo && (
							<DropdownMenuItem onSelect={handleUseGitHub}>
								<Github className="size-4" />
								Use GitHub icon
							</DropdownMenuItem>
						)}
						{iconUrl && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem variant="destructive" onSelect={handleRemove}>
									<Trash2 className="size-4" />
									Remove icon
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			) : (
				Thumbnail
			)}
			<input
				ref={fileInputRef}
				type="file"
				accept={ACCEPTED_MIME_TYPES}
				className="hidden"
				onChange={handleFileChange}
			/>
		</>
	);
}
