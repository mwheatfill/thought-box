---
title: "Internal App Platform: Exploration and Decisions"
type: Working Note
status: Draft
author: "Michael Wheatfill"
description: "Running exploration log for the internal app platform architecture. Captures requirements, options evaluated, decisions made, and open questions."
---

# Internal App Platform: Exploration and Decisions

Running document tracking the architecture exploration for a lightweight, repeatable Azure platform for hosting internal web applications. Updated as decisions are made.

## Vision

SwitchThink needs a capability for rapidly building and hosting internal web applications that don't fit the Microsoft 365 low-code path (SharePoint, Power Automate, Power Apps). The development model is AI-assisted: an architect defines the requirements and architecture, an AI coding agent generates the implementation, and the architect reviews, iterates, and deploys.

The platform should be repeatable (template-based), cost-effective (Azure-native), and AI-native from day one (conversational interfaces, LLM integration, MCP-compatible APIs).

### Decision framework: when to use what

| Path | When to use |
|---|---|
| **Microsoft 365** (SharePoint, Power Automate, Power Apps) | The hardest part is the data model and the workflow. Business team can own development and maintenance. |
| **Internal App Platform** (this) | The hardest part is the user experience or the business logic. Needs richer UI, custom logic, or AI integration. |
| **Development team** | Full product with dedicated development resources and long-term roadmap. |

### First app

