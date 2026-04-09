# ThoughtBox

Employee idea and suggestion platform for Desert Financial Credit Union. AI-first intake, modern dashboard, built on Azure App Service.

## Quick reference

| Item | Value |
|---|---|
| Framework | TanStack Start (v1.x) |
| Language | TypeScript (strict mode) |
| Runtime | Node.js 22 LTS |
| Package manager | pnpm |
| Database | PostgreSQL (Drizzle ORM) |
| UI | shadcn/ui + Tailwind CSS |
| AI | Vercel AI SDK + assistant-ui |
| Auth | Azure App Service Easy Auth (Entra ID) |
| Email | React Email + Microsoft Graph |
| Testing | Vitest + Testing Library |
| Code quality | Biome (format + lint) |
| Git hooks | Husky + lint-staged |
| Deployment | GitHub Actions → Azure App Service |
| Infrastructure | Bicep |

## Architecture

Read these documents (in this order) before building:

1. `docs/prd-thoughtbox-app.md` — what to build (product requirements, data model, routes, AI spec, design direction)
2. `docs/app-platform-exploration.md` — what to build it with (platform architecture decisions and rationale)

The PRD is the source of truth for features. The platform exploration is the source of truth for technology choices. When they conflict, the PRD wins on product decisions and the platform exploration wins on infrastructure decisions.

## Project structure

```
thoughtbox/
├── .github/
│   └── workflows/
│       └── deploy.yml              # GitHub Actions: build, test, deploy to App Service
├── infra/
│   ├── main.bicep                  # All Azure resources
│   └── parameters/
│       ├── dev.bicepparam
│       └── prod.bicepparam
├── src/
│   ├── routes/                     # TanStack Start file-based routes
│   │   ├── __root.tsx              # Root layout (sidebar, theme provider, error boundary)
│   │   ├── index.tsx               # Landing page (hero + AI chat)
│   │   ├── dashboard.tsx           # Role-aware dashboard
│   │   ├── ideas/
│   │   │   └── $ideaId.tsx         # Idea detail view
│   │   └── admin/
│   │       ├── categories.tsx
│   │       ├── routing.tsx
│   │       ├── users.tsx
│   │       └── settings.tsx
│   ├── server/                     # Server-side code
│   │   ├── functions/              # TanStack Start server functions
│   │   │   ├── ideas.ts            # CRUD, status changes, reassignment
│   │   │   ├── messages.ts         # Leader-submitter comment thread (addMessage, getIdeaMessages)
│   │   │   ├── categories.ts       # CRUD for category taxonomy
│   │   │   ├── users.ts            # Directory search, role management, profile enrichment
│   │   │   ├── dashboard.ts        # KPI stats, chart data, activity feed
│   │   │   ├── landing.ts          # Yearly count, personal count, social proof, suggested prompts
│   │   │   ├── ai.ts               # Chat streaming, tool definitions, conversation storage
│   │   │   ├── email.ts            # Send notifications via Graph
│   │   │   └── settings.ts         # App settings CRUD
│   │   ├── middleware/
│   │   │   └── auth.ts             # Easy Auth header parsing, user lookup/creation, role check
│   │   ├── db/
│   │   │   ├── schema.ts           # Drizzle schema (all tables)
│   │   │   ├── index.ts            # Database connection (with retry)
│   │   │   └── seed.ts             # Seed categories, admin users, system prompt
│   │   └── lib/
│   │       ├── graph.ts            # Microsoft Graph client (user profiles, photos, email)
│   │       ├── sla.ts              # Business days calculation, SLA due dates
│   │       ├── submission-id.ts    # TB-NNNN sequence generation
│   │       └── env.ts              # Zod-validated environment variables
│   ├── components/
│   │   ├── ui/                     # shadcn/ui components (generated via CLI)
│   │   ├── chat/                   # assistant-ui chat components
│   │   ├── dashboard/              # KPI cards, charts, data tables
│   │   ├── ideas/                  # Idea detail, activity timeline, people card
│   │   └── layout/                 # Sidebar, nav, theme toggle
│   ├── emails/                     # React Email templates
│   │   ├── components/
│   │   │   └── EmailLayout.tsx     # Shared header, footer, brand wrapper
│   │   ├── IdeaSubmitted.tsx
│   │   ├── IdeaAssigned.tsx
│   │   ├── StatusChanged.tsx
│   │   ├── IdeaReassigned.tsx
│   │   ├── NewMessage.tsx
│   │   └── WatcherAlert.tsx
│   ├── lib/
│   │   ├── utils.ts                # cn() helper, formatting utilities
│   │   └── constants.ts            # Status labels, role labels, impact areas
│   ├── hooks/                      # Custom React hooks
│   └── styles/
│       └── globals.css             # Tailwind base + shadcn CSS variables
├── drizzle/
│   └── migrations/                 # Drizzle Kit generated SQL migrations
├── tests/
│   ├── unit/                       # Server function and utility tests
│   ├── components/                 # React component tests (Testing Library)
│   └── setup.ts                    # Test configuration
├── public/                         # Static assets
├── .env.example                    # Template for environment variables
├── biome.json                      # Biome configuration
├── drizzle.config.ts               # Drizzle Kit configuration
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── package.json
└── CLAUDE.md                       # This file
```

