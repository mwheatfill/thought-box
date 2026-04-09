import { createElement } from "react";
import IdeaAssigned from "#/emails/IdeaAssigned";
import IdeaReassigned from "#/emails/IdeaReassigned";
import IdeaSubmitted from "#/emails/IdeaSubmitted";
import NewMessage from "#/emails/NewMessage";
import StatusChanged from "#/emails/StatusChanged";
import { sendEmail } from "#/server/lib/email";

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