ThoughtBox (Desert Financial's employee suggestion system). Re-platform from InMoment (sunset May 1, 2026). 10 heavy users, 25-30 submissions/month, org-wide submission access. Existing M365 solution design exists but has tradeoffs at Phase 2+ (leader dashboard, reporting, conversational intake all require additional tools).

---

## Requirements

### Established

These emerged from the exploration and are treated as firm.

1. **Entra ID authentication.** Every app authenticates through the shared Entra ID tenant. Role-based access maps to Entra ID security groups.
2. **Azure-native.** All services billable through SwitchThink's existing Azure subscription. No external SaaS dependencies for hosting or auth.
3. **AI-native UX.** Apps should be able to evolve from traditional form interfaces toward conversational interfaces (chat, LLM classification, smart routing). This should be a natural extension, not a re-architecture.
4. **MCP and agent compatibility.** Apps expose well-documented APIs so external agents (Copilot Studio, Claude, etc.) can interact with app data. The app's API is the integration surface; different frontends (web UI, Teams bot, MCP server) are just different consumers.
5. **Simple deployment.** Self-contained. Infrastructure defined in Bicep/ARM. CI/CD through GitHub Actions. Minimal manual steps to go from repo to running app.
6. **Full-stack framework.** A single codebase for frontend and server logic. Type-safe end-to-end. Portable across hosting platforms if the need arises.
7. **Scalable architecture choices.** The framework and hosting model should accommodate apps that grow beyond simple CRUD without requiring a platform change.
8. **Cost-effective at low scale.** Individual apps serving 10-50 users should cost less than $30/month to operate.
9. **Repeatable.** New apps start from a template repo with auth, data access, UI components, and deployment pre-configured.

### Open

These need further exploration or validation.

- **Email/notification delivery.** Microsoft Graph `mail.send` from a shared mailbox is the likely approach. The app registration already needs `User.Read.All` for the directory search, so adding `Mail.Send` is incremental. Need to confirm admin consent process.
- **Background processing.** If an app needs timer-triggered jobs or queue processing, does that require a separate Azure Functions App alongside the main app? Or can Nitro handle lightweight scheduled tasks?
- **Local development workflow.** How does auth work locally? TanStack Start + Nitro may have a different local dev story than SWA CLI. Likely: mock auth in development, real Easy Auth in production.
- **Multi-tenant (future).** The architecture is scoped for internal use. Multi-tenant or client-facing delivery is a future consideration, not a current requirement.

---

## Architecture decisions

### Hosting: Azure App Service

**Decision: App Service (Linux, Node.js), not Azure Static Web Apps.**

SWA was the initial candidate for its simplicity and built-in Entra ID auth. It's the right choice for static SPAs with simple serverless APIs. But three requirements pushed us beyond what SWA supports:

- **Streaming responses.** AI chat interfaces need SSE or WebSocket to stream LLM responses to the client. SWA's managed Functions have a 45-second timeout and no WebSocket/SSE support.
- **Full-stack framework.** TanStack Start (and Next.js, Remix, etc.) need a running server process for SSR and server functions. SWA is built for static files + serverless, not full-stack apps.
- **Portability.** Server functions in a full-stack framework are more portable than Azure Functions. If the app moves to another host, the server code moves with it.

App Service provides:

- **Easy Auth** for Entra ID (same zero-code auth flow as SWA: configure provider, all requests authenticated before reaching app code, user claims in headers).
- **WebSocket and SSE support** for streaming.
- **Deployment slots** for staging/production with instant swap.
- **Bicep-deployable** infrastructure.
- **Any Node.js framework** runs without adapters.
- **Cost:** B1 plan ~$13/month. Free tier (F1) available for dev/test.

**Alternatives considered:**

| Option | Why not |
|---|---|
| Azure Static Web Apps | No WebSocket/SSE, 45s API timeout, no SSR support |
| Azure Container Apps | More operational complexity (container images, registry), higher cost floor. Good "scale up" path if App Service limits become a constraint. |
| Vercel/Netlify | Can't bill through Azure subscription. External auth dependency. |

### Framework: TanStack Start

**Decision: TanStack Start.**

TanStack Start provides type-safe server functions, file-based routing, SSR when needed, and a unified codebase. It hit v1.0 in March 2026.

**Why leaning this way:**

- Type-safe server functions mean the AI agent writes one codebase with shared types between client and server. No manual API contract maintenance.
- Built on Vite (fast dev server, fast builds).
- Uses Nitro under the hood, which is hosting-agnostic. The app isn't locked to Azure.
- TanStack Router (which it includes) is the most type-safe React router available.
- Tanner Linsley has a strong track record (TanStack Query, TanStack Table, TanStack Router are all production staples).

**Concerns to validate:**

- One month into GA. Documentation is good but not exhaustive. Some examples outdated.
- No official Azure adapter. A community proof-of-concept exists for App Service. Custom adapter maintenance is on us.
- Smaller ecosystem than Next.js. Fewer community examples, fewer blog posts, thinner AI training data.
- Auth performance: loader-based auth checks trigger server round-trips on every navigation. Needs caching strategy.

**If TanStack Start doesn't work out:**

- **Next.js** is the fallback. Bigger ecosystem, better Azure documentation, more AI training data. The Vercel hosting lock-in concern doesn't apply on App Service (it's just Node.js). App Router with server actions is a similar model.
- **Hono + Vite** is the simplicity fallback. No framework magic, maximum portability. Tradeoff: no SSR, no file-based routing.

### Design language: shadcn/ui ecosystem

**Decision: shadcn/ui as the foundation, with layered extensions.**

The design language is the set of libraries that every app inherits through the template repo. Everything shares the Tailwind theme system (CSS variables), so visual consistency is automatic.

