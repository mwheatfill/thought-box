import { Button, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";

interface IdeaAssignedProps {
	leaderFirstName: string;
	submissionId: string;
	ideaTitle: string;
	categoryName: string;
	submitterName: string;
	submitterDepartment: string | null;
	viewUrl: string;
}

export default function IdeaAssigned({
	leaderFirstName = "Michelle",
	submissionId = "TB-0001",
	ideaTitle = "Add dark mode toggle to mobile app",
	categoryName = "Member Experience",
	submitterName = "Sean St Onge",
	submitterDepartment = "Digital Banking",
	viewUrl = "https://thoughtbox.desertfinancial.com/ideas/TB-0001",
}: IdeaAssignedProps) {
	return (
		<EmailLayout preview={`New idea assigned to you: ${ideaTitle}`}>
			<Text className="text-lg font-semibold text-gray-900">
				New idea for you, {leaderFirstName}
			</Text>

			<Text className="text-sm text-gray-600">
				{submitterName}
				{submitterDepartment ? ` from ${submitterDepartment}` : ""} has submitted a new idea that's
				been routed to you for review.
			</Text>

			<div className="my-4 rounded-md border border-gray-200 bg-gray-50 p-4">
				<Text className="m-0 text-xs font-medium text-gray-500">
					{submissionId} · {categoryName}
				</Text>
				<Text className="m-0 mt-1 text-sm font-semibold text-gray-900">{ideaTitle}</Text>
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
