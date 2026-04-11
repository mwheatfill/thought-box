import appInsights from "applicationinsights";
import { initEmailLog } from "#/server/lib/email-log";
import { registerTelemetry } from "#/server/lib/telemetry";

export function init() {
	initEmailLog();

	if (appInsights.defaultClient) {
		registerTelemetry((name, properties, measurements) => {
			appInsights.defaultClient.trackEvent({ name, properties, measurements });
		});
	}
}