| Layer | Library | Role |
|---|---|---|
| **Styling** | Tailwind CSS | Utility-first CSS. Theme defined in CSS variables. |
| **Components** | shadcn/ui | Buttons, forms, cards, dialogs, tabs, dropdowns, etc. Copied into project, not a dependency. |
| **Data tables** | TanStack Table (via shadcn data table pattern) | Sorting, filtering, pagination, column visibility, row selection. |
| **Command palette** | cmdk (via shadcn Command) | Cmd+K search, keyboard navigation, fuzzy search. |
| **Charts** | shadcn/ui charts (Recharts v3) | Area, bar, line, pie, radar. 53 pre-built chart components. Theme-integrated. |
| **Dashboard components** | Tremor (optional) | Higher-level analytics widgets: KPI cards, sparklines, progress bars, date range pickers. Complementary to shadcn, not conflicting (same Tailwind + Recharts foundation). |
| **AI chat interface** | assistant-ui + AI SDK | Pre-built chat components (streaming, markdown, tool calls, file attachments). Integrates with shadcn theming and Vercel AI SDK. |
| **Email templates** | React Email + @react-email/tailwind | Email as React components. Render to HTML, send via Graph. Tailwind styling. Outlook-compatible. |
| **Animation** | Motion v12 (formerly Framer Motion) | Page transitions, micro-interactions, layout animations. 3.5M weekly downloads. |
| **Toast notifications** | Sonner (via shadcn) | Non-blocking notifications. |
| **Schema validation** | Zod | Runtime validation for API inputs, form data, environment variables. TanStack Start and TanStack Form integrate natively. |
| **Forms** | TanStack Form + Zod | Type-safe forms with validation. Same ecosystem as Router and Query. |
| **Testing (unit)** | Vitest + Testing Library | Fast, Vite-native unit and component tests. |
| **Testing (e2e)** | Playwright | Real browser, real auth flow, full end-to-end verification. |
| **Code quality** | Biome (or ESLint + Prettier) | Formatting and linting. Enforces consistency across human and AI-generated code. |
| **Logging** | Pino | Structured JSON logging with Application Insights transport. Fast, low overhead. |

**Template infrastructure (not per-app decisions, baked into the template):**

| Concern | Approach |
|---|---|
| **Structured logging** | Pino. JSON output, log levels (debug/info/warn/error), structured fields (userId, ideaId, etc.). Application Insights transport so logs, metrics, and errors land in one dashboard. |
| **Healthcheck endpoint** | `GET /api/health` checks database connectivity, returns status. App Service uses this for warmup. Scheduled ping prevents B1 cold starts. |
| **Environment variable validation** | `env.ts` using Zod to validate required variables at startup (database URL, Entra ID client ID, Graph config). Fails fast with clear error on misconfiguration. |
| **Client-side error monitoring** | Application Insights JavaScript SDK wired into a root-level React error boundary. Catches rendering errors, unhandled exceptions, reports to App Insights. |
| **Light/dark/system mode** | shadcn/ui handles this natively. Template includes theme provider with no-flash script (sets theme before React hydration). |
| **Pre-commit hooks** | Husky + lint-staged. Runs Biome (or ESLint + Prettier) on staged files before commit. Keeps AI-generated code consistent. |

**Resiliency defaults (zero-cost, baked into the template):**

| Concern | Approach |
|---|---|
| **Process self-healing** | App Service health check configured to ping `/api/health`. Automatic restart on failure. Bicep config toggle. |
| **Database connection retry** | Drizzle connection wrapper retries once on transient failures (network blips, PostgreSQL maintenance). A few lines of code. |
| **Client-side retry** | TanStack Query configured with sensible defaults: retry 2x on failure, stale-while-revalidate so UI shows cached data while refreshing. |
| **Route-level error boundaries** | React error boundary at each route catches rendering errors, reports to Application Insights, shows recovery UI instead of white screen. |

**Known extension points (not in template, added per-app when needed):**

| Concern | Approach when needed |
|---|---|
| **Zero-downtime deploys** | App Service deployment slots (staging/production swap). Available on B1, configure when needed. |
| **Image/file storage** | Azure Blob Storage. ThoughtBox needs optional screenshot uploads. Add per-app. |
| **Server-side caching** | In-memory or Azure Cache for Redis. TanStack Query handles client-side caching by default. |
| **Queue-based processing** | Azure Service Bus or Storage Queues for guaranteed delivery of background tasks. Not needed when logging + retry is sufficient. |
| **WAF/DDoS protection** | Azure Front Door or Application Gateway. Not relevant for internal tools behind Entra ID auth. |
| **Database scaling** | Read replicas, PgBouncer connection pooling. Nowhere near these thresholds at 25-30 monthly interactions. |
| **Internationalization** | Not scoped for internal apps at Desert Financial (English-only). Add if needed. |
| **Feature flags** | Azure App Configuration or LaunchDarkly. Add when an app needs controlled rollouts. |
| **Request mocking (dev)** | MSW (Mock Service Worker) for testing against third-party APIs without live calls. |

