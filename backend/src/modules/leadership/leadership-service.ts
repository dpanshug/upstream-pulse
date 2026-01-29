/**
 * LeadershipService
 * 
 * Provides leadership and governance data for the dashboard.
 * Queries maintainerStatus and leadershipPositions tables.
 */

import { db } from '../../shared/database/client.js';
import { maintainerStatus, leadershipPositions, teamMembers, projects } from '../../shared/database/schema.js';
import { eq, and, isNotNull, sql } from 'drizzle-orm';
import { logger } from '../../shared/utils/logger.js';

export interface LeadershipMember {
  id: string;
  name: string;
  githubUsername: string | null;
  avatarUrl?: string;
  roles: LeadershipRoleInfo[];
}

export interface LeadershipRoleInfo {
  projectId: string;
  projectName: string;
  roleType: string;
  roleTitle: string | null;
  isActive: boolean;
  source: string | null;
}

export interface LeadershipSummary {
  totalApprovers: number;
  totalReviewers: number;
  totalEmeritus: number;
  teamApprovers: number;
  teamReviewers: number;
  teamEmeritus: number;
  byProject: ProjectLeadershipSummary[];
}

export interface ProjectLeadershipSummary {
  projectId: string;
  projectName: string;
  githubOrg: string;
  githubRepo: string;
  approvers: number;
  reviewers: number;
  teamApprovers: number;
  teamReviewers: number;
}

export class LeadershipService {

  /**
   * Get leadership summary across all projects
   */
  async getLeadershipSummary(): Promise<LeadershipSummary> {
    logger.info('Building leadership summary');

    // Get all maintainer statuses grouped by type
    const allRoles = await db
      .select({
        positionType: maintainerStatus.positionType,
        isTeamMember: sql<boolean>`${maintainerStatus.teamMemberId} IS NOT NULL`,
        count: sql<number>`count(*)::int`,
      })
      .from(maintainerStatus)
      .where(eq(maintainerStatus.isActive, true))
      .groupBy(maintainerStatus.positionType, sql`${maintainerStatus.teamMemberId} IS NOT NULL`);

    // Calculate totals
    let totalApprovers = 0, totalReviewers = 0, totalEmeritus = 0;
    let teamApprovers = 0, teamReviewers = 0, teamEmeritus = 0;

    for (const role of allRoles) {
      const count = Number(role.count);
      if (role.positionType === 'approver') {
        totalApprovers += count;
        if (role.isTeamMember) teamApprovers = count;
      } else if (role.positionType === 'reviewer') {
        totalReviewers += count;
        if (role.isTeamMember) teamReviewers = count;
      } else if (role.positionType === 'emeritus') {
        totalEmeritus += count;
        if (role.isTeamMember) teamEmeritus = count;
      }
    }

    // Get per-project breakdown
    const projectBreakdown = await db
      .select({
        projectId: maintainerStatus.projectId,
        projectName: projects.name,
        githubOrg: projects.githubOrg,
        githubRepo: projects.githubRepo,
        positionType: maintainerStatus.positionType,
        isTeamMember: sql<boolean>`${maintainerStatus.teamMemberId} IS NOT NULL`,
        count: sql<number>`count(*)::int`,
      })
      .from(maintainerStatus)
      .innerJoin(projects, eq(maintainerStatus.projectId, projects.id))
      .where(eq(maintainerStatus.isActive, true))
      .groupBy(
        maintainerStatus.projectId,
        projects.name,
        projects.githubOrg,
        projects.githubRepo,
        maintainerStatus.positionType,
        sql`${maintainerStatus.teamMemberId} IS NOT NULL`
      );

    // Aggregate by project
    const projectMap = new Map<string, ProjectLeadershipSummary>();
    
    for (const row of projectBreakdown) {
      if (!row.projectId) continue;
      
      if (!projectMap.has(row.projectId)) {
        projectMap.set(row.projectId, {
          projectId: row.projectId,
          projectName: row.projectName,
          githubOrg: row.githubOrg,
          githubRepo: row.githubRepo,
          approvers: 0,
          reviewers: 0,
          teamApprovers: 0,
          teamReviewers: 0,
        });
      }
      
      const proj = projectMap.get(row.projectId)!;
      const count = Number(row.count);
      
      if (row.positionType === 'approver') {
        proj.approvers += count;
        if (row.isTeamMember) proj.teamApprovers += count;
      } else if (row.positionType === 'reviewer') {
        proj.reviewers += count;
        if (row.isTeamMember) proj.teamReviewers += count;
      }
    }

    return {
      totalApprovers,
      totalReviewers,
      totalEmeritus,
      teamApprovers,
      teamReviewers,
      teamEmeritus,
      byProject: Array.from(projectMap.values()),
    };
  }

