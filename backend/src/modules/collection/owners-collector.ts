/**
 * OWNERS File Collector
 * 
 * Parses OWNERS files from Kubernetes/Kubeflow-style repositories
 * to extract leadership information (approvers, reviewers, emeritus).
 * 
 * GOVERNANCE MODEL NOTE:
 * This collector currently supports the Kubernetes/Kubeflow OWNERS file format.
 * Other open source projects may use different governance models:
 * - Apache projects: MAINTAINERS file, PMC membership
 * - Linux Foundation: MAINTAINERS, CODEOWNERS
 * - GitHub-native: CODEOWNERS, team permissions
 * 
 * Future extensibility:
 * - Add GovernanceParser interface for different formats
 * - Implement ApacheMaintainersParser, CodeownersParser, etc.
 * - Auto-detect governance model based on repo files
 */

import { Octokit } from '@octokit/rest';
import yaml from 'js-yaml';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { db } from '../../shared/database/client.js';
import { maintainerStatus, teamMembers, projects } from '../../shared/database/schema.js';
import { eq, and } from 'drizzle-orm';
import type { Repository } from '../../shared/types/index.js';

// OWNERS file structure (Kubernetes/Kubeflow style)
interface OwnersFile {
  approvers?: string[];
  reviewers?: string[];
  emeritus_approvers?: string[];
  labels?: string[];
  options?: {
    no_parent_owners?: boolean;
  };
}

// Parsed leadership role
export interface LeadershipRole {
  githubUsername: string;
  roleType: 'approver' | 'reviewer' | 'emeritus_approver';
  source: string; // e.g., 'OWNERS', 'OWNERS_ALIASES'
  filePath: string;
}

export class OwnersCollector {
  private octokit: Octokit;

  constructor(token?: string) {
    this.octokit = new Octokit({
      auth: token || config.githubToken,
    });
  }

  /**
   * Collect and sync OWNERS data for a repository
   */
  async collectOwnersForRepo(repo: Repository): Promise<LeadershipRole[]> {
    const repoPath = `${repo.githubOrg}/${repo.githubRepo}`;
    logger.info(`Collecting OWNERS for ${repoPath}`);

    const roles: LeadershipRole[] = [];

    try {
      // Fetch root OWNERS file
      const rootOwners = await this.fetchOwnersFile(repo.githubOrg, repo.githubRepo, 'OWNERS');
      if (rootOwners) {
        const parsed = this.parseOwnersFile(rootOwners, 'OWNERS');
        roles.push(...parsed);
        logger.info(`Found ${parsed.length} roles in root OWNERS file`);
      }

      // Could also check for OWNERS files in subdirectories if needed
      // For now, just root OWNERS is sufficient for most projects

      return roles;

    } catch (error) {
      logger.error(`Error collecting OWNERS for ${repoPath}`, { error });
      return roles;
    }
  }

  /**
   * Fetch OWNERS file content from GitHub
   */
  private async fetchOwnersFile(
    org: string,
    repo: string,
    path: string
  ): Promise<string | null> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: org,
        repo: repo,
        path: path,
      });

      if ('content' in data && data.encoding === 'base64') {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }

      return null;
    } catch (error: any) {
      if (error.status === 404) {
        logger.debug(`No ${path} file found in ${org}/${repo}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Parse OWNERS file YAML content
   */
  private parseOwnersFile(content: string, filePath: string): LeadershipRole[] {
    const roles: LeadershipRole[] = [];

    try {
      const owners = yaml.load(content) as OwnersFile;

      if (!owners) return roles;

      // Parse approvers
      if (owners.approvers) {
        for (const username of owners.approvers) {
          // Skip comments (lines starting with #) that might be in the array
          if (username.startsWith('#')) continue;
          
          roles.push({
            githubUsername: username.replace(/\s*#.*$/, '').trim(), // Remove inline comments
            roleType: 'approver',
            source: 'OWNERS',
            filePath,
          });
        }
      }

      // Parse reviewers
      if (owners.reviewers) {
        for (const username of owners.reviewers) {
          if (username.startsWith('#')) continue;
          
          roles.push({
            githubUsername: username.replace(/\s*#.*$/, '').trim(),
            roleType: 'reviewer',
            source: 'OWNERS',
            filePath,
          });
        }
      }

      // Parse emeritus approvers
      if (owners.emeritus_approvers) {
        for (const username of owners.emeritus_approvers) {
          if (username.startsWith('#')) continue;
          
          roles.push({
            githubUsername: username.replace(/\s*#.*$/, '').trim(),
            roleType: 'emeritus_approver',
            source: 'OWNERS',
            filePath,
          });
        }
      }

      return roles;

    } catch (error) {
      logger.error(`Error parsing OWNERS file: ${filePath}`, { error });
      return roles;
    }
  }

  /**
   * Sync collected OWNERS data to database
   */
  async syncToDatabase(
    projectId: string,
    roles: LeadershipRole[]
  ): Promise<{ synced: number; matched: number }> {
    let synced = 0;
    let matched = 0;

    for (const role of roles) {
      try {
        // Try to find matching team member by GitHub username
        const member = await db
          .select()
          .from(teamMembers)
          .where(eq(teamMembers.githubUsername, role.githubUsername))
          .limit(1);

        const teamMemberId = member.length > 0 ? member[0].id : null;
        if (teamMemberId) matched++;

        // Map role type to position type
        const positionType = role.roleType === 'approver' ? 'approver' :
                            role.roleType === 'reviewer' ? 'reviewer' :
                            'emeritus';

        // Check if this role already exists
        const existing = await db
          .select()
          .from(maintainerStatus)
          .where(
            and(
              eq(maintainerStatus.projectId, projectId),
              eq(maintainerStatus.positionType, positionType),
              // Match by evidence URL (GitHub username in source)
              eq(maintainerStatus.evidenceUrl, `github:${role.githubUsername}`)
            )
          )
          .limit(1);

        if (existing.length === 0) {
          // Insert new role
          await db.insert(maintainerStatus).values({
            projectId,
            teamMemberId,
            positionType,
            positionTitle: role.roleType.replace('_', ' '),
            isActive: role.roleType !== 'emeritus_approver',
            source: role.source,
            evidenceUrl: `github:${role.githubUsername}`,
            notes: `Auto-discovered from ${role.filePath}`,
          });
          synced++;
        } else if (teamMemberId && !existing[0].teamMemberId) {
          // Update existing role with team member ID if we found a match
          await db
            .update(maintainerStatus)
            .set({ teamMemberId, updatedAt: new Date() })
            .where(eq(maintainerStatus.id, existing[0].id));
          synced++;
        }

      } catch (error) {
        logger.error(`Error syncing role for ${role.githubUsername}`, { error });
      }
    }

    logger.info(`Synced ${synced} roles, ${matched} matched to team members`);
    return { synced, matched };
  }

  /**
   * Collect OWNERS for all tracked projects
   */
  async collectAllProjects(): Promise<void> {
    const trackedProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.trackingEnabled, true));

    logger.info(`Collecting OWNERS for ${trackedProjects.length} projects`);

    for (const project of trackedProjects) {
      try {
        const roles = await this.collectOwnersForRepo({
          id: project.id,
          name: project.name,
          githubOrg: project.githubOrg,
          githubRepo: project.githubRepo,
        });

        if (roles.length > 0) {
          await this.syncToDatabase(project.id, roles);
        }

      } catch (error) {
        logger.error(`Error processing project ${project.name}`, { error });
      }
    }
  }
}

// Export singleton instance
export const ownersCollector = new OwnersCollector();
