import { Text } from "@react-email/components";
import {
	EmailLayout,
	HeroIcon,
	IdeaCard,
	PrimaryButton,
	QuoteBlock,
} from "./components/EmailLayout";

interface NewMessageProps {
	recipientFirstName: string;
	senderName: string;
	submissionId: string;
	ideaTitle: string;
	messagePreview: string;
	isFromLeader: boolean;
	viewUrl: string;
}

export default function NewMessage({
	recipientFirstName = "Alex",
	senderName = "Michelle Murray",
	submissionId = "TB-0001",
	ideaTitle = "Add dark mode toggle to mobile app",
	messagePreview = "Could you tell me more about which screens would benefit most from dark mode?",
	isFromLeader = true,
	viewUrl = "https://thoughtbox.desertfinancial.com/ideas/TB-0001",
}: NewMessageProps) {
	const headline = isFromLeader
		? `${senderName} has a question about your idea`
		: `${senderName} responded on ${submissionId}`;

	return (
		<EmailLayout preview={headline} accentColor="#3b82f6">
			<HeroIcon bgColor="#dbeafe" color="#3b82f6">
				{"✉"}
			</HeroIcon>

			<Text className="m-0 text-center text-xl font-bold text-gray-900">
				New message, {recipientFirstName}
			</Text>

			<Text className="m-0 mt-2 text-center text-sm text-gray-500">{headline}</Text>

			<IdeaCard submissionId={submissionId} title={ideaTitle} />

			<QuoteBlock label={senderName}>{messagePreview}</QuoteBlock>

			<PrimaryButton href={viewUrl}>Reply →</PrimaryButton>
		</EmailLayout>
	);
}
