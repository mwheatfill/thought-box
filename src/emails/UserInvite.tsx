import { Text } from "@react-email/components";
import { EmailLayout, HeroIcon, PrimaryButton, StepCard } from "./components/EmailLayout";

interface UserInviteProps {
	recipientFirstName: string;
	role: "leader" | "admin";
	invitedByName: string;
	dashboardUrl: string;
}

const ROLE_CONFIG = {
	leader: {
		label: "Idea Reviewer",
		description:
			"You'll receive and review employee ideas assigned to your area. Update statuses, leave notes, and communicate with submitters to help bring great ideas to life.",
	},
	admin: {
		label: "Administrator",
		description:
			"You'll have full visibility across all ideas, manage categories and routing rules, configure settings, and oversee the ThoughtBox program.",
	},
};

export default function UserInvite({
	recipientFirstName = "Sarah",
	role = "leader",
	invitedByName = "Nubia Ruiz",
	dashboardUrl = "https://thoughtbox.desertfinancial.com/dashboard",
}: UserInviteProps) {
	const config = ROLE_CONFIG[role];

	return (
		<EmailLayout preview={`You've been invited to ThoughtBox as a ${role}`} accentColor="#7c3aed">
			<HeroIcon bgColor="#ede9fe" color="#7c3aed">
				{"★"}
			</HeroIcon>

			<Text className="m-0 text-center text-xl font-bold text-gray-900">
				Welcome to ThoughtBox!
			</Text>

			<Text className="m-0 mt-2 text-center text-sm text-gray-500">
				{invitedByName} has added you to ThoughtBox, Desert Financial's employee idea platform.
			</Text>

			{/* Role card */}
			<div
				style={{
					border: "1px solid #e5e7eb",
					borderRadius: 8,
					padding: "14px 16px",
					margin: "16px 0",
				}}
			>
				<Text className="m-0 text-xs font-bold" style={{ color: "#7c3aed" }}>
					Your role: {config.label}
				</Text>
				<Text className="m-0 mt-2 text-sm leading-5 text-gray-600">{config.description}</Text>
			</div>

			<StepCard
				icon="1"
				iconBg="#ede9fe"
				iconColor="#7c3aed"
				title="Sign in with your Desert Financial account"
				description="Use your existing credentials — no separate signup needed"
			/>
			<StepCard
				icon="2"
				iconBg="#ede9fe"
				iconColor="#7c3aed"
				title="Your dashboard is ready"
				description="Everything is set up and waiting for you"
			/>

			<PrimaryButton href={dashboardUrl}>Open ThoughtBox →</PrimaryButton>
		</EmailLayout>
	);
}
