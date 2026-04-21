import {
	Body,
	Container,
	Head,
	Hr,
	Html,
	Img,
	Preview,
	Section,
	Text,
} from "@react-email/components";
import { Tailwind } from "@react-email/tailwind";

interface EmailLayoutProps {
	preview: string;
	accentColor?: string;
	children: React.ReactNode;
}

export function EmailLayout({ preview, accentColor = "#3b82f6", children }: EmailLayoutProps) {
	return (
		<Html>
			<Head />
			<Preview>{preview}</Preview>
			<Tailwind>
				<Body className="bg-gray-100 font-sans">
					<Container className="mx-auto max-w-[560px] py-8">
						{/* Accent bar */}
						<Section
							style={{
								height: "4px",
								backgroundColor: accentColor,
								borderRadius: "8px 8px 0 0",
							}}
						/>

						{/* Main card */}
						<Section className="bg-white px-8 pt-6 pb-8" style={{ borderRadius: "0 0 8px 8px" }}>
							{/* Brand */}
							<Img
								src="https://thoughtbox.desertfinancial.com/logo.png"
								alt="Desert Financial"
								width="140"
								height="53"
								style={{ margin: "0 auto 8px" }}
							/>
							<Text className="m-0 text-center text-sm font-bold tracking-tight text-gray-800">
								ThoughtBox
							</Text>

							<Hr className="my-5 border-gray-100" />

							{children}
						</Section>

						{/* Footer */}
						<Section className="px-4 py-6">
							<Text className="m-0 text-center text-[11px] leading-5 text-gray-400">
								This is an automated message from ThoughtBox. Please do not reply.
								<br />
								Desert Financial Credit Union
							</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

/** Centered hero icon circle */
export function HeroIcon({
	children,
	bgColor,
	color,
}: {
	children: string;
	bgColor: string;
	color: string;
}) {
	return (
		<table cellPadding="0" cellSpacing="0" role="presentation" style={{ margin: "0 auto 16px" }}>
			<tbody>
				<tr>
					<td
						style={{
							width: 56,
							height: 56,
							borderRadius: 28,
							backgroundColor: bgColor,
							textAlign: "center" as const,
							fontSize: 28,
							lineHeight: "56px",
							color,
						}}
					>
						{children}
					</td>
				</tr>
			</tbody>
		</table>
	);
}

/** Styled idea reference card */
export function IdeaCard({
	submissionId,
	title,
	meta,
}: {
	submissionId: string;
	title: string;
	meta?: string;
}) {
	return (
		<div
			style={{
				border: "1px solid #e5e7eb",
				borderRadius: 8,
				padding: "14px 16px",
				margin: "16px 0",
			}}
		>
			<Text className="m-0 text-xs font-bold" style={{ color: "#3b82f6" }}>
				{submissionId}
			</Text>
			<Text className="m-0 mt-1 text-sm font-semibold text-gray-900">{title}</Text>
			{meta && <Text className="m-0 mt-1 text-xs text-gray-500">{meta}</Text>}
		</div>
	);
}

/** Step card with icon, title, description */
export function StepCard({
	icon,
	iconBg,
	iconColor,
	title,
	description,
}: {
	icon: string;
	iconBg: string;
	iconColor: string;
	title: string;
	description: string;
}) {
	return (
		<div
			style={{
				border: "1px solid #e5e7eb",
				borderRadius: 8,
				padding: "12px 14px",
				marginBottom: 8,
			}}
		>
			<table cellPadding="0" cellSpacing="0" role="presentation" width="100%">
				<tbody>
					<tr>
						<td style={{ width: 38, verticalAlign: "top" }}>
							<div
								style={{
									width: 28,
									height: 28,
									borderRadius: 14,
									backgroundColor: iconBg,
									textAlign: "center" as const,
									lineHeight: "28px",
									fontSize: 14,
									color: iconColor,
								}}
							>
								{icon}
							</div>
						</td>
						<td style={{ verticalAlign: "top", paddingLeft: 10 }}>
							<Text className="m-0 text-sm font-semibold text-gray-900">{title}</Text>
							<Text className="m-0 mt-0.5 text-xs text-gray-500">{description}</Text>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	);
}

/** Primary CTA button */
export function PrimaryButton({
	href,
	children,
}: {
	href: string;
	children: React.ReactNode;
}) {
	return (
		<table cellPadding="0" cellSpacing="0" role="presentation" width="100%">
			<tbody>
				<tr>
					<td align="center" style={{ paddingTop: 8 }}>
						{/* biome-ignore lint/a11y/useValidAnchor: email template */}
						<a
							href={href}
							style={{
								display: "inline-block",
								backgroundColor: "#3b82f6",
								color: "#ffffff",
								borderRadius: 8,
								padding: "12px 32px",
								fontSize: 14,
								fontWeight: 600,
								textDecoration: "none",
							}}
						>
							{children}
						</a>
					</td>
				</tr>
			</tbody>
		</table>
	);
}

/** Quoted block with left accent border */
export function QuoteBlock({
	label,
	children,
	borderColor = "#3b82f6",
}: {
	label?: string;
	children: React.ReactNode;
	borderColor?: string;
}) {
	return (
		<div
			style={{
				borderLeft: `3px solid ${borderColor}`,
				paddingLeft: 14,
				margin: "16px 0",
			}}
		>
			{label && <Text className="m-0 text-[11px] font-semibold text-gray-400">{label}</Text>}
			<Text className="m-0 mt-1 text-sm text-gray-700">{children}</Text>
		</div>
	);
}
