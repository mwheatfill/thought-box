import { Button, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";

interface WatcherAlertProps {
	submissionId: string;
	ideaTitle: string;
	ideaDescription: string;
	categoryName: string;
	submitterName: string;
	submitterDepartment: string | null;
	assignedLeaderName: string | null;
	viewUrl: string;
}

export default function WatcherAlert({
	submissionId = "TB-0001",
	ideaTitle = "Add dark mode toggle to mobile app",
	ideaDescription = "Add a dark mode toggle feature to the member-facing mobile app to give members more control over their experience.",
	categoryName = "Member Experience",
	submitterName = "Sean St Onge",
	submitterDepartment = "Digital Banking",
	assignedLeaderName = "Michelle Murray",
	viewUrl = "https://thoughtbox.desertfinancial.com/ideas/TB-0001",
}: WatcherAlertProps) {
	return (
		<EmailLayout preview={`New ThoughtBox idea: ${ideaTitle}`}>
			<Text className="text-lg font-semibold text-gray-900">New Idea Submitted</Text>

			<div className="my-4 rounded-md border border-gray-200 bg-gray-50 p-4">
				<Text className="m-0 text-xs font-medium text-gray-500">
					{submissionId} · {categoryName}
				</Text>
				<Text className="m-0 mt-1 text-sm font-semibold text-gray-900">{ideaTitle}</Text>
				<Text className="m-0 mt-2 text-sm text-gray-600">
					{ideaDescription.length > 200 ? `${ideaDescription.slice(0, 200)}...` : ideaDescription}
				</Text>
			</div>

			<Text className="text-xs text-gray-500">
				<strong>Submitted by:</strong> {submitterName}
				{submitterDepartment ? `, ${submitterDepartment}` : ""}
			</Text>
			{assignedLeaderName && (
				<Text className="text-xs text-gray-500">
					<strong>Assigned to:</strong> {assignedLeaderName}
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
