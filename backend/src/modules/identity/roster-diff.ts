/**
 * Roster diff helpers.
 *
 * Extracted from the bulk team-member sync handler so the deactivation policy
 * is a pure, testable function. The policy question ("who should we deactivate
 * because they are missing from this payload?") is the one that can silently
 * remove real people, so it must be easy to review and easy to test.
 */

export interface RosterMember {
  id: string;
  /** Nullable in the schema; null is treated as inactive. */
  isActive: boolean | null;
  source: string | null;
  githubUsername: string | null;
  name: string;
}

export interface DeactivationCandidate {
  id: string;
  name: string;
  githubUsername: string | null;
}

/**
 * Members that belong to one of the synced sources, are currently active, and
 * were not present in the incoming payload.
 *
 * Note: absence from a single payload is not proof of departure. Callers decide
 * whether to act on the result; the default is to report it.
 */
export function findDeactivationCandidates(params: {
  existingMembers: RosterMember[];
  processedIds: Set<string>;
  incomingUsernames: Set<string>;
  deactivationSources: string[];
}): DeactivationCandidate[] {
  const { existingMembers, processedIds, incomingUsernames, deactivationSources } = params;

  return existingMembers
    .filter(
      (m) =>
        m.isActive &&
        !processedIds.has(m.id) &&
        m.source !== null &&
        deactivationSources.includes(m.source) &&
        !(m.githubUsername && incomingUsernames.has(m.githubUsername.toLowerCase()))
    )
    .map((m) => ({ id: m.id, name: m.name, githubUsername: m.githubUsername }));
}
