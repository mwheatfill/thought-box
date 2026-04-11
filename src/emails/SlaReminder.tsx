import { Button, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";

interface SlaReminderProps {
	leaderFirstName: string;
	submissionId: string;
	ideaTitle: string;
	submitterName: string;
	categoryName: string;
	currentStatus: string;
	daysSinceSubmission: number;
	viewUrl: string;
}

export default function SlaReminder({
	leaderFirstName = "Michelle",
	submissionId = "TB-0001",
	ideaTitle = "Simplify the new account opening process",
	submitterName = "Sarah Chen",
	categoryName = "Process Improvement",
	currentStatus = "New",
	daysSinceSubmission = 5,
	viewUrl = "https://thoughtbox.desertfinancial.com/ideas/TB-0001",
}: SlaReminderProps) {
	return (
		<EmailLayout preview={`Reminder: ${submissionId} needs your attention`}>
			<Text className="text-lg font-semibold text-gray-900">Idea Needs Attention</Text>

			<Text className="text-sm text-gray-600">Hi {leaderFirstName},</Text>

			<Text className="text-sm text-gray-600">
				The following idea has been in <strong>{currentStatus}</strong> status for{" "}
				<strong>{daysSinceSubmission} days</strong> and is waiting for your review.
			</Text>

			<div className="my-4 rounded-md border border-yellow-200 bg-yellow-50 p-4">
				<Text className="m-0 text-xs font-medium text-yellow-800">
					{submissionId} · {categoryName}
				</Text>
				<Text className="m-0 mt-1 text-sm font-semibold text-yellow-900">{ideaTitle}</Text>
				<Text className="m-0 mt-1 text-xs text-yellow-700">Submitted by {submitterName}</Text>
			</div>

			<Text className="text-sm text-gray-600">
				Please review this idea and update its status when you can. Every response matters to the
				employee who shared it.
			</Text>

			<Button
				href={viewUrl}
				className="mt-2 rounded-md bg-[#1e3a5f] px-6 py-3 text-sm font-medium text-white"
			>
				Review Idea
			</Button>
		</EmailLayout>
	);
}
