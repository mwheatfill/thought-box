import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";
import { render } from "@react-email/render";

interface SendEmailOptions {
	to: string | string[];
	subject: string;
	template: React.ReactElement;
}

function getMailClient(): Client | null {
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
 */
export async function sendEmail({ to, subject, template }: SendEmailOptions): Promise<void> {
	const recipients = Array.isArray(to) ? to : [to];
	const html = await render(template);

	const client = getMailClient();
	const fromMailbox = process.env.THOUGHTBOX_SHARED_MAILBOX;

	// Dev mode: log instead of sending
	if (!client || !fromMailbox) {
		console.log("[email:dev] Would send email:");
		console.log(`  From: ${fromMailbox ?? "thoughtbox@desertfinancial.com"}`);
		console.log(`  To: ${recipients.join(", ")}`);
		console.log(`  Subject: ${subject}`);
		console.log(`  HTML length: ${html.length} chars`);
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
	} catch (error) {
		// Email failures should not block the primary action
		console.error("[email:error] Failed to send email:", {
			to: recipients,
			subject,
			error: error instanceof Error ? error.message : error,
		});
	}
}
