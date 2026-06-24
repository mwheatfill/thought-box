import { createServerFn } from "@tanstack/react-start";
import { createElement } from "react";
import { z } from "zod";
import AccessRequested from "#/emails/AccessRequested";
import CategoryRoleGranted from "#/emails/CategoryRoleGranted";
import IdeaAssigned from "#/emails/IdeaAssigned";
import IdeaReassigned from "#/emails/IdeaReassigned";
import IdeaReassignedSubmitter from "#/emails/IdeaReassignedSubmitter";
import IdeaSubmitted from "#/emails/IdeaSubmitted";
import MentionAlert from "#/emails/MentionAlert";
import NewMessage from "#/emails/NewMessage";
import SlaReminder from "#/emails/SlaReminder";
import StatusChanged from "#/emails/StatusChanged";
import UserInvite from "#/emails/UserInvite";
import WatcherAlert from "#/emails/WatcherAlert";
import WatcherUpdate from "#/emails/WatcherUpdate";
import { sendEmail } from "#/server/lib/email";
import { adminMiddleware } from "#/server/middleware/auth";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/** Owner→submitter message notification subject (shared by real + test sends). */
const OWNER_COMMENT_SUBJECT = "There has been a comment added about your idea";

function ideaUrl(submissionId: string) {
	return `${APP_URL}/ideas/${submissionId}`;
}

/** Send confirmation email to the submitter after idea creation. */
export async function sendIdeaSubmittedEmail(params: {
	submitterEmail: string;
	submitterFirstName: string;
	submissionId: string;
	ideaTitle: string;
	categoryName: string;
	ideaCount: number;
}) {
	await sendEmail({
		to: params.submitterEmail,
		subject: `Your idea has been submitted: ${params.submissionId}`,
		templateName: "IdeaSubmitted",
		template: createElement(IdeaSubmitted, {
			submitterFirstName: params.submitterFirstName,
			submissionId: params.submissionId,
			ideaTitle: params.ideaTitle,
			categoryName: params.categoryName,
			ideaCount: params.ideaCount,
			viewUrl: ideaUrl(params.submissionId),
		}),
	});
}

/** Notify the assigned owner about a new idea. */
export async function sendIdeaAssignedEmail(params: {
	ownerEmail: string;
	ownerFirstName: string;
	submissionId: string;
	ideaTitle: string;
	categoryName: string;
	submitterName: string;
	submitterDepartment: string | null;
}) {
	await sendEmail({
		to: params.ownerEmail,
		subject: `New idea assigned to you: ${params.submissionId}`,
		templateName: "IdeaAssigned",
		template: createElement(IdeaAssigned, {
			ownerFirstName: params.ownerFirstName,
			submissionId: params.submissionId,
			ideaTitle: params.ideaTitle,
			categoryName: params.categoryName,
			submitterName: params.submitterName,
			submitterDepartment: params.submitterDepartment,
			viewUrl: ideaUrl(params.submissionId),
		}),
	});
}

/** Notify submitter when their idea's status changes. */
export async function sendStatusChangedEmail(params: {
	submitterEmail: string;
	submitterFirstName: string;
	submissionId: string;
	ideaTitle: string;
	newStatus: "under_review" | "accepted" | "declined";
	ownerFirstName: string;
	messageToSubmitter: string | null;
	declineReason: string | null;
}) {
	const subjectMap = {
		under_review: `Your idea is being reviewed: ${params.submissionId}`,
		accepted: `Great news about your idea: ${params.submissionId}`,
		declined: `Update on your idea: ${params.submissionId}`,
	};

	await sendEmail({
		to: params.submitterEmail,
		subject: subjectMap[params.newStatus],
		templateName: "StatusChanged",
		template: createElement(StatusChanged, {
			submitterFirstName: params.submitterFirstName,
			submissionId: params.submissionId,
			ideaTitle: params.ideaTitle,
			newStatus: params.newStatus,
			ownerFirstName: params.ownerFirstName,
			messageToSubmitter: params.messageToSubmitter,
			declineReason: params.declineReason,
			viewUrl: ideaUrl(params.submissionId),
		}),
	});
}

