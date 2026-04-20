import { Text } from "@react-email/components";
import { EmailLayout, HeroIcon, PrimaryButton } from "./components/EmailLayout";

interface SlaReminderProps {
	leaderFirstName: string;
	submissionId: string;
	ideaTitle: string;
	submitterName: string;
	categoryName: string;
	currentStatus: string;
	daysSinceSubmission: number;
	viewUrl: string;
}

export default function SlaReminder({
	leaderFirstName = "Michelle",
	submissionId = "TB-0001",
	ideaTitle = "Simplify the new account opening process",
	submitterName = "Sarah Chen",
	categoryName = "Process Improvement",
	currentStatus = "New",
	daysSinceSubmission = 5,
	viewUrl = "https://thoughtbox.desertfinancial.com/ideas/TB-0001",
}: SlaReminderProps) {
	return (
		<EmailLayout preview={`Reminder: ${submissionId} needs your attention`} accentColor="#d97706">
			<HeroIcon bgColor="#fef3c7" color="#d97706">
				{"!"}
			</HeroIcon>

			<Text className="m-0 text-center text-xl font-bold text-gray-900">Idea needs attention</Text>

			<Text className="m-0 mt-2 text-center text-sm text-gray-500">
				Hi {leaderFirstName}, this idea has been in{" "}
				<strong className="text-gray-700">{currentStatus}</strong> status for{" "}
				<strong className="text-gray-700">{daysSinceSubmission} days</strong>.
			</Text>

			{/* Idea card with amber accent */}
			<div
				style={{
					border: "1px solid #fde68a",
					borderLeft: "3px solid #d97706",
					borderRadius: 8,
					padding: "14px 16px",
					margin: "16px 0",
					backgroundColor: "#fffbeb",
				}}
			>
				<Text className="m-0 text-xs font-bold" style={{ color: "#d97706" }}>
					{submissionId} · {categoryName}
				</Text>
				<Text className="m-0 mt-1 text-sm font-semibold text-gray-900">{ideaTitle}</Text>
				<Text className="m-0 mt-1 text-xs text-gray-500">Submitted by {submitterName}</Text>
			</div>

			<Text className="m-0 text-center text-xs text-gray-400">
				Every response matters to the employee who shared it.
			</Text>

			<PrimaryButton href={viewUrl}>Review Idea →</PrimaryButton>
		</EmailLayout>
	);
}
