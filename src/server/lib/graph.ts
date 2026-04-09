import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";

export interface DirectoryUser {
	entraId: string;
	displayName: string;
	email: string;
	jobTitle: string | null;
	department: string | null;
	officeLocation: string | null;
}

// ── Dev mock data ─────────────────────────────────────────────────────────

const MOCK_DIRECTORY: DirectoryUser[] = [
	{
		entraId: "mock-sarah-chen",
		displayName: "Sarah Chen",
		email: "sarah.chen@desertfinancial.com",
		jobTitle: "Branch Manager",
		department: "Retail Banking",
		officeLocation: "Scottsdale",
	},
	{
		entraId: "mock-marcus-williams",
		displayName: "Marcus Williams",
		email: "marcus.williams@desertfinancial.com",
		jobTitle: "VP of Operations",
		department: "Operations",
		officeLocation: "Phoenix HQ",
	},
	{
		entraId: "mock-jennifer-patel",
		displayName: "Jennifer Patel",
		email: "jennifer.patel@desertfinancial.com",
		jobTitle: "Digital Banking Manager",
		department: "Digital Banking",
		officeLocation: "Tempe",
	},
	{
		entraId: "mock-david-martinez",
		displayName: "David Martinez",
		email: "david.martinez@desertfinancial.com",
		jobTitle: "IT Director",
		department: "Information Technology",
		officeLocation: "Phoenix HQ",
	},
	{
		entraId: "mock-lisa-thompson",
		displayName: "Lisa Thompson",
		email: "lisa.thompson@desertfinancial.com",
		jobTitle: "HR Business Partner",
		department: "Human Resources",
		officeLocation: "Phoenix HQ",
	},
];

// ── Graph client ──────────────────────────────────────────────────────────

function getGraphClient(): Client | null {
	const tenantId = process.env.AZURE_TENANT_ID;
	const clientId = process.env.GRAPH_CLIENT_ID;
	const clientSecret = process.env.GRAPH_CLIENT_SECRET;

	if (!tenantId || !clientId || !clientSecret) {
		return null;
	}

	const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
	const authProvider = new TokenCredentialAuthenticationProvider(credential, {
		scopes: ["https://graph.microsoft.com/.default"],
	});

	return Client.initWithMiddleware({ authProvider });
}

// ── Profile enrichment ───────────────────────────────────────────────────

export interface UserProfile {
	displayName: string;
	email: string;
	jobTitle: string | null;
	department: string | null;
	officeLocation: string | null;
}

export interface UserManager {
	entraId: string;
	displayName: string;
}

/** Fetch a user's profile fields from Graph API. Returns null in dev mode. */
export async function getUserProfile(entraId: string): Promise<UserProfile | null> {
	const client = getGraphClient();
	if (!client) return null;

	const u = await client
		.api(`/users/${entraId}`)
		.select("displayName,mail,jobTitle,department,officeLocation")
		.get();

	return {
		displayName: u.displayName,
		email: u.mail,
		jobTitle: u.jobTitle ?? null,
		department: u.department ?? null,
		officeLocation: u.officeLocation ?? null,
	};
}

/** Fetch a user's manager from Graph API. Returns null if no manager or dev mode. */
export async function getUserManager(entraId: string): Promise<UserManager | null> {
	const client = getGraphClient();
	if (!client) return null;

	try {
		const m = await client.api(`/users/${entraId}/manager`).select("id,displayName").get();

		return { entraId: m.id, displayName: m.displayName };
	} catch {
		// 404 if user has no manager set in Entra ID
		return null;
	}
}

/** Fetch a user's profile photo as a Buffer. Returns null if no photo or dev mode. */
export async function getUserPhoto(entraId: string): Promise<Buffer | null> {
	const client = getGraphClient();
	if (!client) return null;

	try {
		const photoBlob = await client.api(`/users/${entraId}/photo/$value`).get();
		// Graph SDK returns an ArrayBuffer
		return Buffer.from(photoBlob);
	} catch {
		// 404 if no photo uploaded
		return null;
	}
}

// ── Search directory ──────────────────────────────────────────────────────

export async function searchDirectory(query: string): Promise<DirectoryUser[]> {
	if (!query || query.length < 2) return [];

	const client = getGraphClient();

	// Dev mode: use mock data
	if (!client) {
		const lower = query.toLowerCase();
		return MOCK_DIRECTORY.filter(
			(u) =>
				u.displayName.toLowerCase().includes(lower) ||
				u.email.toLowerCase().includes(lower) ||
				u.department?.toLowerCase().includes(lower),
		);
	}

	// Production: search Entra ID directory (members only, not guests, not disabled)
	const safeQuery = query.replace(/'/g, "''");
	const response = await client
		.api("/users")
		.filter(
			`userType eq 'Member' and accountEnabled eq true and (startsWith(displayName,'${safeQuery}') or startsWith(mail,'${safeQuery}'))`,
		)
		.select("id,displayName,mail,jobTitle,department,officeLocation")
		.top(10)
		.get();

	return (response.value ?? []).map(
		(u: {
			id: string;
			displayName: string;
			mail: string;
			jobTitle: string | null;
			department: string | null;
			officeLocation: string | null;
		}) => ({
			entraId: u.id,
			displayName: u.displayName,
			email: u.mail,
			jobTitle: u.jobTitle ?? null,
			department: u.department ?? null,
			officeLocation: u.officeLocation ?? null,
		}),
	);
}
