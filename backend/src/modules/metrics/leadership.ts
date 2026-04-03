import { db } from '../../shared/database/client.js';
import { projects, teamMembers, maintainerStatus, leadershipPositions } from '../../shared/database/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { getOrgConfig } from '../../shared/config/org-registry.js';
import { logger } from '../../shared/utils/logger.js';
import type { LeadershipSummaryResponse } from './types.js';

function getWorkingGroupsForProject(githubOrg: string, githubRepo: string): string[] {
  const orgCfg = getOrgConfig(githubOrg);
  if (!orgCfg?.repoToWorkingGroup) return [];
  return orgCfg.repoToWorkingGroup[githubRepo] ?? [];
}

export async function getLeadershipSummary(
  projectId?: string,
  githubRepo?: string,
  githubOrg?: string,
): Promise<LeadershipSummaryResponse> {
  try {
    const msConditions = [eq(maintainerStatus.isActive, true)];
    if (projectId) msConditions.push(eq(maintainerStatus.projectId, projectId));
    if (githubOrg) msConditions.push(eq(projects.githubOrg, githubOrg));

    const totalMsConditions = [eq(maintainerStatus.isActive, true)];
    if (projectId) totalMsConditions.push(eq(maintainerStatus.projectId, projectId));
    if (githubOrg) totalMsConditions.push(eq(projects.githubOrg, githubOrg));

    const [maintainerStatuses, allLp, totalLpCounts, totalMsCounts] = await Promise.all([
      db
        .select({
          id: maintainerStatus.id,
          positionType: maintainerStatus.positionType,
          positionTitle: maintainerStatus.positionTitle,
          scope: maintainerStatus.scope,
          teamMemberId: maintainerStatus.teamMemberId,
          teamMemberName: teamMembers.name,
          githubUsername: teamMembers.githubUsername,
          projectId: maintainerStatus.projectId,
          projectName: projects.name,
          isActive: maintainerStatus.isActive,
        })
        .from(maintainerStatus)
        .innerJoin(teamMembers, eq(maintainerStatus.teamMemberId, teamMembers.id))
        .innerJoin(projects, eq(maintainerStatus.projectId, projects.id))
        .where(and(...msConditions)),

      db
        .select({
          id: leadershipPositions.id,
          positionType: leadershipPositions.positionType,
          committeeName: leadershipPositions.committeeName,
          roleTitle: leadershipPositions.roleTitle,
          communityOrg: leadershipPositions.communityOrg,
          teamMemberId: leadershipPositions.teamMemberId,
          teamMemberName: teamMembers.name,
          githubUsername: teamMembers.githubUsername,
          isActive: leadershipPositions.isActive,
          votingRights: leadershipPositions.votingRights,
        })
        .from(leadershipPositions)
        .innerJoin(teamMembers, eq(leadershipPositions.teamMemberId, teamMembers.id))
        .where(eq(leadershipPositions.isActive, true)),

      db
        .select({
          communityOrg: leadershipPositions.communityOrg,
          positionType: leadershipPositions.positionType,
          committeeName: leadershipPositions.committeeName,
          count: sql<number>`count(*)::int`,
        })
        .from(leadershipPositions)
        .where(eq(leadershipPositions.isActive, true))
        .groupBy(leadershipPositions.communityOrg, leadershipPositions.positionType, leadershipPositions.committeeName),

      db
        .select({
          positionType: maintainerStatus.positionType,
          positionTitle: sql<string>`min(${maintainerStatus.positionTitle})`,
          scope: maintainerStatus.scope,
          count: sql<number>`count(distinct ${maintainerStatus.githubUsername})::int`,
        })
        .from(maintainerStatus)
        .innerJoin(projects, eq(maintainerStatus.projectId, projects.id))
        .where(and(...totalMsConditions))
        .groupBy(maintainerStatus.positionType, maintainerStatus.scope),
    ]);

    let filteredLp = allLp;
    if (githubOrg && !projectId) {
      filteredLp = allLp.filter(p => p.communityOrg === githubOrg);
    } else if (projectId && githubRepo) {
      const project = await db.query.projects.findFirst({
        columns: { githubOrg: true },
        where: eq(projects.id, projectId),
      });
      if (project) {
        const relevantWGs = new Set(
          getWorkingGroupsForProject(project.githubOrg, githubRepo)
            .map(wg => wg.toLowerCase()),
        );
        filteredLp = allLp.filter(p => {
          if (p.communityOrg !== project.githubOrg) return false;
          const name = p.committeeName?.toLowerCase() ?? '';
          return relevantWGs.has(name);
        });
      }
    }

    type OrgPositionGroup = {
      positionType: string;
      roleTitle: string;
      groupName?: string;
      teamCount: number;
      totalCount: number;
      members: Array<{
        id: string;
        name: string;
        githubUsername: string | null;
        avatarUrl?: string;
        groupName: string;
        votingRights: boolean;
      }>;
    };

    const orgMap = new Map<string, {
      org: string;
      orgName: string;
      positions: Map<string, OrgPositionGroup>;
    }>();

    const totalKey = (org: string, type: string, committee: string) => `${org}::${type}::${committee}`;
    const totalMap = new Map(totalLpCounts.map(r => [totalKey(r.communityOrg ?? 'unknown', r.positionType, r.committeeName ?? ''), r.count]));

    for (const pos of filteredLp) {
      const orgSlug = pos.communityOrg ?? 'unknown';
      if (!orgMap.has(orgSlug)) {
        const orgCfg = getOrgConfig(orgSlug);
        orgMap.set(orgSlug, {
          org: orgSlug,
          orgName: orgCfg?.name ?? orgSlug,
          positions: new Map(),
        });
      }
      const orgEntry = orgMap.get(orgSlug)!;

      const groupKey = `${pos.positionType}::${pos.committeeName ?? 'default'}`;
      if (!orgEntry.positions.has(groupKey)) {
        const roleTitle = pos.roleTitle
          || pos.positionType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        orgEntry.positions.set(groupKey, {
          positionType: pos.positionType,
          roleTitle,
          groupName: pos.committeeName || orgSlug,
          teamCount: 0,
          totalCount: totalMap.get(totalKey(orgSlug, pos.positionType, pos.committeeName ?? '')) ?? 0,
          members: [],
        });
      }

      const group = orgEntry.positions.get(groupKey)!;
      group.teamCount++;
      group.members.push({
        id: pos.teamMemberId!,
        name: pos.teamMemberName,
        githubUsername: pos.githubUsername,
        avatarUrl: pos.githubUsername
          ? `https://github.com/${pos.githubUsername}.png?size=80`
          : undefined,
        groupName: pos.committeeName || 'Unknown',
        votingRights: pos.votingRights ?? false,
      });
    }

    const relevantOrgs = new Set(orgMap.keys());
    if (githubOrg && !relevantOrgs.has(githubOrg)) relevantOrgs.add(githubOrg);
    for (const row of totalLpCounts) {
      const orgSlug = row.communityOrg ?? 'unknown';
      if (!relevantOrgs.has(orgSlug)) continue;
      if (!orgMap.has(orgSlug)) {
        const orgCfg = getOrgConfig(orgSlug);
        orgMap.set(orgSlug, {
          org: orgSlug,
          orgName: orgCfg?.name ?? orgSlug,
          positions: new Map(),
        });
      }
      const orgEntry = orgMap.get(orgSlug)!;
      const groupKey = `${row.positionType}::${row.committeeName ?? 'default'}`;
      if (!orgEntry.positions.has(groupKey)) {
        orgEntry.positions.set(groupKey, {
          positionType: row.positionType,
          roleTitle: row.positionType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          groupName: row.committeeName || orgSlug,
          teamCount: 0,
          totalCount: row.count,
          members: [],
        });
      }
    }

    const byOrg = Array.from(orgMap.values()).map(o => ({
      org: o.org,
      orgName: o.orgName,
      positions: Array.from(o.positions.values()),
    }));

    const isApproverType = (t: string) => t !== 'reviewer';
    const teamApprovers = maintainerStatuses.filter(s => isApproverType(s.positionType)).length;
    const teamReviewers = maintainerStatuses.filter(s => s.positionType === 'reviewer').length;
    const teamRootApprovers = maintainerStatuses.filter(s => isApproverType(s.positionType) && s.scope === 'root').length;
    const teamRootReviewers = maintainerStatuses.filter(s => s.positionType === 'reviewer' && s.scope === 'root').length;
    const teamComponentApprovers = maintainerStatuses.filter(s => isApproverType(s.positionType) && s.scope === 'component').length;
    const teamComponentReviewers = maintainerStatuses.filter(s => s.positionType === 'reviewer' && s.scope === 'component').length;

    const sumApproverTypes = (scopeFilter?: string) =>
      totalMsCounts.filter(r => isApproverType(r.positionType) && (scopeFilter == null || r.scope === scopeFilter)).reduce((s, r) => s + r.count, 0);
    const sumReviewerTypes = (scopeFilter?: string) =>
      totalMsCounts.filter(r => r.positionType === 'reviewer' && (scopeFilter == null || r.scope === scopeFilter)).reduce((s, r) => s + r.count, 0);

    const totalApprovers = sumApproverTypes();
    const totalReviewers = sumReviewerTypes();
    const rootApprovers = sumApproverTypes('root');
    const rootReviewers = sumReviewerTypes('root');
    const componentApprovers = sumApproverTypes('component');
    const componentReviewers = sumReviewerTypes('component');

    const memberMap = new Map<string, {
      id: string;
      name: string;
      githubUsername: string | null;
      avatarUrl?: string;
      roles: Array<{ projectId: string; projectName: string; roleType: string; roleLabel: string; scope: string; isActive: boolean }>;
      leadershipRoles: Array<{ positionType: string; groupName: string; roleTitle: string; votingRights: boolean }>;
    }>();

    const getMember = (id: string, name: string, ghUser: string | null) => {
      if (!memberMap.has(id)) {
        memberMap.set(id, {
          id, name, githubUsername: ghUser,
          avatarUrl: ghUser ? `https://github.com/${ghUser}.png?size=80` : undefined,
          roles: [], leadershipRoles: [],
        });
      }
      return memberMap.get(id)!;
    };

    for (const s of maintainerStatuses) {
      if (!s.teamMemberId) continue;
      getMember(s.teamMemberId, s.teamMemberName, s.githubUsername).roles.push({
        projectId: s.projectId!, projectName: s.projectName,
        roleType: s.positionType === 'reviewer' ? 'reviewer' : 'approver',
        roleLabel: s.positionTitle || (s.positionType === 'reviewer' ? 'Reviewer' : 'Approver'),
        scope: s.scope ?? 'root',
        isActive: s.isActive ?? true,
      });
    }

    for (const p of filteredLp) {
      if (!p.teamMemberId) continue;
      getMember(p.teamMemberId, p.teamMemberName, p.githubUsername).leadershipRoles.push({
        positionType: p.positionType,
        groupName: p.committeeName || 'Unknown',
        roleTitle: p.roleTitle || p.positionType,
        votingRights: p.votingRights ?? false,
      });
    }

    const govByType = new Map<string, { positionType: string; label: string; team: number; total: number; teamRoot: number; teamComponent: number }>();
    for (const s of maintainerStatuses) {
      if (!govByType.has(s.positionType)) {
        govByType.set(s.positionType, {
          positionType: s.positionType,
          label: s.positionTitle || s.positionType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          team: 0, total: 0, teamRoot: 0, teamComponent: 0,
        });
      }
      const g = govByType.get(s.positionType)!;
      g.team++;
      if (s.scope === 'root') g.teamRoot++;
      else if (s.scope === 'component') g.teamComponent++;
    }
    for (const r of totalMsCounts) {
      if (!govByType.has(r.positionType)) {
        govByType.set(r.positionType, {
          positionType: r.positionType,
          label: r.positionTitle || r.positionType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          team: 0, total: 0, teamRoot: 0, teamComponent: 0,
        });
      }
      govByType.get(r.positionType)!.total += r.count;
    }
    const governanceByType = Array.from(govByType.values()).filter(g => g.total > 0);

    return {
      byOrg,
      maintainers: {
        teamApprovers, teamReviewers, totalApprovers, totalReviewers,
        rootApprovers, rootReviewers, componentApprovers, componentReviewers,
        teamRootApprovers, teamRootReviewers, teamComponentApprovers, teamComponentReviewers,
        governanceByType,
      },
      teamLeaders: Array.from(memberMap.values()),
    };
  } catch (error) {
    logger.warn('Error fetching leadership data', { error });
    return {
      byOrg: [],
      maintainers: {
        teamApprovers: 0, teamReviewers: 0, totalApprovers: 0, totalReviewers: 0,
        rootApprovers: 0, rootReviewers: 0, componentApprovers: 0, componentReviewers: 0,
        teamRootApprovers: 0, teamRootReviewers: 0, teamComponentApprovers: 0, teamComponentReviewers: 0,
      },
      teamLeaders: [],
    };
  }
}
