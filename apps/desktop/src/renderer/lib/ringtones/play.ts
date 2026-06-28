import { electronTrpcClient } from "../trpc-client";

export interface PlayRingtoneOptions {
	ringtoneId: string;
	/** 0..100 — matches the existing `notificationVolume` setting shape. */
	volume: number;
	muted: boolean;
}

export async function playRingtone(opts: PlayRingtoneOptions): Promise<void> {
	if (opts.muted) return;
	const volumePercent = Math.max(0, Math.min(100, opts.volume));
	if (volumePercent === 0) return;

	try {
		await electronTrpcClient.ringtone.playNotification.mutate({
			ringtoneId: opts.ringtoneId,
			volume: volumePercent,
		});
	} catch (error) {
		console.warn("[ringtone] playback failed:", error);
	}
}
