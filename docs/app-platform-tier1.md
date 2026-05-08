---
title: "Internal App Platform: Tier 1 — SPA + Thin Proxy"
type: Working Note
status: Draft
author: "Michael Wheatfill"
description: "Blueprint for the lightweight tier of the internal app platform. Azure Static Web Apps + Vite/React/shadcn + optional managed Functions for token-holding API proxies. For read-only viewers, dashboards, and simple integrations."
---

# Internal App Platform: Tier 1 — SPA + Thin Proxy

Companion to [app-platform-exploration.md](./app-platform-exploration.md). This doc covers the lightweight blueprint for apps that don't need a full server runtime.

## Tier overview

The internal app platform now spans three hosting profiles. They share a common core (identity model, design language, conventions, observability) and differ in hosting, server runtime, and persistence.

| Tier | Hosting | When to use | Cost floor |
|---|---|---|---|
| **Tier 1: SPA + thin proxy** | Azure Static Web Apps | Read-only viewers, dashboards, lookup tools, simple API mashups. No persistent state, no streaming. | $0 |
| **Tier 2: Full-stack** | App Service + TanStack Start | Write workflows, role-based UI, AI chat, persistent state. | ~$13/mo (shared plan) |
| **Tier 3: Edge** *(deferred)* | Cloudflare Workers | Latency-sensitive global access or unusual cost shapes. Not blueprinted yet. | n/a |

This doc covers Tier 1.

## When Tier 1 is the right choice

Choose Tier 1 when **all** of the following are true:

- The app's primary job is to display, summarize, or proxy data from existing systems
- Writes to those systems are absent, or simple/idempotent enough to live in a Function
- No need for SSR, WebSockets, or long-running server work (>45s)
- No persistent relational data (Cosmos free tier is fine for incidental state)
- The audience is internal employees in a single Entra tenant

If any of those flip — promote to Tier 2 from the start. Migrating later is straightforward (same frontend stack, same auth model) but doing it twice wastes time.

## Reference apps

- **PagerDuty Schedules viewer** *(in build)* — displays who's on call across multiple PD teams, augmented with Teams presence and contact actions.
- **DFCU Ecosystem Diagram** *(deployed)* — read-only architecture diagram. Source for the current bootstrap pattern.

## Architecture decisions

### Hosting: Azure Static Web Apps (Free tier)

**Decision: SWA Free tier with managed Functions enabled when an API is needed.**

SWA gives us:
- Static asset hosting on a CDN
- Built-in Entra ID auth (EasyAuth) — same model as App Service
- Optional managed Functions (Node) for backend logic, no separate Function App to manage
- Per-PR preview environments
- $0 hosting cost

Constraints (these are the boundary between Tier 1 and Tier 2):
- 45-second function timeout
- No WebSocket or SSE
- 100 GB bandwidth/month on Free tier
- Functions cold-start (acceptable at internal-tool scale)

### Frontend stack

**Decision: same shadcn ecosystem as Tier 2, minus the server-side bits.**

| Layer | Library | Notes |
|---|---|---|
| **Build** | Vite | Rolldown when stable |
| **Framework** | React 19 + TypeScript | |
| **Styling** | Tailwind CSS v4 | |
| **Components** | shadcn/ui | Copied into project, not a dependency |
| **Data fetching** | TanStack Query | |
| **Routing** | TanStack Router (file-based) | Skip for single-screen apps |
| **Forms** | TanStack Form + Zod | |
| **Charts** | shadcn charts (Recharts v3) | |
| **Animation** | Motion v12 | |
| **Toasts** | Sonner | |
| **Command palette** | cmdk | |
| **Testing (unit)** | Vitest + Testing Library | |
| **Testing (e2e)** | Playwright | |
| **Code quality** | Biome | |

Design tokens (`tailwind.config.ts`, shadcn CSS variables) live in the template and inherit on every new app — visual consistency is automatic across both tiers.

### Backend: SWA Managed Functions (when needed)

**Decision: Node.js Functions in `/api`, deployed as part of the SWA.**

Use a Function when:
- An API token can't be exposed to the client (PagerDuty token, Graph client secret)
- The frontend needs server-side filtering, aggregation, or caching
- A request needs to fan out to multiple upstream APIs

Don't use a Function when:
- The API is already public and CORS-friendly
- The data is fetched at build time and shipped as static JSON

Function conventions (template-level — Azure Functions v4 programming model):
- Each endpoint is a TypeScript file under `api/src/functions/`, registered via `app.http('name', { ... })` (no `function.json` files)
- A single entry point at `api/src/index.ts` imports every function module so handlers register on startup
- Shared code lives in `api/_shared/` (sibling of `src/`, not inside it)
- All endpoints validate the SWA principal header (`x-ms-client-principal`) — `/api/*` is gated by EasyAuth at the SWA layer, but defense in depth
- Responses include cache hints (`Cache-Control`) where the upstream allows it

### Auth: EasyAuth for identity, app-level checks for fine-grained access

**Decision: same model as Tier 2 — EasyAuth for tenant gate, app code for anything finer.**

