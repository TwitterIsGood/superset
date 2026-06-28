import { Button } from "@superset/ui/button";
import { Dialog, DialogContent } from "@superset/ui/dialog";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { track } from "renderer/lib/analytics";
import { FeaturePreview } from "./components/FeaturePreview";
import { FeatureSidebar } from "./components/FeatureSidebar";
import { FEATURE_ID_MAP, PRO_FEATURES } from "./constants";
import type { PaywallOptions } from "./Paywall";

interface PaywallContentProps {
	paywallOptions: PaywallOptions;
	onClose: () => void;
}

export function PaywallContent({
	paywallOptions,
	onClose,
}: PaywallContentProps) {
	const navigate = useNavigate();
	const [isOpen, setIsOpen] = useState(true);
	const openTimeRef = useRef<number | null>(null);
	const featuresViewedRef = useRef<Set<string>>(new Set());
	const triggerSource = paywallOptions.feature;
	const initialFeatureId =
		FEATURE_ID_MAP[triggerSource] ||
		PRO_FEATURES[0]?.id ||
		"team-collaboration";

	const [selectedFeatureId, setSelectedFeatureId] =
		useState<string>(initialFeatureId);

	useEffect(() => {
		setIsOpen(true);
		setSelectedFeatureId(initialFeatureId);
	}, [initialFeatureId]);

	// Track paywall_opened when modal opens
	useEffect(() => {
		if (isOpen && paywallOptions) {
			openTimeRef.current = Date.now();
			featuresViewedRef.current = new Set([initialFeatureId]);

			const feature = PRO_FEATURES.find((f) => f.id === initialFeatureId);
			track("paywall_opened", {
				trigger_source: paywallOptions.feature,
				feature_id: initialFeatureId,
				feature_title: feature?.title,
			});
		}
	}, [isOpen, paywallOptions, initialFeatureId]);

	useEffect(() => {
		const mappedId =
			FEATURE_ID_MAP[paywallOptions.feature] || PRO_FEATURES[0]?.id;
		if (mappedId) {
			setSelectedFeatureId(mappedId);
		}
	}, [paywallOptions.feature]);

	const handleSelectFeature = (featureId: string) => {
		if (featureId !== selectedFeatureId) {
			const feature = PRO_FEATURES.find((f) => f.id === featureId);
			track("paywall_feature_clicked", {
				trigger_source: triggerSource,
				feature_id: featureId,
				feature_title: feature?.title,
				previous_feature_id: selectedFeatureId,
			});
			featuresViewedRef.current.add(featureId);
		}
		setSelectedFeatureId(featureId);
	};

	const handleOpenChange = (open: boolean) => {
		if (open) {
			setIsOpen(true);
			return;
		}

		const timeSpent = openTimeRef.current
			? Date.now() - openTimeRef.current
			: 0;
		track("paywall_cancelled", {
			trigger_source: triggerSource,
			feature_id: selectedFeatureId,
			features_viewed_count: featuresViewedRef.current.size,
			time_spent_ms: timeSpent,
		});
		setIsOpen(false);
		onClose();
	};

	const selectedFeature =
		PRO_FEATURES.find((f) => f.id === selectedFeatureId) || PRO_FEATURES[0];

	if (!selectedFeature) {
		return null;
	}

	const handleUpgrade = () => {
		const timeSpent = openTimeRef.current
			? Date.now() - openTimeRef.current
			: 0;
		track("paywall_upgrade_clicked", {
			trigger_source: triggerSource,
			feature_id: selectedFeatureId,
			feature_title: selectedFeature.title,
			features_viewed_count: featuresViewedRef.current.size,
			time_spent_ms: timeSpent,
		});
		setIsOpen(false);
		onClose();
		navigate({ to: "/settings/billing/plans" });
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent
				className="!w-[744px] !max-w-[744px] p-0 gap-0 overflow-hidden !rounded-none"
				showCloseButton={false}
			>
				<div className="flex">
					<FeatureSidebar
						selectedFeatureId={selectedFeatureId}
						highlightedFeatureId={initialFeatureId}
						onSelectFeature={handleSelectFeature}
					/>
					<FeaturePreview selectedFeature={selectedFeature} />
				</div>

				<div className="box-border flex items-center justify-between border-t bg-background px-5 py-4">
					<Button variant="outline" onClick={() => handleOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleUpgrade}>Get Superset Pro</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
