import { Text } from "@react-email/components";
import {
	EmailLayout,
	HeroIcon,
	IdeaCard,
	PrimaryButton,
	QuoteBlock,
} from "./components/EmailLayout";

interface MentionAlertProps {
	recipientFirstName: string;
	mentionerName: string;
	submissionId: string;
	ideaTitle: string;
	notePreview: string;
	viewUrl: string;
}

export default function MentionAlert({
	recipientFirstName = "Alex",
	mentionerName = "Nubia Ruiz",
	submissionId = "TB-0001",
	ideaTitle = "Add dark mode toggle to mobile app",
	notePreview = "@Alex can you check whether the team already has this on the roadmap?",
	viewUrl = "https://thoughtbox.desertfinancial.com/ideas/TB-0001",
}: MentionAlertProps) {
	const headline = `${mentionerName} mentioned you in an internal note`;

	return (
		<EmailLayout preview={headline} accentColor="#7c3aed">
			<HeroIcon bgColor="#ede9fe" color="#7c3aed">
				{"@"}
			</HeroIcon>

			<Text className="m-0 text-center text-xl font-bold text-gray-900">
				You were mentioned, {recipientFirstName}
			</Text>

			<Text className="m-0 mt-2 text-center text-sm text-gray-500">{headline}</Text>

			<IdeaCard submissionId={submissionId} title={ideaTitle} />

			<QuoteBlock label={mentionerName}>{notePreview}</QuoteBlock>

			<Text className="m-0 mt-2 text-center text-xs text-gray-400">
				Internal notes are visible to owners and admins only.
			</Text>

			<PrimaryButton href={viewUrl}>View Idea →</PrimaryButton>
		</EmailLayout>
	);
}
