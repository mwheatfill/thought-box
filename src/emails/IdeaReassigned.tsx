import { Button, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";

interface IdeaReassignedProps {
	leaderFirstName: string;
	submissionId: string;
	ideaTitle: string;
	categoryName: string;
	submitterName: string;
	reassignedByName: string;
	viewUrl: string;
}

export default function IdeaReassigned({
	leaderFirstName = "David",
	submissionId = "TB-0001",
	ideaTitle = "Add dark mode toggle to mobile app",
	categoryName = "Member Experience",
	submitterName = "Sean St Onge",
	reassignedByName = "Michelle Murray",
	viewUrl = "https://thoughtbox.desertfinancial.com/ideas/TB-0001",
}: IdeaReassignedProps) {
	return (
		<EmailLayout preview={`Idea reassigned to you: ${ideaTitle}`}>
			<Text className="text-lg font-semibold text-gray-900">
				An idea has been reassigned to you, {leaderFirstName}
			</Text>

			<Text className="text-sm text-gray-600">
				{reassignedByName} reassigned this idea to you for review.
			</Text>

			<div className="my-4 rounded-md border border-gray-200 bg-gray-50 p-4">
				<Text className="m-0 text-xs font-medium text-gray-500">
					{submissionId} · {categoryName}
				</Text>
				<Text className="m-0 mt-1 text-sm font-semibold text-gray-900">{ideaTitle}</Text>
				<Text className="m-0 mt-1 text-xs text-gray-500">Submitted by {submitterName}</Text>
			</div>

			<Button
				href={viewUrl}
				className="mt-4 rounded-md bg-[#1e3a5f] px-6 py-3 text-sm font-medium text-white"
			>
				Review Idea
			</Button>
		</EmailLayout>
	);
}