## Getting started

### Initial scaffolding

```bash
# Create project
pnpm create @tanstack/start thoughtbox
cd thoughtbox

# Install dependencies (see full list in Dependencies section below)
pnpm install

# Initialize shadcn/ui
pnpm dlx shadcn@latest init

# Add shadcn components (add more as needed)
pnpm dlx shadcn@latest add button card input label badge dialog sheet sidebar \
  table select textarea dropdown-menu command avatar tooltip separator skeleton \
  alert scroll-area tabs popover calendar date-picker chart sonner

# Set up Drizzle
pnpm drizzle-kit generate  # after writing schema.ts
pnpm drizzle-kit migrate   # apply to local PostgreSQL

# Install TanStack Router docs as Claude Code context rules
pnpm add -g vibe-rules
vibe-rules install claude-code

# Set up Biome
pnpm dlx @biomejs/biome init

# Set up Husky
pnpm dlx husky init
```

### Local PostgreSQL

Use Docker for local development:

```bash
docker run --name thoughtbox-db -e POSTGRES_PASSWORD=local -e POSTGRES_DB=thoughtbox -p 5432:5432 -d postgres:16
```

Connection string: `postgresql://postgres:local@localhost:5432/thoughtbox`

## Development workflow

### Git

**Commit proactively.** Do not wait to be asked. Commit after every meaningful unit of work. A "meaningful unit" is any of these:

- A feature or sub-feature that works (e.g., "auth middleware complete," "AI chat intake functional")
- A new file or set of related files that form a coherent piece (e.g., "Drizzle schema and initial migration")
- A bug fix, refactor, or configuration change
- Dependencies installed or updated

**Commit cadence:** If you've been working for more than 10-15 minutes without committing, you're probably overdue. Err on the side of committing too often rather than too rarely. Small, focused commits are easier to review, revert, and understand.

**Commit workflow:**
1. Run `pnpm check:fix` to auto-format
2. `git add` the relevant files (be specific, not `git add .`)
3. Commit with a descriptive message using conventional commit prefixes

**Message prefixes:** `feat(chat):`, `feat(dashboard):`, `feat(admin):`, `fix(auth):`, `chore(deps):`, `chore(config):`, `refactor(ideas):`, `test(sla):`, `docs:`.

**Branch strategy:** Work on `main` for initial scaffolding. Create feature branches (`feat/ai-chat-intake`, `feat/leader-dashboard`) once the foundation is stable.

**Never commit:** `.env` files, `node_modules/`, secrets, API keys.

### Commands

```bash
pnpm dev              # Start dev server (TanStack Start + Vite)
pnpm build            # Production build
pnpm start            # Start production server
pnpm check            # Run Biome (format + lint)
pnpm check:fix        # Auto-fix Biome issues
pnpm test             # Run Vitest (unit + component tests)
pnpm test:watch       # Vitest in watch mode
pnpm db:generate      # Generate Drizzle migration from schema changes
pnpm db:migrate       # Apply pending migrations
pnpm db:seed          # Seed initial data (categories, admin users)
pnpm db:studio        # Open Drizzle Studio (database browser)
pnpm email:preview    # Open React Email preview server
```

### Local development

