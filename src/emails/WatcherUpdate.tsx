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
	/** "status" → a status change; "message" → a new public message on the thread. */
	updateKind: "status" | "message";
	/** Human label of the new status (status updates only). */
	statusLabel: string | null;
	/** Short preview of the message (message updates only). */
	messagePreview: string | null;
	viewUrl: string;
}

export default function WatcherUpdate({
	watcherFirstName = "Alex",
	submissionId = "TB-0001",
	ideaTitle = "Add dark mode toggle to mobile app",
	updateKind = "status",
	statusLabel = "Under Review",
	messagePreview = null,
	viewUrl = "https://thoughtbox.desertfinancial.com/ideas/TB-0001",
}: WatcherUpdateProps) {
	const isStatus = updateKind === "status";
	const headline = isStatus
		? `Status updated: ${statusLabel}`
		: "New activity on an idea you're watching";

	return (
		<EmailLayout preview={`${submissionId} — ${headline}`} accentColor="#3b82f6">
			<HeroIcon bgColor="#dbeafe" color="#3b82f6">
				{isStatus ? "◎" : "💬"}
			</HeroIcon>

			<Text className="m-0 text-center text-xl font-bold text-gray-900">{headline}</Text>

			<Text className="m-0 mt-2 text-center text-sm text-gray-500">
				Hi {watcherFirstName}, there's an update on an idea you're watching.
			</Text>

			<IdeaCard
				submissionId={submissionId}
				title={ideaTitle}
				meta={isStatus ? `Now ${statusLabel}` : "New message"}
			/>

			{!isStatus && messagePreview && <QuoteBlock>{messagePreview}</QuoteBlock>}

			<Text className="m-0 text-center text-xs text-gray-400">
				You're receiving this because you're watching this idea. Open it to stop watching.
			</Text>

			<PrimaryButton href={viewUrl}>View Idea →</PrimaryButton>
		</EmailLayout>
	);
}