**Design language as template config:**

All of this lives in the template repo:

- `tailwind.config.ts` defines brand colors, fonts, border radius, spacing scale
- `globals.css` defines shadcn CSS variables (light/dark mode)
- `src/components/ui/` contains shadcn components
- `src/components/chat/` contains assistant-ui components
- Chart defaults follow the shadcn theme (CSS variable-based colors)

When an AI agent builds a new app from the template, the design language is inherited. The agent focuses on app-specific routes, data model, and business logic.

### Data layer: Azure PostgreSQL (Flexible Server) + Drizzle ORM

**Decision: PostgreSQL over Azure SQL. Drizzle over Prisma.**

**Why PostgreSQL:**
- Drizzle's PostgreSQL support is the most mature path (first dialect fully supported).
- The Node.js/TypeScript ecosystem is PostgreSQL-oriented. More community examples, more blog posts, more AI training data. AI agents produce better PostgreSQL code.
- Portable. Every cloud has managed PostgreSQL. Azure SQL is Microsoft-only.
- Azure Database for PostgreSQL Flexible Server supports Entra ID managed identity authentication.

**Why Drizzle:**
- Now ahead of Prisma in adoption (5.1M vs 4.3M npm weekly downloads, flipped Q1 2026).
- 7.4KB bundle vs Prisma's 1.6MB. Matters for App Service cold starts.
- SQL-like syntax produces better output from AI coding agents. Migration files are readable SQL.
- Better managed identity story: uses `@azure/identity` + `node-postgres` for token-based auth. Prisma doesn't have native managed identity support (GitHub issue #12562, requires custom middleware).
- Schema-as-code: database schema lives in the repository alongside application code, version-controlled migrations.

**Infrastructure:**
- One shared Azure PostgreSQL Flexible Server, per-app databases.
- Burstable tier (B1ms, ~$13/month for the server). Multiple databases share the server.
- Connection via managed identity (Entra ID token-based, no passwords in config). Token acquisition through `@azure/identity` DefaultAzureCredential, refreshed hourly.
- Server name: `psql-switchthink-apps` (or similar, following the naming convention).

**Cost note:** PostgreSQL Flexible Server's burstable tier doesn't auto-pause like Azure SQL Serverless. The server runs continuously at ~$13/month. For a platform hosting 2-3 apps on the same server, this is acceptable. The marginal cost of additional databases on the same server is negligible.

**Options ruled out:**
- **Azure SQL Database (Serverless):** Auto-pause is attractive, but Drizzle's mssql driver is less mature, the Node.js ecosystem leans PostgreSQL, and portability favors PostgreSQL.
- **Prisma (either database):** No native managed identity support. Larger bundle (1.6MB). AI agents produce slightly lower quality output with Prisma's schema DSL vs. Drizzle's SQL-like syntax.
- **Turso (libSQL/SQLite):** Architecturally compelling (near-zero latency, generous free tier), but external SaaS. Can't bill through Azure subscription.
- **Self-contained database (SQLite on App Service):** App Service filesystem is not persistent. Every deployment or restart wipes local state. Not viable.

### Auth: Easy Auth for authentication, app-level roles for authorization

**Decision: Easy Auth handles identity. The app handles permissions. No Entra ID groups for app roles.**

