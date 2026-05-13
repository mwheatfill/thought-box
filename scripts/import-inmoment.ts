/**
 * One-off import of historical InMoment Q1+April 2026 cases (119 rows).
 *
 * Decisions locked from the Nubia thread (May 2026):
 *  1. Categories from col E (Nubia's "New Category"). Must already exist in DB.
 *  2. Titles auto-generated from first 80 chars of the suggestion (Option A).
 *  3. submissionId uses IM-<CaseID> (e.g. IM-33417). TB-NNNN stays reserved.
 *  4. Status from col N, rejection reason from col O (Nubia's hand-curated mapping).
 *  5. SLA: reset on open ideas, preserve on closed (Option C).
 *  6. Activity timeline: real created/status_changed events with original dates (Option A).
 *  7. Users matched against DB first, then Graph directory. Unmatched gate the apply phase.
 *
 * Usage:
 *   pnpm tsx scripts/import-inmoment.ts --file <path.xlsx>
 *   pnpm tsx scripts/import-inmoment.ts --file <path.xlsx> --apply
 *   pnpm tsx scripts/import-inmoment.ts --file <path.xlsx> --apply --legacy-user
 *
 * Required env:  DATABASE_URL
 * Optional env (Graph fallback): AZURE_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET
 */

import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import XLSX from "xlsx";
import { db, sql } from "#/server/db";
import { auditLog, categories, ideaEvents, ideas, users } from "#/server/db/schema";
import { searchDirectory } from "#/server/lib/graph";
import { addBusinessDays } from "#/server/lib/sla";

// ── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const fileArgIdx = args.indexOf("--file");
const FILE_PATH = fileArgIdx >= 0 ? args[fileArgIdx + 1] : undefined;
const overridesArgIdx = args.indexOf("--overrides");
const OVERRIDES_PATH = overridesArgIdx >= 0 ? args[overridesArgIdx + 1] : undefined;
const APPLY = args.includes("--apply");
const LEGACY_USER_FALLBACK = args.includes("--legacy-user");

if (!FILE_PATH) {
	console.error("Missing --file <path.xlsx>");
	process.exit(1);
}

// Map of spreadsheet name (lowercased) → email or "LEGACY" sentinel
const OVERRIDES = new Map<string, string>();
if (OVERRIDES_PATH) {
	const raw = JSON.parse(readFileSync(OVERRIDES_PATH, "utf-8")) as Record<string, string>;
	for (const [k, v] of Object.entries(raw)) OVERRIDES.set(k.trim().toLowerCase(), v.trim());
}

// Spreadsheet category name → canonical DB category name. Used when Nubia
// chose a label that doesn't quite match the active DB row (e.g. "Product"
// vs "Products"). Whitespace alone is handled by normalizeCategory(), so
// only put true word-level aliases here.
const CATEGORY_ALIASES = new Map<string, string>([["product / policy", "products / policy"]]);

function normalizeCategory(name: string): string {
	return name.replace(/\s+/g, " ").trim().toLowerCase();
}

// ── Mappings ───────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, "new" | "under_review" | "accepted" | "declined"> = {
	new: "new",
	"under review": "under_review",
	accepted: "accepted",
	declined: "declined",
};

const DECLINE_REASON_MAP: Record<
	string,
	"already_in_progress" | "not_thoughtbox" | "not_feasible" | "not_aligned"
> = {
	"already in progress": "already_in_progress",
	"not a thoughtbox idea": "not_thoughtbox",
	"not feasible/priority at this time": "not_feasible",
	"not aligned to strategy": "not_aligned",
};

// SLA business days for the "new → under review" window.
// Mirrors the live setting; if Nubia tunes it later, closed ideas keep their
// historical due date and open ideas will be calculated against the live value
// inside ThoughtBox's own helpers.
const SLA_BUSINESS_DAYS_DEFAULT = 15;

// ── Source row shape ───────────────────────────────────────────────────────

interface SourceRow {
	rowNum: number; // 1-indexed in the xlsx for error reporting
	caseId: string;
	submissionId: string;
	submittedAt: Date;
	submitterName: string;
	categoryName: string;
	suggestion: string;
	originalOwnerName: string;
	leaderName: string;
	actionTaken: string;
	communicated: string;
	ticketNumber: string;
	researchNotes: string;
	status: "new" | "under_review" | "accepted" | "declined";
	rejectionReason: "already_in_progress" | "not_thoughtbox" | "not_feasible" | "not_aligned" | null;
	closedAt: Date | null;
}

