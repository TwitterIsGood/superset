import type React from "react";

interface DevicePreviewProps {
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	isConnected: boolean;
	isLoading: boolean;
	deviceLabel?: string;
}

export function DevicePreview({
	canvasRef,
	isLoading,
	deviceLabel,
}: DevicePreviewProps) {
	const hasDevice = !!deviceLabel;
	const showPhone = hasDevice && !isLoading;

	return (
		<div className="flex-1 flex items-center justify-center p-3 relative">
			{!hasDevice && (
				<div className="text-xs opacity-30 select-none">Select a device</div>
			)}
			{hasDevice && isLoading && (
				<div className="size-4 border border-current/20 border-t-current rounded-full animate-spin" />
			)}
			<div
				className="phone-viewport w-full max-w-[394px]"
				style={{
					aspectRatio: "394 / 852",
					borderRadius: "48px",
					overflow: "hidden",
					background: "#000",
					visibility: showPhone ? "visible" : "hidden",
					position: !showPhone ? "absolute" : "relative",
					pointerEvents: showPhone ? "auto" : "none",
					boxShadow: showPhone
						? "0 0 0 1px rgba(255,255,255,.06), 0 24px 64px -16px rgba(0,0,0,.72), 0 48px 120px -32px rgba(0,0,0,.44)"
						: "none",
				}}
			>
				<canvas ref={canvasRef} className="w-full h-full" />
			</div>
		</div>
	);
}
