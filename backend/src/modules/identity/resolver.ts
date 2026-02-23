import { db } from '../../shared/database/client.js';
import { teamMembers, identityMappings } from '../../shared/database/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';
import type { ResolvedIdentity, TeamMember } from '../../shared/types/index.js';

export class IdentityResolver {
  /**
   * Resolve a GitHub contributor to a team member
   */
  async resolveContributor(
    githubUsername: string,
    email?: string
  ): Promise<ResolvedIdentity> {
    logger.debug(`Resolving identity for ${githubUsername} (${email})`);

    // 1. DIRECT GitHub username match (primary method)
    const directMatch = await this.matchByGitHubUsername(githubUsername);
    if (directMatch) {
      return directMatch;
    }

    // If no direct match found, mark as unresolved
    await this.storeUnresolvedIdentity(githubUsername, email);

    return {
      teamMember: null,
      confidence: 0,
      source: 'unresolved',
    };
  }

  /**
   * Direct match by GitHub username (PRIMARY METHOD)
   */
  private async matchByGitHubUsername(
    githubUsername: string
  ): Promise<ResolvedIdentity | null> {
    try {
      const member = await db.query.teamMembers.findFirst({
        where: eq(teamMembers.githubUsername, githubUsername),
      });

      if (member) {
        logger.info(`Matched ${githubUsername} to ${member.name} via direct GitHub username`);
        return {
          teamMember: member,
          confidence: 1.0,
          source: 'github_username',
        };
      }

      return null;
    } catch (error) {
      logger.error('Error matching by GitHub username', { error, githubUsername });
      return null;
    }
  }

  /**
   * Check for explicit verified mappings
   */
  private async checkExplicitMapping(
    githubUsername: string
  ): Promise<ResolvedIdentity | null> {
    try {
      const mapping = await db.query.identityMappings.findFirst({
        where: and(
          eq(identityMappings.identityType, 'github'),
          eq(identityMappings.identityValue, githubUsername),
          eq(identityMappings.verified, true)
        ),
        with: {
          teamMember: true,
        },
      });

      if (mapping && mapping.teamMember) {
        logger.debug(`Found explicit mapping for ${githubUsername}`);
        return {
          teamMember: mapping.teamMember,
          confidence: 1.0,
          source: 'explicit_mapping',
        };
      }

      return null;
    } catch (error) {
      logger.error('Error checking explicit mapping', { error, githubUsername });
      return null;
    }
  }

  /**
   * Match by email domain (configurable via TEAM_EMAIL_DOMAIN)
   */
  private async matchByEmail(
    email: string,
    githubUsername: string
  ): Promise<ResolvedIdentity | null> {
    try {
      const domain = config.teamEmailDomain;
      if (!domain || !email.endsWith(`@${domain}`)) {
        return null;
      }

      const member = await db.query.teamMembers.findFirst({
        where: eq(teamMembers.primaryEmail, email),
      });

      if (member) {
        logger.info(`Matched ${githubUsername} to ${member.name} via email domain`);

        // Auto-create mapping for future lookups
        await this.createMapping(member.id, 'github', githubUsername, 0.95, true);

        return {
          teamMember: member,
          confidence: 0.95,
          source: 'email_domain',
        };
      }

      return null;
    } catch (error) {
      logger.error('Error matching by email', { error, email });
      return null;
    }
  }

  /**
   * Fuzzy match by name extracted from email
   */
  private async fuzzyMatchByName(
    email: string,
    githubUsername: string
  ): Promise<ResolvedIdentity | null> {
    try {
      const nameFromEmail = email.split('@')[0];
      const candidates = await this.fuzzyMatchCandidates(nameFromEmail);

      if (candidates.length === 1) {
        logger.info(`Fuzzy matched ${githubUsername} to ${candidates[0].name} (requires verification)`);

        return {
          teamMember: candidates[0],
          confidence: 0.6,
          source: 'fuzzy_match',
          requiresVerification: true,
        };
      }

      if (candidates.length > 1) {
        logger.warn(`Multiple fuzzy matches for ${githubUsername}`, {
          candidates: candidates.map(c => c.name),
        });
      }

      return null;
    } catch (error) {
      logger.error('Error in fuzzy matching', { error, email });
      return null;
    }
  }

