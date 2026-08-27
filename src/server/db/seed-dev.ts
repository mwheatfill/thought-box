import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { DEV_PERSONAS } from "../lib/dev-personas";
import { calculateSlaDueDate } from "../lib/sla";
import { categories, categoryContributors, ideaEvents, ideas, users } from "./schema";

/**
 * Dev/UAT seed: the four test personas (matching DEV_PERSONAS) + a realistic
 * spread of ideas across categories, statuses, and SLA states so the dashboards,
 * queues, and the idea_report view look populated. Run AFTER `pnpm db:seed`
 * (which creates the categories/settings/admin users this script looks up).
 *
 * Personas use `@localhost` emails so their notifications never deliver to a real
 * person — and submitter/owner attribution stays inside the test set.
 */

// Derived from the persona switcher's list — one source of truth for both.
const PERSONAS = DEV_PERSONAS.map(({ entraId, displayName, email, role }) => ({
	entraId,
	displayName,
	email,
	role,
}));

// Persona who owns the demo category + the contributor on its roster.
const OWNER_PERSONA = "dev-owner-1";
const CONTRIBUTOR_PERSONA = "dev-contributor-1";
const DEMO_CATEGORY = "Technology";

type Status = "new" | "under_review" | "accepted" | "declined";

interface IdeaSpec {
	title: string;
	description: string;
	category: string;
	impactArea: "cost" | "time" | "safety" | "customer" | "culture";
	status: Status;
	submitter: string; // persona entraId
	submittedDaysAgo: number;
	reviewedDaysAgo?: number; // when it first moved to under_review
	closedDaysAgo?: number; // for accepted/declined
	assignTo?: string; // persona entraId of an assigned reviewer (else derives to owner)
}

const IDEA_SPECS: IdeaSpec[] = [
	{
		title: "Self-service PTO balance in the mobile app",
		description: "Let employees check their PTO balance from the staff app instead of emailing HR.",
		category: "Employee Experience",
		impactArea: "time",
		status: "accepted",
		submitter: "dev-submitter-1",
		submittedDaysAgo: 48,
		reviewedDaysAgo: 45,
		closedDaysAgo: 30,
	},
	{
		title: "Auto-route fraud alerts to on-call analyst",
		description:
			"Fraud alerts currently sit in a shared inbox overnight. Route them to the on-call analyst's phone.",
		category: "Safety & Security",
		impactArea: "safety",
		status: "under_review",
		submitter: "dev-submitter-1",
		submittedDaysAgo: 22,
		reviewedDaysAgo: 18,
	},
	{
		title: "Consolidate the three loan-status spreadsheets",
		description:
			"Three teams keep overlapping loan-status spreadsheets. One shared source would cut rework.",
		category: "Process Improvement",
		impactArea: "time",
		status: "under_review",
		submitter: "dev-contributor-1",
		submittedDaysAgo: 19,
		reviewedDaysAgo: 12,
	},
	{
		title: "Branch tablet kiosks for member check-in",
		description: "A check-in kiosk would shorten lobby waits during peak hours.",
		category: "Member Experience",
		impactArea: "customer",
		status: "new",
		submitter: "dev-submitter-1",
		submittedDaysAgo: 3,
	},
	{
		title: "Dark mode for the teller terminal",
		description: "Tellers on the late shift asked for a dark theme to reduce eye strain.",
		category: "Technology",
		impactArea: "culture",
		status: "new",
		submitter: "dev-submitter-1",
		submittedDaysAgo: 2,
		assignTo: "dev-contributor-1",
	},
	{
		title: "Negotiate bulk pricing on shred bins",
		description: "Each branch contracts shredding separately. A single contract should save ~15%.",
		category: "Cost Savings",
		impactArea: "cost",
		status: "accepted",
		submitter: "dev-submitter-1",
		submittedDaysAgo: 40,
		reviewedDaysAgo: 36,
		closedDaysAgo: 21,
	},
	{
		title: "Standing desks in the contact center",
		description: "Contact-center staff requested sit/stand desks for ergonomics.",
		category: "Employee Experience",
		impactArea: "culture",
		status: "declined",
		submitter: "dev-contributor-1",
		submittedDaysAgo: 55,
		reviewedDaysAgo: 50,
		closedDaysAgo: 33,
	},
	{
		title: "Reuse paper for internal printing",
		description: "Set internal printers to draft/duplex by default to cut paper use.",
		category: "Cost Savings",
		impactArea: "cost",
		status: "new",
		submitter: "dev-submitter-1",
		submittedDaysAgo: 6,
	},
	{
		title: "SMS appointment reminders for loan closings",
		description: "No-shows at closings could drop with a same-day SMS reminder.",
		category: "Member Experience",
		impactArea: "customer",
		status: "under_review",
		submitter: "dev-submitter-1",
		submittedDaysAgo: 14,
		reviewedDaysAgo: 9,
		assignTo: "dev-contributor-1",
	},
	{
		title: "Single sign-on for the training portal",
		description: "The training portal needs a separate login. SSO would lift completion rates.",
		category: "Technology",
		impactArea: "time",
		status: "under_review",
		submitter: "dev-contributor-1",
		submittedDaysAgo: 11,
		reviewedDaysAgo: 7,
	},
	{
		title: "Quarterly shred-day for members",
		description: "A member shred event builds goodwill and foot traffic.",
		category: "Member Experience",
		impactArea: "customer",
		status: "new",
		submitter: "dev-submitter-1",
		submittedDaysAgo: 1,
	},
	{
		title: "Phishing-report button in Outlook",
		description: "A one-click report button would speed up phishing triage.",
		category: "Safety & Security",
		impactArea: "safety",
		status: "accepted",
		submitter: "dev-contributor-1",
		submittedDaysAgo: 35,
		reviewedDaysAgo: 31,
		closedDaysAgo: 16,
	},
	{
		title: "Pre-fill member info on the call screen",
		description: "Agents retype member info every call. Pre-fill from the CRM.",
		category: "Technology",
		impactArea: "time",
		status: "new",
		submitter: "dev-submitter-1",
		submittedDaysAgo: 4,
	},
	{
		title: "Bilingual signage in high-traffic branches",
		description: "Spanish-language signage would better serve several branch communities.",
		category: "Member Experience",
		impactArea: "customer",
		status: "under_review",
		submitter: "dev-submitter-1",
		submittedDaysAgo: 17,
		reviewedDaysAgo: 10,
	},
	{
		title: "Cross-train tellers on new-account opening",
		description: "Cross-training would smooth coverage during call-outs.",
		category: "Process Improvement",
		impactArea: "time",
		status: "new",
		submitter: "dev-contributor-1",
		submittedDaysAgo: 8,
	},
];