// ── Parse ──────────────────────────────────────────────────────────────────

function parseMdyDate(s: string): Date | null {
	const trimmed = s.trim();
	if (!trimmed) return null;
	const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (!m) return null;
	const [, mm, dd, yyyy] = m;
	// Treat as Phoenix-local (UTC-7, no DST). Store at noon to avoid TZ-edge weirdness.
	const isoLocal = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T12:00:00-07:00`;
	const d = new Date(isoLocal);
	return Number.isNaN(d.getTime()) ? null : d;
}

function autoTitle(suggestion: string): string {
	const cleaned = suggestion.replace(/\s+/g, " ").trim();
	if (cleaned.length <= 80) return cleaned;
	const truncated = cleaned.slice(0, 80);
	const lastSpace = truncated.lastIndexOf(" ");
	const base = lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated;
	return `${base.trim()}…`;
}

function parseXlsx(path: string): SourceRow[] {
	const wb = XLSX.read(readFileSync(path));
	const sheet = wb.Sheets[wb.SheetNames[0]];
	const raw = XLSX.utils.sheet_to_json<string[]>(sheet, {
		header: 1,
		defval: "",
		raw: false,
	});

	// Header is on row 4 (index 3) of the YTD export. Validate it didn't shift.
	const headerRow = raw[3];
	if (!headerRow || headerRow[2] !== "Case ID" || headerRow[4] !== "New Category") {
		throw new Error(
			"Spreadsheet header row not where expected (row 4). Header[2] must be 'Case ID' and Header[4] must be 'New Category'.",
		);
	}

	const out: SourceRow[] = [];
	const errors: string[] = [];

	for (let i = 4; i < raw.length; i++) {
		const r = raw[i];
		if (!r || !r.some((c) => String(c).trim())) continue; // skip blank rows
		const rowNum = i + 1;

		const caseId = String(r[2] ?? "").trim();
		if (!caseId) {
			errors.push(`Row ${rowNum}: missing Case ID`);
			continue;
		}

		const submittedAt = parseMdyDate(String(r[0] ?? ""));
		if (!submittedAt) {
			errors.push(
				`Row ${rowNum} (case ${caseId}): unparseable submitted date ${JSON.stringify(r[0])}`,
			);
			continue;
		}

		const statusRaw = String(r[13] ?? "")
			.trim()
			.toLowerCase();
		const status = STATUS_MAP[statusRaw];
		if (!status) {
			errors.push(`Row ${rowNum} (case ${caseId}): unknown New Status ${JSON.stringify(r[13])}`);
			continue;
		}

		const reasonRaw = String(r[14] ?? "")
			.trim()
			.toLowerCase();
		const rejectionReason = reasonRaw ? (DECLINE_REASON_MAP[reasonRaw] ?? null) : null;
		if (reasonRaw && !rejectionReason) {
			errors.push(
				`Row ${rowNum} (case ${caseId}): unknown decline reason ${JSON.stringify(r[14])}`,
			);
			continue;
		}
		if (status === "declined" && !rejectionReason) {
			errors.push(`Row ${rowNum} (case ${caseId}): status Declined but no decline reason set`);
			continue;
		}

		const closedAt = parseMdyDate(String(r[15] ?? ""));

		out.push({
			rowNum,
			caseId,
			submissionId: `IM-${caseId}`,
			submittedAt,
			submitterName: String(r[1] ?? "").trim(),
			categoryName: String(r[4] ?? "").trim(),
			suggestion: String(r[5] ?? "").trim(),
			originalOwnerName: String(r[6] ?? "").trim(),
			leaderName: String(r[7] ?? "").trim(),
			actionTaken: String(r[8] ?? "").trim(),
			communicated: String(r[9] ?? "").trim(),
			ticketNumber: String(r[10] ?? "").trim(),
			researchNotes: String(r[11] ?? "").trim(),
			status,
			rejectionReason,
			closedAt,
		});
	}

	if (errors.length) {
		console.error("\nValidation errors:");
		for (const e of errors) console.error(`  ${e}`);
		throw new Error(`${errors.length} validation errors — fix the spreadsheet and re-run`);
	}

	return out;
}

// ── DB lookups ─────────────────────────────────────────────────────────────

async function loadCategoryIndex(): Promise<Map<string, string>> {
	const rows = await db
		.select({ id: categories.id, name: categories.name, active: categories.active })
		.from(categories);
	const idx = new Map<string, string>();
	for (const r of rows) {
		if (r.active) idx.set(normalizeCategory(r.name), r.id);
	}
	return idx;
}

function lookupCategory(idx: Map<string, string>, name: string): string | undefined {
	const norm = normalizeCategory(name);
	return idx.get(CATEGORY_ALIASES.get(norm) ?? norm);
}

interface UserMatch {
	userId: string;
	displayName: string;
	source: "db" | "graph" | "legacy";
	willCreate: boolean;
	role: "submitter" | "leader" | "admin";
	entraId?: string; // present when source === "graph"
	resolvedVia?: "displayName" | "override-email" | "override-legacy";
}

interface GraphHit {
	entraId: string;
	email: string;
	jobTitle: string | null;
	department: string | null;
	officeLocation: string | null;
	displayName: string;
}

type DbUser = {
	id: string;
	displayName: string;
	email: string;
	role: "submitter" | "leader" | "admin";
};

interface UserIndexes {
	byName: Map<string, DbUser>;
	byEmail: Map<string, DbUser>;
}

async function loadUserIndex(): Promise<UserIndexes> {
	const rows = await db
		.select({ id: users.id, displayName: users.displayName, email: users.email, role: users.role })
		.from(users)
		.where(eq(users.active, true));
	const byName = new Map<string, DbUser>();
	const byEmail = new Map<string, DbUser>();
	for (const r of rows) {
		byName.set(r.displayName.toLowerCase(), r);
		byEmail.set(r.email.toLowerCase(), r);
	}
	return { byName, byEmail };
}

async function resolveOne(
	name: string,
	indexes: UserIndexes,
	graphByName: Map<string, GraphHit | null>,
	graphByEmail: Map<string, GraphHit | null>,
): Promise<UserMatch | null> {
	const nameKey = name.toLowerCase();

	// 1. Manual override (email or LEGACY sentinel)
	const override = OVERRIDES.get(nameKey);
	if (override) {
		if (override.toUpperCase() === "LEGACY") {
			return {
				userId: "<LEGACY>",
				displayName: name,
				source: "legacy",
				willCreate: false,
				role: "submitter",
				resolvedVia: "override-legacy",
			};
		}
		const emailKey = override.toLowerCase();
		const dbHit = indexes.byEmail.get(emailKey);
		if (dbHit) {
			return {
				userId: dbHit.id,
				displayName: dbHit.displayName,
				source: "db",
				willCreate: false,
				role: dbHit.role,
				resolvedVia: "override-email",
			};
		}
		if (!graphByEmail.has(emailKey)) {
			try {
				const results = await searchDirectory(override);
				const exact = results.find((r) => r.email.toLowerCase() === emailKey);
				graphByEmail.set(emailKey, exact ? { ...exact } : null);
			} catch (err) {
				console.error(
					`  Graph email lookup failed for ${JSON.stringify(override)}: ${(err as Error).message}`,
				);
				graphByEmail.set(emailKey, null);
			}
		}
		const gHit = graphByEmail.get(emailKey);
		if (gHit) {
			return {
				userId: `<NEW:${gHit.entraId}>`,
				displayName: gHit.displayName,
				source: "graph",
				willCreate: true,
				role: "submitter",
				entraId: gHit.entraId,
				resolvedVia: "override-email",
			};
		}
		// Override email pointed at nobody — fall through so it shows as unmatched
		// and the user gets a chance to fix the override.
		return null;
	}

	// 2. DB by displayName
	const hit = indexes.byName.get(nameKey);
	if (hit) {
		return {
			userId: hit.id,
			displayName: hit.displayName,
			source: "db",
			willCreate: false,
			role: hit.role,
			resolvedVia: "displayName",
		};
	}

	// 3. Graph by displayName
	if (!graphByName.has(nameKey)) {
		try {
			const results = await searchDirectory(name);
			const exact = results.find((r) => r.displayName.toLowerCase() === nameKey);
			graphByName.set(nameKey, exact ? { ...exact } : null);
		} catch (err) {
			console.error(`  Graph lookup failed for ${JSON.stringify(name)}: ${(err as Error).message}`);
			graphByName.set(nameKey, null);
		}
	}
	const graphHit = graphByName.get(nameKey);
	if (graphHit) {
		return {
			userId: `<NEW:${graphHit.entraId}>`,
			displayName: graphHit.displayName,
			source: "graph",
			willCreate: true,
			role: "submitter",
			entraId: graphHit.entraId,
			resolvedVia: "displayName",
		};
	}

	return null;
}

// ── Phase: verify ──────────────────────────────────────────────────────────

interface Plan {
	source: SourceRow[];
	categoryByRow: Map<number, string>; // rowNum → categoryId
	submitterByRow: Map<number, UserMatch>; // rowNum → resolved
	leaderByRow: Map<number, UserMatch>;
	usersToCreate: Map<string, GraphHit>; // by lowercased name
	unmatchedSubmitters: string[];
	unmatchedLeaders: string[];
	missingCategories: string[];
}

async function buildPlan(rows: SourceRow[]): Promise<Plan> {
	console.log("\n→ Loading category index from DB…");
	const categoryIndex = await loadCategoryIndex();
	console.log(`  ${categoryIndex.size} active categories in DB`);

	const wantedCats = new Set(rows.map((r) => r.categoryName));
	const missingCategories: string[] = [];
	const categoryByRow = new Map<number, string>();
	for (const row of rows) {
		const id = lookupCategory(categoryIndex, row.categoryName);
		if (id) {
			categoryByRow.set(row.rowNum, id);
		} else if (!missingCategories.includes(row.categoryName)) {
			missingCategories.push(row.categoryName);
		}
	}

	console.log("\n→ Category verification:");
	for (const cat of wantedCats) {
		const ok = !!lookupCategory(categoryIndex, cat);
		console.log(`  ${ok ? "✓" : "✗"} ${cat}`);
	}

	console.log("\n→ Loading user index from DB…");
	const indexes = await loadUserIndex();
	console.log(`  ${indexes.byName.size} active users in DB`);
	if (OVERRIDES.size)
		console.log(`  ${OVERRIDES.size} name overrides loaded from ${OVERRIDES_PATH}`);

	const submitterNames = new Set(rows.map((r) => r.submitterName).filter(Boolean));
	const leaderNames = new Set(rows.map((r) => r.leaderName).filter(Boolean));

	console.log(`\n→ Resolving ${submitterNames.size} submitters + ${leaderNames.size} leaders…`);

	const graphByName = new Map<string, GraphHit | null>();
	const graphByEmail = new Map<string, GraphHit | null>();
	const resolved = new Map<string, UserMatch | null>();
	for (const name of [...submitterNames, ...leaderNames]) {
		if (resolved.has(name.toLowerCase())) continue;
		const match = await resolveOne(name, indexes, graphByName, graphByEmail);
		resolved.set(name.toLowerCase(), match);
	}

	const submitterByRow = new Map<number, UserMatch>();
	const leaderByRow = new Map<number, UserMatch>();
	const unmatchedSubmitters = new Set<string>();
	const unmatchedLeaders = new Set<string>();
	for (const row of rows) {
		const sub = resolved.get(row.submitterName.toLowerCase());
		const lead = resolved.get(row.leaderName.toLowerCase());
		if (sub) submitterByRow.set(row.rowNum, sub);
		else unmatchedSubmitters.add(row.submitterName);
		if (lead) leaderByRow.set(row.rowNum, lead);
		else unmatchedLeaders.add(row.leaderName);
	}

	const usersToCreate = new Map<string, GraphHit>();
	for (const v of graphByName.values()) if (v) usersToCreate.set(v.entraId, v);
	for (const v of graphByEmail.values()) if (v) usersToCreate.set(v.entraId, v);

	return {
		source: rows,
		categoryByRow,
		submitterByRow,
		leaderByRow,
		usersToCreate,
		unmatchedSubmitters: [...unmatchedSubmitters].sort(),
		unmatchedLeaders: [...unmatchedLeaders].sort(),
		missingCategories,
	};
}

function leaderEntraSet(plan: Plan): Set<string> {
	const set = new Set<string>();
	for (const row of plan.source) {
		const lead = plan.leaderByRow.get(row.rowNum);
		if (lead?.source === "graph" && lead.entraId) set.add(lead.entraId);
	}
	return set;
}

// ── Phase: report ──────────────────────────────────────────────────────────

function printReport(plan: Plan): void {
	const total = plan.source.length;
	const byStatus = new Map<string, number>();
	for (const r of plan.source) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);

	console.log("\n=== Import plan ===");
	console.log(`  Total rows: ${total}`);
	console.log(`  Status breakdown: ${[...byStatus].map(([k, v]) => `${k}=${v}`).join(", ")}`);
	console.log(`  Users to create (Graph-resolved new): ${plan.usersToCreate.size}`);
	console.log(
		`  Submission ID range: IM-${plan.source[0].caseId} … IM-${plan.source.at(-1)?.caseId}`,
	);

	if (plan.missingCategories.length) {
		console.log("\n!! Missing categories (create these in /admin/categories before applying):");
		for (const c of plan.missingCategories) console.log(`     • ${c}`);
	}

	if (plan.unmatchedSubmitters.length) {
		console.log(`\n!! Unmatched submitters (${plan.unmatchedSubmitters.length}):`);
		for (const n of plan.unmatchedSubmitters) console.log(`     • ${n}`);
	}
	if (plan.unmatchedLeaders.length) {
		console.log(`\n!! Unmatched leaders (${plan.unmatchedLeaders.length}):`);
		for (const n of plan.unmatchedLeaders) console.log(`     • ${n}`);
	}

	const newGraphUsers = [...plan.usersToCreate.values()];
	if (newGraphUsers.length) {
		const leaderEntras = leaderEntraSet(plan);
		const newLeaders = newGraphUsers.filter((u) => leaderEntras.has(u.entraId));
		const newSubmitters = newGraphUsers.filter((u) => !leaderEntras.has(u.entraId));
		console.log(
			`\n→ Graph-resolved users that will be created on --apply (${newGraphUsers.length} total):`,
		);
		if (newLeaders.length) {
			console.log(
				`   Leaders (${newLeaders.length}) — will need an invite via /admin/users after import:`,
			);
			for (const u of newLeaders) console.log(`     • ${u.displayName}  <${u.email}>`);
		}
		if (newSubmitters.length) {
			console.log(
				`   Submitters (${newSubmitters.length}) — no invite needed; auto-created on first login:`,
			);
			for (const u of newSubmitters) console.log(`     • ${u.displayName}  <${u.email}>`);
		}
	}

	const legacyMatches = plan.source
		.map((r) => ({ row: r, sub: plan.submitterByRow.get(r.rowNum) }))
		.filter(({ sub }) => sub?.source === "legacy");
	if (legacyMatches.length) {
		console.log(
			`\n→ Explicit Legacy User assignments via --overrides (${legacyMatches.length} rows):`,
		);
		const uniqueNames = new Set(legacyMatches.map(({ row }) => row.submitterName));
		for (const n of [...uniqueNames].sort()) console.log(`     • ${n}`);
	}
}

// ── Phase: apply ───────────────────────────────────────────────────────────

const SCRIPT_ACTOR = "system-inmoment-import";

async function ensureSystemActor(): Promise<string> {
	const existing = await db.select().from(users).where(eq(users.entraId, SCRIPT_ACTOR)).limit(1);
	if (existing.length) return existing[0].id;
	const [created] = await db
		.insert(users)
		.values({
			entraId: SCRIPT_ACTOR,
			email: "thoughtbox-import@desertfinancial.com",
			displayName: "ThoughtBox Import",
			role: "admin",
			source: "login",
			active: false, // never logs in; just an actor for migration audit rows
		})
		.returning();
	return created.id;
}

async function ensureLegacyUser(): Promise<string> {
	const ENTRA = "legacy-inmoment-user";
	const existing = await db.select().from(users).where(eq(users.entraId, ENTRA)).limit(1);
	if (existing.length) return existing[0].id;
	const [created] = await db
		.insert(users)
		.values({
			entraId: ENTRA,
			email: "legacy-inmoment@desertfinancial.com",
			displayName: "Legacy InMoment User",
			role: "submitter",
			source: "login",
			active: false,
		})
		.returning();
	return created.id;
}

async function applyPlan(plan: Plan): Promise<void> {
	const importedAt = new Date();
	const systemActorId = await ensureSystemActor();

	// Materialize Graph-resolved users. Anyone who appears as a leader in column
	// H gets role=leader; everyone else is a submitter. Roles can be promoted
	// later via the admin UI if needed.
	const leaderEntras = leaderEntraSet(plan);
	const graphUserIds = new Map<string, string>(); // entraId → user.id
	for (const gu of plan.usersToCreate.values()) {
		const existing = await db.select().from(users).where(eq(users.entraId, gu.entraId)).limit(1);
		if (existing.length) {
			graphUserIds.set(gu.entraId, existing[0].id);
			continue;
		}
		const role: "submitter" | "leader" = leaderEntras.has(gu.entraId) ? "leader" : "submitter";
		const [created] = await db
			.insert(users)
			.values({
				entraId: gu.entraId,
				email: gu.email,
				displayName: gu.displayName,
				jobTitle: gu.jobTitle,
				department: gu.department,
				officeLocation: gu.officeLocation,
				role,
				source: "graph",
				active: true,
			})
			.returning();
		graphUserIds.set(gu.entraId, created.id);
	}

	const hasLegacyOverrides = [...plan.submitterByRow.values()].some((m) => m.source === "legacy");
	let legacyUserId: string | null = null;
	if (LEGACY_USER_FALLBACK || hasLegacyOverrides) {
		legacyUserId = await ensureLegacyUser();
	}

	function resolveActor(match: UserMatch | undefined, fallback: string): string {
		if (!match) return fallback;
		if (match.source === "db") return match.userId;
		if (match.source === "graph" && match.entraId)
			return graphUserIds.get(match.entraId) ?? fallback;
		if (match.source === "legacy" && legacyUserId) return legacyUserId;
		return fallback;
	}

	console.log(`\n→ Inserting ${plan.source.length} ideas…`);
	let inserted = 0;
	let skipped = 0;

	for (const row of plan.source) {
		const existing = await db
			.select({ id: ideas.id })
			.from(ideas)
			.where(eq(ideas.submissionId, row.submissionId))
			.limit(1);
		if (existing.length) {
			skipped++;
			continue;
		}

		const categoryId = plan.categoryByRow.get(row.rowNum);
		if (!categoryId) throw new Error(`Row ${row.rowNum}: no resolved category`);

		const submitterMatch = plan.submitterByRow.get(row.rowNum);
		const leaderMatch = plan.leaderByRow.get(row.rowNum);

		let submitterId: string;
		if (submitterMatch && submitterMatch.source !== "legacy") {
			submitterId = resolveActor(submitterMatch, "");
		} else if (legacyUserId) {
			submitterId = legacyUserId;
		} else {
			throw new Error(`Row ${row.rowNum}: submitter unresolved and --legacy-user not set`);
		}

		const usingLegacy = submitterId === legacyUserId;

		const leaderId = leaderMatch ? resolveActor(leaderMatch, "") : null;
		if (!leaderId) throw new Error(`Row ${row.rowNum}: leader unresolved (${row.leaderName})`);

		const isClosed = row.status === "accepted" || row.status === "declined";
		const slaStartedAt = isClosed ? row.submittedAt : importedAt;
		const slaDueDate = addBusinessDays(slaStartedAt, SLA_BUSINESS_DAYS_DEFAULT);

		const title = autoTitle(row.suggestion);
		const leaderNotes =
			[
				row.researchNotes,
				row.ticketNumber ? `Ticket: ${row.ticketNumber}` : "",
				usingLegacy ? `Original submitter: ${row.submitterName}` : "",
				row.communicated === "Yes" ? "Outcome communicated to submitter (per InMoment)." : "",
			]
				.filter(Boolean)
				.join("\n\n") || null;

		const [idea] = await db
			.insert(ideas)
			.values({
				submissionId: row.submissionId,
				title,
				description: row.suggestion,
				categoryId,
				status: row.status,
				rejectionReason: row.rejectionReason,
				submitterId,
				assignedLeaderId: leaderId,
				leaderNotes,
				actionTaken: row.actionTaken || null,
				slaDueDate,
				slaStartedAt,
				hasBeenReviewed: row.status !== "new",
				closedAt: isClosed ? (row.closedAt ?? importedAt) : null,
				submittedAt: row.submittedAt,
				createdAt: row.submittedAt,
				updatedAt: row.closedAt ?? row.submittedAt,
			})
			.returning();

		// created event — at original submitted date, actor = submitter
		await db.insert(ideaEvents).values({
			ideaId: idea.id,
			eventType: "created",
			actorId: submitterId,
			newValue: "new",
			note: "Imported from InMoment.",
			createdAt: row.submittedAt,
		});

		if (isClosed) {
			// status_changed event — at close date, actor = assigned leader
			await db.insert(ideaEvents).values({
				ideaId: idea.id,
				eventType: "status_changed",
				actorId: leaderId,
				oldValue: "new",
				newValue: row.status,
				note: row.rejectionReason ? `Reason: ${row.rejectionReason}` : null,
				createdAt: row.closedAt ?? importedAt,
			});
		} else if (row.status === "under_review") {
			// Under-review cases that were originally closed in InMoment but Nubia
			// recategorized — we don't know when the "under review" decision was made,
			// so log the transition at import time so the timeline isn't blank.
			await db.insert(ideaEvents).values({
				ideaId: idea.id,
				eventType: "status_changed",
				actorId: leaderId,
				oldValue: "new",
				newValue: "under_review",
				note: "Reclassified during InMoment import.",
				createdAt: importedAt,
			});
		}

		if (row.researchNotes) {
			await db.insert(ideaEvents).values({
				ideaId: idea.id,
				eventType: "note_added",
				actorId: leaderId,
				note: row.researchNotes,
				createdAt: row.closedAt ?? row.submittedAt,
			});
		}

		await db.insert(auditLog).values({
			actorId: systemActorId,
			action: "idea.imported",
			resourceType: "idea",
			resourceId: idea.id,
			details: {
				submissionId: row.submissionId,
				inMomentCaseId: row.caseId,
				originalOwner: row.originalOwnerName,
				originalSubmitter: row.submitterName,
				resolvedSubmitterId: submitterId,
				resolvedSubmitterSource: usingLegacy ? "legacy" : (submitterMatch?.source ?? "legacy"),
				resolvedVia: submitterMatch?.resolvedVia ?? "fallback-legacy",
			},
		});

		inserted++;
		if (inserted % 20 === 0) console.log(`  ${inserted}/${plan.source.length}…`);
	}

	console.log(`\n✓ Inserted ${inserted}, skipped ${skipped} (already present by submission_id).`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
	const absPath = resolve(FILE_PATH!);
	console.log(`\nFile:   ${absPath}`);
	console.log(`Mode:   ${APPLY ? "APPLY (writes to DB)" : "DRY-RUN"}`);
	console.log(`Legacy: ${LEGACY_USER_FALLBACK ? "yes (unmatched → Legacy InMoment User)" : "no"}`);

	const rows = parseXlsx(absPath);
	console.log(`\nParsed ${rows.length} rows from spreadsheet`);

	// Backup the raw source rows alongside the script so we have a snapshot of
	// exactly what we imported if anyone asks later.
	if (APPLY) {
		const backupPath = `${absPath.replace(/\.xlsx?$/i, "")}.import-snapshot.${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
		writeFileSync(backupPath, JSON.stringify(rows, null, 2));
		console.log(`Backup: ${backupPath}`);
	}

	const plan = await buildPlan(rows);
	printReport(plan);

	const blockers: string[] = [];
	if (plan.missingCategories.length)
		blockers.push(`${plan.missingCategories.length} missing categories`);
	if (plan.unmatchedSubmitters.length && !LEGACY_USER_FALLBACK) {
		blockers.push(
			`${plan.unmatchedSubmitters.length} unmatched submitters (use --legacy-user to fall back)`,
		);
	}
	if (plan.unmatchedLeaders.length) {
		blockers.push(
			`${plan.unmatchedLeaders.length} unmatched leaders (must be resolved — no fallback)`,
		);
	}

	if (blockers.length) {
		console.log(`\n✗ Blocked: ${blockers.join("; ")}`);
		if (APPLY) {
			console.log("Apply aborted. Resolve the blockers above and re-run.");
			await sql.end();
			process.exit(2);
		}
	}

	if (!APPLY) {
		console.log("\nDry-run complete. Re-run with --apply to write.");
		await sql.end();
		return;
	}

	await applyPlan(plan);
	await sql.end();
}

main().catch(async (err) => {
	console.error("\nFAILED:", err);
	try {
		await sql.end();
	} catch {
		/* ignore */
	}
	process.exit(1);
});
