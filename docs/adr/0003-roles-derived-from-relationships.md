# Roles are derived from relationships, not stored (except admin)

## Context

`user.role` was an explicit enum an admin set per user. With category-centric ownership (ADR-0001) and roster-granted Contributors (ADR-0002), an explicit role field drifts from reality — a user flagged "owner" who owns no Category, or a roster member whose enum still says "submitter."

## Decision

A user's effective role is **derived**: `admin` (the only explicitly-granted role) → `owner` (owns ≥1 Category) → `contributor` (on ≥1 Contributor roster) → `submitter` (default). You make someone an Owner by **giving them a Category** and a Contributor by **adding them to a roster** — there is no manual owner/contributor setter.

## Consequences

- Eliminates role/relationship drift. Pri 8's "promote to New leader" becomes simply "assign them a Category."
- The admin Users page loses its manual owner/contributor role setter (replaced by assigning Categories / rosters). `admin` stays an explicit grant.
- Everywhere `user.role` is read must compute it from relationships (or a maintained projection), not a stored column. This is a cross-cutting change.

## Considered alternatives

- **Explicit enum (status quo)** — rejected: drifts from Category/roster reality and needs manual cleanup.
- **Hybrid (admin + submitter explicit, owner/contributor derived)** — functionally the chosen design; `admin` is the explicit grant and `submitter` is the default, so the two framings converge.
