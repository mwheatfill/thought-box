---
title: "ThoughtBox Cloudflare Workers PoC: Session Brief"
type: Working Note
status: Draft
author: "Michael Wheatfill"
description: "Session brief for a Claude Code agent to add Cloudflare Workers deployment alongside the existing Azure App Service setup."
---

# ThoughtBox: Cloudflare Workers PoC

## What this is

This is a session brief for adding Cloudflare Workers deployment to the existing ThoughtBox codebase. **This is a proof of concept, not a replacement.** The Azure deployment path stays intact. We're validating that the app works on Cloudflare before making a final hosting decision.

Read CLAUDE.md first. Everything in CLAUDE.md applies (coding standards, TanStack Start patterns, testing, naming conventions). This document only covers **what's different for Cloudflare**.

## Goal

Get ThoughtBox running on Cloudflare Workers with:

- TanStack Start rendering and routing working
- Entra ID authentication via OIDC middleware
- Database connected via Neon PostgreSQL + Hyperdrive
- AI chat streaming working (Vercel AI SDK + SSE)
- Local development working via `wrangler dev`

## What NOT to do

- Do not remove Azure deployment files (Bicep, Azure GitHub Actions workflow, Azure-specific config). Leave them in place.
- Do not modify the existing auth middleware in a way that breaks the Azure path. Create new files or use conditional logic.
- Do not change the Drizzle schema. It works on any PostgreSQL database.
- Do not refactor the entire codebase. Touch the minimum necessary to get Cloudflare working.

## Branch strategy

Work on a `feat/cloudflare-workers` branch. Do not merge to main until the PoC is validated.

```bash
git checkout -b feat/cloudflare-workers
```

## Architecture changes (Cloudflare vs Azure)

| Layer | Azure (existing) | Cloudflare (this PoC) |
|---|---|---|
| Hosting | App Service (Node.js process) | Cloudflare Workers (V8 isolate) |
| TanStack preset | Custom adapter (Nitro) | `cloudflare-module` (first-class) |
| Auth | Easy Auth headers (`X-MS-CLIENT-PRINCIPAL`) | OIDC middleware (arctic library) |
| Database | Azure PostgreSQL (direct connection) | Neon PostgreSQL + Hyperdrive (connection pooling) |
| Object storage | Azure Blob Storage (not yet configured) | Cloudflare R2 |
| Monitoring | Application Insights | Cloudflare Workers Logs (built-in) |
| Environment vars | `process.env` (global) | Request-bound (handler context via `env`) |
| Deployment | GitHub Actions → App Service | GitHub Actions → Wrangler |
| IaC | Bicep | `wrangler.toml` |

## Step-by-step implementation

### 1. Add Cloudflare dependencies

```bash
pnpm add -D wrangler
pnpm add arctic oslo  # OIDC auth library + session utilities
```

### 2. Create wrangler.toml

Place at project root alongside the existing config files.

```toml
name = "thoughtbox"
main = ".output/server/index.mjs"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".output/public"

# Hyperdrive binding for database connection pooling
[[hyperdrive]]
binding = "HYPERDRIVE"
id = ""  # Fill after creating Hyperdrive config in dashboard

# R2 binding for avatar photo cache
[[r2_buckets]]
binding = "STORAGE"
bucket_name = "thoughtbox-storage"

# Environment variables (non-secret)
[vars]
AI_PROVIDER = "anthropic"
THOUGHTBOX_SHARED_MAILBOX = ""

# Secrets (set via `wrangler secret put <NAME>`)
# DATABASE_URL — Neon connection string (used by Hyperdrive)
# AZURE_CLIENT_ID — Entra ID app registration
# AZURE_CLIENT_SECRET — Entra ID client secret
# AZURE_TENANT_ID — Entra ID tenant
# GRAPH_CLIENT_ID — Graph API app registration
# GRAPH_CLIENT_SECRET — Graph API client secret
# ANTHROPIC_API_KEY — AI provider key
# SESSION_SECRET — Cookie signing key for auth sessions
```

### 3. Configure TanStack Start for Cloudflare

In the TanStack Start / Vite config, set the Cloudflare preset. The exact configuration depends on which version and config format the existing project uses. Look for `app.config.ts`, `vite.config.ts`, or similar. Add the Cloudflare target:

```typescript
// If using Nitro config
export default defineConfig({
  server: {
    preset: 'cloudflare-module',
  },
})
```

If TanStack Start uses the Cloudflare Vite plugin instead of a Nitro preset (check TanStack Start docs for the current recommended approach), install and configure that:

```bash
pnpm add -D @cloudflare/vite-plugin
```

### 4. Abstract environment variable access

