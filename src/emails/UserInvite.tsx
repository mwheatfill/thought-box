import { Button, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";

interface UserInviteProps {
	recipientFirstName: string;
	role: "leader" | "admin";
	invitedByName: string;
	dashboardUrl: string;
}

export default function UserInvite({
	recipientFirstName = "Sarah",
	role = "leader",
	invitedByName = "Nubia Ruiz",
	dashboardUrl = "https://thoughtbox.desertfinancial.com/dashboard",
}: UserInviteProps) {
	const roleDescriptions = {
		leader:
			"As a leader, you'll receive and review employee ideas assigned to your area. You can update statuses, leave notes, communicate with submitters, and help bring great ideas to life.",
		admin:
			"As an admin, you'll have full visibility across all ideas, manage the category taxonomy and routing rules, configure settings, and oversee the ThoughtBox program.",
	};

	return (
		<EmailLayout preview={`You've been invited to ThoughtBox as a ${role}`}>
			<Text className="text-lg font-semibold text-gray-900">Welcome to ThoughtBox!</Text>

			<Text className="text-sm text-gray-600">Hi {recipientFirstName},</Text>

			<Text className="text-sm text-gray-600">
				{invitedByName} has added you to <strong>ThoughtBox</strong>, Desert Financial's employee
				idea platform. ThoughtBox makes it easy for employees to share ideas that improve our team
				and member experience.
			</Text>

			<div className="my-4 rounded-md border border-blue-200 bg-blue-50 p-4">
				<Text className="m-0 text-xs font-medium text-blue-800">
					Your role: {role === "admin" ? "Administrator" : "Idea Reviewer"}
				</Text>
				<Text className="m-0 mt-2 text-sm text-blue-700">{roleDescriptions[role]}</Text>
			</div>

			<Text className="text-sm text-gray-600">
				Sign in with your Desert Financial account to get started. Your dashboard will be ready when
				you arrive.
			</Text>

			<Button
				href={dashboardUrl}
				className="mt-2 rounded-md bg-[#1e3a5f] px-6 py-3 text-sm font-medium text-white"
			>
				Open ThoughtBox
			</Button>
		</EmailLayout>
	);
}
