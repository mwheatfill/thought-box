import { createServerFn } from "@tanstack/react-start";
import { createElement } from "react";
import { z } from "zod";
import AccessRequested from "#/emails/AccessRequested";
import IdeaAssigned from "#/emails/IdeaAssigned";
import IdeaReassigned from "#/emails/IdeaReassigned";
import IdeaReassignedSubmitter from "#/emails/IdeaReassignedSubmitter";
import IdeaSubmitted from "#/emails/IdeaSubmitted";
import NewMessage from "#/emails/NewMessage";
import SlaReminder from "#/emails/SlaReminder";
import StatusChanged from "#/emails/StatusChanged";
import UserInvite from "#/emails/UserInvite";
import WatcherAlert from "#/emails/WatcherAlert";
import { sendEmail } from "#/server/lib/email";
import { adminMiddleware } from "#/server/middleware/auth";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

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

/** Notify the assigned leader about a new idea. */
export async function sendIdeaAssignedEmail(params: {
	leaderEmail: string;
	leaderFirstName: string;
	submissionId: string;
	ideaTitle: string;
	categoryName: string;
	submitterName: string;
	submitterDepartment: string | null;
}) {
	await sendEmail({
		to: params.leaderEmail,
		subject: `New idea assigned to you: ${params.submissionId}`,
		templateName: "IdeaAssigned",
		template: createElement(IdeaAssigned, {
			leaderFirstName: params.leaderFirstName,
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
	leaderFirstName: string;
	leaderNotes: string | null;
	rejectionReason: string | null;
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
			leaderFirstName: params.leaderFirstName,
			leaderNotes: params.leaderNotes,
			rejectionReason: params.rejectionReason,
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
	isFromLeader: boolean;
}) {
	const subject = params.isFromLeader
		? `A leader has a question about your idea: ${params.ideaTitle}`
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
			isFromLeader: params.isFromLeader,
			viewUrl: ideaUrl(params.submissionId),
		}),
	});
}

/** Notify a leader when an idea is reassigned to them. */
export async function sendIdeaReassignedEmail(params: {
	leaderEmail: string;
	leaderFirstName: string;
	submissionId: string;
	ideaTitle: string;
	categoryName: string;
	submitterName: string;
	reassignedByName: string;
}) {
	await sendEmail({
		to: params.leaderEmail,
		subject: `Idea reassigned to you: ${params.submissionId}`,
		templateName: "IdeaReassigned",
		template: createElement(IdeaReassigned, {
			leaderFirstName: params.leaderFirstName,
			submissionId: params.submissionId,
			ideaTitle: params.ideaTitle,
			categoryName: params.categoryName,
			submitterName: params.submitterName,
			reassignedByName: params.reassignedByName,
			viewUrl: ideaUrl(params.submissionId),
		}),
	});
}

/** Notify the submitter that their idea has been reassigned (no leader name revealed). */
export async function sendIdeaReassignedSubmitterEmail(params: {
	submitterEmail: string;
	submitterFirstName: string;
	submissionId: string;
	ideaTitle: string;
	categoryName: string;
}) {
	await sendEmail({
		to: params.submitterEmail,
		subject: `Your idea ${params.submissionId} has a new reviewer`,
		templateName: "IdeaReassignedSubmitter",
		template: createElement(IdeaReassignedSubmitter, {
			submitterFirstName: params.submitterFirstName,
			submissionId: params.submissionId,
			ideaTitle: params.ideaTitle,
			categoryName: params.categoryName,
			viewUrl: ideaUrl(params.submissionId),
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
	assignedLeaderName: string | null;
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
			assignedLeaderName: params.assignedLeaderName,
			viewUrl: ideaUrl(params.submissionId),
		}),
	});
}

// ── SLA reminder ─────────────────────────────────────────────────────────

export async function sendSlaReminderEmail(params: {
	leaderEmail: string;
	leaderFirstName: string;
	submissionId: string;
	ideaTitle: string;
	submitterName: string;
	categoryName: string;
	currentStatus: string;
	daysSinceSubmission: number;
}) {
	await sendEmail({
		to: params.leaderEmail,
		subject: `Reminder: ${params.submissionId} needs your review (${params.daysSinceSubmission} days)`,
		templateName: "SlaReminder",
		template: createElement(SlaReminder, {
			leaderFirstName: params.leaderFirstName,
			submissionId: params.submissionId,
			ideaTitle: params.ideaTitle,
			submitterName: params.submitterName,
			categoryName: params.categoryName,
			currentStatus: params.currentStatus,
			daysSinceSubmission: params.daysSinceSubmission,
			viewUrl: ideaUrl(params.submissionId),
		}),
	});
}

// ── User invite ──────────────────────────────────────────────────────────

export async function sendUserInviteEmail(params: {
	recipientEmail: string;
	recipientFirstName: string;
	role: "leader" | "admin";
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
	"message_from_leader",
	"message_from_submitter",
	"watcher_alert",
	"sla_reminder",
	"user_invite_leader",
	"user_invite_admin",
	"access_requested",
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
						leaderFirstName: firstName,
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
						leaderFirstName: "Michelle",
						leaderNotes: null,
						rejectionReason: null,
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
						leaderFirstName: "Michelle",
						leaderNotes:
							"This is a great idea. We're going to pilot it at the Scottsdale branch next quarter.",
						rejectionReason: null,
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
						leaderFirstName: "Michelle",
						leaderNotes: "We appreciate the suggestion but this is already in progress.",
						rejectionReason: "already_in_progress",
						viewUrl,
					}),
				},
				idea_reassigned: {
					subject: `[TEST] Idea reassigned to you: ${sample.submissionId}`,
					template: createElement(IdeaReassigned, {
						leaderFirstName: firstName,
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
				message_from_leader: {
					subject: `[TEST] A leader has a question about your idea: ${sample.ideaTitle}`,
					template: createElement(NewMessage, {
						recipientFirstName: firstName,
						senderName: "Michelle Murray",
						submissionId: sample.submissionId,
						ideaTitle: sample.ideaTitle,
						messagePreview:
							"Can you share more details about the current process? Specifically, which steps take the longest?",
						isFromLeader: true,
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
						isFromLeader: false,
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
						assignedLeaderName: "Michelle Murray",
						viewUrl,
					}),
				},
				sla_reminder: {
					subject: `[TEST] Reminder: ${sample.submissionId} needs your review (5 days)`,
					template: createElement(SlaReminder, {
						leaderFirstName: firstName,
						submissionId: sample.submissionId,
						ideaTitle: sample.ideaTitle,
						submitterName: "Sarah Chen",
						categoryName: sample.categoryName,
						currentStatus: "New",
						daysSinceSubmission: 5,
						viewUrl,
					}),
				},
				user_invite_leader: {
					subject: "[TEST] You've been invited to ThoughtBox",
					template: createElement(UserInvite, {
						recipientFirstName: firstName,
						role: "leader",
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
			};

		const { subject, template } = templates[data.template];
		await sendEmail({ to, subject, template });
		return { success: true, sentTo: to };
	});
