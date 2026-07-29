// AI provider health monitor. Pure state machine — the ping and notify side
// effects are injected so the alert/recovery logic is testable without a
// provider or mailbox.

export interface AiHealthMonitorOptions {
	/** Makes one cheap round-trip to the AI provider; throws on failure. */
	ping: () => Promise<void>;
	/** Called once when the failure streak reaches the threshold. */
	notifyDown: (details: string, consecutiveFailures: number) => Promise<void>;
	/** Called once when a ping succeeds after notifyDown fired. */
	notifyRecovered: () => Promise<void>;
	/** Consecutive failures before notifyDown fires. */
	threshold?: number;
}

export function createAiHealthMonitor({
	ping,
	notifyDown,
	notifyRecovered,
	threshold = 3,
}: AiHealthMonitorOptions): () => Promise<void> {
	let consecutiveFailures = 0;
	let alerted = false;

	return async function check(): Promise<void> {
		try {
			await ping();
		} catch (error) {
			consecutiveFailures++;
			const details = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
			console.error(`[ai-health] Ping failed (${consecutiveFailures} consecutive):`, error);
			if (consecutiveFailures >= threshold && !alerted) {
				// Mark alerted before notifying so a failing notifier can't spam.
				alerted = true;
				await notifyDown(details, consecutiveFailures);
			}
			return;
		}

		const wasAlerted = alerted;
		consecutiveFailures = 0;
		alerted = false;
		if (wasAlerted) {
			console.log("[ai-health] Provider recovered");
			await notifyRecovered();
		}
	};
}
