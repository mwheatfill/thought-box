# Derive an Idea's Owner from its Category

## Context

ThoughtBox stored the responsible person directly on each Idea (`ideas.assignedOwnerId`, snapshotted from the Category's default owner at creation). This let the two drift: an Idea reassigned to a different person kept its old Category, and a Category's owner leaving the org left Ideas orphaned (UAT rows Pri 6, Pri 13).

## Decision

The **Category is the unit of ownership.** An Idea's **Owner** is derived at read time from `category.ownerId`; it is not stored on the Idea. Reassignment means moving an Idea to a different Category. The idea→person column is repurposed to mean the optionally-assigned **Contributor** (the active reviewer), not the owner.

## Consequences

- Category drift (Pri 6) and owner-orphaning (Pri 13) become impossible by construction rather than handled after the fact.
- ~56 read sites across 11 files that filter on `assignedOwnerId` (My Queue, dashboard KPIs, email targeting, visibility) move to "Ideas whose Category I own." This is the bulk of the work and can be staged.
- Accountability (SLA, escalation) follows the Category Owner; execution can be delegated to a Contributor without changing accountability.

## Considered alternatives

- **Snapshot owner onto the Idea on Category change** — far smaller change (reuses the existing creation-time write pattern, leaves the 56 read sites untouched), but reintroduces the exact drift that caused Pri 6/13. Acceptable as a first-ship interim, rejected as the target model.