/** Notify the other party when a message is posted. */
export async function sendNewMessageEmail(params: {
	recipientEmail: string;
	recipientFirstName: string;
	senderName: string;
	submissionId: string;
	ideaTitle: string;
	messagePreview: string;
	isFromOwner: boolean;
}) {
	const subject = params.isFromOwner
		? `${OWNER_COMMENT_SUBJECT}: ${params.ideaTitle}`
		: `The submitter responded on: ${params.ideaTitle}`;

	await sendEmail({
		to: params.recipientEmail,
		subject,
		templateName: "NewMessage",
		template: createElement(NewMessage, {
			recipientFirstName: params.recipientFirstName,
			senderName: params.senderName,
			submissionId: params.submissionId,
			ideaTitle: params.ideaTitle,
			messagePreview: params.messagePreview,
			isFromOwner: params.isFromOwner,
			viewUrl: ideaUrl(params.submissionId),
		}),
	});
}

/** Notify an owner/admin that they were @-mentioned in an internal note. */
export async function sendMentionAlertEmail(params: {
	recipientEmail: string;
	recipientFirstName: string;
	mentionerName: string;
	submissionId: string;
	ideaTitle: string;
	notePreview: string;
}) {
	await sendEmail({
		to: params.recipientEmail,
		subject: `${params.mentionerName} mentioned you on ${params.submissionId}`,
		templateName: "MentionAlert",
		template: createElement(MentionAlert, {
			recipientFirstName: params.recipientFirstName,
			mentionerName: params.mentionerName,
			submissionId: params.submissionId,
			ideaTitle: params.ideaTitle,
			notePreview: params.notePreview,
			viewUrl: ideaUrl(params.submissionId),
		}),
	});
}

/** Notify an owner when an idea is reassigned to them. */
export async function sendIdeaReassignedEmail(params: {
	ownerEmail: string;
	ownerFirstName: string;
	submissionId: string;
	ideaTitle: string;
	categoryName: string;
	submitterName: string;
	reassignedByName: string;
	reasonLabel?: string | null;
	note?: string | null;
}) {
	await sendEmail({
		to: params.ownerEmail,
		subject: `Idea reassigned to you: ${params.submissionId}`,
		templateName: "IdeaReassigned",
		template: createElement(IdeaReassigned, {
			ownerFirstName: params.ownerFirstName,
			submissionId: params.submissionId,
			ideaTitle: params.ideaTitle,
			categoryName: params.categoryName,
			submitterName: params.submitterName,
			reassignedByName: params.reassignedByName,
			reasonLabel: params.reasonLabel ?? null,
			note: params.note ?? null,
			viewUrl: ideaUrl(params.submissionId),
		}),
	});
}

/**
 * Notify a per-idea Watcher of a submitter-facing update — a status change or a
 * new public message (ADR/CONTEXT: Watchers never get internal notes, SLA
 * reminders, or administrative events).
 */
export async function sendWatcherUpdateEmail(params: {
	watcherEmail: string;
	watcherFirstName: string;
	submissionId: string;
	ideaTitle: string;
	updateKind: "status" | "message";
	statusLabel?: string | null;
	messagePreview?: string | null;
}) {
	const headline =
		params.updateKind === "status"
			? `Update on idea ${params.submissionId}: ${params.statusLabel}`
			: `New activity on idea ${params.submissionId}`;
	await sendEmail({
		to: params.watcherEmail,
		subject: headline,
		templateName: "WatcherUpdate",
		template: createElement(WatcherUpdate, {
			watcherFirstName: params.watcherFirstName,
			submissionId: params.submissionId,
			ideaTitle: params.ideaTitle,
			updateKind: params.updateKind,
			statusLabel: params.statusLabel ?? null,
			messagePreview: params.messagePreview ?? null,
			viewUrl: ideaUrl(params.submissionId),
		}),
	});
}

/**
 * Notify a user that they've been made a Category Owner (accountable) or added
 * as a Contributor (can be assigned its ideas). The two new-role notifications
 * for the derived-ownership model (Pri 13 / stories 32–33).
 */