Cloudflare Workers don't support top-level `process.env`. Environment variables are only available inside request handlers via the `env` parameter.

Create a Cloudflare-compatible env helper alongside the existing one:

```typescript
// src/server/lib/env-cloudflare.ts
import { z } from 'zod'

const EnvSchema = z.object({
  DATABASE_URL: z.string(),
  AZURE_CLIENT_ID: z.string(),
  AZURE_CLIENT_SECRET: z.string(),
  AZURE_TENANT_ID: z.string(),
  GRAPH_CLIENT_ID: z.string(),
  GRAPH_CLIENT_SECRET: z.string(),
  THOUGHTBOX_SHARED_MAILBOX: z.string(),
  AI_PROVIDER: z.enum(['anthropic', 'azure-openai']),
  ANTHROPIC_API_KEY: z.string().optional(),
  AZURE_OPENAI_ENDPOINT: z.string().optional(),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_DEPLOYMENT: z.string().optional(),
  SESSION_SECRET: z.string(),
})

export type Env = z.infer<typeof EnvSchema>

// Call this inside request handlers, not at top level
export function getEnv(env: Record<string, string>): Env {
  return EnvSchema.parse(env)
}
```

**Key pattern:** Anywhere the existing code does `process.env.SOMETHING` at the module level, it needs to move inside a function that receives the env from the request context. This is the biggest code change in the migration.

### 5. Replace auth middleware

The existing auth middleware reads Easy Auth headers (`X-MS-CLIENT-PRINCIPAL-ID`, `X-MS-CLIENT-PRINCIPAL-NAME`). The Cloudflare version implements OIDC directly.

Create a new auth middleware file:

```typescript
// src/server/middleware/auth-cloudflare.ts
import { createMiddleware } from '@tanstack/react-start'
import { Arctic } from 'arctic'

// Initialize the Entra ID OIDC provider
// Arctic handles the OAuth 2.0 / OIDC flow with minimal code
// Docs: https://arcticjs.dev

export const authMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    // 1. Check for existing session cookie (encrypted JWT)
    const session = await getSessionFromCookie(request)
    
    if (!session) {
      // 2. No session: redirect to Entra ID login
      //    Arctic handles the authorization URL construction
      //    After login, Entra ID redirects back to /auth/callback
      throw redirect({ to: '/auth/login' })
    }

    // 3. Session exists: look up or create user in database
    const user = await db.query.users.findFirst({
      where: eq(usersTable.entraId, session.oid),
    })

    if (!user) {
      // First login: create user from Entra ID claims
      // Then trigger profile enrichment (Graph API)
    }

    return next({ context: { user } })
  },
)
```

You'll also need auth callback routes:

```
src/routes/
├── auth/
│   ├── login.tsx        # Initiates OIDC flow (redirect to Entra ID)
│   ├── callback.tsx     # Handles Entra ID redirect, creates session
│   └── logout.tsx       # Clears session, redirects to Entra ID logout
```

**Session storage:** Use encrypted JWT cookies (stateless, no external storage needed). The `oslo` library provides cookie-based session helpers that work in edge runtimes. The cookie contains the user's Entra ID object ID (`oid`), email, display name, and token expiration. The actual database user lookup happens in the middleware on each request (fast, single query via Hyperdrive).

**Token storage for Graph API:** The OIDC flow gives you an access token and refresh token from Entra ID. Store the access token in the session cookie (encrypted) so you can make Graph API calls on behalf of the user. For service-level Graph calls (email sending), use client credentials flow (app-only token, no user context needed).

### 6. Database connection via Hyperdrive

The Drizzle ORM setup needs to use the Hyperdrive binding instead of a direct connection string.

```typescript
// src/server/db/index-cloudflare.ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

// Hyperdrive provides a connection string via the binding
// The binding is available in the Worker's env object
export function createDb(hyperdrive: { connectionString: string }) {
  const pool = new Pool({
    connectionString: hyperdrive.connectionString,
    maxUses: 1,  // Required for Hyperdrive: don't reuse connections across requests
  })
  return drizzle({ client: pool, schema })
}
```

**Important:** `maxUses: 1` is required when using Hyperdrive. Each Worker invocation gets a fresh connection from the pool.

### 7. Update Graph API client

The existing Graph client likely uses `@azure/identity` for managed identity auth. On Cloudflare, use client credentials flow with a client secret instead.

