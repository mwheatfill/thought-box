# Assignment confers ownership

## Context

The 2026-08-29 production release shipped the category-centric model (ADR-0001/0002/0003): the verdict (Accept/Decline), Change Category, hand-off, and Reopen were reserved to the Category Owner, and the `owner` role was derived only from owning a Category.

Within two days the client reported two production incidents that were the same defect seen from two sides:

1. An assignee got **"Forbidden"** declining her ticket (TB-0171) — the UI offered the action, the server reserved it to the Category Owner.
2. **37 users** who had worked assigned tickets for months without owning a Category derived to `submitter`: no queue, no dashboard, "missing" tickets, and the Users page could only grant admin.

The client's operating model — evident since R19 ("non-leaders will be assigned ideas"), R29 (assign anyone in the directory), and stated outright in the incident thread ("she is an owner, not a category owner") — is person-centric: **whoever a ticket is assigned to owns it.**

## Decision

1. **The idea's active owner holds every power on that idea.** Active owner = the assignee if set, else the Category Owner; admins always. Powers: notes, messaging, Under Review, Accept/Decline, Assignment (hand-off), Change Category, Reopen, Watcher management. Encoded once, in `resolveIdeaCapabilities` (`assignedActor`); every server gate reads it from there — no inline copies.
2. **The `owner` role derives from owning a Category OR holding ≥1 assigned idea.** Assignment *is* the promotion; there is no manual Owner setter. Closed ideas still count on purpose: a past assignee keeps their history, dashboard, and Owner standing — dropping them the moment their last ticket closes would recreate incident #2.
3. **Accountability follows the Category Owner as notification, not veto.** When someone other than the Category Owner decides, moves, hands off, or reopens one of their category's ideas, they are emailed (`notifyIdeaStakeholders`). The prior assignee is told of a hand-off; the new assignee gets their own email.
4. **An assignee acting on their own ticket never loses sight of it.** Change Category, Reopen, and Triage clear the assignment; when the assignee is the actor they are kept as a per-idea Watcher so the page and queue don't vanish under them.
5. **Assignment blocks deactivation** the way category ownership does: a user with open assigned ideas must be reassigned first.

## Consequences

- Dashboard / All Ideas scope includes ideas assigned to the user, not just their categories' ideas.
- Category Watchers are unchanged: notes and messages only, never status.
- Hand-offs are transitive (A→B→C) by design — every hop emails the Category Owner.
- ADR-0002's verdict reservation is retired; ADR-0003's derivation rule is amended (a fourth relationship).
- Role derivation now issues one extra indexed count per authenticated request (`ideas_assigned_reviewer_idx`, migration 0023). A per-user role cache is a known follow-up if it shows in latency.