**Authentication (Entra ID via Easy Auth):**
- Easy Auth handles the Entra ID OAuth flow at the platform level. Zero auth code.
- User identity (name, email, Entra ID object ID) available in request headers (`x-ms-client-principal`).
- One Entra ID app registration per app, per environment.

**Authorization (app-level roles in the database):**
- Roles are managed in the app's own database, not Entra ID groups.
- App owners assign roles through an admin UI in the app (no Azure portal access needed).
- Default role on first login: `submitter` (or app-appropriate equivalent).
- The business owns their own role management. IT is not in the loop for role changes.

**User provisioning (proactive via Microsoft Graph):**
- Admins can search the Entra ID directory from within the app and add users before they ever log in.
- Uses Microsoft Graph `/users?$search` with application-level `User.Read.All` permission (admin-consented, read-only).
- On first login, Easy Auth provides the Entra ID object ID. The app matches it to any existing record (admin pre-created) or creates a new one with the default role.
- This lets app owners configure the entire role and routing setup before go-live.

**User table pattern (template-level):**

| Column | Purpose |
|---|---|
| `entraId` | Entra ID object ID (primary key for identity matching) |
| `email` | From Graph or Easy Auth |
| `displayName` | From Graph or Easy Auth |
| `role` | App-specific (e.g., `submitter`, `leader`, `admin`) |
| `source` | `graph` (admin-added) or `login` (self-created on first visit) |
| `firstSeen` | First login timestamp (null if admin-added, not yet logged in) |

**Template includes:**
- Login flow: check for existing user record by Entra ID object ID, create or update on login.
- Admin "Add user" dialog: search field that queries Graph, shows matching employees, assigns a role.
- Role check middleware: server function reads user identity from Easy Auth headers, looks up role in database, authorizes.

**When Entra ID groups DO make sense:** For organizational roles that already exist as groups (e.g., "all branch managers," "all SwitchThink employees"). Reference via group claims in the token. But for app-specific roles (ThoughtBox leader for Digital Banking), that's app data.

**MSAL:** Add `@azure/msal-node` only when an app needs to call downstream APIs with delegated user permissions beyond the Graph directory search (e.g., sending email as the user, reading calendars).

**Options ruled out:**
- **Entra ID groups for app roles:** Requires IT/admin for every role change. Not self-service for the business.
- **Better Auth or similar auth library:** Replaces Easy Auth, adding OAuth flow management, session handling, and attack surface for something already handled at the platform level.
- **SCIM provisioning:** Enterprise plumbing for automated sync at scale. Overkill for 10-50 user internal tools.

### AI integration: Vercel AI SDK (not TanStack AI, yet)

**Decision: Vercel AI SDK now. Monitor TanStack AI for future migration.**

**Why AI SDK over TanStack AI:**
- TanStack AI launched January 2026 and is still **alpha**. Breaking changes expected. Requires Node.js 24+.
- assistant-ui (our chat UI layer) only integrates with the Vercel AI SDK. No TanStack AI support as of April 2026. This is the deciding factor.
- AI SDK is production-ready (v6+), has documented Azure OpenAI support, and 25+ provider integrations.

**Why TanStack AI is worth watching:**
- Isomorphic tool definitions (write once, share between server and client). Less code duplication.
- `createServerFnTool()` integrates naturally with TanStack Start's server functions.
- Provider-agnostic, no vendor coupling.
- When it hits 1.0 and assistant-ui adds support, migration from AI SDK is straightforward (similar React hooks API).

**Current stack:**
- AI SDK (`ai` npm package) for streaming, tool calling, structured output.
- Works with TanStack Start server functions.
- assistant-ui for chat UI components (integrates with AI SDK and shadcn theming).
- Provider choice (Azure OpenAI vs. Anthropic) decided per-app. AI SDK supports both. Azure OpenAI keeps billing in Azure. Anthropic may offer better model quality for certain tasks.

### Email: React Email + Microsoft Graph

**Decision: React Email for templates. Microsoft Graph for delivery.**