  /**
   * Get team members with leadership roles
   */
  async getTeamLeadership(): Promise<LeadershipMember[]> {
    logger.info('Fetching team leadership roles');

    // Get all maintainer statuses for team members
    const roles = await db
      .select({
        teamMemberId: maintainerStatus.teamMemberId,
        memberName: teamMembers.name,
        githubUsername: teamMembers.githubUsername,
        projectId: maintainerStatus.projectId,
        projectName: projects.name,
        positionType: maintainerStatus.positionType,
        positionTitle: maintainerStatus.positionTitle,
        isActive: maintainerStatus.isActive,
        source: maintainerStatus.source,
      })
      .from(maintainerStatus)
      .innerJoin(teamMembers, eq(maintainerStatus.teamMemberId, teamMembers.id))
      .innerJoin(projects, eq(maintainerStatus.projectId, projects.id))
      .where(isNotNull(maintainerStatus.teamMemberId));

    // Group by team member
    const memberMap = new Map<string, LeadershipMember>();

    for (const role of roles) {
      if (!role.teamMemberId) continue;

      if (!memberMap.has(role.teamMemberId)) {
        memberMap.set(role.teamMemberId, {
          id: role.teamMemberId,
          name: role.memberName,
          githubUsername: role.githubUsername,
          avatarUrl: role.githubUsername
            ? `https://github.com/${role.githubUsername}.png?size=80`
            : undefined,
          roles: [],
        });
      }

      memberMap.get(role.teamMemberId)!.roles.push({
        projectId: role.projectId!,
        projectName: role.projectName,
        roleType: role.positionType,
        roleTitle: role.positionTitle,
        isActive: role.isActive ?? true,
        source: role.source,
      });
    }

    // Sort by number of roles (most roles first)
    return Array.from(memberMap.values())
      .sort((a, b) => b.roles.length - a.roles.length);
  }

  /**
   * Get leadership roles for a specific project
   */
  async getProjectLeadership(projectId: string): Promise<{
    approvers: Array<{ name: string; githubUsername: string | null; isTeamMember: boolean }>;
    reviewers: Array<{ name: string; githubUsername: string | null; isTeamMember: boolean }>;
  }> {
    const roles = await db
      .select({
        positionType: maintainerStatus.positionType,
        teamMemberId: maintainerStatus.teamMemberId,
        memberName: teamMembers.name,
        memberGithub: teamMembers.githubUsername,
        evidenceUrl: maintainerStatus.evidenceUrl,
      })
      .from(maintainerStatus)
      .leftJoin(teamMembers, eq(maintainerStatus.teamMemberId, teamMembers.id))
      .where(
        and(
          eq(maintainerStatus.projectId, projectId),
          eq(maintainerStatus.isActive, true)
        )
      );

    const approvers: Array<{ name: string; githubUsername: string | null; isTeamMember: boolean }> = [];
    const reviewers: Array<{ name: string; githubUsername: string | null; isTeamMember: boolean }> = [];

    for (const role of roles) {
      // Extract GitHub username from evidenceUrl if no team member match
      const githubUsername = role.memberGithub || 
        (role.evidenceUrl?.startsWith('github:') ? role.evidenceUrl.replace('github:', '') : null);
      
      const entry = {
        name: role.memberName || githubUsername || 'Unknown',
        githubUsername,
        isTeamMember: role.teamMemberId !== null,
      };

      if (role.positionType === 'approver') {
        approvers.push(entry);
      } else if (role.positionType === 'reviewer') {
        reviewers.push(entry);
      }
    }

    return { approvers, reviewers };
  }
}

// Export singleton
export const leadershipService = new LeadershipService();
