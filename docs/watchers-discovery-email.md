# Watchers discovery email (draft)

**To:** [Client contact]
**From:** Michael
**Subject:** Quick chat before we build Watchers?

---

Hi [Name],

Before we kick off the Watchers work from row 6 of the UAT spreadsheet, would you have 20 minutes for a quick chat about it? Want to make sure we land this one in a place you'll still be happy with six months from now.

A few things stood out as I was mapping the ask to the code:

- The Watchers in your spec can edit Owner Notes and message the submitter, so they're not passive observers. They're active participants working the idea.
- Pairing that with the other items in the same row (multiple Watchers per category, owners reassigning category ownership, owners self-serving their own category settings), it feels like the underlying need might be team-based ownership of a category rather than a Watchers list added on top of a single Default Leader.

If that hunch is right, building Watchers as a standalone concept now would probably push us into a refactor down the road, once the team shape becomes obvious. If the hunch is wrong, no harm in checking before we commit code.

Here's what I'd suggest:

1. A quick 20 minute call where you walk me through who does what day-to-day on a category. Who watches, who acts, who gets pinged, and when one person needs to hand things off.
2. I'll bring two short sketches. One for a thin Watchers feature pretty close to what's in the UAT row, and one for Category Teams (a Lead plus members, with the Lead owning the SLA). You react to both, and whichever fits your workflow is what we build.

Async also works if calendars are tight this week. Happy to send the sketches over and gather your thoughts in writing instead.

Just wanted to pause for a beat before committing to a shape, since this one touches a few parts of the app at once.

Let me know what works for you,
Michael
