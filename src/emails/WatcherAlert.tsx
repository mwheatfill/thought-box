import { Text } from "@react-email/components";
import { EmailLayout, HeroIcon, PrimaryButton } from "./components/EmailLayout";

interface WatcherAlertProps {
	submissionId: string;
	ideaTitle: string;
	ideaDescription: string;
	categoryName: string;
	submitterName: string;
	submitterDepartment: string | null;
	assignedLeaderName: string | null;
	viewUrl: string;
}

export default function WatcherAlert({
	submissionId = "TB-0001",
	ideaTitle = "Add dark mode toggle to mobile app",
	ideaDescription = "Add a dark mode toggle feature to the member-facing mobile app to give members more control over their experience.",
	categoryName = "Member Experience",
	submitterName = "Sean St Onge",
	submitterDepartment = "Digital Banking",
	assignedLeaderName = "Michelle Murray",
	viewUrl = "https://thoughtbox.desertfinancial.com/ideas/TB-0001",
}: WatcherAlertProps) {
	const truncatedDescription =
		ideaDescription.length > 200 ? `${ideaDescription.slice(0, 200)}...` : ideaDescription;

	return (
		<EmailLayout preview={`New ThoughtBox idea: ${ideaTitle}`} accentColor="#6366f1">
			<HeroIcon bgColor="#e0e7ff" color="#6366f1">
				{"★"}
			</HeroIcon>

			<Text className="m-0 text-center text-xl font-bold text-gray-900">New Idea Submitted</Text>

			{/* Idea card with description */}
			<div
				style={{
					border: "1px solid #e5e7eb",
					borderRadius: 8,
					padding: "14px 16px",
					margin: "16px 0",
				}}
			>
				<Text className="m-0 text-xs font-bold" style={{ color: "#3b82f6" }}>
					{submissionId} · {categoryName}
				</Text>
				<Text className="m-0 mt-1 text-sm font-semibold text-gray-900">{ideaTitle}</Text>
				<Text className="m-0 mt-2 text-xs leading-5 text-gray-500">{truncatedDescription}</Text>
			</div>

			{/* Metadata */}
			<div
				style={{
					backgroundColor: "#f9fafb",
					borderRadius: 8,
					padding: "12px 16px",
					margin: "0 0 8px",
				}}
			>
				<table cellPadding="0" cellSpacing="0" role="presentation" width="100%">
					<tbody>
						<tr>
							<td style={{ width: 80 }}>
								<Text className="m-0 text-[11px] font-semibold text-gray-400">Submitted by</Text>
							</td>
							<td>
								<Text className="m-0 text-xs font-medium text-gray-700">
									{submitterName}
									{submitterDepartment ? `, ${submitterDepartment}` : ""}
								</Text>
							</td>
						</tr>
						{assignedLeaderName && (
							<tr>
								<td style={{ width: 80, paddingTop: 4 }}>
									<Text className="m-0 text-[11px] font-semibold text-gray-400">Assigned to</Text>
								</td>
								<td style={{ paddingTop: 4 }}>
									<Text className="m-0 text-xs font-medium text-gray-700">
										{assignedLeaderName}
									</Text>
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			<PrimaryButton href={viewUrl}>View Idea →</PrimaryButton>
		</EmailLayout>
	);
}
