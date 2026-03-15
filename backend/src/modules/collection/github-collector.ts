import { Octokit } from '@octokit/rest';
import * as yaml from 'js-yaml';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';
import type { Repository } from '../../shared/types/index.js';

export interface OwnersEntry {
  username: string;
  role: 'approver' | 'reviewer';
  roleKey: string; // Original OWNERS key name (e.g., 'approvers', 'project-leads', 'owners')
  path: string; // Directory path where OWNERS file was found
  source: string; // Full path to the OWNERS file
}

type OwnersFileContent = Record<string, unknown>;

const OWNERS_SKIP_KEYS = new Set([
  'labels', 'options', 'filters',
  'emeritus_approvers', 'emeritus_reviewers', 'emeritus_maintainers',
  'security_contacts', 'auto-assign',
]);

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

interface GraphQLReviewNode {
  databaseId: number;
  author: { login: string } | null;
  submittedAt: string | null;
  state: string;
  body: string | null;
  url: string;
}

interface GraphQLPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface GraphQLRateLimit {
  cost: number;
  remaining: number;
  resetAt: string;
}

interface GraphQLReviewsResponse {
  repository: {
    pullRequests: {
      pageInfo: GraphQLPageInfo;
      nodes: Array<{
        number: number;
        title: string;
        updatedAt: string;
        reviews: {
          pageInfo: GraphQLPageInfo;
          nodes: GraphQLReviewNode[];
        };
      }>;
    };
  };
  rateLimit: GraphQLRateLimit;
}

interface GraphQLSinglePRReviewsResponse {
  repository: {
    pullRequest: {
      reviews: {
        pageInfo: GraphQLPageInfo;
        nodes: GraphQLReviewNode[];
      };
    };
  };
  rateLimit: GraphQLRateLimit;
}

const REVIEWS_QUERY = `
  query($owner: String!, $repo: String!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequests(first: 100, orderBy: {field: UPDATED_AT, direction: DESC}, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          title
          updatedAt
          reviews(first: 10) {
            pageInfo { hasNextPage endCursor }
            nodes {
              databaseId
              author { login }
              submittedAt
              state
              body
              url
            }
          }
        }
      }
    }
    rateLimit { cost remaining resetAt }
  }
`;

const REMAINING_REVIEWS_QUERY = `
  query($owner: String!, $repo: String!, $prNumber: Int!, $cursor: String!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
        reviews(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            databaseId
            author { login }
            submittedAt
            state
            body
            url
          }
        }
      }
    }
    rateLimit { cost remaining resetAt }
  }
`;

export class GitHubCollector {
  private octokit: Octokit;
  private rateLimitRemaining: number = 5000;
  private rateLimitReset: Date | null = null;
  private graphqlPointsRemaining: number = 5000;
  private graphqlResetAt: Date | null = null;

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
   * Wait if rate limit is exhausted. Checks remaining calls and sleeps until reset if needed.
   */
  private async waitIfRateLimited(onProgress?: (detail: { phase: string; collected: number }) => void): Promise<void> {
    if (this.rateLimitRemaining > 50) return;

    const { data } = await this.octokit.rest.rateLimit.get();
    this.rateLimitRemaining = data.rate.remaining;
    this.rateLimitReset = new Date(data.rate.reset * 1000);

    if (this.rateLimitRemaining > 50) return;

    const waitMs = Math.max(0, this.rateLimitReset.getTime() - Date.now()) + 5000;
    const waitMin = Math.ceil(waitMs / 60000);
    logger.warn(`Rate limit low (${this.rateLimitRemaining} remaining), waiting ${waitMin}m for reset at ${this.rateLimitReset.toISOString()}`);
    onProgress?.({ phase: 'waiting_for_api', collected: -1 });
    await new Promise(resolve => setTimeout(resolve, waitMs));
    this.rateLimitRemaining = 5000;
    logger.info('Rate limit reset, resuming collection');
    onProgress?.({ phase: 'resuming', collected: -1 });
  }

  /**
   * Update rate limit tracking from response headers
   */
  private trackRateLimit(headers: Record<string, string | undefined>): void {
    const remaining = headers['x-ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'];
    if (remaining != null) this.rateLimitRemaining = parseInt(remaining, 10);
    if (reset != null) this.rateLimitReset = new Date(parseInt(reset, 10) * 1000);
  }

