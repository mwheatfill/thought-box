import { ClientSecretCredential, ManagedIdentityCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";
import { render } from "@react-email/render";
import { trackEvent } from "#/server/lib/telemetry";

interface SendEmailOptions {
	to: string | string[];
	subject: string;
	template: React.ReactElement;
	templateName?: string;
	ideaId?: string;
}

// Global email log callback — set once at server startup from a server-only context.
// This avoids importing DB modules in this file (which gets pulled into client bundles).
type EmailLogFn = (entry: {
	recipient: string;
	subject: string;
	template: string;
	ideaId: string | null;
	status: string;
	error: string | null;
}) => void;

let logFn: EmailLogFn | null = null;

export function registerEmailLogger(fn: EmailLogFn) {
	logFn = fn;
}

/**
 * Addresses that exist in the data but have no real inbox behind them — e.g. the
 * "Legacy InMoment User" placeholder submitter created during the InMoment import
 * (scripts/import-inmoment.ts). Sending to these bounces (and sending to our own
 * shared mailbox would trigger a mail loop), so they're dropped before we call
 * Graph. Skipped recipients are still logged so the attempt is auditable.
 */
const UNDELIVERABLE_RECIPIENTS = new Set(["legacy-inmoment@desertfinancial.com"]);

function isUndeliverable(email: string, fromMailbox: string | undefined): boolean {
	const normalized = email.trim().toLowerCase();
	if (UNDELIVERABLE_RECIPIENTS.has(normalized)) return true;
	// Never email our own sending mailbox — that's a self-addressed mail loop.
	if (fromMailbox && normalized === fromMailbox.trim().toLowerCase()) return true;
	return false;
}

function getMailClient(): Client | null {
	const isAzure = process.cwd().startsWith("/home/site");
	if (isAzure) {
		const credential = new ManagedIdentityCredential();
		const authProvider = new TokenCredentialAuthenticationProvider(credential, {
			scopes: ["https://graph.microsoft.com/.default"],
		});
		return Client.initWithMiddleware({ authProvider });
	}

	// Dev: fall back to client secret if configured
	const tenantId = process.env.AZURE_TENANT_ID;
	const clientId = process.env.GRAPH_CLIENT_ID;
	const clientSecret = process.env.GRAPH_CLIENT_SECRET;

	if (!tenantId || !clientId || !clientSecret) {
		return null;
	}

	const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
	const authProvider = new TokenCredentialAuthenticationProvider(credential, {
		scopes: ["https://graph.microsoft.com/.default"],
	});

	return Client.initWithMiddleware({ authProvider });
}

/**
 * Send an email using Microsoft Graph.
 * In dev (no Graph credentials), logs to console instead.
 * Email failures are non-blocking — logged but don't throw.
 * All attempts are recorded via the registered email logger.
 */
export async function sendEmail({
	to,
	subject,
	template,
	templateName,
	ideaId,
}: SendEmailOptions): Promise<void> {
	const tplName = templateName ?? "unknown";
	const iId = ideaId ?? null;

	const client = getMailClient();
	const fromMailbox = process.env.THOUGHTBOX_SHARED_MAILBOX;

	// Drop placeholder/self-addressed recipients before doing any work. Log each
	// skip so it shows up in the email log as intentional, not a silent failure.
	const requested = Array.isArray(to) ? to : [to];
	const recipients: string[] = [];
	for (const r of requested) {
		if (isUndeliverable(r, fromMailbox)) {
			logFn?.({
				recipient: r,
				subject,
				template: tplName,
				ideaId: iId,
				status: "skipped_placeholder",
				error: null,
			});
		} else {
			recipients.push(r);
		}
	}
	if (recipients.length === 0) return;

	const html = await render(template);

	// Dev mode: log instead of sending
	if (!client || !fromMailbox) {
		console.log("[email:dev] Would send email:");
		console.log(`  From: ${fromMailbox ?? "thoughtbox@desertfinancial.com"}`);
		console.log(`  To: ${recipients.join(", ")}`);
		console.log(`  Subject: ${subject}`);
		console.log(`  HTML length: ${html.length} chars`);

		for (const r of recipients) {
			logFn?.({
				recipient: r,
				subject,
				template: tplName,
				ideaId: iId,
				status: "dev_skipped",
				error: null,
			});
		}
		return;
	}

	// Production: send via Graph
	try {
		await client.api(`/users/${fromMailbox}/sendMail`).post({
			message: {
				subject,
				body: { contentType: "HTML", content: html },
				toRecipients: recipients.map((email) => ({
					emailAddress: { address: email },
				})),
			},
			saveToSentItems: false,
		});

		for (const r of recipients) {
			logFn?.({
				recipient: r,
				subject,
				template: tplName,
				ideaId: iId,
				status: "sent",
				error: null,
			});
		}

		trackEvent("EmailSent", { template: tplName, subject }, { recipientCount: recipients.length });
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		console.error("[email:error] Failed to send email:", {
			to: recipients,
			subject,
			error: errorMsg,
		});

		for (const r of recipients) {
			logFn?.({
				recipient: r,
				subject,
				template: tplName,
				ideaId: iId,
				status: "failed",
				error: errorMsg,
			});
		}

		trackEvent("EmailFailed", {
			template: tplName,
			subject,
			error: errorMsg,
		});
	}
}
