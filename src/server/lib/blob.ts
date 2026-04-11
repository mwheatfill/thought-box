import { DefaultAzureCredential, ManagedIdentityCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";

// biome-ignore lint/complexity/useLiteralKeys: prevent vite from replacing at build time
const STORAGE_ACCOUNT = process["env"].AZURE_STORAGE_ACCOUNT;

let blobServiceClient: BlobServiceClient | null = null;

function getBlobClient(): BlobServiceClient | null {
	if (blobServiceClient) return blobServiceClient;
	if (!STORAGE_ACCOUNT) return null;

	// Use ManagedIdentityCredential on Azure (AZURE_CLIENT_ID is set for Easy Auth,
	// which confuses DefaultAzureCredential). Fall back to DefaultAzureCredential
	// for local dev (uses az login).
	const isAzure = process.cwd().startsWith("/home/site");
	const credential = isAzure ? new ManagedIdentityCredential() : new DefaultAzureCredential();

	blobServiceClient = new BlobServiceClient(
		`https://${STORAGE_ACCOUNT}.blob.core.windows.net`,
		credential,
	);
	return blobServiceClient;
}

// ── Allowed file types ───────────────────────────────────────────────────

const ALLOWED_TYPES: Record<string, string> = {
	"image/jpeg": ".jpg",
	"image/png": ".png",
	"image/gif": ".gif",
	"image/webp": ".webp",
	"image/svg+xml": ".svg",
	"application/pdf": ".pdf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
	"text/csv": ".csv",
	"text/plain": ".txt",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function isAllowedType(contentType: string): boolean {
	return contentType in ALLOWED_TYPES;
}

export function getMaxFileSize(): number {
	return MAX_FILE_SIZE;
}

// ── Upload ───────────────────────────────────────────────────────────────

export async function uploadBlob(
	container: "photos" | "attachments",
	blobName: string,
	data: Buffer,
	contentType: string,
): Promise<string | null> {
	const client = getBlobClient();
	if (!client) {
		console.log("[blob] No storage account configured, skipping upload");
		return null;
	}

	const containerClient = client.getContainerClient(container);
	const blockBlobClient = containerClient.getBlockBlobClient(blobName);

	await blockBlobClient.uploadData(data, {
		blobHTTPHeaders: {
			blobContentType: contentType,
			blobCacheControl: container === "photos" ? "public, max-age=86400" : "private, max-age=3600",
			blobContentDisposition: "inline",
		},
	});

	return blockBlobClient.url;
}

// ── Download ─────────────────────────────────────────────────────────────

export async function downloadBlob(
	container: "photos" | "attachments",
	blobName: string,
): Promise<{ data: Buffer; contentType: string } | null> {
	const client = getBlobClient();
	if (!client) return null;

	try {
		const containerClient = client.getContainerClient(container);
		const blockBlobClient = containerClient.getBlockBlobClient(blobName);
		const response = await blockBlobClient.download();

		const chunks: Buffer[] = [];
		if (response.readableStreamBody) {
			for await (const chunk of response.readableStreamBody) {
				chunks.push(Buffer.from(chunk));
			}
		}

		return {
			data: Buffer.concat(chunks),
			contentType: response.contentType ?? "application/octet-stream",
		};
	} catch {
		return null;
	}
}

// ── Delete ───────────────────────────────────────────────────────────────

export async function deleteBlob(
	container: "photos" | "attachments",
	blobName: string,
): Promise<void> {
	const client = getBlobClient();
	if (!client) return;

	try {
		const containerClient = client.getContainerClient(container);
		await containerClient.getBlockBlobClient(blobName).deleteIfExists();
	} catch {
		// Ignore deletion failures
	}
}
