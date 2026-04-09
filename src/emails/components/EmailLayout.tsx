import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";
import { Tailwind } from "@react-email/tailwind";

interface EmailLayoutProps {
	preview: string;
	children: React.ReactNode;
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
	return (
		<Html>
			<Head />
			<Preview>{preview}</Preview>
			<Tailwind>
				<Body className="bg-gray-50 font-sans">
					<Container className="mx-auto max-w-[560px] py-8">
						{/* Header */}
						<Section className="rounded-t-lg bg-[#1e3a5f] px-8 py-6">
							<Text className="m-0 text-xl font-bold text-white">ThoughtBox</Text>
							<Text className="m-0 mt-1 text-sm text-blue-200">Desert Financial Credit Union</Text>
						</Section>

						{/* Body */}
						<Section className="rounded-b-lg border border-t-0 border-gray-200 bg-white px-8 py-6">
							{children}
						</Section>

						{/* Footer */}
						<Section className="px-8 py-4">
							<Hr className="border-gray-200" />
							<Text className="mt-4 text-center text-xs text-gray-400">
								This is an automated message from ThoughtBox. Please do not reply to this email.
							</Text>
							<Text className="mt-1 text-center text-xs text-gray-400">
								Desert Financial Credit Union
							</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}
