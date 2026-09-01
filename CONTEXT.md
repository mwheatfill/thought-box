# ThoughtBox — Domain Context

Employee idea-and-suggestion platform for Desert Financial. This file captures the domain language for the **ownership model** — who is responsible for an idea, who works it, and how that changes.

## Language

**Idea**:
A single employee suggestion moving through the workflow (New → Under Review → Accepted/Declined).
_Avoid_: ticket, submission (use Idea; "submission ID" is fine for the TB-NNNN code).

**Category**:
The taxonomy bucket an Idea belongs to, and the **unit of ownership** — ownership and routing attach to the Category, not the Idea.

**Owner**:
The single person accountable for a Category and, by derivation, for every Idea in it; holds the SLA.
_Avoid_: Leader (renamed to Owner in code as of `d285d06`), assignee.

**Category Watcher** (UI label: "Watcher"; code identifiers still say `contributor`):
A user role (below Owner) on a Category's Watcher roster. **Category-scoped rights** (client-confirmed R14, 2026-08-27, superseding the earlier assignment gate): a category Watcher can read/edit Owner Notes and message the submitter on **any** Idea in the Category, and receives alert emails for every status change and public message in it (never for their own actions). They cannot change status, decide (Accept/Decline), change category, assign, or reopen — those stay with Owner/Admin (advancing to Under Review also with the assigned reviewer). The stored role enum value remains `contributor`; only the user-facing label changed.

**Watcher roster** (formerly Contributor roster):
The set of category Watchers a Category Owner has added to their Category. Managed by the Owner in a dedicated UI surface ("Watchers" in the category team sheet).

**My Category**:
An Owner's self-serve view (off My Queue) of a Category they own. Read-only on the definition (name, description, routing type, keywords — admin-controlled); the Owner can manage the Contributor roster and transfer Category ownership to anyone (audited; target must be valid so the Category never goes unowned).

**Idea Watcher** (per-Idea subscription):
A user subscribed to notifications for a single **Idea** — a subscription, not a role (self opt-in, or looped in by an Owner/Admin, which also grants view access to that one Idea). Receives the submitter-facing events — status changes (incl. Reopen) and public owner↔submitter messages — but never internal notes, SLA reminders, or administrative events (Change Category / Assignment). NOTE: the UI word "Watcher" now covers BOTH this per-Idea subscription AND the category Watcher role above — the client insisted on one word (R14). Disambiguate in code and docs via `ideaWatchers` (subscription) vs `categoryContributors` (role).

**Reopen**:
An explicit, audited action by the Idea's active owner (assignee, Category Owner, or Admin) that returns a closed Idea (Accepted or Declined) to New and resets the SLA. Closed Ideas are otherwise locked; Reopen is the only path back, and may recategorize in the same step. The accountable Category Owner is notified when someone else reopens.
_Avoid_: treating a Change Category on a closed Idea as an implicit reopen — reopening is always deliberate.

**Active owner** (a.k.a. active reviewer / assignee):
The single person currently working an Idea: the assignee if one is set, else the Category Owner. **Anyone in the Entra directory can be assigned** (R29) — inline-created as a User on first assignment; deactivated accounts are refused. **Whoever a ticket is assigned to owns it** (ADR-0004, 2026-09-01): the active owner holds every power on that Idea — notes, messaging, Under Review, Accept/Decline, hand-off (Assignment), Change Category, Reopen, Watcher management. The Category Owner keeps the *category-level* powers (roster, transfer, definitions) and is notified whenever someone else moves, hands off, or reopens one of their category's Ideas.

**Needs Triage** (Category):
An admin-owned catch-all Category (none seeded today — created when this ships). A reviewer who can't place an Idea uses "need admin assistance" to move it here, which notifies ThoughtBox admins to recategorize it. The reviewer is also offered an **AI suggestion** (reusing the embedded classifier) before falling back to triage.

**Change Category** (a.k.a. Reassignment):
Moving an Idea to a different Category, which changes its derived Owner. The accountability lever — captures a reason (Internal Department Reassignment / Improperly Assigned), resets the SLA, clears any assigned Contributor (so the Active reviewer falls back to the new Category's derived Owner), and rolls the status back to New so the Idea lands fresh in the new Owner's queue. The target must be a live destination (active, ThoughtBox-routing, owned). It is an **administrative** move: only the new Owner is notified — the submitter is **not** pinged (consistent with the Watcher event filter, which excludes administrative events). Not a person-to-person handoff.

**Assignment** (hand-off):
Setting an Idea's active owner — the category team quick-picks plus an open Entra directory search (R29). Any current active owner (assignee, Category Owner, or Admin) may hand the Idea off; defaults to the Category Owner and resets to them on Change Category. Assignment **is the promotion**: holding an assigned Idea makes someone an Owner in the app (ADR-0004). It never resets the SLA. The Category Owner and the prior assignee are notified of a hand-off they didn't make.

## Relationships

- A **Category** has at most one **Owner** (nullable Owner = unowned Category). The app blocks demoting/deactivating a user through its own UI while they still own Categories (forcing a transfer first); out-of-band departures (Entra deactivation) can still leave a Category unowned, which is surfaced to admins as "needs Owner". Prior owners are traceable via the idea-event/audit trail, not stored on the Idea
- An **Owner** can own multiple **Categories**
- An **Idea** belongs to exactly one **Category**; its **Owner** is *derived* from that Category, never stored on the Idea
- An **Idea** has exactly one **Active reviewer** — by default its Category's **Owner**, or a single explicitly-assigned **Contributor** or **Admin** scoped to the Category. No co-review (one reviewer at a time)
- Assignment is **open**: anyone in the directory can be made an Idea's Active reviewer (R29); roster membership is not required
- A user's effective **category Watcher** role is *granted by roster membership* (on ≥1 Watcher roster), not set directly by an admin; any Owner can add any active user to their Category's roster
- Add-people pickers (Owner, Contributor, Watcher) default to existing Users and extend to an Entra directory search, **inline-creating** the User if they don't exist yet (reusing `searchDirectory` + `upsertUser`). Owners — not just admins — may do this inline-create when adding a Contributor/Watcher; the created User defaults to role `submitter` (roster membership is what grants Contributor capability). This deliberately widens the current admin-only gate
- A user becomes a **Watcher** three ways: self opt-in (any user with view access to the Idea), added by an Owner/Admin (which grants that user view access to that one Idea), or automatically when assigned as the Idea's reviewer. The submitter is always notified implicitly and is **not** a Watcher row (cannot be unwatched off their own Idea)
- **Roles** form a hierarchy: `submitter → contributor → owner → admin`, and are **derived from relationships** (ADR-0003, amended by ADR-0004): `admin` is the only explicitly-granted role; `owner` = owns ≥1 Category **or holds ≥1 assigned Idea (open or closed — a past assignee keeps their history and Owner standing)**; `contributor` (UI: Watcher) = on ≥1 roster; `submitter` = default. No manual owner/contributor setter — assigning someone a ticket or a category is the promotion

## Flagged ambiguities

- **"Watcher" is overloaded — accepted (2026-08-27).** The client rejected the Watcher/Contributor split and wanted one word. The UI now uses **Watcher** for both the category role (active: notes + messages + category-wide alerts) and the per-Idea subscription (passive: alerts only). Code keeps the two apart: `categoryContributors` (role) vs `ideaWatchers` (subscription). The `watcher_email` intake-DL setting remains unrelated config.
