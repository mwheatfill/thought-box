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

**Contributor**:
A user role (below Owner) who can be assigned individual Ideas to review and respond to the submitter, but does not own a Category. Edit/respond rights are **assignment-gated**: a Contributor can view and watch a Category's Ideas, but only on Ideas the Owner has assigned to them can they edit Owner Notes, message the submitter, and advance the Idea to Under Review. The final disposition (Accepted / Declined) is reserved to the Owner.

**Contributor roster**:
The set of Contributors a Category Owner has added to their Category; an Idea can only be assigned to a Contributor on its Category's roster. Managed by the Owner in a dedicated UI surface.

**My Category**:
An Owner's self-serve view (off My Queue) of a Category they own. Read-only on the definition (name, description, routing type, keywords — admin-controlled); the Owner can manage the Contributor roster and transfer Category ownership to anyone (audited; target must be valid so the Category never goes unowned).

**Watcher**:
A user subscribed to notifications for a single **Idea**; a subscription, **not** a role. Per-Idea only for now. A Watcher receives the submitter-facing events — status changes (incl. Reopen) and public owner↔submitter messages — but never internal notes, SLA reminders, or administrative events (Change Category / Assignment). (Future, out of scope here: a separate user-controlled opt-in for Owners/Contributors to follow a whole Category's notifications.)

**Reopen**:
An explicit, audited Owner/Admin action that returns a closed Idea (Accepted or Declined) to New and resets the SLA. Closed Ideas are otherwise locked; Reopen is the only path back, and may recategorize in the same step.
_Avoid_: treating a Change Category on a closed Idea as an implicit reopen — reopening is always deliberate.

**Active reviewer** (assigned reviewer):
The single person currently working an Idea. Any person scoped to the Idea's Category can be assigned: the Owner, a roster Contributor, or an Admin. Defaults to the Owner. This is who is *assigned*, distinct from who is *accountable* (always the Owner). The assigned person's role governs their permissions.

**Needs Triage** (Category):
An admin-owned catch-all Category (none seeded today — created when this ships). A reviewer who can't place an Idea uses "need admin assistance" to move it here, which notifies ThoughtBox admins to recategorize it. The reviewer is also offered an **AI suggestion** (reusing the embedded classifier) before falling back to triage.

**Change Category** (a.k.a. Reassignment):
Moving an Idea to a different Category, which changes its derived Owner. The accountability lever — captures a reason (Internal Department Reassignment / Improperly Assigned), resets the SLA, and clears any assigned Contributor (so the Active reviewer falls back to the new Category's derived Owner). Not a person-to-person handoff.

**Assignment**:
Setting an Idea's single Active reviewer — any person scoped to its Category: the Owner, a roster Contributor, or an Admin (shown with their role in the picker). An Owner/Admin action; defaults to the Owner and resets to the Owner on Change Category. Does not change ownership and does not reset the SLA.

## Relationships

- A **Category** has at most one **Owner** (nullable Owner = unowned Category). The app blocks demoting/deactivating a user through its own UI while they still own Categories (forcing a transfer first); out-of-band departures (Entra deactivation) can still leave a Category unowned, which is surfaced to admins as "needs Owner". Prior owners are traceable via the idea-event/audit trail, not stored on the Idea
- An **Owner** can own multiple **Categories**
- An **Idea** belongs to exactly one **Category**; its **Owner** is *derived* from that Category, never stored on the Idea
- An **Idea** has exactly one **Active reviewer** — by default its Category's **Owner**, or a single explicitly-assigned **Contributor** or **Admin** scoped to the Category. No co-review (one reviewer at a time)
- A **Contributor** must be on a **Category**'s **Contributor roster** before being assigned any Idea in that Category
- A user's effective **Contributor** role is *granted by roster membership* (on ≥1 Contributor roster), not set directly by an admin; any Owner can add any active user to their Category's roster
- Add-people pickers (Owner, Contributor, Watcher) default to existing Users and extend to an Entra directory search, **inline-creating** the User if they don't exist yet (reusing `searchDirectory` + `upsertUser`). Owners — not just admins — may do this inline-create when adding a Contributor/Watcher; the created User defaults to role `submitter` (roster membership is what grants Contributor capability). This deliberately widens the current admin-only gate
- A user becomes a **Watcher** three ways: self opt-in (any user with view access to the Idea), added by an Owner/Admin (which grants that user view access to that one Idea), or automatically when assigned as the Idea's reviewer. The submitter is always notified implicitly and is **not** a Watcher row (cannot be unwatched off their own Idea)
- **Roles** form a hierarchy: `submitter → contributor → owner → admin`, and are **derived from relationships** (ADR-0003): `admin` is the only explicitly-granted role; `owner` = owns ≥1 Category; `contributor` = on ≥1 roster; `submitter` = default. No manual owner/contributor setter

## Flagged ambiguities

- **"Watcher" is overloaded — resolved.** The domain term **Watcher** = a user subscribed to an Idea. The existing `watcher_email` *setting* (a new-submission notification DL) is unrelated config and should be renamed in code (e.g. an intake-notification address) to free the name.
- **Customer's "Watcher" ≠ our "Watcher."** In the UAT sheet (Pri 3), the customer's "Watcher" can edit Owner Notes and message the submitter — i.e. an *active* participant. That maps to our **Contributor**, not our (passive) Watcher.
