import { Button, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";

interface IdeaSubmittedProps {
	submitterFirstName: string;
	submissionId: string;
	ideaTitle: string;
	categoryName: string;
	ideaCount: number;
	viewUrl: string;
}

export default function IdeaSubmitted({
	submitterFirstName = "Alex",
	submissionId = "TB-0001",
	ideaTitle = "Add dark mode toggle to mobile app",
	categoryName = "Member Experience",
	ideaCount = 3,
	viewUrl = "https://thoughtbox.desertfinancial.com/ideas/TB-0001",
}: IdeaSubmittedProps) {
	const countMessage =
		ideaCount === 1
			? "Your first idea! Welcome to ThoughtBox."
			: `That's your ${ordinal(ideaCount)} idea this year. Thanks for making Desert Financial better.`;

	return (
		<EmailLayout preview={`Your idea has been submitted: ${ideaTitle}`}>
			<Text className="text-lg font-semibold text-gray-900">
				Thanks for sharing, {submitterFirstName}!
			</Text>

			<Text className="text-sm text-gray-600">
				Your idea has been submitted and a leader will review it soon.
			</Text>

			<div className="my-4 rounded-md border border-gray-200 bg-gray-50 p-4">
				<Text className="m-0 text-xs font-medium text-gray-500">
					{submissionId} · {categoryName}
				</Text>
				<Text className="m-0 mt-1 text-sm font-semibold text-gray-900">{ideaTitle}</Text>
			</div>

			<Text className="text-sm text-gray-600">{countMessage}</Text>

			<Button
				href={viewUrl}
				className="mt-4 rounded-md bg-[#1e3a5f] px-6 py-3 text-sm font-medium text-white"
			>
				View Your Idea
			</Button>
		</EmailLayout>
	);
}

function ordinal(n: number): string {
	const s = ["th", "st", "nd", "rd"];
	const v = n % 100;
	return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
