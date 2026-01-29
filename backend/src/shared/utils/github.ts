import { config } from '../config/index.js';
import { logger } from './logger.js';

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  company: string | null;
  email: string | null;
}

/**
 * Fetch GitHub user info by username
 * Returns the user object or null if not found/error
 * Does not throw - always returns null on failure for soft failure handling
 */
export async function fetchGitHubUser(username: string): Promise<GitHubUser | null> {
  try {
    const response = await fetch(`https://api.github.com/users/${username}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'upstream-pulse',
        ...(config.githubToken && { 'Authorization': `Bearer ${config.githubToken}` }),
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        logger.warn(`GitHub user not found: ${username}`);
        return null;
      }
      if (response.status === 403) {
        logger.error('GitHub API rate limited - add GITHUB_TOKEN to .env for higher limits');
        return null;
      }
      logger.error(`GitHub API error: ${response.status}`);
      return null;
    }

    return await response.json() as GitHubUser;
  } catch (error) {
    logger.error(`Error fetching GitHub user ${username}:`, { error });
    return null;
  }
}

/**
 * Fetch just the GitHub user ID by username
 * Returns the numeric ID or null if not found
 */
export async function fetchGitHubUserId(username: string): Promise<number | null> {
  const user = await fetchGitHubUser(username);
  return user?.id ?? null;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  created_at: string;
  pushed_at: string;
}

/**
 * Fetch GitHub repository creation date
 * Returns the date the repo was created (day 0)
 * Does not throw - returns null on failure
 */
export async function fetchGitHubRepoCreatedAt(owner: string, repo: string): Promise<Date | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'upstream-pulse',
        ...(config.githubToken && { 'Authorization': `Bearer ${config.githubToken}` }),
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        logger.warn(`GitHub repo not found: ${owner}/${repo}`);
        return null;
      }
      if (response.status === 403) {
        logger.error('GitHub API rate limited - add GITHUB_TOKEN to .env for higher limits');
        return null;
      }
      logger.error(`GitHub API error: ${response.status}`);
      return null;
    }

    const repoData = await response.json() as GitHubRepo;
    return new Date(repoData.created_at);
  } catch (error) {
    logger.error(`Error fetching repo info for ${owner}/${repo}:`, { error });
    return null;
  }
}