For most Tier 1 apps the EasyAuth gate is sufficient: "must be signed into the tenant." If an app needs role-based UI:
- Read `x-ms-client-principal` in a Function and look up the user's roles in a config file or Cosmos document
- Apply role-driven UI gating client-side (UX), backed by Function-level checks (security)

**Graph access:** When a Tier 1 app needs Microsoft Graph (presence, photos, directory, mail.send), use **application permissions with client-credentials flow** in a Function. Same pattern as Tier 2:
- The SWA's Entra app gets admin consent for the specific scopes it needs
- The Function uses `@azure/identity` `ClientSecretCredential` to get a Graph token
- The token is cached in-Function memory (~50 min before refresh)

Avoid delegated/on-behalf-of in Tier 1 unless the app genuinely needs to act *as* the user (e.g., reading their personal calendar). Adding MSAL.js + a second sign-in dance is rarely worth it for read-only views.

### Configuration: env-driven, no source mutation

**Decision: build-time env var substitution, not commit-time `sed`.**

The dfcu template mutates `staticwebapp.config.json` in place via `sed` during bootstrap (replacing `__TENANT_ID__` with the real tenant ID). This is one-way, breaks idempotency, and pollutes the repo with environment-specific values.

Tier 1 template fix:
- Source keeps `__TENANT_ID__` placeholder
- Bootstrap script writes `AAD_TENANT_ID` as a GitHub repository **variable** (not a secret — tenant IDs aren't sensitive)
- GH Actions workflow runs `envsubst` on `staticwebapp.config.json` immediately before deploy
- Local dev uses `.env.local` with the same variable; an npm script substitutes for local SWA CLI runs

Same pattern for any other tenant- or app-specific config (resource group names, App Insights connection strings, etc.).

### Local development

**Decision: SWA CLI for full-fidelity runs; Vite alone for pure frontend iteration.**

- `npm run dev` — Vite only, fastest, no auth, no Functions. Good for component work.
- `npm run dev:swa` — SWA CLI (`swa start`) emulates auth, Functions, and routing. Use when touching anything past the static layer.
- Mock principal: SWA CLI's built-in `/.auth/me` mocking; the template ships a default mock user (`localdev@switchthink.com`).

### Deployment: GH Actions + one-shot bootstrap script

**Decision: same shape as dfcu, generalized and made idempotent.**

Bootstrap script (`scripts/azure-deploy.sh`) — env-driven, safe to re-run:

1. Create resource group (skip if exists)
2. Create SWA Free tier (skip if exists)
3. Pull deployment token, push to GH repo as `AZURE_STATIC_WEB_APPS_API_TOKEN`
4. Create or reuse Entra app registration (lookup by display name)
5. Set redirect URI for the SWA hostname
6. Mint client secret, push as `AAD_CLIENT_SECRET` (SWA app setting)
7. Push `AAD_CLIENT_ID` to SWA app settings + as GH repo variable
8. Push `AAD_TENANT_ID` as GH repo variable
9. Print next steps including any Graph admin consent URL the app needs

GH Actions workflow:
- On `push` to `main`: build, substitute env, deploy
- On `pull_request`: build, deploy to PR preview
- On PR close: tear down preview

Every Tier 1 repo ships this exact pair. Bicep migration, slot promotion, and automated Graph consent grants are added as they prove necessary.

### Observability

**Decision: Application Insights — frontend SDK + optional Function instrumentation.**

- Connection string in SWA app settings (`APPINSIGHTS_CONNECTION_STRING`)
- Frontend: `@microsoft/applicationinsights-web` wired into root error boundary
- Functions: `applicationinsights` Node SDK auto-instrumented

Cost: free at Tier 1 scales (well under 5 GB/month).

### When NOT to use Tier 1

Promote to Tier 2 when an app needs any of:
- Persistent relational data (more than incidental Cosmos use)
- Long-running server work (>45s) — analysis, document generation, bulk exports
- Streaming AI chat or any SSE/WebSocket
- SSR (rare for internal tools, but if needed for perf, that's a Tier 2 signal)
- Cron / scheduled jobs (SWA has none — Tier 2 has Nitro plus optional Logic Apps)

If you find yourself building scaffolding to work around a Tier 1 limit, stop and promote.

## Monolith vs separate Tier 1 apps

**Default: separate apps.** Free hosting and per-app Entra registrations make isolation cheap. Each app gets its own URL, its own deploy cadence, its own auth scope. A bug in one can't take down another.

**Group into one Tier 1 app when** all of these are true:
- The features genuinely share a navigation context (the user thinks of them as "one tool")
- They share a data domain (same upstream APIs, same identity mapping)
- The combined surface stays inside the Tier 1 constraints

**Promote to a single Tier 2 app with sub-routes when** ≥3 small read-only tools serve the same audience interchangeably. At that scale, a portal experience beats a folder of separate URLs, and Tier 2's persistent layer enables shared user prefs, saved searches, etc.

## Project layout

```
my-tier1-app/
├── .github/workflows/
│   └── azure-static-web-apps.yml
├── api/                       # Functions (only if needed); v4 programming model
│   ├── _shared/               # sibling of src/, not inside it
│   │   ├── auth.ts            # validate x-ms-client-principal
│   │   ├── graph.ts           # Graph client + token cache
│   │   └── http.ts            # JSON helpers, error envelope
│   ├── src/
│   │   ├── functions/
│   │   │   └── health.ts      # registers via app.http('health', { ... })
│   │   └── index.ts           # imports all function modules
│   ├── host.json
│   ├── package.json
│   └── tsconfig.json
├── public/
├── scripts/
│   └── azure-deploy.sh        # one-shot bootstrap
├── src/
│   ├── components/
│   │   └── ui/                # shadcn components
│   ├── lib/                   # client utilities
│   ├── routes/                # TanStack Router file-based (optional)
│   ├── App.tsx
│   └── main.tsx
├── AGENTS.md                  # canonical agent instructions
├── CLAUDE.md                  # → AGENTS.md
├── README.md
├── staticwebapp.config.json
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vite.config.ts
```

## Template repo

**Decision: maintain `mwheatfill/template-az-spa` as a GitHub template repo.**

Naming convention for the broader template family (so future tiers and platforms slot in cleanly):

| Template repo | Tier | Hosting |
|---|---|---|
| `template-az-spa` | Tier 1 | Azure Static Web Apps |
| `template-az-fullstack` *(future)* | Tier 2 | Azure App Service |
| `template-cf-spa` *(future)* | Tier 1 equivalent | Cloudflare Workers + Pages |
| `template-cf-fullstack` *(future)* | Tier 2 equivalent | Cloudflare Workers |

The `az`/`cf` prefix makes the platform unambiguous at a glance. The shape suffix (`spa` / `fullstack`) describes the app pattern. Combined: a Tier 1 Azure app uses `template-az-spa`; a Tier 2 Cloudflare app uses `template-cf-fullstack`.

- "Use this template" creates a new repo with the full layout pre-configured
- New apps run `./scripts/azure-deploy.sh` and are deploying within ~30 minutes
- Template improvements pulled in manually per-app (no managed update story; fine at this scale)

Template ships:
- All conventions above wired up and working
- A working `/api/health` Function (proves the API tier loads)
- A sample shadcn page proving the design tokens load
- AGENTS.md / CLAUDE.md
- Bootstrap script
- GH Actions workflow

## AI agent instructions (AGENTS.md / CLAUDE.md)

**Decision: AGENTS.md is canonical. CLAUDE.md is a one-line pointer for cross-tool compatibility.**

AGENTS.md is becoming the cross-agent standard (Codex, Cursor, others) and Claude Code reads it natively. A separate CLAUDE.md just risks drift.

AGENTS.md content (high-level — drafted in detail when the template is built):

- **Stack and conventions** — point at this blueprint doc; don't restate
- **What's where** — `src/routes/`, `src/components/`, `api/`, etc.
- **Commands** — `npm run dev`, `dev:swa`, `build`, `test`, `test:e2e`, `lint`
- **Auth model** — every `/api/*` endpoint trusts the EasyAuth header; never skip the validation helper
- **Adding a Function** — copy `api/src/functions/health.ts` and add an import for the new module to `api/src/index.ts`; always use `_shared/http.ts` for responses
- **Adding a route** — TanStack Router file conventions; loaders for data fetching, not `useEffect`
- **Don't-do list:**
  - Don't import server-only modules into client code
  - Don't put secrets in `staticwebapp.config.json` (it ships to the client)
  - Don't add a database without checking whether this should be Tier 2 instead
  - Don't add MSAL.js without confirming app permissions can't solve the use case
  - Don't `sed` source files at deploy time — use env substitution
- **Style:** Biome formatting; no comments for what code obviously does; one-line WHY comments where intent is non-obvious

CLAUDE.md content:

```markdown
See AGENTS.md for repo conventions and agent guidance.
```

## Open questions

1. **Template-managed updates.** When the template improves, how do existing apps adopt the changes? Manual cherry-pick is fine at 2-3 apps. At 10+ it'll bite. Defer until it's a real problem.
2. **Cosmos DB free tier as the default Tier 1 store.** When a Tier 1 app needs incidental state (user prefs, saved searches, role assignments), Cosmos free tier (1000 RU/s, 25 GB) is the natural fit. Validate the Function-only access pattern.
3. **Bicep for Tier 1.** Imperative `az` is faster to write and reason about. Bicep gets idiomatic if/when Tier 1 resource graphs grow (Cosmos, Front Door, custom domains). Migrate when complexity warrants.
4. **Per-app vs shared Entra app registration.** Currently each app gets its own. For 5+ Tier 1 apps with the same audience, a single registration with multiple redirect URIs is cheaper to manage. Revisit at the 5-app mark.
5. **Mock auth in local dev.** SWA CLI's mock works but is clunky for testing role-based behavior. Worth investing in a richer dev-mode principal stub once an app needs it.
