import { db } from '../database/client.js';
import { teamMembers, identityMappings } from '../database/schema.js';
import { eq, or } from 'drizzle-orm';

export interface ResolvedTeamMember {
  id: string;
  name: string;
  githubUsername: string | null;
  avatarUrl: string | null;
  memberSince: string | null;
}

/**
 * Resolves an OAuth identity (email / username) to a team_members row.
 * Lookup order:
 *   1. team_members.primary_email = email
 *   2. identity_mappings where identity_type='email' and identity_value=email
 *   3. If email is @cluster.local, retry 1 & 2 with <kerberos>@redhat.com
 *   4. team_members.github_username = username (case-insensitive)
 */
export async function resolveTeamMember(
  email: string | undefined,
  username: string | undefined,
): Promise<ResolvedTeamMember | null> {
  if (!email && !username) return null;

  // 1. Direct email match
  if (email) {
    const byEmail = await db.query.teamMembers.findFirst({
      where: eq(teamMembers.primaryEmail, email),
    });
    if (byEmail) return toResolved(byEmail);
  }

  // 2. Identity mappings (email)
  if (email) {
    const mapping = await db.query.identityMappings.findFirst({
      where: (im, { and: a, eq: e }) =>
        a(e(im.identityType, 'email'), e(im.identityValue, email)),
    });
    if (mapping?.teamMemberId) {
      const member = await db.query.teamMembers.findFirst({
        where: eq(teamMembers.id, mapping.teamMemberId),
      });
      if (member) return toResolved(member);
    }
  }

  // 3. cluster.local fallback — OpenShift OAuth returns <kerberos>@cluster.local;
  //    try the corporate email derived from the local part.
  if (email?.endsWith('@cluster.local')) {
    const kerberosId = email.split('@')[0];
    const corporateEmail = `${kerberosId}@redhat.com`;

    const byCorp = await db.query.teamMembers.findFirst({
      where: eq(teamMembers.primaryEmail, corporateEmail),
    });
    if (byCorp) return toResolved(byCorp);

    const corpMapping = await db.query.identityMappings.findFirst({
      where: (im, { and: a, eq: e }) =>
        a(e(im.identityType, 'email'), e(im.identityValue, corporateEmail)),
    });
    if (corpMapping?.teamMemberId) {
      const member = await db.query.teamMembers.findFirst({
        where: eq(teamMembers.id, corpMapping.teamMemberId),
      });
      if (member) return toResolved(member);
    }
  }

  // 4. GitHub username match (case-insensitive)
  if (username) {
    const allActive = await db.query.teamMembers.findMany({
      where: eq(teamMembers.isActive, true),
    });
    const match = allActive.find(
      (m) => m.githubUsername?.toLowerCase() === username.toLowerCase(),
    );
    if (match) return toResolved(match);
  }

  return null;
}

function toResolved(
  member: typeof teamMembers.$inferSelect,
): ResolvedTeamMember {
  return {
    id: member.id,
    name: member.name,
    githubUsername: member.githubUsername,
    avatarUrl: member.githubUsername
      ? `https://github.com/${member.githubUsername}.png?size=128`
      : null,
    memberSince: member.startDate ?? member.createdAt?.toISOString().split('T')[0] ?? null,
  };
}