  private trackGraphQLRateLimit(rateLimit: GraphQLRateLimit): void {
    this.graphqlPointsRemaining = rateLimit.remaining;
    this.graphqlResetAt = new Date(rateLimit.resetAt);
  }

  private async waitIfGraphQLRateLimited(onProgress?: (detail: { phase: string; collected: number }) => void): Promise<void> {
    if (this.graphqlPointsRemaining > 50) return;

    const waitMs = this.graphqlResetAt
      ? Math.max(0, this.graphqlResetAt.getTime() - Date.now()) + 5000
      : 60000;
    const waitMin = Math.ceil(waitMs / 60000);
    logger.warn(`GraphQL rate limit low (${this.graphqlPointsRemaining} points remaining), waiting ${waitMin}m`);
    onProgress?.({ phase: 'waiting_for_api', collected: -1 });
    await new Promise(resolve => setTimeout(resolve, waitMs));
    this.graphqlPointsRemaining = 5000;
    logger.info('GraphQL rate limit reset, resuming collection');
    onProgress?.({ phase: 'resuming', collected: -1 });
  }

  /**
   * Collect all contributions for a repository since a given date
   */
  async collectRepositoryContributions(
    repo: Repository,
    since: Date,
    onProgress?: (detail: { phase: string; collected: number }) => void,
    onPhaseComplete?: (phase: string, records: ContributionRecord[]) => Promise<void>,
    phases?: ('commits' | 'pull_requests' | 'reviews' | 'issues')[],
  ): Promise<ContributionRecord[]> {
    const allPhases = phases || ['commits', 'pull_requests', 'reviews', 'issues'];
    logger.info(`Collecting contributions for ${repo.githubOrg}/${repo.githubRepo} since ${since.toISOString()}`, { phases: allPhases });

    let totalCollected = 0;
    const signal = (phase: string) => onProgress?.({ phase, collected: totalCollected });

    const completePhase = async (phase: string, records: ContributionRecord[]) => {
      totalCollected += records.length;
      logger.info(`Collected ${records.length} ${phase}`);
      if (onPhaseComplete) await onPhaseComplete(phase, records);
    };

    try {
      await this.checkRateLimit();

      if (allPhases.includes('commits')) {
        signal('commits');
        const commits = await this.collectCommits(repo, since, onProgress);
        await completePhase('commits', commits);
      }

      if (allPhases.includes('pull_requests')) {
        signal('pull_requests');
        const prs = await this.collectPullRequests(repo, since, onProgress);
        await completePhase('pull_requests', prs);
      }

      if (allPhases.includes('reviews')) {
        signal('reviews');
        const reviews = await this.collectReviews(repo, since, onProgress);
        await completePhase('reviews', reviews);
      }

      if (allPhases.includes('issues')) {
        signal('issues');
        const issues = await this.collectIssues(repo, since, onProgress);
        await completePhase('issues', issues);
      }

      signal('done');
      logger.info(`Total contributions collected: ${totalCollected}`);
      return [];

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
    since: Date,
    onProgress?: (detail: { phase: string; collected: number }) => void,
  ): Promise<ContributionRecord[]> {
    const contributions: ContributionRecord[] = [];
    let page = 0;

    try {
      for await (const response of this.octokit.paginate.iterator(
        this.octokit.rest.repos.listCommits,
        { owner: repo.githubOrg, repo: repo.githubRepo, since: since.toISOString(), per_page: 100 },
      )) {
        this.trackRateLimit(response.headers as Record<string, string | undefined>);
        await this.waitIfRateLimited(onProgress);
        onProgress?.({ phase: `commits (page ${++page})`, collected: contributions.length });

        for (const commit of response.data) {
          if (commit.parents && commit.parents.length > 1) continue;
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
    since: Date,
    onProgress?: (detail: { phase: string; collected: number }) => void,
  ): Promise<ContributionRecord[]> {
    const contributions: ContributionRecord[] = [];
    let page = 0;

    try {
      for await (const response of this.octokit.paginate.iterator(
        this.octokit.rest.pulls.list,
        { owner: repo.githubOrg, repo: repo.githubRepo, state: 'all', sort: 'created', direction: 'desc', per_page: 100 },
      )) {
        this.trackRateLimit(response.headers as Record<string, string | undefined>);
        await this.waitIfRateLimited(onProgress);
        onProgress?.({ phase: `pull_requests (page ${++page})`, collected: contributions.length });

        let allOlderThanSince = true;
        for (const pr of response.data) {
          if (new Date(pr.created_at) < since) continue;
          allOlderThanSince = false;
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

        // Sorted desc by created — if entire page is older than since, no need to fetch more
        if (allOlderThanSince && response.data.length > 0) break;
      }

      return contributions;

    } catch (error) {
      logger.error('Error collecting pull requests', { error, repo });
      return contributions;
    }
  }

  /**
   * Collect PR reviews since a given date using GraphQL.
   * Fetches 100 PRs with nested reviews per query, eliminating the N+1 REST problem.
   */
  private async collectReviews(
    repo: Repository,
    since: Date,
    onProgress?: (detail: { phase: string; collected: number }) => void,
  ): Promise<ContributionRecord[]> {
    const contributions: ContributionRecord[] = [];
    let cursor: string | null = null;
    let page = 0;

    try {
      let hasNextPage = true;
      while (hasNextPage) {
        await this.waitIfGraphQLRateLimited(onProgress);
        onProgress?.({ phase: `reviews (page ${++page})`, collected: contributions.length });

        const vars = { owner: repo.githubOrg, repo: repo.githubRepo, cursor };
        let data: GraphQLReviewsResponse;
        try {
          data = await this.octokit.graphql<GraphQLReviewsResponse>(REVIEWS_QUERY, vars);
        } catch (error) {
          logger.warn(`GraphQL reviews query failed (page ${page}), retrying after 3s`, { error: (error as Error).message });
          await new Promise(r => setTimeout(r, 3000));
          try {
            data = await this.octokit.graphql<GraphQLReviewsResponse>(REVIEWS_QUERY, vars);
          } catch (retryError) {
            logger.error(`GraphQL reviews query failed after retry (page ${page})`, { error: (retryError as Error).message });
            break;
          }
        }

        this.trackGraphQLRateLimit(data.rateLimit);

        const { pullRequests } = data.repository;
        hasNextPage = pullRequests.pageInfo.hasNextPage;
        cursor = pullRequests.pageInfo.endCursor;

        let allOlderThanSince = true;
        for (const pr of pullRequests.nodes) {
          if (new Date(pr.updatedAt) < since) continue;
          allOlderThanSince = false;

          this.pushReviewRecords(contributions, pr.reviews.nodes, pr.number, pr.title, since);

          if (pr.reviews.pageInfo.hasNextPage && pr.reviews.pageInfo.endCursor) {
            const remaining = await this.collectRemainingReviews(
              repo.githubOrg, repo.githubRepo, pr.number, pr.title,
              pr.reviews.pageInfo.endCursor, since, onProgress,
            );
            contributions.push(...remaining);
          }
        }

        if (allOlderThanSince && pullRequests.nodes.length > 0) break;
      }

      return contributions;

    } catch (error) {
      logger.error('Error collecting reviews', { error, repo });
      return contributions;
    }
  }

  /**
   * Paginate remaining reviews for a single PR that has more than 10 reviews.
   */
  private async collectRemainingReviews(
    owner: string,
    repo: string,
    prNumber: number,
    prTitle: string,
    afterCursor: string,
    since: Date,
    onProgress?: (detail: { phase: string; collected: number }) => void,
  ): Promise<ContributionRecord[]> {
    const contributions: ContributionRecord[] = [];
    let cursor: string | null = afterCursor;

    try {
      let hasNextPage = true;
      while (hasNextPage) {
        await this.waitIfGraphQLRateLimited(onProgress);

        const data: GraphQLSinglePRReviewsResponse = await this.octokit.graphql(
          REMAINING_REVIEWS_QUERY,
          { owner, repo, prNumber, cursor },
        );

        this.trackGraphQLRateLimit(data.rateLimit);

        const reviews = data.repository.pullRequest.reviews;
        hasNextPage = reviews.pageInfo.hasNextPage;
        cursor = reviews.pageInfo.endCursor;

        this.pushReviewRecords(contributions, reviews.nodes, prNumber, prTitle, since);
      }
    } catch (error) {
      logger.warn(`Error collecting remaining reviews for PR #${prNumber}`, { error });
    }

    return contributions;
  }

  private pushReviewRecords(
    contributions: ContributionRecord[],
    nodes: GraphQLReviewNode[],
    prNumber: number,
    prTitle: string,
    since: Date,
  ): void {
    for (const review of nodes) {
      if (!review.author || !review.submittedAt) continue;

      const reviewDate = new Date(review.submittedAt);
      if (reviewDate < since) continue;

      contributions.push({
        type: 'review',
        githubId: String(review.databaseId),
        author: review.author.login,
        date: reviewDate,
        metadata: {
          author: review.author.login,
          prNumber,
          prTitle,
          state: review.state.toLowerCase(),
          body: review.body,
          url: review.url,
        },
      });
    }
  }

  /**
   * Collect issues since a given date
   */
  private async collectIssues(
    repo: Repository,
    since: Date,
    onProgress?: (detail: { phase: string; collected: number }) => void,
  ): Promise<ContributionRecord[]> {
    const contributions: ContributionRecord[] = [];
    let page = 0;

    try {
      for await (const response of this.octokit.paginate.iterator(
        this.octokit.rest.issues.listForRepo,
        { owner: repo.githubOrg, repo: repo.githubRepo, state: 'all', sort: 'updated', direction: 'desc', since: since.toISOString(), per_page: 100 },
      )) {
        this.trackRateLimit(response.headers as Record<string, string | undefined>);
        await this.waitIfRateLimited(onProgress);
        onProgress?.({ phase: `issues (page ${++page})`, collected: contributions.length });

        for (const issue of response.data) {
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

      // Process all keys that contain arrays of usernames
      if (parsed && typeof parsed === 'object') {
        for (const [key, value] of Object.entries(parsed)) {
          if (OWNERS_SKIP_KEYS.has(key)) continue;
          if (!Array.isArray(value)) continue;
          if (!value.every(v => typeof v === 'string')) continue;

          const role: 'approver' | 'reviewer' = key === 'reviewers' ? 'reviewer' : 'approver';

          for (const entry of value as string[]) {
            const resolvedUsers = this.resolveAlias(entry, aliases);
            for (const username of resolvedUsers) {
              entries.push({
                username: username.toLowerCase(),
                role,
                roleKey: key,
                path: directoryPath,
                source: `https://github.com/${org}/${repo}/blob/main/${filePath}`,
              });
            }
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
    roleTitle: string;
    paths: string[];
    sources: string[];
  }>> {
    const entries = await this.collectOwnersFiles(org, repo);

    // Aggregate by username — keep the highest-authority role key
    const userMap = new Map<string, {
      role: 'approver' | 'reviewer';
      roleKey: string;
      paths: Set<string>;
      sources: Set<string>;
    }>();

    const roleKeyPriority = (key: string) => {
      if (key.includes('lead') || key === 'owners') return 0;
      if (key === 'approvers') return 1;
      return 2;
    };

    for (const entry of entries) {
      const existing = userMap.get(entry.username);

      if (existing) {
        if (entry.role === 'approver') existing.role = 'approver';
        if (roleKeyPriority(entry.roleKey) < roleKeyPriority(existing.roleKey)) {
          existing.roleKey = entry.roleKey;
        }
        existing.paths.add(entry.path);
        existing.sources.add(entry.source);
      } else {
        userMap.set(entry.username, {
          role: entry.role,
          roleKey: entry.roleKey,
          paths: new Set([entry.path]),
          sources: new Set([entry.source]),
        });
      }
    }

    const formatTitle = (key: string) =>
      key.replace(/-/g, ' ').replace(/s$/, '').replace(/\b\w/g, c => c.toUpperCase());

    return Array.from(userMap.entries()).map(([username, data]) => ({
      username,
      role: data.role,
      roleTitle: formatTitle(data.roleKey),
      paths: Array.from(data.paths),
      sources: Array.from(data.sources),
    }));
  }
}