```typescript
// src/server/lib/graph-cloudflare.ts

// Get an app-only token using client credentials
async function getGraphToken(env: Env): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GRAPH_CLIENT_ID,
      client_secret: env.GRAPH_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  const data = await response.json()
  return data.access_token
}

// Use the token for Graph API calls (user profiles, photos, email)
export async function getGraphClient(env: Env) {
  const token = await getGraphToken(env)
  return {
    async fetch(url: string, options?: RequestInit) {
      return fetch(`https://graph.microsoft.com/v1.0${url}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          ...options?.headers,
        },
      })
    },
  }
}
```

### 8. Avatar photo storage with R2

Replace any local file storage or Blob Storage references with R2:

```typescript
// src/server/lib/photo-storage.ts

export async function storeUserPhoto(
  storage: R2Bucket,  // From env.STORAGE binding
  userId: string,
  photoBlob: Blob,
): Promise<string> {
  const key = `avatars/${userId}.jpg`
  await storage.put(key, photoBlob, {
    httpMetadata: { contentType: 'image/jpeg' },
    customMetadata: { fetchedAt: new Date().toISOString() },
  })
  return key
}

export async function getUserPhoto(
  storage: R2Bucket,
  userId: string,
): Promise<{ body: ReadableStream; contentType: string } | null> {
  const object = await storage.get(`avatars/${userId}.jpg`)
  if (!object) return null
  return {
    body: object.body,
    contentType: object.httpMetadata?.contentType ?? 'image/jpeg',
  }
}
```

### 9. AI streaming (no changes needed)

Vercel AI SDK's `streamText` and `toTextStreamResponse()` work on Cloudflare Workers. SSE streaming is natively supported. One thing to set:

```typescript
// In your AI streaming handler, set this header to prevent compression buffering
return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Content-Encoding': 'identity',  // Prevents gzip buffering of SSE
  },
})
```

### 10. GitHub Actions workflow for Cloudflare

Create a new workflow file alongside the existing Azure one:

```yaml
# .github/workflows/deploy-cloudflare.yml
name: Deploy to Cloudflare Workers
on:
  push:
    branches: [feat/cloudflare-workers]  # Change to main after PoC validation

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

### 11. Local development

```bash
# Create .dev.vars file (Cloudflare's equivalent of .env for wrangler dev)
cp .env .dev.vars

# Run local dev with Wrangler
wrangler dev

# Or use standard TanStack Start dev server for faster iteration
# (won't have Hyperdrive/R2 bindings, but routes and components work)
pnpm dev
```

For local auth, the same mock pattern applies. When running locally, skip the OIDC flow and inject a test user identity. Check for `import.meta.env.DEV` or a `DEV_USER_ENTRA_ID` variable in `.dev.vars`.

## Setup checklist

Before starting, you'll need these accounts and credentials:

- [ ] Cloudflare account with Workers access (confirmed: Enterprise account, Workers functional)
- [ ] Neon account and database created (free tier for PoC, Pro for production)
- [ ] Hyperdrive configuration created in Cloudflare dashboard (points to Neon connection string)
- [ ] R2 bucket created: `thoughtbox-storage`
- [ ] Entra ID app registration (may reuse the existing one, add `http://localhost:8787/auth/callback` as a redirect URI for local dev)
- [ ] Wrangler secrets set: `wrangler secret put DATABASE_URL`, `wrangler secret put AZURE_CLIENT_SECRET`, etc.
- [ ] Cloudflare API token created (for GitHub Actions)

## Success criteria

The PoC is validated when:

1. `wrangler dev` starts and serves the app locally
2. OIDC login flow works (redirect to Entra ID, callback creates session)
3. Database queries work through Hyperdrive (ideas load, user lookup works)
4. AI chat streams responses via SSE
5. `wrangler deploy` puts the app on a `*.workers.dev` domain
6. The deployed app passes the same checks (auth, database, AI streaming)

## Files to create (new)

```
wrangler.toml
.dev.vars.example
src/server/middleware/auth-cloudflare.ts
src/server/lib/env-cloudflare.ts
src/server/lib/graph-cloudflare.ts
src/server/lib/photo-storage.ts
src/server/db/index-cloudflare.ts
src/routes/auth/login.tsx
src/routes/auth/callback.tsx
src/routes/auth/logout.tsx
.github/workflows/deploy-cloudflare.yml
```

## Files to modify (minimal changes)

```
app.config.ts or vite.config.ts  — Add Cloudflare preset/plugin
src/server/middleware/auth.ts     — Conditionally use Azure or Cloudflare auth
src/server/db/index.ts            — Conditionally use direct or Hyperdrive connection
src/server/lib/graph.ts           — Conditionally use managed identity or client credentials
package.json                      — Add wrangler, arctic, oslo to dependencies
```

## Commit cadence

Same as CLAUDE.md: commit proactively, every meaningful unit of work. Prefix commits with `feat(cloudflare):` to make the branch history easy to scan.
