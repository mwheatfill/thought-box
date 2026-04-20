import { Text } from "@react-email/components";
import { EmailLayout, HeroIcon, IdeaCard, PrimaryButton } from "./components/EmailLayout";

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
		<EmailLayout preview={`Idea reassigned to you: ${ideaTitle}`} accentColor="#3b82f6">
			<HeroIcon bgColor="#dbeafe" color="#3b82f6">
				{"⇄"}
			</HeroIcon>

			<Text className="m-0 text-center text-xl font-bold text-gray-900">
				Idea reassigned to you, {leaderFirstName}
			</Text>

			<Text className="m-0 mt-2 text-center text-sm text-gray-500">
				{reassignedByName} has reassigned this idea to you for review.
			</Text>

			<IdeaCard
				submissionId={submissionId}
				title={ideaTitle}
				meta={`${categoryName} · Submitted by ${submitterName}`}
			/>

			<PrimaryButton href={viewUrl}>Review Idea →</PrimaryButton>
		</EmailLayout>
	);
}