  /**
   * Find fuzzy match candidates using PostgreSQL similarity
   */
  private async fuzzyMatchCandidates(name: string): Promise<TeamMember[]> {
    try {
      // Normalize name: lowercase, replace separators with spaces
      const normalized = name.toLowerCase().replace(/[._-]/g, ' ');

      // Use PostgreSQL similarity function (requires pg_trgm extension)
      // Note: This requires `CREATE EXTENSION IF NOT EXISTS pg_trgm;` in database
      const candidates = await db
        .select()
        .from(teamMembers)
        .where(
          sql`similarity(lower(${teamMembers.name}), ${normalized}) > 0.7`
        )
        .limit(5);

      return candidates;
    } catch (error) {
      // Fallback to simple LIKE matching if pg_trgm is not available
      logger.warn('Similarity search failed, falling back to LIKE', { error });

      const pattern = `%${name}%`;
      return db
        .select()
        .from(teamMembers)
        .where(sql`lower(${teamMembers.name}) LIKE lower(${pattern})`)
        .limit(5);
    }
  }

  /**
   * Create an identity mapping
   */
  async createMapping(
    teamMemberId: string,
    identityType: string,
    identityValue: string,
    confidence: number,
    verified: boolean = false
  ): Promise<void> {
    try {
      await db.insert(identityMappings).values({
        teamMemberId,
        identityType,
        identityValue,
        confidenceScore: confidence.toFixed(2),
        verified,
        verifiedAt: verified ? new Date() : undefined,
      });

      logger.info(`Created identity mapping: ${identityType}:${identityValue} -> team member ${teamMemberId}`);
    } catch (error) {
      // Ignore duplicate key errors (mapping already exists)
      if ((error as any).code === '23505') {
        logger.debug(`Identity mapping already exists: ${identityType}:${identityValue}`);
        return;
      }

      logger.error('Error creating identity mapping', { error });
    }
  }

  /**
   * Store unresolved identity for manual review
   */
  private async storeUnresolvedIdentity(
    githubUsername: string,
    email?: string
  ): Promise<void> {
    logger.warn(`Unresolved identity: ${githubUsername} (${email || 'no email'})`);

    // TODO: Store in a separate unresolved_identities table for dashboard review
    // For now, just log it
  }

  /**
   * Bulk resolve contributors
   */
  async bulkResolve(
    contributors: Array<{ username: string; email?: string }>
  ): Promise<Map<string, ResolvedIdentity>> {
    const results = new Map<string, ResolvedIdentity>();

    for (const contributor of contributors) {
      const resolved = await this.resolveContributor(
        contributor.username,
        contributor.email
      );
      results.set(contributor.username, resolved);
    }

    // Log summary
    const resolved = Array.from(results.values()).filter(r => r.teamMember !== null).length;
    const total = contributors.length;
    const percentage = total > 0 ? ((resolved / total) * 100).toFixed(1) : '0';

    logger.info(`Bulk resolution complete: ${resolved}/${total} (${percentage}%) resolved`);

    return results;
  }

  /**
   * Get unresolved identities count
   */
  async getUnresolvedCount(): Promise<number> {
    // TODO: Query unresolved_identities table
    return 0;
  }

  /**
   * Manually verify an identity mapping
   */
  async verifyMapping(
    identityType: string,
    identityValue: string,
    teamMemberId: string,
    verifiedBy: string
  ): Promise<void> {
    try {
      await db
        .update(identityMappings)
        .set({
          teamMemberId,
          verified: true,
          verifiedAt: new Date(),
          verifiedBy,
          confidenceScore: '1.0',
        })
        .where(
          and(
            eq(identityMappings.identityType, identityType),
            eq(identityMappings.identityValue, identityValue)
          )
        );

      logger.info(`Verified identity mapping: ${identityType}:${identityValue} by ${verifiedBy}`);
    } catch (error) {
      logger.error('Error verifying identity mapping', { error });
      throw error;
    }
  }
}