export async function sendCategoryRoleGrantedEmail(params: {
	recipientEmail: string;
	recipientFirstName: string;
	categoryName: string;
	kind: "owner" | "contributor";
	openIdeaCount?: number | null;
	grantedByName: string;
}) {
	await sendEmail({
		to: params.recipientEmail,
		subject:
			params.kind === "owner"
				? `You now own the ${params.categoryName} category`
				: `You've been added to the ${params.categoryName} review team`,
		templateName: "CategoryRoleGranted",
		template: createElement(CategoryRoleGranted, {
			recipientFirstName: params.recipientFirstName,
			categoryName: params.categoryName,
			kind: params.kind,
			openIdeaCount: params.openIdeaCount ?? null,
			grantedByName: params.grantedByName,
			viewUrl: params.kind === "owner" ? `${APP_URL}/my-categories` : `${APP_URL}/queue`,
		}),
	});
}

// ── Watcher notification ─────────────────────────────────────────────────

/** Send watcher alert. Caller provides the email (from settings). Skips if blank/null. */
export async function sendWatcherAlert(params: {
	watcherEmail: string | null;
	submissionId: string;
	ideaTitle: string;
	ideaDescription: string;
	categoryName: string;
	submitterName: string;
	submitterDepartment: string | null;
	assignedOwnerName: string | null;
}) {
	if (!params.watcherEmail) return;

	await sendEmail({
		to: params.watcherEmail,
		subject: `New ThoughtBox idea: ${params.submissionId} — ${params.ideaTitle}`,
		templateName: "WatcherAlert",
		template: createElement(WatcherAlert, {
			submissionId: params.submissionId,
			ideaTitle: params.ideaTitle,
			ideaDescription: params.ideaDescription,
			categoryName: params.categoryName,
			submitterName: params.submitterName,
			submitterDepartment: params.submitterDepartment,
			assignedOwnerName: params.assignedOwnerName,
			viewUrl: ideaUrl(params.submissionId),
		}),
	});
}

// ── SLA reminder ─────────────────────────────────────────────────────────

export async function sendSlaReminderEmail(params: {
	ownerEmail: string;
	ownerFirstName: string;
	submissionId: string;
	ideaTitle: string;
	submitterName: string;
	categoryName: string;
	currentStatus: string;
	businessDaysSinceStart: number;
}) {
	const dayLabel = params.businessDaysSinceStart === 1 ? "business day" : "business days";
	await sendEmail({
		to: params.ownerEmail,
		subject: `Reminder: ${params.submissionId} needs your review (${params.businessDaysSinceStart} ${dayLabel})`,
		templateName: "SlaReminder",
		template: createElement(SlaReminder, {
			ownerFirstName: params.ownerFirstName,
			submissionId: params.submissionId,
			ideaTitle: params.ideaTitle,
			submitterName: params.submitterName,
			categoryName: params.categoryName,
			currentStatus: params.currentStatus,
			businessDaysSinceStart: params.businessDaysSinceStart,
			viewUrl: ideaUrl(params.submissionId),
		}),
	});
}

// ── User invite ──────────────────────────────────────────────────────────

export async function sendUserInviteEmail(params: {
	recipientEmail: string;
	recipientFirstName: string;
	role: "owner" | "admin";
	invitedByName: string;
}) {
	await sendEmail({
		to: params.recipientEmail,
		subject: "You've been invited to ThoughtBox",
		templateName: "UserInvite",
		template: createElement(UserInvite, {
			recipientFirstName: params.recipientFirstName,
			role: params.role,
			invitedByName: params.invitedByName,
			dashboardUrl: `${APP_URL}/dashboard`,
		}),
	});
}

// ── Test email ───────────────────────────────────────────────────────────

const TEST_TEMPLATES = [
	"idea_submitted",
	"idea_assigned",
	"status_under_review",
	"status_accepted",
	"status_declined",
	"idea_reassigned",
	"idea_reassigned_submitter",
	"message_from_owner",
	"message_from_submitter",
	"mention_alert",
	"watcher_alert",
	"watcher_update",
	"sla_reminder",
	"user_invite_owner",
	"user_invite_admin",
	"access_requested",
	"category_owner_granted",
	"category_contributor_granted",
] as const;

export type TestEmailTemplate = (typeof TEST_TEMPLATES)[number];