- Copy `.env.example` to `.env` and fill in values.
- For local auth, mock the Easy Auth headers. Create a middleware that injects test user identity when `NODE_ENV=development`. Production uses real Easy Auth headers.
- For local database, use a local PostgreSQL instance or Docker container. Connection string in `.env`.
- For AI testing, use Anthropic API key in `.env`. The AI SDK provider is configurable.
- For email testing, use React Email's preview server (`pnpm email:preview`) to see rendered templates. Don't send real emails in development.

## Coding standards

### TypeScript

- Strict mode enabled (`"strict": true` in tsconfig).
- No `any` types. Use `unknown` and narrow with type guards when the type is genuinely unknown.
- Prefer `interface` for object shapes, `type` for unions and intersections.
- Export types alongside their implementations. Co-locate types with the code that uses them.
- Use Zod schemas for runtime validation at system boundaries (API inputs, environment variables, external API responses). Derive TypeScript types from Zod schemas with `z.infer<>` to avoid duplication.

### React

- Functional components only. No class components.
- Use `function` declarations for components (not arrow functions assigned to variables). This improves stack traces and React DevTools.
- Co-locate component files: `ComponentName.tsx` in the folder where it's used. Only promote to `components/` when shared across multiple routes.
- Keep components focused. If a component file exceeds ~150 lines, consider extracting sub-components.
- Use TanStack Query for all server data fetching. No raw `fetch` or `useEffect` for data.
- Use TanStack Form + Zod for forms. No uncontrolled form patterns.

### Server functions

- Every server function validates inputs with Zod before processing.
- Every server function checks authentication (user must exist in context) and authorization (user role permits the action).
- Return structured errors, not thrown exceptions. Use a consistent `{ data, error }` pattern or TanStack Start's built-in error handling.
- Keep server functions thin. Business logic goes in `server/lib/` modules that server functions call.
- Log meaningful events with Pino (idea created, status changed, email sent). Include structured context (ideaId, userId, action).

### Database

- Schema changes go through Drizzle migrations. Never modify the database directly.
- Use the Drizzle query builder for all database access. No raw SQL except in migrations.
- Wrap multi-step operations in transactions (e.g., create idea + create event + send notification).
- Soft delete only (`active: false`). No hard deletes.
- All timestamps are UTC. Convert to local time only in the UI layer.

### Styling

- Use Tailwind utility classes. No custom CSS except in `globals.css` for theme variables.
- Use shadcn/ui components for all standard UI elements (buttons, inputs, cards, dialogs, tables, badges, etc.). Do not build custom versions of components shadcn already provides.
- Follow the shadcn/ui patterns for component composition. Use `className` prop with `cn()` for style overrides.
- Responsive design: mobile-first. Use Tailwind breakpoints (`sm:`, `md:`, `lg:`).
- Dark mode: use CSS variables from the shadcn theme. Never hardcode colors.
- Motion: use `transition-*` Tailwind classes for simple hover/focus states. Use Motion v12 (`motion/react`) for enter/exit animations, page transitions, and layout animations.

### AI integration

- The AI system prompt is loaded from the database `settings` table, not hardcoded. This allows tuning without redeployment.
- Category taxonomy is injected into the system prompt dynamically from the `categories` table on each conversation start.
- Use Vercel AI SDK's `streamText` for the chat interface. Use `tool` definitions for structured actions (submit_idea, redirect_to_form, get_category_details).
- assistant-ui components handle the chat rendering. Do not build a custom chat UI.
- Store every conversation in the `conversations` table, including abandoned and redirected ones.

### Engagement and celebration

- Use `canvas-confetti` for the submission celebration moment. Brief burst (1-2 seconds) on confirmation. Tasteful, not over-the-top.
- The landing page social proof strip ("12 ideas shared this month") uses `getRecentActivitySummary()`. Only show when monthly count exceeds the `social_proof_min_threshold` setting.
- Suggested prompt pills below the chat input are loaded from the `suggested_prompts` setting (JSON array). Clicking a pill populates the chat input.
- The submitter dashboard stat card ("You've shared 3 ideas this year") uses `getUserSubmissionCount()`. Use a lightbulb icon (Lucide) that visually reflects the count.
- First-time submitter message: "Your first idea! Welcome to ThoughtBox." Returning submitters see their count.
- Admin activity feed uses `getRecentProgramActivity()` (pulls from `idea_events` table, last 48 hours).
- Empty states are designed, not default "No data." Each view has a warm, encouraging empty state with an illustration or icon and a call to action.

### Email

