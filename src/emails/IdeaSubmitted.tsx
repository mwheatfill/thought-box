import { Hr, Text } from "@react-email/components";
import { EmailLayout, HeroIcon, IdeaCard, SectionLabel, StepCard } from "./components/EmailLayout";

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
	const baseUrl = viewUrl.replace(/\/ideas\/.*$/, "");

	return (
		<EmailLayout preview={`Your idea has been submitted: ${ideaTitle}`} accentColor="#16a34a">
			{/* Hero */}
			<HeroIcon bgColor="#dcfce7" color="#16a34a">
				{"✓"}
			</HeroIcon>

			<Text className="m-0 text-center text-xl font-bold text-gray-900">
				Thank you, {submitterFirstName}!
			</Text>

			<Text className="m-0 mt-2 text-center text-sm text-gray-500">
				Your idea has been assigned to the <strong className="text-gray-700">{categoryName}</strong>{" "}
				category for review.
			</Text>

			{/* Idea card */}
			<IdeaCard submissionId={submissionId} title={ideaTitle} />

			{/* What happens next */}
			<Hr className="my-1 border-gray-100" />
			<SectionLabel>What happens next</SectionLabel>

			<StepCard
				icon="→"
				iconBg="#dbeafe"
				iconColor="#3b82f6"
				title="Assigned for review"
				description="A category leader will review your idea"
			/>
			<StepCard
				icon="✉"
				iconBg="#fef3c7"
				iconColor="#d97706"
				title="They may follow up"
				description="You might hear from them with questions or next steps"
			/>
			<StepCard
				icon="★"
				iconBg="#dcfce7"
				iconColor="#16a34a"
				title="You'll stay in the loop"
				description="We'll notify you as your idea moves forward"
			/>

			{/* Idea count */}
			<Text className="m-0 mt-4 text-center text-xs text-gray-400">
				{ideaCount === 1
					? "Your first idea! Welcome to ThoughtBox."
					: `That's your ${ordinal(ideaCount)} idea this year. Thanks for making Desert Financial better.`}
			</Text>

			{/* Attachments prompt */}
			<Text className="m-0 mt-4 text-center text-xs text-gray-500">
				Have supporting files? You can attach images, PDFs, and documents from your idea page.
			</Text>

			{/* CTA buttons */}
			<table
				cellPadding="0"
				cellSpacing="0"
				role="presentation"
				width="100%"
				style={{ marginTop: 20 }}
			>
				<tbody>
					<tr>
						<td style={{ paddingRight: 6, width: "50%" }}>
							{/* biome-ignore lint/a11y/useValidAnchor: email template */}
							<a
								href={viewUrl}
								style={{
									display: "block",
									textAlign: "center" as const,
									backgroundColor: "#3b82f6",
									color: "#ffffff",
									borderRadius: 8,
									padding: "12px 0",
									fontSize: 14,
									fontWeight: 600,
									textDecoration: "none",
								}}
							>
								View Idea →
							</a>
						</td>
						<td style={{ paddingLeft: 6, width: "50%" }}>
							{/* biome-ignore lint/a11y/useValidAnchor: email template */}
							<a
								href={baseUrl}
								style={{
									display: "block",
									textAlign: "center" as const,
									backgroundColor: "#ffffff",
									color: "#374151",
									borderRadius: 8,
									padding: "11px 0",
									fontSize: 14,
									fontWeight: 600,
									textDecoration: "none",
									border: "1px solid #d1d5db",
								}}
							>
								+ Submit Another
							</a>
						</td>
					</tr>
				</tbody>
			</table>
		</EmailLayout>
	);
}

function ordinal(n: number): string {
	const s = ["th", "st", "nd", "rd"];
	const v = n % 100;
	return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