export const sendTestEmail = createServerFn({ method: "POST" })
	.middleware([adminMiddleware])
	.inputValidator(z.object({ template: z.enum(TEST_TEMPLATES) }))
	.handler(async ({ context, data }) => {
		const to = context.user.email;
		const firstName = context.user.displayName.split(" ")[0];
		const viewUrl = ideaUrl("TB-0000");

		const sample = {
			submissionId: "TB-0000",
			ideaTitle: "Simplify the new account opening process",
			categoryName: "Process Improvement",
		};

		const templates: Record<TestEmailTemplate, { subject: string; template: React.ReactElement }> =
			{
				idea_submitted: {
					subject: `[TEST] Your idea has been submitted: ${sample.submissionId}`,
					template: createElement(IdeaSubmitted, {
						submitterFirstName: firstName,
						submissionId: sample.submissionId,
						ideaTitle: sample.ideaTitle,
						categoryName: sample.categoryName,
						ideaCount: 3,
						viewUrl,
					}),
				},
				idea_assigned: {
					subject: `[TEST] New idea assigned to you: ${sample.submissionId}`,
					template: createElement(IdeaAssigned, {
						ownerFirstName: firstName,
						submissionId: sample.submissionId,
						ideaTitle: sample.ideaTitle,
						categoryName: sample.categoryName,
						submitterName: "Sarah Chen",
						submitterDepartment: "Retail Banking",
						viewUrl,
					}),
				},
				status_under_review: {
					subject: `[TEST] Your idea is being reviewed: ${sample.submissionId}`,
					template: createElement(StatusChanged, {
						submitterFirstName: firstName,
						submissionId: sample.submissionId,
						ideaTitle: sample.ideaTitle,
						newStatus: "under_review",
						ownerFirstName: "Michelle",
						messageToSubmitter: null,
						declineReason: null,
						viewUrl,
					}),
				},
				status_accepted: {
					subject: `[TEST] Great news about your idea: ${sample.submissionId}`,
					template: createElement(StatusChanged, {
						submitterFirstName: firstName,
						submissionId: sample.submissionId,
						ideaTitle: sample.ideaTitle,
						newStatus: "accepted",
						ownerFirstName: "Michelle",
						messageToSubmitter:
							"This is a great idea. We're going to pilot it at the Scottsdale branch next quarter.",
						declineReason: null,
						viewUrl,
					}),
				},
				status_declined: {
					subject: `[TEST] Update on your idea: ${sample.submissionId}`,
					template: createElement(StatusChanged, {
						submitterFirstName: firstName,
						submissionId: sample.submissionId,
						ideaTitle: sample.ideaTitle,
						newStatus: "declined",
						ownerFirstName: "Michelle",
						messageToSubmitter: "We appreciate the suggestion but this is already in progress.",
						declineReason: "already_in_progress",
						viewUrl,
					}),
				},
				idea_reassigned: {
					subject: `[TEST] Idea reassigned to you: ${sample.submissionId}`,
					template: createElement(IdeaReassigned, {
						ownerFirstName: firstName,
						submissionId: sample.submissionId,
						ideaTitle: sample.ideaTitle,
						categoryName: sample.categoryName,
						submitterName: "Sarah Chen",
						reassignedByName: "Nubia Ruiz",
						viewUrl,
					}),
				},
				idea_reassigned_submitter: {
					subject: `[TEST] Your idea ${sample.submissionId} has a new reviewer`,
					template: createElement(IdeaReassignedSubmitter, {
						submitterFirstName: firstName,
						submissionId: sample.submissionId,
						ideaTitle: sample.ideaTitle,
						categoryName: sample.categoryName,
						viewUrl,
					}),
				},
				message_from_owner: {
					subject: `[TEST] ${OWNER_COMMENT_SUBJECT}: ${sample.ideaTitle}`,
					template: createElement(NewMessage, {
						recipientFirstName: firstName,
						senderName: "Michelle Murray",
						submissionId: sample.submissionId,
						ideaTitle: sample.ideaTitle,
						messagePreview:
							"Can you share more details about the current process? Specifically, which steps take the longest?",
						isFromOwner: true,
						viewUrl,
					}),
				},
				message_from_submitter: {
					subject: `[TEST] The submitter responded on: ${sample.ideaTitle}`,
					template: createElement(NewMessage, {
						recipientFirstName: firstName,
						senderName: "Sarah Chen",
						submissionId: sample.submissionId,
						ideaTitle: sample.ideaTitle,
						messagePreview:
							"The ID verification step takes about 15 minutes per account. If we could automate the address validation that would cut it in half.",
						isFromOwner: false,
						viewUrl,
					}),
				},
				mention_alert: {
					subject: `[TEST] Nubia Ruiz mentioned you on ${sample.submissionId}`,
					template: createElement(MentionAlert, {
						recipientFirstName: firstName,
						mentionerName: "Nubia Ruiz",
						submissionId: sample.submissionId,
						ideaTitle: sample.ideaTitle,
						notePreview: `@${firstName} can you check whether the Retail Banking team has this on the roadmap?`,
						viewUrl,
					}),
				},
				watcher_alert: {
					subject: `[TEST] New ThoughtBox idea: ${sample.submissionId} — ${sample.ideaTitle}`,
					template: createElement(WatcherAlert, {
						submissionId: sample.submissionId,
						ideaTitle: sample.ideaTitle,
						ideaDescription:
							"The current new account opening process requires members to fill out the same information multiple times. We could consolidate this into a single intake.",
						categoryName: sample.categoryName,
						submitterName: "Sarah Chen",
						submitterDepartment: "Retail Banking",
						assignedOwnerName: "Michelle Murray",
						viewUrl,
					}),
				},
				sla_reminder: {
					subject: `[TEST] Reminder: ${sample.submissionId} needs your review (5 business days)`,
					template: createElement(SlaReminder, {
						ownerFirstName: firstName,
						submissionId: sample.submissionId,
						ideaTitle: sample.ideaTitle,
						submitterName: "Sarah Chen",
						categoryName: sample.categoryName,
						currentStatus: "New",
						businessDaysSinceStart: 5,
						viewUrl,
					}),
				},
				user_invite_owner: {
					subject: "[TEST] You've been invited to ThoughtBox",
					template: createElement(UserInvite, {
						recipientFirstName: firstName,
						role: "owner",
						invitedByName: "Nubia Ruiz",
						dashboardUrl: `${APP_URL}/dashboard`,
					}),
				},
				user_invite_admin: {
					subject: "[TEST] You've been invited to ThoughtBox",
					template: createElement(UserInvite, {
						recipientFirstName: firstName,
						role: "admin",
						invitedByName: "Nubia Ruiz",
						dashboardUrl: `${APP_URL}/dashboard`,
					}),
				},
				access_requested: {
					subject: `[TEST] ThoughtBox access request from ${context.user.displayName}`,
					template: createElement(AccessRequested, {
						requesterName: context.user.displayName,
						requesterEmail: context.user.email,
						requesterDepartment: "Retail Banking",
						requesterJobTitle: "Branch Manager",
						adminUsersUrl: `${APP_URL}/admin/users`,
					}),
				},
				watcher_update: {
					subject: `[TEST] Update on idea ${sample.submissionId}: Under Review`,
					template: createElement(WatcherUpdate, {
						watcherFirstName: firstName,
						submissionId: sample.submissionId,
						ideaTitle: sample.ideaTitle,
						updateKind: "status",
						statusLabel: "Under Review",
						messagePreview: null,
						viewUrl,
					}),
				},
				category_owner_granted: {
					subject: `[TEST] You now own the ${sample.categoryName} category`,
					template: createElement(CategoryRoleGranted, {
						recipientFirstName: firstName,
						categoryName: sample.categoryName,
						kind: "owner",
						openIdeaCount: 4,
						grantedByName: "Jordan Lee",
						viewUrl: `${APP_URL}/my-categories`,
					}),
				},
				category_contributor_granted: {
					subject: `[TEST] You've joined the ${sample.categoryName} review team`,
					template: createElement(CategoryRoleGranted, {
						recipientFirstName: firstName,
						categoryName: sample.categoryName,
						kind: "contributor",
						openIdeaCount: null,
						grantedByName: "Jordan Lee",
						viewUrl: `${APP_URL}/queue`,
					}),
				},
			};

		const { subject, template } = templates[data.template];
		await sendEmail({ to, subject, template });
		return { success: true, sentTo: to };
	});
