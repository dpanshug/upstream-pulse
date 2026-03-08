import { Octokit } from '@octokit/rest';
import * as yaml from 'js-yaml';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';
import type { Repository } from '../../shared/types/index.js';

export interface OwnersEntry {
  username: string;
  role: 'approver' | 'reviewer';
  path: string; // Directory path where OWNERS file was found
  source: string; // Full path to the OWNERS file
}

interface OwnersFileContent {
  approvers?: string[];
  reviewers?: string[];
  labels?: string[];
  options?: Record<string, unknown>;
}

interface OwnersAliases {
  aliases?: Record<string, string[]>;
}

interface ContributionRecord {
  type: 'commit' | 'pr' | 'review' | 'issue';
  githubId: string;
  author?: string;
  email?: string;
  date: Date;
  isMerged?: boolean;
  linesAdded?: number;
  linesDeleted?: number;
  filesChanged?: number;
  metadata?: Record<string, any>;
}

export class GitHubCollector {
  private octokit: Octokit;
  private rateLimitRemaining: number = 5000;
  private rateLimitReset: Date | null = null;

  constructor(token?: string) {
    this.octokit = new Octokit({
      auth: token || config.githubToken,
      log: {
        debug: (msg: string) => logger.debug(msg),
        info: (msg: string) => logger.info(msg),
        warn: (msg: string) => logger.warn(msg),
        error: (msg: string) => logger.error(msg),
      },
    });
  }

  /**
   * Collect all contributions for a repository since a given date
   */
  async collectRepositoryContributions(
    repo: Repository,
    since: Date,
    onProgress?: (detail: { phase: string; collected: number }) => void,
  ): Promise<ContributionRecord[]> {
    logger.info(`Collecting contributions for ${repo.githubOrg}/${repo.githubRepo} since ${since.toISOString()}`);

    const contributions: ContributionRecord[] = [];
    const signal = (phase: string) => onProgress?.({ phase, collected: contributions.length });

    try {
      await this.checkRateLimit();

      signal('commits');
      const commits = await this.collectCommits(repo, since);
      contributions.push(...commits);
      logger.info(`Collected ${commits.length} commits`);

      signal('pull_requests');
      const prs = await this.collectPullRequests(repo, since);
      contributions.push(...prs);
      logger.info(`Collected ${prs.length} PRs`);

      signal('reviews');
      const reviews = await this.collectReviews(repo, since, onProgress);
      contributions.push(...reviews);
      logger.info(`Collected ${reviews.length} reviews`);

      signal('issues');
      const issues = await this.collectIssues(repo, since);
      contributions.push(...issues);
      logger.info(`Collected ${issues.length} issues`);

      signal('done');
      logger.info(`Total contributions collected: ${contributions.length}`);
      return contributions;

    } catch (error) {
      logger.error('Error collecting contributions', { error, repo });
      throw error;
    }
  }

  /**
   * Collect commits since a given date
   */
  private async collectCommits(
    repo: Repository,
    since: Date
  ): Promise<ContributionRecord[]> {
    const contributions: ContributionRecord[] = [];

    try {
      const commits = await this.octokit.paginate(
        this.octokit.rest.repos.listCommits,
        {
          owner: repo.githubOrg,
          repo: repo.githubRepo,
          since: since.toISOString(),
          per_page: 100,
        }
      );

      for (const commit of commits) {
        // Skip merge commits (they don't represent actual work)
        if (commit.parents && commit.parents.length > 1) {
          continue;
        }

        contributions.push({
          type: 'commit',
          githubId: commit.sha,
          author: commit.author?.login,
          email: commit.commit.author?.email,
          date: new Date(commit.commit.author?.date || Date.now()),
          linesAdded: commit.stats?.additions,
          linesDeleted: commit.stats?.deletions,
          filesChanged: commit.files?.length,
          metadata: {
            author: commit.author?.login,
            message: commit.commit.message,
            url: commit.html_url,
          },
        });
      }

      return contributions;

    } catch (error) {
      logger.error('Error collecting commits', { error, repo });
      return contributions;
    }
  }

