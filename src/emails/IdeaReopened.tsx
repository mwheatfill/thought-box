import { Text } from "@react-email/components";
import { EmailLayout, HeroIcon, IdeaCard, PrimaryButton } from "./components/EmailLayout";

interface IdeaReopenedProps {
	submitterFirstName: string;
	submissionId: string;
	ideaTitle: string;
	viewUrl: string;
}

export default function IdeaReopened({
	submitterFirstName = "Alex",
	submissionId = "TB-0001",
	ideaTitle = "Add dark mode toggle to mobile app",
	viewUrl = "https://thoughtbox.desertfinancial.com/ideas/TB-0001",
}: IdeaReopenedProps) {
	return (
		<EmailLayout
			preview={`Your idea ${submissionId} is being looked at again`}
			accentColor="#3b82f6"
		>
			<HeroIcon bgColor="#dbeafe" color="#3b82f6">
				{"↻"}
			</HeroIcon>

			<Text className="m-0 text-center text-xl font-bold text-gray-900">
				Your idea is back under review
			</Text>

			<Text className="m-0 mt-2 text-center text-sm text-gray-500">
				Hi {submitterFirstName}, good news — a reviewer has reopened your idea to take another look.
				No action is needed from you; you'll hear back as it progresses.
			</Text>

			<IdeaCard submissionId={submissionId} title={ideaTitle} meta="Reopened — now New" />

			<PrimaryButton href={viewUrl}>View Idea →</PrimaryButton>
		</EmailLayout>
	);
}
