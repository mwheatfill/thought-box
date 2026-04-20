import { Text } from "@react-email/components";
import { EmailLayout, HeroIcon, IdeaCard, PrimaryButton } from "./components/EmailLayout";

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
		<EmailLayout preview={`New idea assigned to you: ${ideaTitle}`} accentColor="#3b82f6">
			<HeroIcon bgColor="#dbeafe" color="#3b82f6">
				{"→"}
			</HeroIcon>

			<Text className="m-0 text-center text-xl font-bold text-gray-900">
				New idea for you, {leaderFirstName}
			</Text>

			<Text className="m-0 mt-2 text-center text-sm text-gray-500">
				{submitterName}
				{submitterDepartment ? ` from ${submitterDepartment}` : ""} submitted an idea that's been
				routed to you for review.
			</Text>

			<IdeaCard submissionId={submissionId} title={ideaTitle} meta={categoryName} />

			<PrimaryButton href={viewUrl}>Review Idea →</PrimaryButton>
		</EmailLayout>
	);
}
