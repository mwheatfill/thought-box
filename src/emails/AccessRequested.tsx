import { Text } from "@react-email/components";
import { EmailLayout, HeroIcon, PrimaryButton } from "./components/EmailLayout";

interface AccessRequestedProps {
	requesterName: string;
	requesterEmail: string;
	requesterDepartment: string | null;
	requesterJobTitle: string | null;
	adminUsersUrl: string;
}

export default function AccessRequested({
	requesterName = "Sarah Chen",
	requesterEmail = "sarah.chen@desertfinancial.com",
	requesterDepartment = "Retail Banking",
	requesterJobTitle = "Branch Manager",
	adminUsersUrl = "https://thoughtbox.desertfinancial.com/admin/users",
}: AccessRequestedProps) {
	return (
		<EmailLayout
			preview={`${requesterName} is requesting access to ThoughtBox`}
			accentColor="#d97706"
		>
			<HeroIcon bgColor="#fef3c7" color="#d97706">
				{"?"}
			</HeroIcon>

			<Text className="m-0 text-center text-xl font-bold text-gray-900">Access Request</Text>

			<Text className="m-0 mt-2 text-center text-sm text-gray-500">
				A deactivated user is trying to sign into ThoughtBox.
			</Text>

			{/* Requester card */}
			<div
				style={{
					border: "1px solid #e5e7eb",
					borderRadius: 8,
					padding: "14px 16px",
					margin: "16px 0",
				}}
			>
				<Text className="m-0 text-sm font-semibold text-gray-900">{requesterName}</Text>
				<Text className="m-0 mt-1 text-xs text-gray-500">{requesterEmail}</Text>
				{requesterJobTitle && (
					<Text className="m-0 mt-1 text-xs text-gray-500">{requesterJobTitle}</Text>
				)}
				{requesterDepartment && (
					<Text className="m-0 mt-1 text-xs text-gray-500">{requesterDepartment}</Text>
				)}
			</div>

			<Text className="m-0 text-center text-xs text-gray-400">
				To reactivate this account, visit the Users page in admin settings.
			</Text>

			<PrimaryButton href={adminUsersUrl}>View Users →</PrimaryButton>
		</EmailLayout>
	);
}
