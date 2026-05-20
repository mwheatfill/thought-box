import { Text } from "@react-email/components";
import { EmailLayout, HeroIcon, IdeaCard, PrimaryButton } from "./components/EmailLayout";

interface IdeaReassignedProps {
	ownerFirstName: string;
	submissionId: string;
	ideaTitle: string;
	categoryName: string;
	submitterName: string;
	reassignedByName: string;
	reasonLabel?: string | null;
	note?: string | null;
	viewUrl: string;
}

export default function IdeaReassigned({
	ownerFirstName = "David",
	submissionId = "TB-0001",
	ideaTitle = "Add dark mode toggle to mobile app",
	categoryName = "Member Experience",
	submitterName = "Sean St Onge",
	reassignedByName = "Michelle Murray",
	reasonLabel = "Internal department reassignment",
	note = "Moving this to your team — you own the mobile roadmap now.",
	viewUrl = "https://thoughtbox.desertfinancial.com/ideas/TB-0001",
}: IdeaReassignedProps) {
	return (
		<EmailLayout preview={`Idea reassigned to you: ${ideaTitle}`} accentColor="#3b82f6">
			<HeroIcon bgColor="#dbeafe" color="#3b82f6">
				{"⇄"}
			</HeroIcon>

			<Text className="m-0 text-center text-xl font-bold text-gray-900">
				Idea reassigned to you, {ownerFirstName}
			</Text>

			<Text className="m-0 mt-2 text-center text-sm text-gray-500">
				{reassignedByName} has reassigned this idea to you for review.
			</Text>

			<IdeaCard
				submissionId={submissionId}
				title={ideaTitle}
				meta={`${categoryName} · Submitted by ${submitterName}`}
			/>

			{reasonLabel && (
				<div
					style={{
						border: "1px solid #e5e7eb",
						borderRadius: 8,
						padding: "14px 16px",
						margin: "16px 0",
						backgroundColor: "#f9fafb",
					}}
				>
					<Text className="m-0 text-xs font-bold uppercase tracking-wide text-gray-500">
						Why this was reassigned
					</Text>
					<Text className="m-0 mt-1 text-sm font-semibold text-gray-900">{reasonLabel}</Text>
					{note && (
						<Text className="m-0 mt-2 text-sm text-gray-700" style={{ whiteSpace: "pre-wrap" }}>
							{note}
						</Text>
					)}
				</div>
			)}

			<Text className="m-0 text-center text-sm font-medium text-gray-700">
				Please review and change status within 5 days.
			</Text>

			<PrimaryButton href={viewUrl}>Review Idea →</PrimaryButton>
		</EmailLayout>
	);
}
