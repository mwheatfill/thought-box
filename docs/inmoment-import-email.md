# Email draft: InMoment historical import async kickoff

> Draft for sending to the customer instead of an hour-long meeting to walk through the InMoment Q1 export.

---

**Subject:** ThoughtBox: InMoment historical import questions

Hi [name],

I dug into the Q1 InMoment export this morning. There are seven decisions that need to be made before I can run the import. None of them are technical, but several change what owners and submitters experience on day one of go-live, so I want to lock them down with you before anything is written to production. To save us both an hour, I've put them below so you can answer at your pace. Happy to jump on a quick call if anything is unclear.

**What's in the file:** 84 ideas from Jan 1 to Mar 31. 58 Closed, 23 New, 3 In Progress. 59 unique submitters and 25 unique owners.

**A note on emails first:** the import writes directly to the database. No "new idea" emails to submitters. No "idea assigned to you" emails to owners. No watcher alerts. No "welcome to ThoughtBox" invites. Day one inboxes stay clean. If you want me to send owners a one-time summary after the import ("here are your historical ideas"), I can do that as a separate step. Just say the word.

**Questions:**

**1. Category mapping.** InMoment has 11 categories. ThoughtBox has 13. Below is my best guess. Please confirm or correct each row. Mark "create new" if none of ours fit.

| InMoment category | Suggested ThoughtBox category | OK? |
|---|---|---|
| Desertforce | Desertforce | |
| System ideas to revise digital banking | Digital Banking / Online Banking | |
| Product, new (doesn't currently exist) | Products / Policy | |
| Product, revise a current product | Products / Policy | |
| Employee, perks/benefits or HR-related | HR / Benefits / Employee Programs / Training | |
| Employee, financial well-being idea | HR / Benefits / Employee Programs / Training | |
| Employee, communication (e.g., The Union) | Internal Communications | |
| System, Genesys phone system | *(your call)* | |
| System, other | *(your call)* | |
| Dee, Intelligent Virtual Assistant | *(your call)* | |
| Other | *(your call: keep as ThoughtBox catch-all?)* | |

**2. Title generation.** InMoment didn't capture a title field, just the body. ThoughtBox requires a title. Pick one:

- **(a)** Auto-generate from the first 80 characters of the suggestion. Fastest. Owners can edit later. *(My recommendation.)*
- **(b)** Use AI to generate a clean one-line title for each. Adds maybe 20 minutes and about 10 cents in API cost.
- **(c)** Leave blank. Owners fill in manually as they re-touch each one.

**3. Submitter and owner user accounts.** The export has names but no email addresses. I'll look up each name in your directory to find the matching person, then quietly create their ThoughtBox user record (no invite email). When they later log in for the first time, the system recognizes them and uses the same record, so no duplicates. About 80 to 90% of names should match cleanly. Two questions:

- For names that don't match (typos, departed staff, ambiguous names): assign those ideas to a placeholder "Legacy InMoment User" account with the original name in the description? Or send you the list of unmatched names first and wait for your guidance?
- Of the 25 owner names, are any no longer at Desert Financial or no longer in an owner role? If so, who should those ideas go to instead?
- After the import, do you want me to send you a list of newly created owners so an admin can send each of them the standard ThoughtBox invite?

**4. Submission ID numbering.** Right now, the first real go-live submission will be TB-0001. If we import the 84 historical ideas first, they take TB-0001 through TB-0084 and the first new go-live idea becomes TB-0085. The alternative: keep TB-0001 reserved for the first real submission, and import the historical ideas with their original InMoment Case ID (33417, etc.) saved in the notes field. Which do you prefer?

**5. Closed status mapping.** For each combination of "Closed" + the action taken, here's the proposed mapping:

| InMoment Action | ThoughtBox status / rejection reason |
|---|---|
| "No changes will be made" | Declined / Not feasible |
| "Idea is already captured on a roadmap" | Accepted / Already in progress |
| "New idea, will be implemented" | Accepted |
| "Submission error, redirected" | Redirected / Not ThoughtBox |
| "Researching feasibility" | Under Review *(treating as still active)* |
| (blank) | Declined / Not feasible *(fallback)* |

OK as proposed, or any changes?

**6. SLA reminders for the 26 open ideas.** ThoughtBox's automated reminders fire at 5, 14, and 30 business days. If we import an idea submitted in January with its original date intact, two things happen:

- The next morning, owners get a flood of "overdue" reminder emails for every open imported idea.
- Day-one dashboards show all of them as red.

Three options:

| Option | What it does | Tradeoff |
|---|---|---|
| **(a)** Suppress reminders, preserve real age | Mark each already-passed reminder as sent so the daily check skips them. Real submission dates and overdue indicators show. | Day-one dashboards show real overdue count (lots of red). |
| **(b)** Reset SLA on every open imported idea | Treat each as just received. Fresh 15-day countdown from import time. | Clean dashboards. But a 90-day-old idea looks brand new. |
| **(c)** Reset SLA on open ideas, preserve on closed *(my recommendation)* | Open ideas get a fresh window so owners can triage. Closed ones keep accurate history. | Best balance. Clean go-live, accurate audit trail. |

No reminder emails fire during the import itself. This question is only about what happens the morning after.

**7. Activity history for closed cases.** Two options:

- **(a)** Build the full history: created event on the original submission date, status change on the close date, research notes attached. *(My recommendation. Preserves real timing.)*
- **(b)** Import each in its final state with a single "Imported from InMoment on [date]" event.

**Next steps.** ThoughtBox doesn't have a built-in import feature, so I'll need to write a one-off script to handle this. Once you reply, I'll build the script around your answers, do a dry run that prints what would happen without writing anything, send you the output for sanity check, then run the real import with a JSON backup of the source data. No production downtime.

Thanks,
Michael
