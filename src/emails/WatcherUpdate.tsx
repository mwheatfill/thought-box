import { Text } from "@react-email/components";
import {
	EmailLayout,
	HeroIcon,
	IdeaCard,
	PrimaryButton,
	QuoteBlock,
} from "./components/EmailLayout";

interface WatcherUpdateProps {
	watcherFirstName: string;
	submissionId: string;
	ideaTitle: string;
	/**
	 * "status" → a status change; "message" → a new public message on the
	 * thread; "added" → the recipient was just added as a Watcher; "moved" /
	 * "handoff" / "reopened" → an owner notice that someone else acted on an
	 * idea the recipient is accountable for.
	 */
	updateKind: WatcherUpdateKind;
	/** Human label of the new status (status updates only). */
	statusLabel: string | null;
	/** Short preview of the message (message updates only). */
	messagePreview: string | null;
	/** Who added the recipient ("added" updates only). */
	addedByName?: string | null;
	/** New category / new assignee name (moved / handoff only). */
	detail?: string | null;
	/** Who did it (owner notices only). */
	actorName?: string | null;
	viewUrl: string;
}

/**
 * One copy source per update kind — the server subject and the email body pull
 * from here so they can never drift apart.
 */
export type WatcherUpdateKind = "status" | "message" | "added" | "moved" | "handoff" | "reopened";

export function watcherUpdateCopy(params: {
	updateKind: WatcherUpdateKind;
	submissionId: string;
	statusLabel?: string | null;
	/** Free-text detail for moved/handoff kinds (new category / new assignee). */
	detail?: string | null;
}): { subject: string; headline: string; icon: string; meta: string } {
	switch (params.updateKind) {
		case "added":
			return {
				subject: `You've been added as a watcher on idea ${params.submissionId}`,
				headline: "You've been added as a watcher",
				icon: "👀",
				meta: "Now watching",
			};
		case "moved":
			return {
				subject: `Idea ${params.submissionId} moved to ${params.detail ?? "another category"}`,
				headline: "Moved to another category",
				icon: "📁",
				meta: `Now in ${params.detail ?? "a different category"}`,
			};
		case "handoff":
			return {
				subject: `Idea ${params.submissionId} reassigned to ${params.detail ?? "someone else"}`,
				headline: "Reassigned to someone else",
				icon: "🤝",
				meta: `Now with ${params.detail ?? "a new owner"}`,
			};
		case "reopened":
			return {
				subject: `Idea ${params.submissionId} was reopened`,
				headline: "Reopened for another look",
				icon: "↩",
				meta: "Back to New",
			};
		case "status":
			return {
				subject: `Update on idea ${params.submissionId}: ${params.statusLabel}`,
				headline: `Status updated: ${params.statusLabel}`,
				icon: "◎",
				meta: `Now ${params.statusLabel}`,
			};
		default:
			return {
				subject: `New activity on idea ${params.submissionId}`,
				headline: "New activity on an idea you're watching",
				icon: "💬",
				meta: "New message",
			};
	}
}

export default function WatcherUpdate({
	watcherFirstName = "Alex",
	submissionId = "TB-0001",
	ideaTitle = "Add dark mode toggle to mobile app",
	updateKind = "status",
	statusLabel = "Under Review",
	messagePreview = null,
	addedByName = null,
	detail = null,
	actorName = null,
	viewUrl = "https://thoughtbox.desertfinancial.com/ideas/TB-0001",
}: WatcherUpdateProps) {
	const isStatus = updateKind === "status";
	const isAdded = updateKind === "added";
	const isOwnerNotice =
		updateKind === "moved" || updateKind === "handoff" || updateKind === "reopened";
	const copy = watcherUpdateCopy({ updateKind, submissionId, statusLabel, detail });
	const subline = isAdded
		? `Hi ${watcherFirstName}, ${addedByName ?? "the idea's owner"} added you as a watcher on this idea. You'll get updates when its status changes or a new message is posted.`
		: isOwnerNotice
			? `Hi ${watcherFirstName}, ${actorName ?? "someone"} ${
					updateKind === "moved"
						? "moved this idea out of your category"
						: updateKind === "handoff"
							? "reassigned this idea"
							: "reopened this idea"
				}. You're being told because you're accountable for it.`
			: `Hi ${watcherFirstName}, there's an update on an idea you're watching.`;

	return (
		<EmailLayout preview={`${submissionId} — ${copy.headline}`} accentColor="#3b82f6">
			<HeroIcon bgColor="#dbeafe" color="#3b82f6">
				{copy.icon}
			</HeroIcon>

			<Text className="m-0 text-center text-xl font-bold text-gray-900">{copy.headline}</Text>

			<Text className="m-0 mt-2 text-center text-sm text-gray-500">{subline}</Text>

			<IdeaCard submissionId={submissionId} title={ideaTitle} meta={copy.meta} />

			{!isStatus && messagePreview && <QuoteBlock>{messagePreview}</QuoteBlock>}

			<Text className="m-0 text-center text-xs text-gray-400">
				{isOwnerNotice
					? "You're receiving this because you own this idea's category or were assigned to it."
					: "You're receiving this because you're watching this idea. Open it to stop watching."}
			</Text>

			<PrimaryButton href={viewUrl}>View Idea →</PrimaryButton>
		</EmailLayout>
	);
}
