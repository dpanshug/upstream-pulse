import { Octokit } from '@octokit/rest';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';
import type { Repository } from '../../shared/types/index.js';

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
    since: Date
  ): Promise<ContributionRecord[]> {
    logger.info(`Collecting contributions for ${repo.githubOrg}/${repo.githubRepo} since ${since.toISOString()}`);

    const contributions: ContributionRecord[] = [];

    try {
      // Check rate limit before starting
      await this.checkRateLimit();

      // Collect commits
      const commits = await this.collectCommits(repo, since);
      contributions.push(...commits);
      logger.info(`Collected ${commits.length} commits`);

      // Collect PRs
      const prs = await this.collectPullRequests(repo, since);
      contributions.push(...prs);
      logger.info(`Collected ${prs.length} PRs`);

      // Collect reviews
      const reviews = await this.collectReviews(repo, since);
      contributions.push(...reviews);
      logger.info(`Collected ${reviews.length} reviews`);

      // Collect issues
      const issues = await this.collectIssues(repo, since);
      contributions.push(...issues);
      logger.info(`Collected ${issues.length} issues`);

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
          sort: 'updated',
          direction: 'desc',
          per_page: 100,
        }
      );

      // Filter PRs updated since 'since' date
      const recentPulls = pulls.filter(pr =>
        new Date(pr.updated_at) >= since
      );

      for (const pr of recentPulls) {
        if (!pr.user) continue;

        contributions.push({
          type: 'pr',
          githubId: String(pr.number),
          author: pr.user.login,
          date: new Date(pr.created_at),
          isMerged: pr.merged_at !== null,
          linesAdded: pr.additions,
          linesDeleted: pr.deletions,
          filesChanged: pr.changed_files,
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
    since: Date
  ): Promise<ContributionRecord[]> {
    const contributions: ContributionRecord[] = [];

    try {
      // First get recent PRs
      const pulls = await this.octokit.paginate(
        this.octokit.rest.pulls.list,
        {
          owner: repo.githubOrg,
          repo: repo.githubRepo,
          state: 'all',
          sort: 'updated',
          direction: 'desc',
          per_page: 50, // Limit to recent 50 PRs to avoid too many API calls
        }
      );

      const recentPulls = pulls.filter(pr =>
        new Date(pr.updated_at) >= since
      );

      // Collect reviews for each PR
      for (const pr of recentPulls) {
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
}
