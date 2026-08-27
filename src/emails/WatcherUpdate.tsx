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
	 * thread; "added" → the recipient was just added as a Watcher.
	 */
	updateKind: "status" | "message" | "added";
	/** Human label of the new status (status updates only). */
	statusLabel: string | null;
	/** Short preview of the message (message updates only). */
	messagePreview: string | null;
	/** Who added the recipient ("added" updates only). */
	addedByName?: string | null;
	viewUrl: string;
}

export default function WatcherUpdate({
	watcherFirstName = "Alex",
	submissionId = "TB-0001",
	ideaTitle = "Add dark mode toggle to mobile app",
	updateKind = "status",
	statusLabel = "Under Review",
	messagePreview = null,
	addedByName = null,
	viewUrl = "https://thoughtbox.desertfinancial.com/ideas/TB-0001",
}: WatcherUpdateProps) {
	const isStatus = updateKind === "status";
	const isAdded = updateKind === "added";
	const headline = isAdded
		? "You've been added as a watcher"
		: isStatus
			? `Status updated: ${statusLabel}`
			: "New activity on an idea you're watching";
	const subline = isAdded
		? `Hi ${watcherFirstName}, ${addedByName ?? "the idea's owner"} added you as a watcher on this idea. You'll get updates when its status changes or a new message is posted.`
		: `Hi ${watcherFirstName}, there's an update on an idea you're watching.`;

	return (
		<EmailLayout preview={`${submissionId} — ${headline}`} accentColor="#3b82f6">
			<HeroIcon bgColor="#dbeafe" color="#3b82f6">
				{isAdded ? "👀" : isStatus ? "◎" : "💬"}
			</HeroIcon>

			<Text className="m-0 text-center text-xl font-bold text-gray-900">{headline}</Text>

			<Text className="m-0 mt-2 text-center text-sm text-gray-500">{subline}</Text>

			<IdeaCard
				submissionId={submissionId}
				title={ideaTitle}
				meta={isAdded ? "Now watching" : isStatus ? `Now ${statusLabel}` : "New message"}
			/>

			{!isStatus && messagePreview && <QuoteBlock>{messagePreview}</QuoteBlock>}

			<Text className="m-0 text-center text-xs text-gray-400">
				You're receiving this because you're watching this idea. Open it to stop watching.
			</Text>

			<PrimaryButton href={viewUrl}>View Idea →</PrimaryButton>
		</EmailLayout>
	);
}
