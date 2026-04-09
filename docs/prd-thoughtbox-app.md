---
title: "ThoughtBox: Product Requirements Document"
type: Working Note
status: Draft
author: "Michael Wheatfill"
description: "Technical PRD for building ThoughtBox as the first app on the Internal App Platform. Target audience: Claude Code."
---

# ThoughtBox: Product Requirements Document

## What this document is

A technical PRD for an AI coding agent (Claude Code) to build ThoughtBox as a modern web application. This replaces the M365 solution design (SharePoint Lists + Power Automate) with a custom app built on the Internal App Platform stack. The platform architecture decisions are captured in `projects/app-platform/app-platform-exploration.md` and should be treated as the authoritative reference for all technology choices.

This document defines what to build. The platform exploration doc defines what to build it with.

## Product vision

ThoughtBox is Desert Financial's employee idea and suggestion platform. Today it runs on InMoment (a survey platform being sunset), with a multi-step form, manual case management, and inconsistent follow-through on employee communication.

The new ThoughtBox is AI-first. Instead of navigating dropdowns, selecting categories, and filling in form fields, employees open ThoughtBox and start typing their idea. An AI agent understands the idea, classifies it, asks smart follow-up questions when needed, and routes it to the right person. For ideas that belong in a different intake system (Keystone revisions, Desertforce changes), the agent recognizes this and presents the employee with a direct link to the right place, saving them the dead-end experience of the current form.

For leaders who review and act on ideas, ThoughtBox provides a clean dashboard with their assigned queue, SLA visibility, and one-click actions. For program administrators (PDI team), it provides operational reporting, routing configuration, and full visibility across all ideas.

The tagline: **"Share an idea to make things better for our team and our members."**

### Design goal: make sharing ideas irresistible

The biggest risk to ThoughtBox isn't technical. It's indifference. InMoment's multi-step form, corporate vocabulary ("case manager," "case ID"), and dead-end redirects trained employees to not bother. The new ThoughtBox needs to reverse that by making the submission experience easy, fast, and satisfying enough that employees actually want to come back.

With ~1,600 potential submitters and only 25-30 submissions per month, even a small increase in participation has outsized impact. The platform should feel like something the org is proud of, not another checkbox tool. Every design decision should pass the test: "Does this make someone more likely to share their next idea?"

This isn't about gamification for its own sake. It's about removing friction, creating moments of delight, and making the invisible visible (showing employees that their ideas are heard, acted on, and valued).

## Users and roles

### Submitter (every employee)

Any Desert Financial or SwitchThink employee. ~1,600 potential users. Typical volume: 25-30 submissions per month across the organization. Submitters interact with ThoughtBox through the AI chat interface to describe their idea, then can check back to see the status of their submissions.

### Leader (idea reviewer)

~7-8 active leaders who receive and manage idea assignments. Leaders review ideas, update status, add notes, reassign to other leaders, and communicate outcomes. Michelle Murray handles the largest volume (~36 cases visible in recent data). Leaders are assigned by category through a configurable routing table.

### Admin (PDI program owners)

Nubia Ruiz, Eric Konefal, Greg Scott, Jaime Carranza. Own the ThoughtBox program. Configure routing rules, manage the category taxonomy, view all ideas across all leaders, run reports, and handle escalations. Admins see everything and can act on any idea.

### Watcher

Members of the Process Design and Improvement distribution list. Receive notifications when new ideas are submitted or reassigned. Read-only awareness, not an app role. Handled entirely through email notifications.

## Submission experience (AI-first intake)

### The interaction model

The employee opens ThoughtBox and sees a welcoming chat interface. No dropdowns, no category selection, no "are you a leader?" question. Just a prompt: something like "What's your idea?" or "Tell me about your idea to make things better."

The employee types naturally. The AI agent:

1. **Understands the idea.** Parses the natural language description to extract what the employee is suggesting, what area it affects, and what problem it solves.

2. **Classifies it.** Maps the idea to one of the configured categories. The category determines routing. Some categories are handled within ThoughtBox (the idea becomes a submission). Others redirect to external intake systems.

3. **Handles redirects gracefully.** If the idea maps to a redirect category (e.g., Keystone system revision, Desertforce change), the agent explains that this type of suggestion has a dedicated intake process, presents a card with a direct link to the external form, and thanks the employee. The employee is not left at a dead end.

4. **Asks follow-up questions when needed.** For ThoughtBox categories, the agent may ask one or two clarifying questions to improve the submission quality. These should feel conversational, not interrogative. Examples: "That sounds like it could save time for the branch team. Can you estimate how often this comes up?" or "Got it. Is this about the mobile app or the desktop experience?" The agent should not ask more than 2-3 follow-up questions.

5. **Presents a summary for confirmation.** Before submitting, the agent shows the employee a structured summary card: their idea (as the agent understood it), the category it was classified into, and any details they provided. The employee confirms or edits.

6. **Submits and confirms.** On confirmation, the idea is created in the system. The employee sees a celebration moment: a brief confetti or sparkle animation, their submission ID, their updated personal idea count ("That's your 3rd idea this year!"), and a note that their assigned reviewer will follow up. The moment should feel rewarding, not transactional.

### AI agent behavior specification

The agent needs a system prompt and a set of tools. Here is the behavioral specification.

**Persona:** Friendly, concise, encouraging. The agent should make employees feel like their idea matters. It should not feel like a bureaucratic intake process. Think: a helpful colleague who listens, asks good questions, and makes sure the idea gets to the right person.

**Classification approach:** The agent receives the full category taxonomy as context, including which categories are ThoughtBox categories (create a submission) and which are redirect categories (present external link). The agent classifies based on the employee's natural language description. If the classification is ambiguous, the agent asks a clarifying question rather than guessing.

**Redirect behavior:** When the agent determines an idea belongs to a redirect category, it should:
- Acknowledge the idea positively ("That's a great suggestion about Keystone.")
- Explain that this type of idea has a dedicated team and intake process
- Present a card/link to the external intake form
- Not ask the employee to re-enter information they already provided
- Not make the employee feel like they did something wrong

