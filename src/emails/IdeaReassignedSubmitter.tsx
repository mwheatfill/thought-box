import { Text } from "@react-email/components";
import { EmailLayout, HeroIcon, IdeaCard, PrimaryButton } from "./components/EmailLayout";

interface IdeaReassignedSubmitterProps {
	submitterFirstName: string;
	submissionId: string;
	ideaTitle: string;
	categoryName: string;
	viewUrl: string;
}

export default function IdeaReassignedSubmitter({
	submitterFirstName = "Alex",
	submissionId = "TB-0001",
	ideaTitle = "Add dark mode toggle to mobile app",
	categoryName = "Member Experience",
	viewUrl = "https://thoughtbox.desertfinancial.com/ideas/TB-0001",
}: IdeaReassignedSubmitterProps) {
	return (
		<EmailLayout
			preview={`Your idea ${submissionId} has been assigned to a new reviewer`}
			accentColor="#3b82f6"
		>
			<HeroIcon bgColor="#dbeafe" color="#3b82f6">
				{"⇄"}
			</HeroIcon>

			<Text className="m-0 text-center text-xl font-bold text-gray-900">New reviewer assigned</Text>

			<Text className="m-0 mt-2 text-center text-sm text-gray-500">
				Hi {submitterFirstName}, your idea has been assigned to a new reviewer who will continue the
				evaluation. No action is needed from you.
			</Text>

			<IdeaCard submissionId={submissionId} title={ideaTitle} meta={categoryName} />

			<Text className="m-0 text-center text-xs text-gray-400">
				You'll be notified of any status updates.
			</Text>

			<PrimaryButton href={viewUrl}>View Idea →</PrimaryButton>
		</EmailLayout>
	);
}