- Write email templates as React Email components in `src/emails/`.
- Every email template accepts typed props. No inline data construction.
- Use the shared `EmailLayout` component for consistent header/footer/branding.
- Send through Microsoft Graph `mail.send` from the shared mailbox configured in settings.
- Email sending failures should not block the primary action (idea creation, status change). Log the failure, show a success to the user, retry in the background.

### Error handling

- Every route has a React error boundary.
- Server function failures return structured error objects, not unhandled exceptions.
- UI shows the previous state with an error toast on failure (optimistic updates via TanStack Query).
- If the AI provider is down, surface the fallback traditional form.
- Log all errors to Application Insights with structured context.
- Never show raw error messages or stack traces to users.

## Testing

### What to test

- **Server functions:** Auth checks (unauthorized user gets rejected, role check works), input validation (bad data rejected), business logic (SLA calculation, status transitions, reassignment rules), data integrity (submission ID generation, event logging).
- **Utilities:** Business days calculation, submission ID formatting, role hierarchy checks.
- **Components:** Dashboard renders correct view per role, status badges show correct colors, SLA indicators calculate correctly, empty states render when no data.
- **AI tools:** Tool definitions return correct structured data, classification maps to expected categories.

### What NOT to test

- shadcn/ui component internals (they're already tested upstream).
- Tailwind class application (visual testing is better handled by screenshots).
- Third-party library behavior (Graph API responses, AI SDK streaming).

### Test patterns

- Use `describe` blocks organized by feature, not by file.
- Test the behavior, not the implementation. "When a leader changes status to accepted, the submitter receives an email" not "updateIdeaStatus calls sendNotification."
- Mock external services (Graph API, AI provider) at the boundary. Do not mock internal modules.
- Use factory functions for test data (createTestUser, createTestIdea) to avoid repetitive setup.

## Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `idea-detail.tsx`, `sla-utils.ts` |
| Components | PascalCase | `IdeaDetail`, `KpiCard` |
| Functions | camelCase | `getAssignedIdeas`, `calculateSlaDueDate` |
| Server functions | camelCase, verb-first | `createIdea`, `updateIdeaStatus`, `getMyIdeas` |
| Database tables | snake_case (plural) | `ideas`, `idea_events`, `categories` |
| Database columns | camelCase (Drizzle maps to snake_case) | `assignedLeaderId`, `slaDueDate` |
| CSS variables | shadcn convention | `--primary`, `--muted-foreground` |
| Environment variables | SCREAMING_SNAKE_CASE | `DATABASE_URL`, `AI_PROVIDER` |
| Branches | kebab-case with prefix | `feat/ai-chat-intake`, `fix/sla-calculation` |
| Commits | conventional commits | `feat(chat): add suggested prompt pills` |

## Environment variables

See `.env.example` for the full list. Required variables are validated at startup via Zod (`src/server/lib/env.ts`). The app fails fast with a clear error message if any required variable is missing.

Critical variables:
- `DATABASE_URL` — PostgreSQL connection string
- `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` — Entra ID app registration
- `GRAPH_CLIENT_ID` / `GRAPH_CLIENT_SECRET` — Graph API app registration (may be same as above)
- `THOUGHTBOX_SHARED_MAILBOX` — Email sending address
- `AI_PROVIDER` — `anthropic` or `azure-openai`
- Provider-specific: `ANTHROPIC_API_KEY` or `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_DEPLOYMENT`

## Dependencies to install

### Core
```
@tanstack/start @tanstack/react-router @tanstack/react-query
react react-dom
drizzle-orm postgres
zod
```

### UI
```
tailwindcss @tailwindcss/vite
class-variance-authority clsx tailwind-merge
lucide-react
motion sonner cmdk canvas-confetti
recharts
@tanstack/react-table
@tanstack/react-form
```

### AI
```
ai @ai-sdk/anthropic @ai-sdk/azure
@assistant-ui/react @assistant-ui/react-ai-sdk
```

### Email
```
@react-email/components @react-email/render @react-email/tailwind
```

### Graph API
```
@microsoft/microsoft-graph-client @azure/identity
```

### Dev
```
typescript @types/react @types/react-dom
vitest @testing-library/react @testing-library/jest-dom
@biomejs/biome
drizzle-kit
husky lint-staged
dotenv
```

## TanStack Start reference patterns

TanStack Start hit v1.0 in March 2026. Training data is thin. The `vibe-rules` package installs TanStack Router's official docs as context rules for Claude Code (run `vibe-rules install claude-code` during setup). Use those rules plus the patterns below. Do not mix in Next.js patterns (no `use server` directive, no `getServerSideProps`, no `app/` directory conventions).

### Server functions

Import from `@tanstack/react-start`, not `@tanstack/start`:

```typescript
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

// GET (default method)
export const getIdeas = createServerFn().handler(async () => {
  const ideas = await db.select().from(ideasTable)
  return ideas
})

// POST with Zod input validation
const CreateIdeaSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  categoryId: z.string(),
})

export const createIdea = createServerFn({ method: 'POST' })
  .inputValidator(CreateIdeaSchema)
  .handler(async ({ data }) => {
    // data is typed from the Zod schema
    const idea = await db.insert(ideasTable).values(data).returning()
    return idea
  })
```

### Middleware (auth pattern)

```typescript
import { createMiddleware } from '@tanstack/react-start'

// Auth middleware: reads Easy Auth headers, looks up user, attaches to context
export const authMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const entraId = getEntraIdFromHeaders(request)
    if (!entraId) throw new Error('Unauthorized')

    const user = await db.query.users.findFirst({
      where: eq(usersTable.entraId, entraId),
    })

    // Pass user to downstream middleware and handlers via context
    return next({ context: { user } })
  },
)

// Role-checking middleware (chains on auth)
export const leaderMiddleware = createMiddleware()
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    if (context.user.role !== 'leader' && context.user.role !== 'admin') {
      throw new Error('Forbidden')
    }
    return next({ context })
  })

// Use middleware on server functions
export const getAssignedIdeas = createServerFn()
  .middleware([leaderMiddleware])
  .handler(async ({ context }) => {
    // context.user is available and typed
    return db.select().from(ideasTable)
      .where(eq(ideasTable.assignedLeaderId, context.user.id))
  })
```

### File-based routing

Routes live in `src/routes/`. The file structure determines the URL structure.

```
src/routes/
├── __root.tsx           # Root layout (html, body, sidebar, theme provider)
├── index.tsx            # /
├── dashboard.tsx        # /dashboard
├── ideas/
│   └── $ideaId.tsx      # /ideas/:ideaId
└── admin/
    ├── categories.tsx   # /admin/categories
    ├── routing.tsx      # /admin/routing
    ├── users.tsx        # /admin/users
    └── settings.tsx     # /admin/settings
```

### Route definition

Use `createFileRoute` (not `createRoute`). The path string is auto-managed by the router.

```typescript
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard')({
  // beforeLoad runs before loader, use for auth checks
  beforeLoad: async ({ context }) => {
    // Auth check: redirect if not logged in
  },
  // loader calls server functions for data
  loader: () => getDashboardData(),
  component: DashboardPage,
})

function DashboardPage() {
  const data = Route.useLoaderData()
  return <div>{/* render dashboard */}</div>
}
```

### Root route (__root.tsx)

The root route renders the HTML document shell. It always renders.

```typescript
import { createRootRoute } from '@tanstack/react-router'
import { Outlet, HeadContent, Scripts } from '@tanstack/react-start'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {/* Sidebar, theme provider, etc. wrap the Outlet */}
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
```

### Calling server functions from components

Use `useServerFn` hook when calling from event handlers. In loaders, call directly.

```typescript
import { useServerFn } from '@tanstack/react-start'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

function IdeaDetail({ ideaId }: { ideaId: string }) {
  // Read data: use TanStack Query + server function
  const { data: idea } = useQuery({
    queryKey: ['idea', ideaId],
    queryFn: () => getIdea({ data: ideaId }),
  })

  // Mutations: useServerFn + useMutation
  const updateStatus = useServerFn(updateIdeaStatus)
  const queryClient = useQueryClient()

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) =>
      updateStatus({ data: { ideaId, status: newStatus } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['idea', ideaId] })
    },
  })

  return <div>{/* render idea detail */}</div>
}
```

### Common mistakes to avoid

- **Do NOT use `'use server'` directive.** That's Next.js/React Server Actions. TanStack Start uses `createServerFn`.
- **Do NOT use `getServerSideProps` or `getStaticProps`.** Those are Next.js. Use `loader` and `beforeLoad` on routes.
- **Do NOT put routes in `app/` directory.** Routes go in `src/routes/`.
- **Do NOT use `useRouter().push()` for navigation.** Use `<Link>` from `@tanstack/react-router` or `useNavigate()`.
- **Do NOT import from `@tanstack/start`.** Server functions and middleware import from `@tanstack/react-start`.
- **Do NOT use `Response` or `NextResponse`.** Server functions return plain objects. Use `redirect()` from `@tanstack/react-router` for redirects.
- **Route path strings in `createFileRoute()` are auto-generated.** Don't manually change them. The TanStack Router generator manages them based on the file location.

## Important implementation notes

1. **Easy Auth mock for local dev.** Create a development middleware that reads a `DEV_USER_ENTRA_ID` env var and injects fake Easy Auth headers. This lets you test as different users locally without Azure.

2. **Drizzle schema is the source of truth.** The database schema in `src/server/db/schema.ts` defines every table, column, and relationship. Run `pnpm db:generate` after schema changes to create a migration, then `pnpm db:migrate` to apply it.

3. **shadcn/ui components are copied, not imported.** Run `npx shadcn@latest add <component>` to add components. They live in `src/components/ui/` and can be customized. This is by design.

4. **Profile photo caching.** Photos fetched from Graph API are stored locally and served through a `GET /api/users/:id/photo` endpoint. Generate initials avatars (SVG or canvas) as fallback when no photo exists. Use a color derived from a hash of the user ID for consistent avatar colors.

5. **Submission ID sequence.** Use a PostgreSQL sequence for gapless, predictable IDs. Create via migration: `CREATE SEQUENCE thoughtbox_submission_id_seq START 1;`. Format as `TB-0001`.

6. **Business days calculation.** The `addBusinessDays` utility skips Saturday and Sunday. No holiday calendar for MVP. SLA due date is calculated on idea creation and recalculated on reassignment.

7. **Role hierarchy.** Admin is a superset of leader. A single `role` enum is sufficient. Check `role === 'admin' || role === 'leader'` for leader-level actions. Check `role === 'admin'` for admin-only actions.

8. **Conversation session handling.** Each page load starts a fresh conversation. Save abandoned conversations (at least one user message, 30 seconds of inactivity or page unmount) with `routingOutcome: 'abandoned'`.

9. **Graph API scoping.** Use an Exchange application access policy to restrict `Mail.Send` to the ThoughtBox shared mailbox only. This is a one-time admin command, not app code.

10. **Fallback form.** When the AI provider fails to initialize, show a traditional form (title, description, category dropdown) so submissions aren't blocked. The form is hidden by default and only surfaces on AI failure.

## Cloudflare Workers deployment (branch: feat/cloudflare-workers)

If you are working on the `feat/cloudflare-workers` branch, read `docs/cloudflare-poc-session-brief.md` before starting. It contains Cloudflare-specific architecture guidance, code patterns, and a step-by-step implementation plan.

The session brief **overrides** the following sections of this file when working on the Cloudflare branch:

- **Auth:** OIDC middleware (arctic library) replaces Easy Auth header parsing. New auth routes at `/auth/login`, `/auth/callback`, `/auth/logout`.
- **Database connection:** Hyperdrive binding + Neon PostgreSQL replaces direct Azure PostgreSQL connection. Same Drizzle schema, different connection init (`maxUses: 1` required).
- **Environment variables:** Request-bound (`env` parameter in handlers) replaces global `process.env`. No top-level env access.
- **Graph API client:** Client credentials flow replaces managed identity. Manual token exchange via fetch.
- **Object storage:** Cloudflare R2 bindings for avatar photo cache.
- **Deployment:** `wrangler.toml` + `wrangler deploy` replaces Bicep + App Service deployment.
- **Monitoring:** Cloudflare Workers Logs replaces Application Insights. Update error handling to log to console (Workers captures structured logs automatically) instead of App Insights SDK.
- **GitHub Actions:** Use `.github/workflows/deploy-cloudflare.yml` (separate from the Azure workflow).

Everything else in this file (TanStack Start patterns, coding standards, React patterns, testing, naming conventions, Drizzle schema, AI integration, email templates, engagement patterns, commit cadence) applies unchanged.

**Do not modify Azure-specific files** (Bicep templates, Azure GitHub Actions workflow, Easy Auth middleware). The Azure path stays intact. Create new Cloudflare-specific files alongside existing ones.
