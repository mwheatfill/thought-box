import { Hr, Text } from "@react-email/components";
import {
	EmailLayout,
	HeroIcon,
	IdeaCard,
	PrimaryButton,
	QuoteBlock,
	StepCard,
} from "./components/EmailLayout";

interface StatusChangedProps {
	submitterFirstName: string;
	submissionId: string;
	ideaTitle: string;
	newStatus: "under_review" | "accepted" | "declined";
	leaderFirstName: string;
	leaderNotes: string | null;
	rejectionReason: string | null;
	viewUrl: string;
}

const STATUS_CONFIG = {
	under_review: {
		accent: "#3b82f6",
		iconBg: "#dbeafe",
		iconColor: "#3b82f6",
		icon: "◎",
		headline: "Your idea is being reviewed",
		body: "A leader is looking into your idea. You'll hear back once a decision has been made.",
		preview: (title: string) => `Your idea is being reviewed: ${title}`,
	},
	accepted: {
		accent: "#16a34a",
		iconBg: "#dcfce7",
		iconColor: "#16a34a",
		icon: "✓",
		headline: "Your idea is moving forward!",
		body: "Great news — your idea has been accepted.",
		preview: (title: string) => `Your idea has been accepted: ${title}`,
	},
	declined: {
		accent: "#9ca3af",
		iconBg: "#f3f4f6",
		iconColor: "#6b7280",
		icon: "—",
		headline: "Update on your idea",
		body: "After careful review, your idea won't be moving forward at this time.",
		preview: (title: string) => `Update on your idea: ${title}`,
	},
};

const REJECTION_LABELS: Record<string, string> = {
	already_in_progress: "This is already in progress",
	not_feasible: "Not feasible at this time",
	not_aligned: "Not aligned with current priorities",
	not_thoughtbox: "Not a ThoughtBox idea",
};

export default function StatusChanged({
	submitterFirstName = "Alex",
	submissionId = "TB-0001",
	ideaTitle = "Add dark mode toggle to mobile app",
	newStatus = "accepted",
	leaderFirstName = "Michelle",
	leaderNotes = "This is a great idea! We'll be adding this to the Q3 roadmap.",
	rejectionReason = null,
	viewUrl = "https://thoughtbox.desertfinancial.com/ideas/TB-0001",
}: StatusChangedProps) {
	const config = STATUS_CONFIG[newStatus];

	return (
		<EmailLayout preview={config.preview(ideaTitle)} accentColor={config.accent}>
			<HeroIcon bgColor={config.iconBg} color={config.iconColor}>
				{config.icon}
			</HeroIcon>

			<Text className="m-0 text-center text-xl font-bold text-gray-900">{config.headline}</Text>

			<Text className="m-0 mt-2 text-center text-sm text-gray-500">
				Hi {submitterFirstName}, {config.body}
			</Text>

			<IdeaCard submissionId={submissionId} title={ideaTitle} />

			{newStatus === "declined" && rejectionReason && (
				<div
					style={{
						backgroundColor: "#f9fafb",
						borderRadius: 8,
						padding: "12px 16px",
						margin: "0 0 12px",
					}}
				>
					<Text className="m-0 text-[11px] font-semibold text-gray-400">REASON</Text>
					<Text className="m-0 mt-1 text-sm font-medium text-gray-700">
						{REJECTION_LABELS[rejectionReason] ?? rejectionReason}
					</Text>
				</div>
			)}

			{leaderNotes && <QuoteBlock label={`Note from ${leaderFirstName}`}>{leaderNotes}</QuoteBlock>}

			{newStatus === "accepted" && (
				<>
					<Hr className="my-1 border-gray-100" />
					<Text
						className="m-0 text-center"
						style={{
							fontSize: 10,
							fontWeight: 700,
							letterSpacing: "0.1em",
							textTransform: "uppercase" as const,
							color: "#9ca3af",
							margin: "16px 0",
						}}
					>
						What happens next
					</Text>
					<StepCard
						icon="✓"
						iconBg="#dcfce7"
						iconColor="#16a34a"
						title="Implementation planning"
						description="Your idea will be evaluated for scope and timeline"
					/>
					<StepCard
						icon="★"
						iconBg="#dbeafe"
						iconColor="#3b82f6"
						title="You'll stay in the loop"
						description="We'll keep you updated as things progress"
					/>
				</>
			)}

			{newStatus === "declined" && (
				<Text className="m-0 mt-2 text-center text-xs text-gray-400">
					Every idea matters — we'd love to hear your next one.
				</Text>
			)}

			<PrimaryButton href={viewUrl}>View Idea →</PrimaryButton>
		</EmailLayout>
	);
}
