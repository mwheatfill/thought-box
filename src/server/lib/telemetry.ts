// Callback-based telemetry to avoid importing applicationinsights in Vite-bundled code.
// The actual App Insights client is registered at server startup via init-email-log.ts.

type TrackFn = (
	name: string,
	properties?: Record<string, string>,
	measurements?: Record<string, number>,
) => void;

let trackFn: TrackFn | null = null;

export function registerTelemetry(fn: TrackFn) {
	trackFn = fn;
}

export function trackEvent(
	name: string,
	properties?: Record<string, string>,
	measurements?: Record<string, number>,
) {
	trackFn?.(name, properties, measurements);
}
