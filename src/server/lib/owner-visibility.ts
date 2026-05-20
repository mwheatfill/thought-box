/**
 * Owner anonymity: submitters should not see which owner is assigned until
 * the idea has entered active review. This prevents direct outreach during
 * early triage (New) and quick declines (New → Declined).
 *
 * Once an idea moves to Under Review or Accepted, the owner's identity is
 * revealed and stays visible even if the idea is later declined.
 */
export function shouldShowOwner(role: string, hasBeenReviewed: boolean): boolean {
	if (role !== "submitter") return true;
	return hasBeenReviewed;
}

/** Replace actor name in events/timeline when the actor is the assigned owner */
export function anonymizeActorName(
	actorName: string,
	actorId: string,
	assignedOwnerId: string | null,
	role: string,
	hasBeenReviewed: boolean,
): string {
	if (shouldShowOwner(role, hasBeenReviewed)) return actorName;
	// Only anonymize the assigned owner, not other actors (e.g., the submitter themselves)
	if (actorId === assignedOwnerId) return "A reviewer";
	return actorName;
}
