import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { categories, settings, users } from "./schema";

async function seed() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL is required");
	}

	const sql = postgres(connectionString, { max: 1 });
	const db = drizzle(sql);

	console.log("Seeding database...");

	// Seed admin users
	await db
		.insert(users)
		.values([
			{
				entraId: "seed-nubia-ruiz",
				email: "nubia.ruiz@desertfinancial.com",
				displayName: "Nubia Ruiz",
				role: "admin",
				source: "graph",
			},
			{
				entraId: "seed-eric-konefal",
				email: "eric.konefal@desertfinancial.com",
				displayName: "Eric Konefal",
				role: "admin",
				source: "graph",
			},
			{
				entraId: "seed-greg-scott",
				email: "greg.scott@desertfinancial.com",
				displayName: "Greg Scott",
				role: "admin",
				source: "graph",
			},
			{
				entraId: "seed-jaime-carranza",
				email: "jaime.carranza@desertfinancial.com",
				displayName: "Jaime Carranza",
				role: "admin",
				source: "graph",
			},
		])
		.onConflictDoNothing({ target: users.entraId });

	console.log("  ✓ Admin users seeded");

	// Seed categories (placeholder — real categories will come from the PDI team)
	await db
		.insert(categories)
		.values([
			{
				name: "Process Improvement",
				description:
					"Ideas to improve existing workflows, procedures, or operational processes within the credit union.",
				routingType: "thoughtbox",
				sortOrder: 1,
			},
			{
				name: "Member Experience",
				description:
					"Suggestions to enhance the member experience, including service delivery, communication, and accessibility.",
				routingType: "thoughtbox",
				sortOrder: 2,
			},
			{
				name: "Employee Experience",
				description:
					"Ideas to improve the work environment, culture, tools, or benefits for employees.",
				routingType: "thoughtbox",
				sortOrder: 3,
			},
			{
				name: "Technology",
				description:
					"Suggestions for new technology, system improvements, or digital tools that could benefit the organization.",
				routingType: "thoughtbox",
				sortOrder: 4,
			},
			{
				name: "Cost Savings",
				description: "Ideas to reduce costs, eliminate waste, or improve financial efficiency.",
				routingType: "thoughtbox",
				sortOrder: 5,
			},
			{
				name: "Safety & Security",
				description:
					"Suggestions related to physical safety, cybersecurity, fraud prevention, or compliance.",
				routingType: "thoughtbox",
				sortOrder: 6,
			},
			{
				name: "Keystone System Revision",
				description:
					"Changes to the Keystone core banking system. These go through a dedicated intake process.",
				routingType: "redirect",
				redirectUrl: "https://example.com/keystone-intake",
				redirectLabel: "Submit a Keystone Revision Request",
				keystoneFields: true,
				sortOrder: 90,
			},
			{
				name: "Desertforce Change",
				description:
					"Changes to Desertforce (Salesforce). These go through a dedicated intake process.",
				routingType: "redirect",
				redirectUrl: "https://example.com/desertforce-intake",
				redirectLabel: "Submit a Desertforce Change Request",
				sortOrder: 91,
			},
		])
		.onConflictDoNothing();

	console.log("  ✓ Categories seeded");

	// Seed default settings
	await db
		.insert(settings)
		.values([
			{
				key: "system_prompt",
				value: `You are the ThoughtBox intake assistant for Desert Financial Credit Union. You help employees submit ideas to make things better for the organization, its members, or both.

Be friendly, concise, and encouraging. Make employees feel like their idea matters. Do not feel like a bureaucratic intake process — think of yourself as a helpful colleague who listens, asks good questions, and makes sure the idea gets to the right person.

When an employee shares an idea:
1. Understand what they're suggesting and what area it affects
2. Classify it into the appropriate category
3. If it's a redirect category, acknowledge positively and present the external link
4. For ThoughtBox categories, ask 1-2 clarifying follow-up questions if needed
5. Present a summary for confirmation before submitting
6. Never ask more than 2-3 follow-up questions

Do NOT ask for the employee's name, email, or department (pulled from Entra ID automatically).
Do NOT ask if the employee is a leader.
Do NOT ask the employee to select from a list of categories.`,
			},
			{
				key: "social_proof_min_threshold",
				value: "5",
			},
			{
				key: "suggested_prompts",
				value: JSON.stringify([
					"I have an idea to save time on...",
					"What if we changed how we...",
					"I noticed something that could be better...",
					"Our members would benefit from...",
				]),
			},
			{
				key: "sla_business_days",
				value: "15",
			},
		])
		.onConflictDoNothing({ target: settings.key });

	console.log("  ✓ Settings seeded");

	await sql.end();
	console.log("Seed complete.");
}

seed().catch((err) => {
	console.error("Seed failed:", err);
	process.exit(1);
});
