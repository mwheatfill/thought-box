import { Button, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";

interface StatusChangedProps {
	submitterFirstName: string;
	submissionId: string;
	ideaTitle: string;
	newStatus: "under_review" | "accepted" | "declined";
	leaderFirstName: string;
	leaderNotes: string | null;
	rejectionReason: string | null;
	viewUrl: string;
}

const STATUS_CONTENT = {
	under_review: {
		headline: () => "Your idea is being reviewed",
		body: "Your idea is being looked at. You'll hear back once a decision has been made.",
		preview: (title: string) => `Your idea is being reviewed: ${title}`,
	},
	accepted: {
		headline: () => "Great news: your idea is moving forward!",
		body: "Your idea has been accepted. Here's what happens next:",
		preview: (title: string) => `Your idea has been accepted: ${title}`,
	},
	declined: {
		headline: () => "Update on your idea",
		body: "After review, your idea won't be moving forward at this time. Here's why:",
		preview: (title: string) => `Update on your idea: ${title}`,
	},
};

const REJECTION_LABELS: Record<string, string> = {
	already_in_progress: "This is already in progress",
	not_feasible: "Not feasible at this time",
	not_aligned: "Not aligned with current priorities",
	not_thoughtbox: "Not a ThoughtBox idea",
};

export default function StatusChanged({
	submitterFirstName = "Alex",
	submissionId = "TB-0001",
	ideaTitle = "Add dark mode toggle to mobile app",
	newStatus = "accepted",
	leaderFirstName = "Michelle",
	leaderNotes = "This is a great idea! We'll be adding this to the Q3 roadmap.",
	rejectionReason = null,
	viewUrl = "https://thoughtbox.desertfinancial.com/ideas/TB-0001",
}: StatusChangedProps) {
	const content = STATUS_CONTENT[newStatus];

	return (
		<EmailLayout preview={content.preview(ideaTitle)}>
			<Text className="text-lg font-semibold text-gray-900">{content.headline()}</Text>

			<div className="my-4 rounded-md border border-gray-200 bg-gray-50 p-4">
				<Text className="m-0 text-xs font-medium text-gray-500">{submissionId}</Text>
				<Text className="m-0 mt-1 text-sm font-semibold text-gray-900">{ideaTitle}</Text>
			</div>

			<Text className="text-sm text-gray-600">
				Hi {submitterFirstName}, {content.body}
			</Text>

			{newStatus === "declined" && rejectionReason && (
				<Text className="text-sm font-medium text-gray-700">
					Reason: {REJECTION_LABELS[rejectionReason] ?? rejectionReason}
				</Text>
			)}

			{leaderNotes && (
				<div className="my-3 border-l-4 border-blue-200 pl-4">
					<Text className="m-0 text-xs font-medium text-gray-500">Reviewer note</Text>
					<Text className="m-0 mt-1 text-sm text-gray-700">{leaderNotes}</Text>
				</div>
			)}

			{newStatus === "declined" && (
				<Text className="text-sm text-gray-600">
					Don't let this stop you — every idea matters, and we'd love to hear your next one.
				</Text>
			)}

			<Button
				href={viewUrl}
				className="mt-4 rounded-md bg-[#1e3a5f] px-6 py-3 text-sm font-medium text-white"
			>
				View Idea
			</Button>
		</EmailLayout>
	);
}
