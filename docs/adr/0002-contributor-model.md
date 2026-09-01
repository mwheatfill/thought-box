# Contributor Model: roster-granted, assignment-gated, single per Idea

> **Superseded (2026-08-27 R14/R29; 2026-09-01 ADR-0004).** The assignment
> gate is removed: roster membership (UI label now **"Watcher"**) grants Owner
> Notes editing and submitter messaging on **all** Ideas in the Category, plus
> category-wide alert emails — and assignment is open to the whole directory.
> The "legwork, not verdict" rule is retired too: **whoever an Idea is assigned
> to owns it**, verdict included (ADR-0004). Still standing: roster-granted
> Watcher role and one assignee per Idea. See CONTEXT.md for the current model.

## Context

The UAT sheet (Pri 3) asked for "Watchers" on a Category who could update Owner Notes and message submitters. We split that into two concepts: a passive **Watcher** (subscription) and an active **Contributor** (role). This ADR records how the Contributor role is granted and bounded.

## Decision

- **Granted by roster, not by admin.** Each Category has a Contributor roster the Owner manages; any Owner can add any active user. A user's effective `contributor` role is *derived* from being on ≥1 roster, not set directly by an admin.
- **Assignment-gated rights.** A roster Contributor can view and watch a Category's Ideas, but can only act (edit Owner Notes, message the submitter, advance to Under Review) on Ideas the Owner has explicitly **assigned** to them.
- **One assigned reviewer per Idea.** An Idea has exactly one Active reviewer — any person scoped to its Category (Owner, a roster Contributor, or an Admin), defaulting to the Owner. Assignment points at a person; their role governs permissions. No co-review.
- **Legwork, not verdict.** When the assigned reviewer is a Contributor, they may advance `New → Under Review` but the final disposition (`Accepted` / `Declined`) is reserved to Owner/Admin. (Owner/Admin reviewers have full rights.)

## Considered alternatives

- **Category-wide rights** (any roster member acts on any Idea, no assignment) — closer to the customer's literal wording, rejected for losing a single clear Active reviewer and inviting collisions.
- **Multiple Contributors per Idea** (co-review via an `idea_contributors` join) — rejected as premature; the roster already provides "multiple people in the category." Promote to a join only if real co-review demand appears.
- **Admin-granted role** (two-step: admin promotes, then Owner adds) — rejected as friction contradicting the customer's "Owner and/or admin assigns."
