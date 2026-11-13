import { describe, it, expect } from 'vitest';
import { findDeactivationCandidates, type RosterMember } from './roster-diff.js';

function member(overrides: Partial<RosterMember> & { id: string }): RosterMember {
  return {
    isActive: true,
    source: 'org_pulse_roster',
    githubUsername: null,
    ...overrides,
  };
}

describe('findDeactivationCandidates', () => {
  it('returns a member who is absent from the payload', () => {
    const result = findDeactivationCandidates({
      existingMembers: [member({ id: 'a', githubUsername: 'alice' })],
      processedIds: new Set<string>(),
      incomingUsernames: new Set<string>(),
      deactivationSources: ['org_pulse_roster'],
    });

    expect(result).toEqual([{ id: 'a', githubUsername: 'alice' }]);
  });

  it('does not return a member present in the payload, regardless of case', () => {
    const result = findDeactivationCandidates({
      existingMembers: [member({ id: 'a', githubUsername: 'Alice' })],
      processedIds: new Set<string>(),
      incomingUsernames: new Set<string>(['alice']),
      deactivationSources: ['org_pulse_roster'],
    });

    expect(result).toEqual([]);
  });

  it('does not return a member that the sync already processed', () => {
    const result = findDeactivationCandidates({
      existingMembers: [member({ id: 'a', githubUsername: 'alice' })],
      processedIds: new Set<string>(['a']),
      incomingUsernames: new Set<string>(),
      deactivationSources: ['org_pulse_roster'],
    });

    expect(result).toEqual([]);
  });

  it('ignores sources outside the sync scope', () => {
    const result = findDeactivationCandidates({
      existingMembers: [
        member({ id: 'manual', githubUsername: 'manual-user', source: 'manual' }),
        member({ id: 'github', githubUsername: 'gh-user', source: 'github_org_sync' }),
      ],
      processedIds: new Set<string>(),
      incomingUsernames: new Set<string>(),
      deactivationSources: ['org_pulse_roster'],
    });

    expect(result).toEqual([]);
  });

  it('ignores members that are already inactive', () => {
    const result = findDeactivationCandidates({
      existingMembers: [member({ id: 'a', githubUsername: 'alice', isActive: false })],
      processedIds: new Set<string>(),
      incomingUsernames: new Set<string>(),
      deactivationSources: ['org_pulse_roster'],
    });

    expect(result).toEqual([]);
  });

  it('handles members without a github username (email-only roster entries)', () => {
    const result = findDeactivationCandidates({
      existingMembers: [member({ id: 'a', githubUsername: null })],
      processedIds: new Set<string>(),
      incomingUsernames: new Set<string>(['alice']),
      deactivationSources: ['org_pulse_roster'],
    });

    expect(result).toEqual([{ id: 'a', githubUsername: null }]);
  });
});
