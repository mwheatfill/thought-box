import { Text } from "@react-email/components";
import { EmailLayout, HeroIcon, IdeaCard, PrimaryButton } from "./components/EmailLayout";

interface CategoryRoleGrantedProps {
	recipientFirstName: string;
	categoryName: string;
	/** "owner" → now accountable for the category; "contributor" → can be assigned its ideas. */
	kind: "owner" | "contributor";
	/** Open-idea count (owner grants only — gives them a sense of the workload). */
	openIdeaCount: number | null;
	grantedByName: string;
	viewUrl: string;
}

export default function CategoryRoleGranted({
	recipientFirstName = "Alex",
	categoryName = "Member Experience",
	kind = "owner",
	openIdeaCount = 4,
	grantedByName = "Jordan Lee",
	viewUrl = "https://thoughtbox.desertfinancial.com/my-categories",
}: CategoryRoleGrantedProps) {
	const isOwner = kind === "owner";
	const headline = isOwner ? `You now own ${categoryName}` : `You're now watching ${categoryName}`;
	const body = isOwner
		? `${grantedByName} made you the owner of the ${categoryName} category. You're now accountable for its ideas and their SLAs.`
		: `${grantedByName} added you as a watcher on ${categoryName}. You'll get updates on its ideas, and you can add owner notes and message submitters.`;

	return (
		<EmailLayout preview={headline} accentColor="#3b82f6">
			<HeroIcon bgColor="#dbeafe" color="#3b82f6">
				{isOwner ? "★" : "+"}
			</HeroIcon>

			<Text className="m-0 text-center text-xl font-bold text-gray-900">{headline}</Text>

			<Text className="m-0 mt-2 text-center text-sm text-gray-500">
				Hi {recipientFirstName}, {body}
			</Text>

			{isOwner && openIdeaCount !== null && (
				<IdeaCard
					submissionId={categoryName}
					title={`${openIdeaCount} open ${openIdeaCount === 1 ? "idea" : "ideas"} to review`}
					meta="Open the category to manage your team and queue"
				/>
			)}

			<PrimaryButton href={viewUrl}>
				{isOwner ? "Go to My Categories →" : "View the category →"}
			</PrimaryButton>
		</EmailLayout>
	);
}
