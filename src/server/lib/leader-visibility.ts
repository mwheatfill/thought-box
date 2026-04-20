/**
 * Leader anonymity: submitters should not see which leader is assigned until
 * the idea has entered active review. This prevents direct outreach during
 * early triage (New) and quick declines (New → Declined).
 *
 * Once an idea moves to Under Review or Accepted, the leader's identity is
 * revealed and stays visible even if the idea is later declined.
 */
export function shouldShowLeader(role: string, hasBeenReviewed: boolean): boolean {
	if (role !== "submitter") return true;
	return hasBeenReviewed;
}

/** Replace actor name in events/timeline when the actor is the assigned leader */
export function anonymizeActorName(
	actorName: string,
	actorId: string,
	assignedLeaderId: string | null,
	role: string,
	hasBeenReviewed: boolean,
): string {
	if (shouldShowLeader(role, hasBeenReviewed)) return actorName;
	// Only anonymize the assigned leader, not other actors (e.g., the submitter themselves)
	if (actorId === assignedLeaderId) return "A reviewer";
	return actorName;
}