  /**
   * Collect pull requests since a given date
   */
  private async collectPullRequests(
    repo: Repository,
    since: Date
  ): Promise<ContributionRecord[]> {
    const contributions: ContributionRecord[] = [];

    try {
      const pulls = await this.octokit.paginate(
        this.octokit.rest.pulls.list,
        {
          owner: repo.githubOrg,
          repo: repo.githubRepo,
          state: 'all',
          sort: 'created',
          direction: 'desc',
          per_page: 100,
        }
      );

      // Filter PRs created since 'since' date
      const recentPulls = pulls.filter(pr =>
        new Date(pr.created_at) >= since
      );

      for (const pr of recentPulls) {
        if (!pr.user) continue;

        contributions.push({
          type: 'pr',
          githubId: String(pr.number),
          author: pr.user.login,
          date: new Date(pr.created_at),
          isMerged: pr.merged_at !== null,
          linesAdded: (pr as any).additions,
          linesDeleted: (pr as any).deletions,
          filesChanged: (pr as any).changed_files,
          metadata: {
            author: pr.user.login,
            title: pr.title,
            state: pr.state,
            mergedAt: pr.merged_at,
            url: pr.html_url,
          },
        });
      }

      return contributions;

    } catch (error) {
      logger.error('Error collecting pull requests', { error, repo });
      return contributions;
    }
  }

  /**
   * Collect PR reviews since a given date
   */
  private async collectReviews(
    repo: Repository,
    since: Date,
    onProgress?: (detail: { phase: string; collected: number }) => void,
  ): Promise<ContributionRecord[]> {
    const contributions: ContributionRecord[] = [];

    try {
      const pulls = await this.octokit.paginate(
        this.octokit.rest.pulls.list,
        {
          owner: repo.githubOrg,
          repo: repo.githubRepo,
          state: 'all',
          sort: 'updated',
          direction: 'desc',
          per_page: 50,
        }
      );

      const recentPulls = pulls.filter(pr =>
        new Date(pr.updated_at) >= since
      );

      let processed = 0;
      for (const pr of recentPulls) {
        if (++processed % 50 === 0) {
          onProgress?.({ phase: `reviews (${processed}/${recentPulls.length} PRs)`, collected: contributions.length });
        }
        try {
          const reviews = await this.octokit.rest.pulls.listReviews({
            owner: repo.githubOrg,
            repo: repo.githubRepo,
            pull_number: pr.number,
          });

          for (const review of reviews.data) {
            if (!review.user || !review.submitted_at) continue;

            const reviewDate = new Date(review.submitted_at);
            if (reviewDate >= since) {
              contributions.push({
                type: 'review',
                githubId: String(review.id),
                author: review.user.login,
                date: reviewDate,
                metadata: {
                  author: review.user.login,
                  prNumber: pr.number,
                  prTitle: pr.title,
                  state: review.state,
                  body: review.body,
                  url: review.html_url,
                },
              });
            }
          }
        } catch (error) {
          logger.warn(`Error collecting reviews for PR #${pr.number}`, { error });
          continue;
        }
      }

      return contributions;

    } catch (error) {
      logger.error('Error collecting reviews', { error, repo });
      return contributions;
    }
  }

  /**
   * Collect issues since a given date
   */
  private async collectIssues(
    repo: Repository,
    since: Date
  ): Promise<ContributionRecord[]> {
    const contributions: ContributionRecord[] = [];

    try {
      const issues = await this.octokit.paginate(
        this.octokit.rest.issues.listForRepo,
        {
          owner: repo.githubOrg,
          repo: repo.githubRepo,
          state: 'all',
          sort: 'updated',
          direction: 'desc',
          since: since.toISOString(),
          per_page: 100,
        }
      );

      for (const issue of issues) {
        // Skip PRs (GitHub API returns PRs as issues)
        if (issue.pull_request) continue;
        if (!issue.user) continue;

        const issueDate = new Date(issue.created_at);
        if (issueDate >= since) {
          contributions.push({
            type: 'issue',
            githubId: String(issue.number),
            author: issue.user.login,
            date: issueDate,
            metadata: {
              author: issue.user.login,
              title: issue.title,
              state: issue.state,
              labels: issue.labels.map(l => typeof l === 'string' ? l : l.name),
              url: issue.html_url,
            },
          });
        }
      }

      return contributions;

    } catch (error) {
      logger.error('Error collecting issues', { error, repo });
      return contributions;
    }
  }

  /**
   * Get maintainer status for a user
   */
  async getMaintainerStatus(
    username: string,
    org: string,
    repo: string
  ): Promise<{
    hasWriteAccess: boolean;
    permission: string;
  }> {
    try {
      const { data } = await this.octokit.rest.repos.getCollaboratorPermissionLevel({
        owner: org,
        repo: repo,
        username: username,
      });

      return {
        hasWriteAccess: ['write', 'admin', 'maintain'].includes(data.permission),
        permission: data.permission,
      };

    } catch (error) {
      logger.warn(`Could not get maintainer status for ${username}`, { error });
      return {
        hasWriteAccess: false,
        permission: 'none'
      };
    }
  }

