# SLA Settings UI — Redesign Options

> **Status:** Pending customer feedback. Captured 2026-04-30.
> **Context:** Eric flagged that the admin Settings page now has multiple SLA areas after the business-day unification. We want a single coherent presentation before go-live.

## Current state

After the business-day unification, the admin Settings page has two separate SLA areas:

1. **Review SLA Deadline** (single card)
   - Setting: `sla_business_days` (default `15`)
   - Sets `slaDueDate` on every new/reassigned idea via `calculateSlaDueDate(now, 15)`.
   - Drives the overdue determination and "X days left" countdown across dashboards.

2. **SLA Reminders** (card containing three fields)
   - `sla_new_first_reminder_days` (default `5`)
   - `sla_new_second_reminder_days` (default `14`)
   - `sla_review_reminder_days` (default `30`)
   - Used only by `checkSlaReminders` in `src/server/lib/sla-check.ts` to send nudge emails.

Hidden from the UI but live in code:

- **Closure SLA** is hardcoded to 30 business days via `calculateSlaDueDate(now, 30)` in `createIdea` (`src/server/functions/ideas.ts`) and `chat.ts`. Not configurable from Settings; no "closure overdue" indicator in any view today.

## Problems with the current split

1. **Decoupling lets configs drift.** "Second Reminder (New)" describes itself as "Typically set to 1 day before the SLA deadline" but the code doesn't enforce it. If admin changes the deadline to 20 days but leaves the reminder at 14, the reminder is no longer "1 day before." Convention only.

2. **Coincidental overlap.** The "Reminder (Under Review)" defaults to 30 days, the closure SLA defaults to 30 business days. They share a number by coincidence — they're unrelated in code. Tuning one looks like tuning the other.

3. **Closure SLA is invisible.** Admin can configure the review SLA but not the closure SLA. Inconsistent surface area.

4. **No relative-time framing.** Reminders are absolute thresholds rather than "X days before deadline," forcing admins to do mental math when adjusting the deadline.

## Options for redesign

### Option A — Light touch (minimal change)

Keep separate fields, group them visually under one "Review SLA" card. Order: deadline → reminders. Helper text explicitly states the relationship.

```
┌──────────────────────────────────────────┐
│ Review SLA                               │
│  Deadline: 15 business days              │
│  Reminders: 5, 14 business days          │
│    ↳ "Reminders fire 5 and 14 days       │
│       before/within the 15-day deadline" │
└──────────────────────────────────────────┘
```

- **Pros:** small change, low risk, preserves flexibility.
- **Cons:** doesn't fix the drift problem; admins can still misconfigure.

### Option B — Derive reminders from the deadline

Store reminders as "fire X days *before* the deadline" instead of absolute thresholds. Changing the deadline auto-shifts the reminders.

- **Pros:** drift impossible by construction; intent is explicit.
- **Cons:** loses the "fire on day 5 regardless of deadline" option (which admin may want for the early "are you alive" nudge); requires data migration.

### Option C — Surface the closure SLA too

Whatever else changes, expose the closure SLA as a configurable setting and add a "closure overdue" indicator wherever review-overdue is shown.

- **Pros:** consistency; admin has full control.
- **Cons:** scope creep (need to add the indicator UI); customer hasn't asked for this yet.

### Recommendation (working hypothesis)

**A + C**: one "SLA Lifecycle" card with two deadlines (Review, Closure) and reminder thresholds nested under each, with relative-time helper text. Roughly an hour of work. Doesn't change semantics — just consolidates and exposes.

**Or** ask Eric whether he wants drift-prevention (Option B) or just visual consolidation (Option A). If they're tuning thresholds rarely after launch, A is plenty.

## Open questions for the customer

1. Do you want the second New reminder to **always** fire 1 day before the deadline (Option B), or do you want independent control (Option A)?
2. Should the closure SLA be exposed as a setting (Option C)?
3. Do you want a "closure overdue" indicator on dashboards/idea detail (separate from the existing review-overdue)?

## Where the settings live

| Setting | Key | Default | Used by |
|---|---|---|---|
| Review SLA | `sla_business_days` | 15 | `calculateSlaDueDate` (sets `ideas.slaDueDate`) |
| First reminder (New) | `sla_new_first_reminder_days` | 5 | `checkSlaReminders` |
| Second reminder (New) | `sla_new_second_reminder_days` | 14 | `checkSlaReminders` |
| Reminder (Under Review) | `sla_review_reminder_days` | 30 | `checkSlaReminders` |
| Closure SLA | hardcoded | 30 business days | `createIdea`, `chat.ts` (sets `ideas.closureSlaDueDate`) |
