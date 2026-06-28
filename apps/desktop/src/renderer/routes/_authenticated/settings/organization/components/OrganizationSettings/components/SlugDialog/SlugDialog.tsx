import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormLabel,
	FormMessage,
} from "@superset/ui/form";
import { Input } from "@superset/ui/input";
import { useEffect, useState } from "react";
import { type FieldErrors, type Resolver, useForm } from "react-hook-form";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { toast } from "renderer/lib/toast";

interface SlugFormValues {
	slug: string;
}

function getSlugValidationMessage(slug: string): string | null {
	if (slug.length < 3) return "Slug must be at least 3 characters";
	if (slug.length > 50) return "Slug must be at most 50 characters";
	if (!/^[a-z0-9-]+$/.test(slug)) {
		return "Slug can only contain lowercase letters, numbers, and hyphens";
	}
	if (!/^[a-z0-9]/.test(slug)) {
		return "Slug must start with a letter or number";
	}
	if (!/[a-z0-9]$/.test(slug)) {
		return "Slug must end with a letter or number";
	}
	return null;
}

const slugFormResolver: Resolver<SlugFormValues> = async (values) => {
	const message = getSlugValidationMessage(values.slug);
	const errors: FieldErrors<SlugFormValues> = {};
	if (message) {
		errors.slug = { type: "validate", message };
	}
	return Object.keys(errors).length
		? { values: {}, errors }
		: { values, errors: {} };
};

interface SlugDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	currentSlug: string;
	onSuccess?: () => void;
}

export function SlugDialog({
	open,
	onOpenChange,
	organizationId,
	currentSlug,
	onSuccess,
}: SlugDialogProps) {
	const [isCheckingSlug, setIsCheckingSlug] = useState(false);
	const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

	const slugForm = useForm<SlugFormValues>({
		resolver: slugFormResolver,
		defaultValues: {
			slug: currentSlug,
		},
	});

	const slugValue = slugForm.watch("slug");

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only sync on currentSlug change
	useEffect(() => {
		slugForm.reset({ slug: currentSlug });
	}, [currentSlug]);

	useEffect(() => {
		if (!open) return;

		const timer = setTimeout(async () => {
			if (slugValue === currentSlug) {
				setSlugAvailable(null);
				return;
			}

			if (!slugValue || slugValue.length < 3) {
				setSlugAvailable(null);
				return;
			}

			setIsCheckingSlug(true);
			try {
				const result = await authClient.organization.checkSlug({
					slug: slugValue,
				});

				setSlugAvailable(result.data?.status ?? null);
			} catch (error) {
				console.error("[slug-dialog] Slug check failed:", error);
				setSlugAvailable(null);
			} finally {
				setIsCheckingSlug(false);
			}
		}, 500);

		return () => clearTimeout(timer);
	}, [slugValue, currentSlug, open]);

	async function handleSlugUpdate(values: SlugFormValues): Promise<void> {
		try {
			await apiTrpcClient.organization.update.mutate({
				id: organizationId,
				slug: values.slug,
			});
			onSuccess?.();
			onOpenChange(false);
			setSlugAvailable(null);
			toast.success("Organization URL updated!");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to update URL";
			toast.error(message);
		}
	}

	function getSlugStatusDisplay(): { text: string; className: string } | null {
		if (isCheckingSlug) {
			return { text: "Checking...", className: "text-muted-foreground" };
		}
		if (slugAvailable === true) {
			return { text: "Available", className: "text-green-600" };
		}
		if (slugAvailable === false) {
			return { text: "Taken", className: "text-destructive" };
		}
		return null;
	}

	const slugStatus = getSlugStatusDisplay();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Change organization slug</DialogTitle>
					<DialogDescription>
						This will change your organization's public URL. Make sure to update
						any bookmarks or shared links.
					</DialogDescription>
				</DialogHeader>
				<Form {...slugForm}>
					<form
						onSubmit={slugForm.handleSubmit(handleSlugUpdate)}
						className="space-y-4"
					>
						<FormField
							control={slugForm.control}
							name="slug"
							render={({ field }) => (
								<>
									<FormLabel>Organization slug</FormLabel>
									<FormControl>
										<div className="relative">
											<Input {...field} placeholder="acme-inc" />
											{slugStatus && (
												<span
													className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${slugStatus.className}`}
												>
													{slugStatus.text}
												</span>
											)}
										</div>
									</FormControl>
									<FormMessage />
								</>
							)}
						/>
						<DialogFooter>
							<Button
								type="button"
								variant="ghost"
								onClick={() => {
									onOpenChange(false);
									slugForm.reset({ slug: currentSlug });
									setSlugAvailable(null);
								}}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={
									isCheckingSlug ||
									slugAvailable === false ||
									slugValue === currentSlug
								}
							>
								Save
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