  /**
   * Get repository collaborators (maintainers)
   */
  async getRepositoryMaintainers(
    org: string,
    repo: string
  ): Promise<Array<{ username: string; permission: string }>> {
    try {
      const collaborators = await this.octokit.paginate(
        this.octokit.rest.repos.listCollaborators,
        {
          owner: org,
          repo: repo,
          per_page: 100,
        }
      );

      return collaborators
        .filter(collab => ['write', 'admin', 'maintain'].includes(collab.permissions?.admin ? 'admin' :
                         collab.permissions?.maintain ? 'maintain' :
                         collab.permissions?.push ? 'write' : 'none'))
        .map(collab => ({
          username: collab.login,
          permission: collab.permissions?.admin ? 'admin' :
                     collab.permissions?.maintain ? 'maintain' :
                     collab.permissions?.push ? 'write' : 'none',
        }));

    } catch (error) {
      logger.error('Error fetching repository maintainers', { error, org, repo });
      return [];
    }
  }

  /**
   * Check and log current rate limit status
   */
  private async checkRateLimit(): Promise<void> {
    try {
      const { data } = await this.octokit.rest.rateLimit.get();

      this.rateLimitRemaining = data.rate.remaining;
      this.rateLimitReset = new Date(data.rate.reset * 1000);

      logger.info('GitHub API rate limit', {
        remaining: this.rateLimitRemaining,
        limit: data.rate.limit,
        reset: this.rateLimitReset,
      });

      // Warn if running low on rate limit
      if (this.rateLimitRemaining < 100) {
        logger.warn('GitHub API rate limit running low!', {
          remaining: this.rateLimitRemaining,
          resetAt: this.rateLimitReset,
        });
      }

    } catch (error) {
      logger.error('Error checking rate limit', { error });
    }
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus() {
    return {
      remaining: this.rateLimitRemaining,
      reset: this.rateLimitReset,
    };
  }

  /**
   * Collect all OWNERS file entries from a repository
   * Handles multiple OWNERS files in different directories and OWNERS_ALIASES
   */
  async collectOwnersFiles(
    org: string,
    repo: string
  ): Promise<OwnersEntry[]> {
    const entries: OwnersEntry[] = [];

    try {
      // First, try to fetch OWNERS_ALIASES if it exists
      const aliases = await this.fetchOwnersAliases(org, repo);

      // Find all OWNERS files in the repository
      const ownersFiles = await this.findOwnersFiles(org, repo);

      logger.info(`Found ${ownersFiles.length} OWNERS files in ${org}/${repo}`);

      // Parse each OWNERS file
      for (const filePath of ownersFiles) {
        try {
          const fileEntries = await this.parseOwnersFile(org, repo, filePath, aliases);
          entries.push(...fileEntries);
        } catch (error) {
          logger.warn(`Failed to parse OWNERS file at ${filePath}`, { error });
          continue;
        }
      }

      logger.info(`Collected ${entries.length} owner entries from ${org}/${repo}`);
      return entries;

    } catch (error) {
      logger.error('Error collecting OWNERS files', { error, org, repo });
      return entries;
    }
  }

  /**
   * Fetch and parse OWNERS_ALIASES file if it exists
   */
  private async fetchOwnersAliases(
    org: string,
    repo: string
  ): Promise<Record<string, string[]>> {
    const aliases: Record<string, string[]> = {};

    try {
      // Try common locations for OWNERS_ALIASES
      const possiblePaths = ['OWNERS_ALIASES', '.github/OWNERS_ALIASES'];

      for (const path of possiblePaths) {
        try {
          const { data } = await this.octokit.rest.repos.getContent({
            owner: org,
            repo: repo,
            path: path,
          });

          if ('content' in data && data.content) {
            const content = Buffer.from(data.content, 'base64').toString('utf-8');
            const parsed = yaml.load(content) as OwnersAliases;

            if (parsed?.aliases) {
              Object.assign(aliases, parsed.aliases);
              logger.info(`Loaded ${Object.keys(parsed.aliases).length} aliases from ${path}`);
            }
            break; // Found aliases, no need to check other paths
          }
        } catch {
          // File doesn't exist at this path, try next
          continue;
        }
      }

    } catch (error) {
      logger.debug('No OWNERS_ALIASES file found (this is normal for many repos)', { org, repo });
    }

    return aliases;
  }

  /**
   * Find all OWNERS files in a repository using Git tree API
   */
  private async findOwnersFiles(
    org: string,
    repo: string
  ): Promise<string[]> {
    const ownersFiles: string[] = [];

    try {
      // Get the default branch
      const { data: repoData } = await this.octokit.rest.repos.get({
        owner: org,
        repo: repo,
      });

      const defaultBranch = repoData.default_branch;

      // Get the full tree recursively
      const { data: tree } = await this.octokit.rest.git.getTree({
        owner: org,
        repo: repo,
        tree_sha: defaultBranch,
        recursive: 'true',
      });

      // Filter for OWNERS files
      for (const item of tree.tree) {
        if (item.type === 'blob' && item.path && item.path.endsWith('OWNERS')) {
          // Only include files named exactly "OWNERS" (not OWNERS_ALIASES, etc.)
          const fileName = item.path.split('/').pop();
          if (fileName === 'OWNERS') {
            ownersFiles.push(item.path);
          }
        }
      }

    } catch (error) {
      logger.error('Error finding OWNERS files', { error, org, repo });
    }

    return ownersFiles;
  }

  /**
   * Parse a single OWNERS file and return owner entries
   */
  private async parseOwnersFile(
    org: string,
    repo: string,
    filePath: string,
    aliases: Record<string, string[]>
  ): Promise<OwnersEntry[]> {
    const entries: OwnersEntry[] = [];

    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: org,
        repo: repo,
        path: filePath,
      });