**Structured data extraction:** From the conversation, the agent extracts:
- `title`: A concise summary of the idea (1 sentence, generated by the agent from the conversation)
- `description`: The full idea as described by the employee (can be the employee's own words, lightly cleaned up)
- `category`: The classified category from the taxonomy
- `expectedBenefit`: What problem it solves or what improvement it brings (optional, extracted if the employee mentioned it)
- `impactArea`: Cost, Time, Safety, Customer, or Culture (optional, inferred if obvious)

**Opening message:** The agent greets the employee with a short, warm opener on page load (before the employee types anything). Use the employee's first name from Entra ID: "Hey Sarah! Got an idea to make things better? Tell me about it." This turns an empty chat into a conversation already in progress.

**What the agent should NOT do:**
- Ask for the employee's name, email, or department (pulled from Entra ID automatically)
- Ask if the employee is a leader
- Ask the employee to select from a list of categories
- Provide lengthy explanations of the ThoughtBox process
- Make promises about timelines or outcomes

### Category taxonomy and routing

The category taxonomy is a configurable table in the database, not hardcoded. Admins manage it through the admin UI. Each category has:

| Field | Type | Description |
|---|---|---|
| `id` | string (cuid) | Primary key |
| `name` | string | Display name (e.g., "Building - Facility suggestion") |
| `description` | string | Brief description to help the AI classify accurately |
| `routingType` | enum | `thoughtbox` (create submission) or `redirect` (external link) |
| `redirectUrl` | string (nullable) | URL of external intake form (only when routingType = redirect) |
| `redirectLabel` | string (nullable) | Display text for the redirect link (e.g., "Operations Programs & Operations Support intake form") |
| `defaultLeaderId` | string (nullable) | FK to user table. The leader who receives ideas in this category by default. Null = goes to unassigned queue. |
| `keystoneFields` | boolean | Whether to collect Keystone-specific additional fields (category, current time, frequency, pain point, estimated time savings). Default false. |
| `sortOrder` | integer | Display order in admin UI |
| `active` | boolean | Whether this category is currently in use |

**Initial category seed data (from current InMoment system):**

Categories that stay in ThoughtBox (routingType = `thoughtbox`):
- Building - Facility suggestion
- Community - Volunteer or community event
- Employee - Communication (e.g., The Union)
- Employee - Financial Well-being idea
- Employee - Perks/Benefits or HR-related suggestion
- Procedure - New
- Procedure - Revise an existing procedure
- Product - New (doesn't currently exist)
- Product - Revise a current product
- System - Idea to revise digital banking (e.g., online/mobile, bill pay)
- Other

Categories that redirect (routingType = `redirect`):
- Dee - Intelligent Virtual Assistant → [redirect URL TBD]
- Desertforce → [redirect URL TBD]
- System - Idea to revise Genesys phone system → [redirect URL TBD]
- System - Idea to revise Keystone → Operations Programs & Operations Support intake form
- System - Idea to revise OnBase → [redirect URL TBD]
- System - Idea to revise other system → [redirect URL TBD]

**Important:** The exact split between ThoughtBox and redirect categories needs confirmation from PDI. The above is based on the current InMoment behavior where Keystone is confirmed as a redirect. The others are assumptions based on the "~30% redirect" observation. The system should make it easy for admins to change any category between `thoughtbox` and `redirect` without code changes.

## Idea lifecycle

### Statuses

| Status | Meaning | Who sets it |
|---|---|---|
| `new` | Just submitted, not yet reviewed | System (on creation) |
| `under_review` | Leader has acknowledged and is investigating | Leader |
| `accepted` | Idea will be or has been implemented | Leader |
| `rejected` | Idea will not be implemented | Leader |

### Rejection reasons

When a leader rejects an idea, they select a reason:
- Already in progress
- Not feasible or priority at this time
- Not aligned to strategy
- Not a ThoughtBox idea (should have been submitted elsewhere)

### SLA targets

| Metric | Target | Escalation |
|---|---|---|
| Initial review (move from `new` to any other status) | 15 business days | 1 day past due: notify leader. Then notify leader's manager. |
| Closure (move to `accepted` or `rejected`) | 30 business days from submission | 31 days: notify leader and leader's manager. Past 30 days: escalate to HR/AVP/VP. |

SLA timers reset when an idea is reassigned to a new leader.

**MVP scope for SLA:** Calculate and display SLA due dates. Show overdue indicators in the leader dashboard. Automated reminder emails are Phase 2 (the scheduled job infrastructure needs to be designed). For MVP, the visual indicators in the dashboard are the accountability mechanism.

## Leader experience

### Idea queue (leader dashboard)

Leaders see a filtered view of ideas assigned to them. The default view is "My Ideas" showing all non-closed items sorted by SLA urgency (most overdue first).

**Queue columns:**
- Submission ID (e.g., TB-0042)
- Title (AI-generated summary)
- Category
- Submitter name
- Submitted date
- SLA status (visual indicator: green = on track, yellow = approaching, red = overdue)
- Status badge

**Quick actions from the queue:**
- Click to open idea detail
- Bulk status update (select multiple, change status)

### Idea detail view

When a leader opens an idea, they see:

**Header section:**
- Submission ID and title
- Status badge (with dropdown to change)
- SLA timer (elapsed time vs. goal, visual like the InMoment counters but modern)
- Assigned leader (with reassign button)

**Idea section:**
- Full description (as submitted through the AI conversation)
- Category
- Expected benefit (if provided)
- Impact area (if provided or inferred)
- Attachments/screenshots (if any)
- Submitter info card (people card style): avatar photo, display name, job title, department, office location, manager name. Styled as a compact card similar to the Teams/Outlook people card. Clicking the submitter name could open their email in a new tab (mailto link).

**Leader actions section:**
- Status dropdown (New, Under Review, Accepted, Rejected)
- Rejection reason dropdown (visible when status = Rejected)
- Leader notes (rich text, for recording research, decisions, context)
- Action taken dropdown (values TBD, carries forward from InMoment)
- Jira ticket number (optional text field, for linking to implementation work)

**Activity timeline:**
- Chronological log of all status changes, reassignments, and notes
- Each entry shows who, what, and when
- This replaces InMoment's "Case History" tab

**Communication section:**
- "Communicate to employee" button that opens a pre-filled message (status, leader notes, outcome) for the leader to review and send
- Automated emails send on status changes, but leaders can also send ad-hoc messages

### Reassignment

Leaders can reassign an idea to another leader by searching the employee directory (same Graph-powered search as the admin user provisioning). Reassignment:
- Changes the assigned leader
- Resets the SLA timer
- Sends notification to the new leader
- Logs the reassignment in the activity timeline
- Sends a watcher notification

## Admin experience

### Admin dashboard

The admin dashboard provides program-level visibility. Admins see everything across all leaders and categories.

**KPI cards (top of dashboard):**
- Total submissions (this month / this year)
- Open ideas (not yet accepted/rejected)
- SLA compliance: % reviewed within 15 days
- SLA compliance: % closed within 30 days
- Average time to close

**Charts:**
- Submissions by category (horizontal bar, stacked by status: closed/in-progress/new, like the InMoment report but cleaner)
- Submissions by owner (horizontal bar, stacked by status)
- Outcome distribution (pie or donut: accepted, rejected by reason, researching)
- Submissions by month (bar chart with trend line)
- SLA compliance over time (line chart)

**Idea table (below charts):**
- Full list of all ideas with sorting, filtering, and search
- Filterable by: status, category, leader, date range, SLA status
- Exportable to CSV

### Category management

Admin UI for managing the category taxonomy. CRUD operations on the categories table. Changes take effect immediately (the AI agent reads the current taxonomy on each conversation).

### Routing configuration

Admin UI for managing the category-to-leader mapping. Each category can have a default leader assigned. Categories without a default leader route to an unassigned queue visible to all admins.

### User management

Admin UI for managing app roles. Admins can:
- Search the Entra ID directory and add users before they log in
- Assign roles: submitter (default), leader, admin
- View all users and their roles
- Deactivate users (soft delete, preserves history)

## Email notifications

All emails send from a shared mailbox (thoughtbox@desertfinancial.com) via Microsoft Graph. Templates are React Email components with Desert Financial branding.

### Notification triggers

| Event | Recipient | Content |
|---|---|---|
| New idea submitted | Assigned leader | Idea title, category, submitter name, link to idea detail |
| New idea submitted | Submitter | Confirmation with submission ID, note that a leader will review |
| New idea submitted | Watcher list (PDI DL) | Idea title, category, submitter name, suggestion text, reassignment instructions |
| Status changed to Under Review | Submitter | "Your idea is being reviewed by [Leader Name]" |
| Status changed to Accepted | Submitter | Acceptance message with leader notes and impact area |
| Status changed to Rejected | Submitter | Rejection message with rejection reason and leader notes |
| Idea reassigned | New leader | Idea title, category, submitter name, link to idea detail |
| Idea reassigned | Watcher list | Reassignment notification with old/new leader |
| Leader posts a message | Submitter | "A leader has a question about your idea: [Title]" with message preview and link |
| Submitter replies to message | Assigned leader | "The submitter responded on: [Title]" with message preview and link |

### Email design

Branded, clean, mobile-friendly. Desert Financial logo header. Clear call-to-action buttons ("View Idea" links to the app). Minimal text. The watcher alert email should be compact (the current InMoment watcher alert is a reasonable model for information density, just with modern styling).

**Tone:** Emails should feel personal and human, not system-generated. Use the leader's first name ("Michelle is reviewing your idea"), reference the idea title, and keep copy conversational. The acceptance email is the most important one to get right: it should feel like good news ("Great news: your idea is moving forward!"), not a status notification. This is the email that drives repeat submissions.

**Submitter confirmation email:** Include the employee's personal submission count: "That's your 3rd idea this year. Thanks for making Desert Financial better." Reinforces contribution even in transactional emails.

## Data model

### Database schema (Drizzle + PostgreSQL)

```
tables:
  users
    id: cuid, PK
    entraId: string, unique, not null (Entra ID object ID)
    email: string, not null
    displayName: string, not null
    department: string, nullable
    jobTitle: string, nullable
    officeLocation: string, nullable -- branch/office name from Entra ID
    managerId: string, nullable, FK -> users.id -- resolved from Graph manager endpoint
    managerEntraId: string, nullable -- Entra ID object ID of manager (stored before manager user record exists)
    managerDisplayName: string, nullable -- cached for display without join
    photoUrl: string, nullable -- relative path to cached profile photo (e.g., /api/users/{id}/photo)
    photoLastFetched: timestamp, nullable -- cache invalidation marker
    role: enum(submitter, leader, admin), default submitter
    source: enum(graph, login) -- how the user record was created
    firstSeen: timestamp, nullable -- null if admin-added, not yet logged in
    active: boolean, default true
    profileEnrichedAt: timestamp, nullable -- last time Graph enrichment ran
    createdAt: timestamp
    updatedAt: timestamp

  categories
    id: cuid, PK
    name: string, not null
    description: string, not null -- helps AI classify accurately
    routingType: enum(thoughtbox, redirect), not null
    redirectUrl: string, nullable
    redirectLabel: string, nullable
    defaultLeaderId: string, nullable, FK -> users.id
    keystoneFields: boolean, default false
    sortOrder: integer, default 0
    active: boolean, default true
    createdAt: timestamp
    updatedAt: timestamp

  ideas
    id: cuid, PK
    submissionId: string, unique, not null -- formatted: TB-0001, TB-0002, etc.
    title: string, not null -- AI-generated summary (1 sentence)
    description: text, not null -- full idea description
    expectedBenefit: text, nullable -- what problem it solves
    categoryId: string, not null, FK -> categories.id
    impactArea: enum(cost, time, safety, customer, culture), nullable
    status: enum(new, under_review, accepted, rejected), default new
    rejectionReason: enum(already_in_progress, not_feasible, not_aligned, not_thoughtbox), nullable
    submitterId: string, not null, FK -> users.id
    assignedLeaderId: string, nullable, FK -> users.id
    leaderNotes: text, nullable -- rich text
    actionTaken: string, nullable -- dropdown value (TBD)
    jiraTicketNumber: string, nullable
    slaDueDate: timestamp, nullable -- calculated: submittedAt + 15 business days
    closedAt: timestamp, nullable
    submittedAt: timestamp, not null
    createdAt: timestamp
    updatedAt: timestamp

  idea_events
    id: cuid, PK
    ideaId: string, not null, FK -> ideas.id
    eventType: enum(created, status_changed, reassigned, note_added, message, communicated)
    actorId: string, not null, FK -> users.id
    oldValue: string, nullable -- e.g., previous status or previous leader
    newValue: string, nullable -- e.g., new status or new leader
    note: text, nullable -- message content (for message type) or context (for other types)
    createdAt: timestamp

    -- The "message" event type enables the leader-to-submitter comment thread.
    -- Leaders post questions (eventType = message, actorId = leader).
    -- Submitters reply (eventType = message, actorId = submitter).
    -- The activity timeline on the idea detail page renders messages differently
    -- from system events (chat bubble style vs. log entry style).
    -- New messages trigger an email notification to the other party.

  conversations
    id: cuid, PK
    ideaId: string, nullable, FK -> ideas.id -- null if conversation didn't result in a submission
    userId: string, not null, FK -> users.id
    messages: jsonb, not null -- array of {role, content, timestamp} from the AI conversation
    classification: string, nullable -- the category the AI classified it as
    routingOutcome: enum(submitted, redirected, abandoned), nullable
    createdAt: timestamp
    updatedAt: timestamp

  keystone_details
    id: cuid, PK
    ideaId: string, unique, not null, FK -> ideas.id
    keystoneCategory: string, nullable
    currentTime: string, nullable
    frequency: string, nullable
    painPoint: text, nullable
    estimatedTimeSavings: string, nullable
    createdAt: timestamp

  settings
    key: string, PK
    value: text, not null
    updatedAt: timestamp
```

### Sequence generation

Submission IDs (TB-0001, TB-0002, etc.) use a PostgreSQL sequence, not the idea table's auto-increment. This ensures IDs are gapless and predictable. The sequence is created via migration:

```sql
CREATE SEQUENCE thoughtbox_submission_id_seq START 1;
```

Server function reads `nextval('thoughtbox_submission_id_seq')` and formats as `TB-${value.toString().padStart(4, '0')}`.

## Route structure

```
/                       → Landing page (gamified hero + AI chat interface)
/dashboard              → Role-aware dashboard (renders different view per role)
/ideas/:id              → Idea detail (read-only for submitters, editable for assigned leader/admin)

/admin/categories       → Category management (admin only)
/admin/routing          → Leader routing configuration (admin only)
/admin/users            → User management (admin only)

/settings               → App settings (future)
```

### Dashboard routing (single route, role-aware)

`/dashboard` renders a different experience based on the authenticated user's role. One route, one nav item, three views.

| Role | Dashboard view |
|---|---|
| **Submitter** | Personal stat card at top ("You've shared 3 ideas this year" with a lightbulb icon that grows/fills as count increases). Below: "My Ideas" list with status badges, submitted dates, last activity. Accepted ideas get a subtle glow or accent to celebrate wins. Empty state is warm and encouraging: "You haven't shared an idea yet. It only takes a minute." with a prominent button to the submit page. |
| **Leader** | KPI row (my open ideas, my overdue, my avg response time) + filterable data table of assigned ideas sorted by SLA urgency. Quick actions: click to open detail, bulk status update. |
| **Admin** | Full dashboard: KPI row (program-wide stats), 2x2 chart grid, then all-ideas data table with faceted filters. Toggle to switch between "All Ideas" and "My Assignments" if the admin is also a leader. Export to CSV. |

This means every user sees "Dashboard" in the nav. Nobody has to wonder where their stuff is. The URL is stable for bookmarking.

### Navigation

All roles see the same nav items. The content behind them adapts.

- **Submit** (home, `/`) → Landing page with chat. Always the default.
- **Dashboard** (`/dashboard`) → Role-aware view as described above.
- **Admin** (`/admin/*`) → Only visible to admin role. Sub-nav for categories, routing, users.

The sidebar adapts by hiding the Admin section for non-admins. Submit and Dashboard are always present for everyone.

## API / server function design

All data access goes through TanStack Start server functions. No direct database queries from the client. Server functions handle auth checks (read user identity from Easy Auth headers, look up role in database).

### Key server functions

```
// Ideas
createIdea(data) → idea -- called after AI conversation confirms submission
getMyIdeas() → idea[] -- filtered by submitterId = current user
getAssignedIdeas() → idea[] -- filtered by assignedLeaderId = current user (leaders)
getAllIdeas(filters) → { ideas, total, page } -- paginated, filterable (admins)
getIdea(id) → idea + events + conversation -- full detail
updateIdeaStatus(id, status, rejectionReason?, leaderNotes?) → idea
reassignIdea(id, newLeaderId) → idea
updateIdeaNotes(id, leaderNotes) → idea

// Categories
getCategories() → category[] -- active categories for AI and admin
createCategory(data) → category
updateCategory(id, data) → category
deleteCategory(id) → void -- soft delete (set active = false)

// Users
searchDirectory(query) → entraUser[] -- Graph API search, returns displayName, jobTitle, department, photo
getUsers(filters) → user[] -- app users with enriched profile data
upsertUser(entraId, role?) → user -- create or update from Graph data
updateUserRole(id, role) → user
enrichUserProfile(userId) → user -- triggers Graph API calls to refresh profile fields, manager, photo
getUserPhoto(userId) → jpeg binary -- serves cached profile photo or generates initials avatar

// AI
getCategoryTaxonomy() → category[] with descriptions -- for AI system prompt context
saveConversation(messages, classification, outcome) → conversation

// Dashboard / reporting
getDashboardStats(dateRange?) → { totalSubmissions, openIdeas, slaCompliance, avgTimeToClose, ... }
getSubmissionsByCategory(dateRange?) → chartData
getSubmissionsByOwner(dateRange?) → chartData
getOutcomeDistribution(dateRange?) → chartData
getSubmissionsByMonth(dateRange?) → chartData
getSlaComplianceOverTime(dateRange?) → chartData

// Email
sendNotification(type, ideaId, recipientOverride?) → void
```

## AI integration

### Tech stack

- Vercel AI SDK (`ai` package) for streaming and tool calling
- assistant-ui for the chat UI components
- LLM provider: configurable (Azure OpenAI or Anthropic). The AI SDK abstracts the provider.

### System prompt (intake agent)

The system prompt is stored in the database or as a config file (not hardcoded) so admins or the architect can tune it without redeploying. It includes:

1. **Role:** "You are the ThoughtBox intake assistant for Desert Financial Credit Union. You help employees submit ideas to make things better for the organization, its members, or both."

2. **Category taxonomy:** Dynamically injected from the database. Each category includes its name and description. Categories marked as `redirect` include their redirect URL and label.

3. **Behavior rules:** The behavioral specification from the "AI agent behavior specification" section above, translated into system prompt format.

4. **Output schema:** When the conversation reaches the confirmation stage, the agent calls a `submit_idea` tool with the structured data.

### Tools (function calling)

The AI agent has access to these tools:

```
submit_idea:
  description: "Submit the employee's idea to ThoughtBox after they confirm the summary."
  parameters:
    title: string -- concise summary (1 sentence)
    description: string -- full idea description
    categoryId: string -- ID of the classified category
    expectedBenefit: string (optional) -- what problem it solves
    impactArea: enum (optional) -- cost, time, safety, customer, culture

redirect_to_form:
  description: "Show the employee a link to an external intake form when their idea belongs to a redirect category."
  parameters:
    categoryName: string -- the category name for context
    redirectUrl: string -- URL to present
    redirectLabel: string -- display text for the link

get_category_details:
  description: "Look up details about a specific category to help classify an idea."
  parameters:
    categoryName: string
```

### Conversation storage

Every conversation (even ones that result in redirects or abandonment) is stored in the `conversations` table. This provides:
- Audit trail for how ideas were classified
- Data for improving the AI's classification accuracy over time
- Visibility into redirect patterns (how often employees hit dead ends)

## Design direction

### Visual identity

Start with the default shadcn/ui theme (zinc/neutral monochromatic palette). Do not apply Desert Financial brand colors to the UI chrome, buttons, badges, or backgrounds. The default shadcn look is clean, professional, and modern. It already looks like Linear and Notion.

**Desert Financial presence:** Small logo mark only, in the sidebar header. No full logo, no brand blue in the interface. The app should feel like a well-designed internal tool, not a branded marketing site.

**Charts:** Use the default shadcn chart color tokens (CSS variables). These are intentionally muted and harmonious. Do not force brand colors into chart segments.

**Future customization:** If Desert Financial branding is desired later, it's a single CSS variable change (`--primary` in `globals.css`). Build the app first, decide on branding after seeing it running. The shadcn UI kit dashboard pattern is the reference layout for all dashboard and management views.

### Design principles

1. **AI conversation is the hero.** The home page is the chat interface. Full viewport height, centered, inviting. No sidebar clutter for submitters.
2. **The queue is the dashboard.** Leaders don't navigate to a "reports page" to understand their workload. The idea table IS the dashboard, with summary stats contextually above it. Charts are secondary.
3. **Minimal clicks.** Status changes, notes, and reassignment happen from the idea detail page without navigating away. Inline editing where possible.
4. **Mobile-first for submission.** The chat interface must work well on phones (employees submit from branches, break rooms). Leader and admin views are desktop-primary.

### Layout system

**Shell:** Collapsible sidebar nav (left) + main content area. Sidebar contains: app logo/name, navigation links (role-filtered), user avatar/name at bottom. The sidebar collapses to icons on smaller screens and is hidden entirely on the submit (chat) page for submitters.

Reference: shadcn sidebar component (`sidebar-07` or `sidebar-10` variant). Rail mode on collapse. Sheet overlay on mobile.

**Page layouts:**

| Page | Layout |
|---|---|
| Submit (/) | Full-bleed, no sidebar for submitters. Gamified hero + centered chat container, max-width ~640px. assistant-ui chat components. Leaders/admins still see the sidebar but the chat area is centered in the content zone. |
| Dashboard (/dashboard) - Submitter | Sidebar + content. Gamified stat card at top ("You've shared 3 ideas this year"), then simple data table of own submissions with status badges. |
| Dashboard (/dashboard) - Leader | Sidebar + content. KPI row at top (my open, my overdue, avg response time), then filterable data table of assigned ideas. |
| Dashboard (/dashboard) - Admin | Sidebar + content. KPI row (program-wide), chart grid (2x2), then full data table with faceted filters and CSV export. |
| Idea Detail (/ideas/:id) | Sidebar + content. Two-column layout on desktop: left column (idea content, activity timeline), right column (status panel, actions, metadata). Single column on mobile. |
| Admin pages (/admin/*) | Sidebar + content. Data tables with toolbar (search, filters, add button). |

### Component mapping

Map every UI element to a specific shadcn/ui component so Claude Code builds with the right primitives.

**KPI cards:** Use shadcn `Card` component. Row of 4-5 cards across the top of dashboard views. Each card: label (muted text, small), value (large number or percentage), trend indicator or sparkline (optional, Recharts `SparklineChart`). For SLA compliance, use color-coded values (green > 80%, yellow 60-80%, red < 60%).

```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Total Ideas      │ │ Open            │ │ SLA: Review     │ │ Avg Days to     │
│ 47 this month   │ │ 23              │ │ 74%             │ │ Close           │
│ ↑ 12% vs last   │ │ 8 overdue       │ │ within 15 days  │ │ 11.3 days       │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

**Data tables:** TanStack Table with the shadcn data table pattern. Column header sorting, faceted filters (dropdowns for status, category, leader), search input, column visibility toggle, pagination. Row actions via a dropdown menu (three-dot icon) or inline buttons for primary actions.

**Status badges:** shadcn `Badge` component with semantic colors:
- `new` → blue/default
- `under_review` → yellow/warning  
- `accepted` → green/success
- `rejected` → red/destructive

**SLA indicators:** Not a separate column. Integrated into the row as a colored dot or icon next to the submission date or in the status area:
- On track (> 3 days remaining) → green dot
- Approaching (1-3 days remaining) → yellow dot with tooltip showing due date
- Overdue → red dot, row gets a subtle red-tinted background (`bg-destructive/5`)

**Charts (admin dashboard only):** shadcn/ui chart components (Recharts v3 wrappers). 2x2 grid below the KPI cards.

| Position | Chart | Type |
|---|---|---|
| Top-left | Submissions by month | Bar chart, stacked by status (new/review/accepted/rejected). Last 6 months. |
| Top-right | SLA compliance trend | Line chart, two lines (review SLA %, close SLA %). Last 6 months. |
| Bottom-left | Ideas by category | Horizontal bar chart, sorted by volume descending. Top 8 categories, rest grouped as "Other." |
| Bottom-right | Outcome distribution | Donut chart. Segments: Accepted, Rejected (by reason), Under Review, New. |

Charts use the shadcn chart color tokens (CSS variables) so they match the theme automatically. Tooltips on hover. No chart titles inside the chart area; use a Card header above each chart.

**Idea detail page (two-column layout):**

```
┌──────────────────────────────────────┬──────────────────────┐
│ TB-0042: Magnifying option on        │ STATUS               │
│ mobile app                           │ [Under Review ▾]     │
│                                      │                      │
│ IDEA                                 │ ASSIGNED TO          │
│ Full description text here...        │ Michelle Murray      │
│                                      │ [Reassign]           │
│ EXPECTED BENEFIT                     │                      │
│ What it solves...                    │ SLA                  │
│                                      │ Due: Apr 16, 2026    │
│ Category: Digital Banking            │ 3 days remaining ●   │
│                                      │                      │
│ SUBMITTER                            │ ACTIONS              │
│ [📷] Sean St Onge                    │ Rejection reason [▾] │
│      Digital Banking Specialist      │ Leader notes [    ]  │
│      Member Engagement · Peoria      │ Action taken [▾]     │
│      Reports to: Maria Torres        │ Jira ticket [    ]   │
│      Submitted: Apr 1, 2026         │                      │
│                                      │                      │
│ ─────────────────────────────────── │                      │
│ ACTIVITY                             │                      │
│ Apr 1 - Created, assigned to         │                      │
│         Michelle Murray              │ [Save Changes]       │
│ Apr 2 - Status → Under Review        │ [Communicate to      │
│         by Michelle Murray           │  Employee]           │
└──────────────────────────────────────┴──────────────────────┘
```

Left column: read-only idea content (shadcn Card sections) + activity timeline (shadcn timeline or custom with relative timestamps). Right column: sticky action panel (shadcn Card with form elements: Select for status, Combobox for reassignment, Textarea for notes, Button for save). The right column is the leader's workspace.

**Landing page (submit page):** Two zones, vertically stacked.

**Top zone: gamified hero.** Centered, above the chat input. A lightweight animation of an idea (lightbulb or spark) dropping into a thought box, with a live counter: "247 ideas shared in 2026." The counter pulls from the database (total submissions for the current year). The animation should be subtle and delightful (Motion v12), not distracting. It runs once on page load, then the counter is static. The hero reinforces that this is a living program with real participation, not a dead form nobody uses. Below the counter, the ThoughtBox tagline: "Share an idea to make things better for our team and our members."

**Social proof strip (optional, below tagline):** A rotating one-liner showcasing recent activity without exposing specifics. Examples: "12 ideas shared this month," "3 ideas accepted this week." This is a lightweight query, not a live feed. Refreshes on page load. Shows the program is alive and ideas are being acted on. If the numbers are too low in the early weeks, hide the strip until submission volume reaches a threshold (configurable in settings).

**Bottom zone: AI chat.** assistant-ui components with shadcn theming. Full width up to max-width 640px, centered. Message bubbles with subtle backgrounds. Typing indicator during AI response. The confirmation summary renders as a structured Card within the chat (not a modal). The redirect card also renders inline with a prominent link button styled as a shadcn Card with an external link icon.

**Empty states:** Every list and dashboard view has a designed empty state. Not "No data." Use a ThoughtBox-themed illustration or icon, a short encouraging message, and a call to action. These are adoption moments. Examples:
- Leader dashboard, no assigned ideas: "All caught up!" with a relaxed illustration. Celebrate the clear queue.
- My Ideas, no submissions: "You haven't shared an idea yet. It only takes a minute, and every idea helps." with a prominent "Share an idea" button linking to the submit page. First-time visitors see this; make it inviting.
- My Ideas, all ideas accepted: "Every idea you've shared has been accepted. You're on a streak." (Micro-delight for engaged submitters.)
- Admin dashboard, first launch: "ThoughtBox is live. Ideas will appear here once employees start sharing. Time to spread the word."

**Navigation items and icons:** Use Lucide icons (via lucide-react, included in shadcn ecosystem).
- Submit / Home → `Lightbulb` or `MessageSquare`
- My Ideas → `List`
- Dashboard → `LayoutDashboard`
- Admin → `Settings`
- Categories → `Tags`
- Routing → `Route`
- Users → `Users`

### Motion and micro-interactions

The app should feel alive without being distracting. Every state change, navigation, and data load should have a subtle transition. This is what separates a "tool someone built" from a product.

**CSS transitions (baked into Tailwind classes, no library needed):**
- Hover states on all interactive elements: buttons (`transition-colors duration-150`), table rows (`hover:bg-muted/50 transition-colors`), cards (`hover:shadow-sm transition-shadow`)
- Focus rings: shadcn defaults handle this, don't override
- Badge and status changes: `transition-all duration-200` so color shifts feel smooth, not jarring
- Sidebar collapse/expand: `transition-[width] duration-200 ease-in-out`

**Motion v12 (for layout and enter/exit animations):**
- Dialog/sheet open/close: fade + scale from 95% to 100% (shadcn's default Radix animation, but ensure it's enabled, not stripped)
- Dropdown menus: fade + slight slide-down on enter, reverse on exit
- Page transitions: subtle fade between routes (`AnimatePresence` wrapper on the router outlet)
- Toast notifications (Sonner): slide-in from bottom-right, auto-dismiss with progress indicator
- Dashboard KPI cards: staggered fade-in on initial load (each card enters 50ms after the previous)
- Chart rendering: Recharts' built-in animation (bars grow, lines draw). Keep defaults, they're good.
- Landing page thought box animation: single playback on load, eased with spring physics

**Loading states:**
- Skeleton loaders (shadcn `Skeleton` component) for every data-dependent area: KPI cards, chart containers, data table rows, idea detail sections. Show the layout shape immediately, fill with data when it arrives.
- Optimistic updates for status changes: the badge updates instantly on click, rolls back if the server function fails. TanStack Query handles this natively.
- Chat streaming: assistant-ui handles the typing indicator and token-by-token rendering. No additional work needed.

**The principle:** If something takes more than 100ms, show a transition. If it takes more than 300ms, show a skeleton. If it fails, show the previous state with an error toast. Never show a blank white screen or a spinner in the middle of the page.

### Responsive behavior

| Breakpoint | Behavior |
|---|---|
| Desktop (>= 1024px) | Full sidebar, two-column idea detail, 2x2 chart grid |
| Tablet (768-1023px) | Collapsed sidebar (rail), single-column idea detail, 2x1 chart stack |
| Mobile (< 768px) | No sidebar (bottom tab nav or hamburger), single column everything, chat interface adapts to full width |

The submit page is the most important mobile experience. The chat interface should feel native, like a messaging app.

## Engagement and adoption design

The submission funnel has three moments that determine whether someone comes back: first impression (landing page), submission completion (celebration), and follow-through (getting a response). Each moment is an opportunity to reinforce that ideas matter.

### First impression: the landing page

The landing page needs to communicate three things instantly: (1) this is easy, (2) other people are doing it, (3) your idea matters. The gamified hero with the yearly counter handles social proof. The AI chat interface handles "this is easy" by replacing the old multi-step form with a single text input. The tagline handles "your idea matters."

**Warm AI greeting:** The chat should not start with an empty input. On load, the AI agent posts a brief, friendly opening message: something like "Hey! Got an idea to make things better? Tell me about it." This lowers the activation energy. The employee is responding to a question, not staring at a blank box.

**Suggested prompts (optional):** Below the chat input, show 2-3 clickable prompt pills that give employees a starting point if they're not sure what to type. Examples: "I have an idea about a process," "Something could work better for members," "I noticed something about our tools." Clicking a pill populates the chat input. These are configurable in settings so PDI can tune them.

### Submission completion: the celebration

After the employee confirms their submission, the experience should feel rewarding. This is the moment that determines whether they submit a second idea.

**Confetti/sparkle animation:** Brief, tasteful. Canvas-confetti library (lightweight, no dependencies) or a custom Motion v12 animation. 1-2 seconds max. Not over-the-top, but noticeable.

**Personal milestone callout:** "That's your 3rd idea this year!" with a lightbulb icon that matches the count (e.g., three lit bulbs, or a single bulb with "x3"). First-time submitters get a special message: "Your first idea! Welcome to ThoughtBox."

**Share prompt (stretch):** After the celebration, optionally show: "Know someone else with a great idea? Share ThoughtBox with them." with a copy-link button. Low effort, high potential for organic growth. Only show after the second submission (don't overwhelm first-timers).

### Follow-through: closing the loop

The biggest adoption killer in InMoment was silence. Employees submitted ideas and heard nothing. ThoughtBox addresses this structurally (email notifications on every status change, comment threads), but the tone of those emails matters too.

**Email personality:** Notification emails should feel personal, not system-generated. "Michelle is reviewing your idea" is better than "Your submission status has been updated to Under Review." Use the leader's first name. Reference the idea title. Keep it short.

**Acceptance celebration email:** When an idea is accepted, the email should feel like good news, not a status update. "Great news: your idea is moving forward!" with the leader's notes on what happens next. This is the email that makes someone submit their next idea.

**Monthly digest (Phase 2 candidate, but design for it):** A monthly email to all employees: "This month, Desert Financial employees shared 32 ideas. 8 were accepted. Here are a few highlights..." This creates ambient awareness that the program is active and ideas lead to change. Not MVP, but the data model supports it.

### Leader experience: make triage satisfying

Leaders need to feel like managing ideas is fast, not burdensome. With only 7-8 active leaders, each one's experience matters.

**One-click status updates:** From the queue, leaders should be able to change status without opening the detail page. A dropdown or button set right in the table row for the most common action (acknowledge/start review).

**SLA gamification for leaders:** The leader dashboard KPI card for "avg response time" should have subtle positive reinforcement. If their response time is under the SLA target, show it in green with a checkmark. If they clear their queue entirely, show a brief "All caught up" state with a clean/empty illustration. These micro-moments make triage feel like progress, not a chore.

**Quick-reply templates:** For common responses (acknowledgment, need more info, already in progress), provide 2-3 pre-written reply templates that the leader can send with one click and optionally personalize. Configurable by admins. Reduces the friction of writing individual responses for routine actions.

### Admin experience: make the program feel alive

Admins (PDI team) need to see momentum. The dashboard charts already handle this, but a few additions reinforce it.

**Program health indicator:** A simple "program health" badge at the top of the admin dashboard. Green if SLA compliance is above target and submission volume is trending up. Yellow if either is declining. Red if both. This gives admins an instant read without parsing five KPI cards.

**Activity feed (sidebar or secondary view):** A real-time-ish feed of recent activity across the program: "Sean submitted an idea," "Michelle accepted TB-0042," "New idea in Digital Banking category." This creates a sense of a living program. Pulls from the `idea_events` table, most recent first, limited to last 48 hours. Optional, can be a sidebar widget or a dedicated section.

## Phase plan

### MVP (build first)

- AI chat intake with category classification and redirect handling
- Warm AI greeting with employee's first name, suggested prompt pills below chat input
- Submission celebration moment (confetti animation, personal idea count, milestone callout)
- Idea creation and storage
- Role-aware dashboard (submitter, leader, admin views)
- Submitter dashboard with personal stat card (idea count with growing lightbulb icon) and accepted-idea highlighting
- Idea detail view with status management, notes, reassignment
- Leader-to-submitter comment thread on idea detail (extends the activity timeline with message type events; leader posts a question, submitter sees it on their idea detail view and can reply)
- Keystone-specific conditional fields (additional fields shown on idea detail when the category has `keystoneFields = true`)
- Quick-reply templates for leaders (configurable by admin, 2-3 defaults for common responses)
- One-click status update from the leader queue (inline dropdown, no detail page navigation required)
- Admin category and routing management
- Admin user management
- User profile enrichment via Graph API (avatar photo, department, job title, office location, manager name)
- People card style submitter info on idea detail (avatar, name, title, department, location, manager)
- Initials avatar fallback when no profile photo exists
- Avatar thumbnails in leader queue, activity timeline, and reassignment combobox
- Email notifications (all triggers listed above) with personal, human tone and submitter idea counts
- Admin dashboard with KPI cards, program health indicator, 2x2 chart grid, and full data table
- Admin activity feed (recent program events, sidebar or section)
- Landing page hero with yearly counter, social proof strip (configurable threshold), and tagline
- Date range filtering on all dashboard views
- CSV export from admin data table
- Designed empty states for every view (warm, encouraging, on-brand)

### Phase 2 (after MVP feedback)

- SLA reminder engine (scheduled job that checks overdue ideas daily and sends tiered escalation emails to leader, leader's manager, then HR/AVP/VP)
- Monthly digest email to all employees (program highlights, acceptance count, featured ideas with submitter permission)
- "Share ThoughtBox" prompt after second submission (copy-link for organic growth)
- Leaderboard: top contributing departments (anonymized, department-level only, opt-in via admin setting)
- Efficiency tracking module (hours saved, team bonus metrics, separate data model and workflow)
- Conversation analytics (classification accuracy, redirect patterns, common themes across submissions)

### Phase 3 (future)

- Copilot Studio / Teams integration (ThoughtBox as a Teams app, MCP server for agent access)
- Microsoft Fabric integration (ThoughtBox data flowing into enterprise analytics)
- AI-powered idea deduplication (flag similar existing ideas during intake)
- AI-powered insights for admins (trend analysis, theme extraction across submissions)

## Implementation details

These clarifications address edge cases and architectural decisions that Claude Code needs to build correctly.

### Authentication and first-login flow

Every request passes through Easy Auth before reaching application code. The middleware chain:

1. Easy Auth validates the Entra ID token and injects identity headers (`x-ms-client-principal`, etc.).
2. Application middleware reads the Entra ID object ID from the header.
3. Look up user in the `users` table by `entraId`.
4. **If found:** Update `displayName`, `email`, `department`, `jobTitle` from the header claims (keep profile data fresh). Set `firstSeen` to now if it was null (first login for an admin-provisioned user). Attach user to request context.
5. **If not found:** Create a new user record with `role: submitter`, `source: login`, `firstSeen: now`. Populate profile fields from header claims. Attach to request context.
6. All server functions read the authenticated user from request context. No anonymous access.

### User profile enrichment (people card data)

Easy Auth provides basic identity claims (object ID, name, email) via the `X-MS-CLIENT-PRINCIPAL` header. To surface the rich people card experience that leaders and admins need (avatar photo, department, job title, manager name, office location), the app makes supplementary Microsoft Graph calls to enrich user profiles.

**Graph API permissions required (application-level):**
- `User.Read.All` — read any user's profile, photo, and manager chain. The app registration already needs this for the directory search feature. One permission covers both use cases.

**Enrichment flow (runs on first login and periodically):**

1. User authenticates via Easy Auth. Middleware reads the Entra ID object ID from headers.
2. Look up user in the `users` table. If the user exists and `profileEnrichedAt` is within the last 24 hours, skip enrichment.
3. If enrichment is needed, make two Graph calls in parallel:
   - `GET /users/{entraId}?$select=displayName,mail,jobTitle,department,officeLocation` — returns profile fields
   - `GET /users/{entraId}/manager?$select=id,displayName` — returns manager's Entra ID and name
4. Optionally (can be deferred to a background job): `GET /users/{entraId}/photo/$value` — returns JPEG binary of the profile photo
5. Update the `users` table with enriched fields. Set `profileEnrichedAt` to now.

**Profile photo handling:**
- Graph returns the photo as JPEG binary (up to 648x648 pixels).
- Store photos in a local cache: write to a `/photos/{entraId}.jpg` path served by the app (or Azure Blob Storage in the future). Store the relative URL in `photoUrl`.
- For MVP, serve photos through a simple API endpoint: `GET /api/users/:id/photo` that returns the cached JPEG with appropriate cache headers. If no photo is cached, return a default avatar (initials-based, generated from `displayName`).
- Refresh photos every 7 days (check `photoLastFetched`). Profile photos don't change often.
- **Fallback:** If the Graph photo call returns 404 (no photo uploaded), generate an initials avatar using the user's first and last name initials on a colored background (color derived from a hash of the user ID for consistency). Use a lightweight server-side SVG or canvas generation.

**Manager chain:**
- Store `managerEntraId` and `managerDisplayName` on the user record. The `managerId` foreign key is populated only if the manager also has a user record in ThoughtBox (which they may not).
- The manager display name is used on the idea detail page: "Sean St Onge, Member Engagement, reports to [Manager Name]."
- For SLA escalation emails (Phase 2), the `managerEntraId` is used to look up the manager's email via Graph if they don't have a ThoughtBox user record.

**Where the enriched data surfaces:**

| Location | Data shown |
|---|---|
| Idea detail (submitter info section) | Avatar photo, display name, job title, department, office location, manager name |
| Leader queue (submitter column) | Avatar thumbnail + name |
| Admin user management | Avatar, name, department, job title, role badge |
| Idea assignment/reassignment | Avatar + name in the combobox results |
| Activity timeline | Small avatar next to each event actor |
| Email notifications | Submitter name and department in email body |

**Performance notes:**
- The enrichment call adds ~200-400ms to first login. Subsequent requests use the cached data.
- Photo caching means no Graph calls on page loads. The cached JPEG is served directly.
- The 24-hour enrichment window means profile changes (department transfers, title changes) propagate within a day.

### Role model

Admin is a superset of leader. A user with `role: admin` has all leader capabilities plus admin-only features. The role hierarchy:

- `submitter` → can submit ideas, view own ideas, post messages on own ideas
- `leader` → everything submitter can do, plus: view and manage assigned ideas, reassign, update status, see leader dashboard
- `admin` → everything leader can do, plus: view all ideas across all leaders, manage categories/routing/users, see admin dashboard with charts, act on any idea

A single enum is sufficient. The admin dashboard's "My Assignments" toggle filters `assignedLeaderId = currentUser` within the admin view. No dual-role model needed.

### Idea detail permissions

| Viewer | Can see? | Can edit? | Notes |
|---|---|---|---|
| Submitter (own idea) | Yes | No (read-only) | Can post messages in the comment thread |
| Submitter (someone else's idea) | No | No | 404 |
| Leader (assigned to this idea) | Yes | Yes | Full edit: status, notes, reassign, communicate |
| Leader (NOT assigned) | No | No | Leaders only see their own assignments. If they need to take over, an admin reassigns to them. |
| Admin | Yes (any idea) | Yes (any idea) | Full edit on everything. Can reassign any idea to any leader. |

### Reassignment

Reassignment searches only users in the ThoughtBox `users` table with `role: leader` or `role: admin`. Not the full Entra ID directory. If an admin wants to assign to someone who isn't a leader yet, they first add the user through the admin user management page (which does search the full directory), assign the leader role, then reassign the idea.

This prevents accidental assignment to random employees and keeps the leader roster intentional.

### File uploads

**MVP: no file uploads.** The AI chat is text-only for MVP. If an employee wants to share a screenshot, they describe it in the conversation. The idea description captures the relevant detail.

**Phase 2: Azure Blob Storage.** Add an `attachments` table (ideaId, filename, blobUrl, uploadedBy, createdAt). Upload endpoint writes to a Blob container. The idea detail page shows attachment thumbnails with download links. The chat interface optionally supports drag-and-drop image upload.

This keeps the MVP scope tight. File uploads add Blob Storage provisioning, upload endpoints, virus scanning considerations, and storage cost. Not worth it for 25-30 monthly submissions where the AI conversation captures the idea adequately.

### Business days calculation

SLA due dates use business days (skip Saturday and Sunday). No holiday calendar for MVP. Use a simple utility function:

```typescript
function addBusinessDays(date: Date, days: number): Date {
  let count = 0;
  const result = new Date(date);
  while (count < days) {
    result.setDate(result.getDate() + 1);
    if (result.getDay() !== 0 && result.getDay() !== 6) count++;
  }
  return result;
}
```

The SLA due date is calculated once on idea creation (`submittedAt + 15 business days`) and recalculated on reassignment (`reassignedAt + 15 business days`). The overdue indicator compares `slaDueDate` to the current date.

### App settings table

Add a `settings` table for runtime-configurable values that don't belong in environment variables:

```
settings
  key: string, PK
  value: string, not null
  updatedAt: timestamp
```

Initial settings:
- `watcher_email`: The distribution list for watcher notifications (e.g., `pdi@desertfinancial.com`)
- `sla_review_days`: Business days for initial review SLA (default: 15)
- `sla_close_days`: Business days for closure SLA (default: 30)
- `system_prompt`: The AI intake agent's system prompt text
- `submission_id_prefix`: The prefix for submission IDs (default: "TB")
- `yearly_counter_start_month`: When to reset the yearly ideas counter (default: 1 for January)
- `suggested_prompts`: JSON array of starter prompt pills for the chat interface (default: `["I have an idea about a process", "Something could work better for members", "I noticed something about our tools"]`)
- `social_proof_min_threshold`: Minimum monthly submissions before the social proof strip shows on the landing page (default: 5, set to 0 to always show)
- `celebration_enabled`: Whether to show confetti/sparkle on submission confirmation (default: true)

Admins manage these through a settings page (add `/settings` to admin routes). This avoids redeployment for configuration changes.

### AI conversation session handling

Each visit to the submit page starts a fresh conversation. No conversation history persists between page loads. An employee can submit multiple ideas by returning to the landing page after each submission.

When a submission is confirmed:
1. The AI calls the `submit_idea` tool
2. The server function creates the idea record, generates the submission ID, sends notifications
3. The tool result returns the submission ID and assigned leader name
4. The AI renders a confirmation message with the ID and a "View your idea" link
5. Below the confirmation, show a "Submit another idea" button that resets the chat

Abandoned conversations (user navigates away before confirming) are saved to the `conversations` table with `routingOutcome: abandoned` after a debounce (save on unmount or after 30 seconds of inactivity if at least one user message exists).

### Graph API email scoping

The app registration needs these application-level permissions:
- `Mail.Send` — send emails from the ThoughtBox shared mailbox
- `User.Read.All` — read user profiles, photos, and manager chain for people card enrichment and directory search

To prevent over-permissioning on mail (ability to send as any user in the tenant), configure an **application access policy** in Exchange Online that restricts the app registration to only the ThoughtBox shared mailbox:

```powershell
New-ApplicationAccessPolicy -AppId "<app-client-id>" `
  -PolicyScopeGroupId "thoughtbox@desertfinancial.com" `
  -AccessRight RestrictAccess `
  -Description "ThoughtBox app can only send from ThoughtBox shared mailbox"
```

This is a one-time Exchange admin command, not an app code change. Document it in the deployment runbook.

### Missing server functions (additions to the API section)

```
// Messages (comment thread)
addMessage(ideaId, content) → ideaEvent -- creates a message event, sends notification to other party
getIdeaMessages(ideaId) → ideaEvent[] -- filtered to eventType = message, for rendering the thread

// Landing page and engagement
getYearlySubmissionCount() → number -- total ideas submitted in the current calendar year
getUserSubmissionCount(userId) → number -- personal idea count for the current year (celebration + dashboard stat)
getRecentActivitySummary() → { monthCount, weekAccepted } -- for social proof strip
getSuggestedPrompts() → string[] -- configurable starter prompts for the chat input
getRecentProgramActivity(limit?) → ideaEvent[] -- recent events across all ideas (admin activity feed)

// Settings
getSettings() → Record<string, string> -- all settings
updateSetting(key, value) → setting -- admin only
```

### Error handling

| Failure | User experience |
|---|---|
| AI provider down or rate limited | Chat shows "I'm having trouble right now. You can try again in a moment, or describe your idea in the form below." Render a fallback traditional form (title, description, category dropdown) so submissions aren't blocked by AI availability. |
| Graph API down (emails) | Idea is created successfully. Email sending fails silently (logged to Application Insights). A background retry sends the email when Graph recovers. The employee sees their confirmation. |
| Database unreachable | Error boundary shows "ThoughtBox is temporarily unavailable. Please try again in a few minutes." Application Insights alert. |
| AI classification is wrong | The confirmation summary lets the employee edit the category before confirming. If the employee corrects it, the conversation is saved with the correction for future classification improvement. |

The fallback form for AI outages is important. ThoughtBox should never be completely down just because the LLM provider has an issue. The traditional form is hidden by default and only surfaces when the AI chat fails to initialize.

## Configuration and environment

### Environment variables

```
# Database
DATABASE_URL=postgresql://...

# Entra ID / Easy Auth
AZURE_CLIENT_ID=...
AZURE_TENANT_ID=...

# Microsoft Graph
GRAPH_CLIENT_ID=... (app registration)
GRAPH_CLIENT_SECRET=... (or managed identity)
GRAPH_TENANT_ID=...

# Email
THOUGHTBOX_SHARED_MAILBOX=thoughtbox@desertfinancial.com

# AI
AI_PROVIDER=azure-openai | anthropic
AZURE_OPENAI_ENDPOINT=...
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_DEPLOYMENT=...
# or
ANTHROPIC_API_KEY=...

# App
APP_URL=https://thoughtbox.desertfinancial.com (or Azure subdomain)
SUBMISSION_ID_PREFIX=TB
```

### Seed data

On first deployment, seed:
- Categories (from the taxonomy table above)
- Admin users (Nubia Ruiz, Eric Konefal, Greg Scott, Jaime Carranza)
- System prompt (default intake agent prompt)

## Open questions for PDI (not blocking build)

1. **Redirect URLs.** Which categories redirect and to where? Keystone is confirmed. Need URLs for Dee, Desertforce, Genesys, OnBase, and "other system."
2. **Action taken values.** What are the dropdown options for "Action taken" on the leader side? Carry forward from InMoment or revise?
3. **Efficiency tracking.** Is this part of ThoughtBox or a separate system? If part of ThoughtBox, it needs its own data model and UI. Deferred to Phase 2.
4. **Watcher list.** Is the Process Design and Improvement distribution list the correct recipient for watcher notifications? Or should watchers be configurable per-category?
5. **Category consolidation.** The current 18+ categories may be more than needed. Should PDI consolidate before launch, or launch with the current taxonomy and refine based on AI classification data?

## Relationship to existing artifacts

- **M365 solution design** (`design-thoughtbox-replatform.md`): The original solution design using SharePoint Lists and Power Automate. Still valid as an alternative path. This PRD replaces it as the build plan.
- **Working notes** (`thoughtbox-replatform-working-notes.md`): Meeting notes, requirements analysis, and context from the PDI kickoff. Source of truth for business requirements and stakeholder context.
- **Platform exploration** (`projects/app-platform/app-platform-exploration.md`): The architecture reference for the Internal App Platform. All technology decisions (TanStack Start, Drizzle, shadcn/ui, etc.) are defined there.

---

*Michael Wheatfill, Cloud & Collaboration Architect*
