import { z } from "zod";

const envSchema = z.object({
	DATABASE_URL: z.string().url(),

	AZURE_CLIENT_ID: z.string().optional(),
	AZURE_TENANT_ID: z.string().optional(),

	GRAPH_CLIENT_ID: z.string().optional(),
	GRAPH_CLIENT_SECRET: z.string().optional(),

	THOUGHTBOX_SHARED_MAILBOX: z.string().email().optional(),

	AI_PROVIDER: z.enum(["anthropic", "azure-openai"]).default("anthropic"),
	ANTHROPIC_API_KEY: z.string().optional(),
	AZURE_OPENAI_ENDPOINT: z.string().url().optional(),
	AZURE_OPENAI_API_KEY: z.string().optional(),
	AZURE_OPENAI_DEPLOYMENT: z.string().optional(),

	DEV_USER_ENTRA_ID: z.string().optional(),

	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
	const result = envSchema.safeParse(process.env);

	if (!result.success) {
		const formatted = result.error.flatten().fieldErrors;
		const message = Object.entries(formatted)
			.map(([key, errors]) => `  ${key}: ${errors?.join(", ")}`)
			.join("\n");

		throw new Error(`Missing or invalid environment variables:\n${message}`);
	}

	return result.data;
}

export const env = validateEnv();