      if (!('content' in data) || !data.content) {
        return entries;
      }

      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      const parsed = yaml.load(content) as OwnersFileContent;

      // Get the directory path (where this OWNERS file applies)
      const directoryPath = filePath.replace(/\/?OWNERS$/, '') || '/';

      // Process approvers
      if (parsed?.approvers) {
        for (const approver of parsed.approvers) {
          const resolvedUsers = this.resolveAlias(approver, aliases);
          for (const username of resolvedUsers) {
            entries.push({
              username: username.toLowerCase(),
              role: 'approver',
              path: directoryPath,
              source: `https://github.com/${org}/${repo}/blob/main/${filePath}`,
            });
          }
        }
      }

      // Process reviewers
      if (parsed?.reviewers) {
        for (const reviewer of parsed.reviewers) {
          const resolvedUsers = this.resolveAlias(reviewer, aliases);
          for (const username of resolvedUsers) {
            entries.push({
              username: username.toLowerCase(),
              role: 'reviewer',
              path: directoryPath,
              source: `https://github.com/${org}/${repo}/blob/main/${filePath}`,
            });
          }
        }
      }

    } catch (error) {
      logger.warn(`Error parsing OWNERS file at ${filePath}`, { error });
    }

    return entries;
  }

  /**
   * Resolve an alias to a list of usernames
   * If the value is not an alias, returns it as-is
   */
  private resolveAlias(
    value: string,
    aliases: Record<string, string[]>
  ): string[] {
    // Check if this is an alias reference
    if (aliases[value]) {
      return aliases[value];
    }

    // Not an alias, return as single username
    return [value];
  }

  /**
   * Get aggregated maintainer info from OWNERS files
   * Returns unique usernames with their highest role and all paths
   */
  async getOwnersAsMaintainers(
    org: string,
    repo: string
  ): Promise<Array<{
    username: string;
    role: 'approver' | 'reviewer';
    paths: string[];
    sources: string[];
  }>> {
    const entries = await this.collectOwnersFiles(org, repo);

    // Aggregate by username
    const userMap = new Map<string, {
      role: 'approver' | 'reviewer';
      paths: Set<string>;
      sources: Set<string>;
    }>();

    for (const entry of entries) {
      const existing = userMap.get(entry.username);

      if (existing) {
        // Upgrade role if current entry is approver
        if (entry.role === 'approver') {
          existing.role = 'approver';
        }
        existing.paths.add(entry.path);
        existing.sources.add(entry.source);
      } else {
        userMap.set(entry.username, {
          role: entry.role,
          paths: new Set([entry.path]),
          sources: new Set([entry.source]),
        });
      }
    }

    // Convert to array
    return Array.from(userMap.entries()).map(([username, data]) => ({
      username,
      role: data.role,
      paths: Array.from(data.paths),
      sources: Array.from(data.sources),
    }));
  }
}