- Write email templates as React components in `/src/emails/`. Same TypeScript, same JSX syntax as the rest of the app.
- Render to HTML string via `@react-email/render`. Send HTML via Microsoft Graph `mail.send` from a shared mailbox.
- React Email works independently of Resend (the sending service from the same team). No external SaaS dependency.
- Tailwind CSS support via `@react-email/tailwind`. Share brand colors with the app's Tailwind config.
- Handles Outlook's Word rendering engine quirks internally (table-based layouts under the hood, modern component syntax on top).
- Clone production-quality templates (Stripe, Vercel, Linear patterns) and customize with brand colors and content.

**Template pattern:**
```
src/emails/
  IdeaAssignedEmail.tsx      # Leader gets notified of new assignment
  IdeaClosed Email.tsx        # Submitter gets notified of outcome
  WelcomeEmail.tsx            # First-time user welcome (optional)
  components/
    EmailLayout.tsx           # Shared header, footer, brand wrapper
```

Each template accepts typed props (idea title, submitter name, leader name, status) and renders branded HTML. The sending service calls `render(<IdeaAssignedEmail {...data} />)` and passes the result to Graph.

**Graph permissions (per app registration):**
- `Mail.Send` (application, admin-consented) for sending from shared mailbox.
- Combined with `User.Read.All` (already needed for directory search).
- Send endpoint: `POST /users/{sharedMailboxEmail}/sendMail` with `contentType: 'HTML'`.

### Deployment: Direct Node.js on App Service + GitHub Actions + Bicep

**Decision: Deploy built Node.js output directly to App Service. No containers.**

- App Service runs the Node.js runtime natively (Linux). No Dockerfile, no container registry.
- GitHub Actions workflow: build the TanStack Start app, zip the output, deploy to App Service.
- Each app is a GitHub repository in the SwitchThink org.
- Push to `main` deploys to production.
- Pull requests deploy to a staging slot (App Service deployment slots).
- Bicep template defines all Azure resources (App Service Plan, App Service, SQL Database, App Insights).
- Target: a new app goes from `az deployment group create` + repo clone to running in under an hour.

**Why not containers:** Adding a Dockerfile, Azure Container Registry (~$5/month), and image build/push step is overhead with no payoff for single Node.js apps serving 10-50 users. If a future app needs containers (multi-service architecture, non-Node.js runtime), adding a Dockerfile to an existing app is trivial. Start simple.

**Shared App Service Plan (cost optimization):** Multiple low-traffic apps can share a single App Service Plan (B1, ~$13/month). Each app is a separate App Service instance on the same plan, with independent deployment, custom domains, and Easy Auth configuration. The plan's CPU/memory is shared, which is fine at ThoughtBox scale. This means the marginal hosting cost of the second app is $0 (just the SQL database).

### Monitoring: Application Insights

**Decision: Application Insights on every app.**

- Auto-instrumented for the Node.js server.
- Frontend telemetry via the Application Insights JavaScript SDK (in the template).
- Cost: effectively free at ThoughtBox scale (under 5 GB/month ingestion).

---

## Open questions

1. **TanStack Start on App Service.** The community proof-of-concept exists, but we need to validate: does Easy Auth work with Nitro's request handling? Does SSE streaming work through Easy Auth? What does the custom adapter look like?
2. **Drizzle + PostgreSQL managed identity.** Token acquisition via `@azure/identity` with `node-postgres` driver. Need to validate the token refresh pattern in TanStack Start's server function context during the template build.
3. **Graph permissions admin consent.** The app registration needs `User.Read.All` and `Mail.Send` (both application-level). Need to confirm: can Michael grant admin consent, or does this go through InfoSec?
4. **LLM provider.** Azure OpenAI (keeps billing in Azure) vs. Anthropic (possibly better model quality). Can we use both through the AI SDK and decide per-app?
5. **App registration permissions.** Can Michael create Entra ID app registrations, or does this require a request through InfoSec?
6. **Cold starts.** App Service B1 doesn't have "always on" (that's B2+). What's the cold start experience for TanStack Start (SSR + Drizzle connection)? Is it acceptable for a 10-user internal tool? Alternative: health check ping to keep the app warm.
7. **PostgreSQL Flexible Server sizing.** B1ms (~$13/month) is the cheapest burstable tier. Need to confirm it handles multiple low-traffic databases without performance issues.

