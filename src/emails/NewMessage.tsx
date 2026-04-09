import { Button, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";

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
	const subject = isFromLeader
		? `A leader has a question about your idea: ${ideaTitle}`
		: `The submitter responded on: ${ideaTitle}`;

	return (
		<EmailLayout preview={subject}>
			<Text className="text-lg font-semibold text-gray-900">
				Hi {recipientFirstName},{" "}
				{isFromLeader
					? `${senderName} has a question about your idea`
					: `${senderName} responded on ${submissionId}`}
			</Text>

			<div className="my-4 rounded-md border border-gray-200 bg-gray-50 p-4">
				<Text className="m-0 text-xs font-medium text-gray-500">{submissionId}</Text>
				<Text className="m-0 mt-1 text-sm font-semibold text-gray-900">{ideaTitle}</Text>
			</div>

			<div className="my-3 border-l-4 border-blue-200 pl-4">
				<Text className="m-0 text-xs font-medium text-gray-500">{senderName}</Text>
				<Text className="m-0 mt-1 text-sm text-gray-700">{messagePreview}</Text>
			</div>

			<Button
				href={viewUrl}
				className="mt-4 rounded-md bg-[#1e3a5f] px-6 py-3 text-sm font-medium text-white"
			>
				Reply
			</Button>
		</EmailLayout>
	);
}
