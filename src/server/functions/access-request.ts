import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import AccessRequested from "#/emails/AccessRequested";
import { db } from "#/server/db";
import { settings, users } from "#/server/db/schema";
import { audit } from "#/server/lib/audit";
import { sendEmail } from "#/server/lib/email";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/**
 * Lightweight auth middleware that identifies the user from Easy Auth headers
 * WITHOUT checking the active flag. Used only for the access request flow
 * where a deactivated user needs to identify themselves.
 */
const deactivatedUserMiddleware = createMiddleware().server(async ({ next, request }) => {
	// Parse Easy Auth headers (same logic as authMiddleware)
	let entraId = request.headers.get("x-ms-client-principal-id");

	if (!entraId && (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")) {
		entraId = process.env.DEV_USER_ENTRA_ID ?? null;
	}

	if (!entraId) {
		throw new Error("Unauthorized");
	}

	const user = await db.query.users.findFirst({
		where: eq(users.entraId, entraId),
	});

	if (!user) {
		throw new Error("User not found");
	}

	return next({ context: { user } });
});

/**
 * Request access — called by deactivated users from the /deactivated page.
 * Sends an email to the watcher_email (system notifications) address and logs an audit event.
 */
export const requestAccess = createServerFn({ method: "POST" })
	.middleware([deactivatedUserMiddleware])
	.handler(async ({ context }) => {
		const { user } = context;

		// Only deactivated users should be calling this
		if (user.active) {
			return { success: true };
		}

		// Get the notifications email from settings
		const watcherSetting = await db.query.settings.findFirst({
			where: eq(settings.key, "watcher_email"),
		});

		const notifyEmail = watcherSetting?.value;

		if (notifyEmail) {
			await sendEmail({
				to: notifyEmail,
				subject: `ThoughtBox access request from ${user.displayName}`,
				templateName: "AccessRequested",
				template: createElement(AccessRequested, {
					requesterName: user.displayName,
					requesterEmail: user.email,
					requesterDepartment: user.department,
					requesterJobTitle: user.jobTitle,
					adminUsersUrl: `${APP_URL}/admin/users`,
				}),
			}).catch((err) => {
				console.error("[access-request] Failed to send email:", err);
			});
		}

		audit({
			actorId: user.id,
			action: "user.access_requested",
			resourceType: "user",
			resourceId: user.id,
			details: { email: user.email, displayName: user.displayName },
		});

		return { success: true };
	});