---

## Exploration log

### 2026-04-08

**Session context:** Michael was working through the ThoughtBox re-platform design (M365 path: SharePoint Lists + Power Automate) and identified tension between the M365 approach and a custom-built alternative using AI-assisted development.

**Key insight:** The M365 path is architecturally simple for Phase 1 but fragments across four tools (SharePoint, Power Automate, Power Apps, Power BI) for the full vision. A well-structured custom app delivers the whole thing as one coherent experience, potentially faster, and establishes a repeatable pattern for future apps.

**Explored:**

- **Azure Static Web Apps** as the hosting platform. Initially attractive (built-in Entra ID auth, $9/month, simple). Ruled out because of 45-second API timeout, no WebSocket/SSE (needed for streaming AI chat), and no SSR support.
- **TanStack Start** as the full-stack framework. v1.0 March 2026. Type-safe server functions, Vite-based, Nitro server (hosting-agnostic). Concerns: one month into GA, no official Azure adapter, thinner ecosystem than Next.js. Leaning this direction.
- **Next.js** as the alternative. Bigger ecosystem, better Azure docs, more AI training data. Vercel lock-in is a non-issue on App Service. Solid fallback.
- **shadcn/ui ecosystem** for design language. Comprehensive: shadcn/ui (components), Recharts v3 (charts), TanStack Table (data tables), Tremor (dashboard widgets), assistant-ui (AI chat), Motion v12 (animation), cmdk (command palette). All share Tailwind theme system.
- **App Service** as the hosting platform. Easy Auth for Entra ID (zero-code, same model as SWA). WebSocket/SSE support. Deployment slots. Bicep-deployable. Any framework runs. ~$13/month for B1.
- **AI-native UX** as a day-one requirement. Apps should support conversational interfaces, LLM integration, and MCP-compatible APIs from the start. This drove the shift from SWA to App Service.

**Decisions made:** App Service over SWA. TanStack Start as framework. Direct Node.js deployment (no containers). PostgreSQL over Azure SQL. Drizzle over Prisma. App-level roles over Entra ID groups (with Graph directory search for proactive user provisioning). shadcn/ui ecosystem for design language. Vercel AI SDK over TanStack AI (alpha, no assistant-ui support yet). React Email + Microsoft Graph for notifications. Bicep for infrastructure. GitHub Actions for CI/CD. Shared App Service Plan for cost optimization.

**Additional decisions (later in session):**
- Vercel AI SDK over TanStack AI (alpha, no assistant-ui support). Monitor TanStack AI for 1.0.
- React Email + Microsoft Graph for branded transactional emails. Graph sends through existing Exchange Online, no separate service.
- App-level roles in database over Entra ID groups. Admins manage roles in the app UI. Graph directory search (`User.Read.All`) for proactive user provisioning before first login.
- Zod for runtime schema validation (TanStack Start and Form integrate natively).
- TanStack Form for type-safe forms.
- Vitest + Testing Library for unit/component tests. Playwright for e2e.
- Biome (or ESLint + Prettier) for code formatting and linting.
- Healthcheck endpoint, env validation, client-side error boundaries, pre-commit hooks as template infrastructure.
- Azure Blob Storage, caching, i18n, feature flags, MSW as known extension points (per-app, not template defaults).

**Decisions pending:** LLM provider per-app (Azure OpenAI vs. Anthropic). Local development workflow. TanStack Start + App Service + Easy Auth validation. Graph permissions admin consent process.
