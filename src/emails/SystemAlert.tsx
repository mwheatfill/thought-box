import { Text } from "@react-email/components";
import { EmailLayout, HeroIcon } from "./components/EmailLayout";

interface SystemAlertProps {
	variant: "alert" | "recovered";
	title: string;
	message: string;
	details?: string | null;
}

export default function SystemAlert({
	variant = "alert",
	title = "AI assistant is failing",
	message = "The ThoughtBox AI chat has failed 3 health checks in a row. Employees who try the chat will be offered the fallback form.",
	details = "AI_APICallError: Your credit balance is too low to access the Anthropic API.",
}: SystemAlertProps) {
	const accent = variant === "recovered" ? "#10b981" : "#ef4444";
	const iconBg = variant === "recovered" ? "#d1fae5" : "#fee2e2";

	return (
		<EmailLayout preview={title} accentColor={accent}>
			<HeroIcon bgColor={iconBg} color={accent}>
				{variant === "recovered" ? "✓" : "!"}
			</HeroIcon>

			<Text className="m-0 text-center text-xl font-bold text-gray-900">{title}</Text>

			<Text className="m-0 mt-3 text-center text-sm leading-6 text-gray-600">{message}</Text>

			{details && (
				<div
					style={{
						backgroundColor: "#f9fafb",
						border: "1px solid #e5e7eb",
						borderRadius: 8,
						padding: "12px 16px",
						margin: "16px 0 0",
					}}
				>
					<Text className="m-0 font-mono text-xs leading-5 text-gray-600">{details}</Text>
				</div>
			)}
		</EmailLayout>
	);
}
