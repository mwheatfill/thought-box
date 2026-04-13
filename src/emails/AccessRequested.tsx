import { Button, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";

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
		<EmailLayout preview={`${requesterName} is requesting access to ThoughtBox`}>
			<Text className="text-lg font-semibold text-gray-900">Access Request</Text>

			<Text className="text-sm text-gray-600">
				A deactivated user is requesting access to ThoughtBox:
			</Text>

			<div className="my-4 rounded-md border border-amber-200 bg-amber-50 p-4">
				<Text className="m-0 text-sm font-medium text-gray-900">{requesterName}</Text>
				<Text className="m-0 mt-1 text-sm text-gray-600">{requesterEmail}</Text>
				{requesterJobTitle && (
					<Text className="m-0 mt-1 text-sm text-gray-600">{requesterJobTitle}</Text>
				)}
				{requesterDepartment && (
					<Text className="m-0 mt-1 text-sm text-gray-600">{requesterDepartment}</Text>
				)}
			</div>

			<Text className="text-sm text-gray-600">
				Their account is currently deactivated. To reactivate, visit the Users page in admin
				settings.
			</Text>

			<Button
				href={adminUsersUrl}
				className="mt-2 rounded-md bg-[#1e3a5f] px-6 py-3 text-sm font-medium text-white"
			>
				View Users
			</Button>
		</EmailLayout>
	);
}