function daysAgo(n: number): Date {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return d;
}

async function seedDev() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) throw new Error("DATABASE_URL is required");
	const sql = postgres(connectionString, { max: 1 });
	const db = drizzle(sql);

	console.log("Seeding dev/UAT data...");

	// 1. Personas (idempotent by entraId).
	for (const p of PERSONAS) {
		await db
			.insert(users)
			.values({
				entraId: p.entraId,
				email: p.email,
				displayName: p.displayName,
				role: p.role,
				source: "login",
				firstSeen: new Date(),
			})
			.onConflictDoNothing({ target: users.entraId });
	}
	const personaIds = new Map<string, string>();
	for (const p of PERSONAS) {
		const [u] = await db.select({ id: users.id }).from(users).where(eq(users.entraId, p.entraId));
		if (u) personaIds.set(p.entraId, u.id);
	}
	console.log("  ✓ Personas seeded");

	// 2. Give the owner persona a dedicated category + put the contributor on its roster.
	const ownerId = personaIds.get(OWNER_PERSONA);
	const contributorId = personaIds.get(CONTRIBUTOR_PERSONA);
	const [demoCat] = await db
		.select({ id: categories.id })
		.from(categories)
		.where(eq(categories.name, DEMO_CATEGORY));
	if (!demoCat)
		throw new Error(`Run \`pnpm db:seed\` first — category "${DEMO_CATEGORY}" not found.`);
	if (ownerId) {
		await db.update(categories).set({ ownerId }).where(eq(categories.id, demoCat.id));
	}
	if (contributorId) {
		await db
			.insert(categoryContributors)
			.values({ categoryId: demoCat.id, userId: contributorId })
			.onConflictDoNothing();
	}
	console.log(`  ✓ ${DEMO_CATEGORY} owned by owner persona, contributor on its roster`);

	// 3. Idea spread. High submission IDs (TB-9xxx) so they never collide with the
	//    live sequence (which starts at TB-0001 for tester-submitted ideas).
	const catByName = new Map<string, string>();
	for (const c of await db.select({ id: categories.id, name: categories.name }).from(categories)) {
		catByName.set(c.name, c.id);
	}

	let seq = 9001;
	let inserted = 0;
	for (const spec of IDEA_SPECS) {
		const categoryId = catByName.get(spec.category);
		const submitterId = personaIds.get(spec.submitter);
		if (!categoryId || !submitterId) continue;

		const submissionId = `TB-${seq++}`;
		// Skip if an idea with this submissionId already exists (re-run safe).
		const [exists] = await db
			.select({ id: ideas.id })
			.from(ideas)
			.where(eq(ideas.submissionId, submissionId));
		if (exists) continue;

		const submittedAt = daysAgo(spec.submittedDaysAgo);
		const closedAt = spec.closedDaysAgo != null ? daysAgo(spec.closedDaysAgo) : null;
		const assignedReviewerId = spec.assignTo ? (personaIds.get(spec.assignTo) ?? null) : null;
		const reviewed = spec.status !== "new";

		const [idea] = await db
			.insert(ideas)
			.values({
				submissionId,
				title: spec.title,
				description: spec.description,
				categoryId,
				impactArea: spec.impactArea,
				status: spec.status,
				submitterId,
				assignedReviewerId,
				hasBeenReviewed: reviewed,
				slaDueDate: calculateSlaDueDate(submittedAt),
				closureSlaDueDate: calculateSlaDueDate(submittedAt, 30),
				slaStartedAt: submittedAt,
				submittedAt,
				closedAt,
				declineReason: spec.status === "declined" ? "not_feasible" : null,
			})
			.returning();

		// Events so the activity timeline + idea_report durations populate.
		const events: (typeof ideaEvents.$inferInsert)[] = [
			{
				ideaId: idea.id,
				eventType: "created",
				actorId: submitterId,
				newValue: "new",
				createdAt: submittedAt,
			},
		];
		const reviewerId = assignedReviewerId ?? ownerId ?? submitterId;
		if (spec.reviewedDaysAgo != null) {
			events.push({
				ideaId: idea.id,
				eventType: "status_changed",
				actorId: reviewerId,
				oldValue: "new",
				newValue: "under_review",
				createdAt: daysAgo(spec.reviewedDaysAgo),
			});
		}
		if (closedAt) {
			events.push({
				ideaId: idea.id,
				eventType: "status_changed",
				actorId: ownerId ?? reviewerId,
				oldValue: "under_review",
				newValue: spec.status,
				createdAt: closedAt,
			});
		}
		await db.insert(ideaEvents).values(events);
		inserted++;
	}
	console.log(`  ✓ ${inserted} ideas seeded`);

	await sql.end();
	console.log("Dev seed complete.");
}

seedDev().catch((err) => {
	console.error("Dev seed failed:", err);
	process.exit(1);
});
