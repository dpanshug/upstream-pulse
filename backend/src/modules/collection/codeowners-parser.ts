/**
 * CODEOWNERS Parser
 *
 * Parses GitHub-native CODEOWNERS files to extract per-user maintainer entries.
 *
 * Handles two owner formats:
 *   1. @username — captured directly
 *   2. @org/team — resolved via comment headers when the repo embeds a
 *      team-member mapping in comments (e.g. `# org/team : user1, user2`).
 *      This covers repos where GitHub team visibility is private and
 *      maintainers are listed in comments by convention.
 *
 * Checks `.github/CODEOWNERS`, root `CODEOWNERS`, and `docs/CODEOWNERS`.
 */

import { Octokit } from '@octokit/rest';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';

export interface CodeownersEntry {
  username: string;
  paths: string[];
  source: string;
}

export class CodeownersParser {
  private octokit: Octokit;

  constructor(token?: string) {
    this.octokit = new Octokit({ auth: token || config.githubToken });
  }

  async parse(org: string, repo: string): Promise<CodeownersEntry[]> {
    const content = await this.fetchCodeowners(org, repo);
    if (!content) return [];

    const sourceUrl = `https://github.com/${org}/${repo}`;
    return this.parseContent(content, sourceUrl);
  }

  private async fetchCodeowners(org: string, repo: string): Promise<string | null> {
    const candidates = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'];
    for (const path of candidates) {
      try {
        const { data } = await this.octokit.rest.repos.getContent({ owner: org, repo, path });
        if ('content' in data && data.content) {
          return Buffer.from(data.content, 'base64').toString('utf-8');
        }
      } catch {
        continue;
      }
    }
    logger.debug(`No CODEOWNERS file found in ${org}/${repo}`);
    return null;
  }

  /**
   * Build a map from "org/team" → [usernames] by scanning comment lines
   * matching the convention:  # org/team : user1, user2, ...
   */
  private buildTeamMap(content: string): Map<string, string[]> {
    const teamMap = new Map<string, string[]>();

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line.startsWith('#')) continue;

      const body = line.slice(1).trim();
      const colonIdx = body.indexOf(':');
      if (colonIdx === -1) continue;

      const teamRef = body.slice(0, colonIdx).trim();
      if (!/^[\w.-]+\/[\w.-]+$/.test(teamRef)) continue;

      const usersStr = body.slice(colonIdx + 1).trim();
      if (!usersStr) continue;

      const users = usersStr
        .split(/[,\s]+/)
        .map(u => u.replace(/^@/, '').trim().toLowerCase())
        .filter(Boolean);

      if (users.length > 0) {
        teamMap.set(teamRef.toLowerCase(), users);
        logger.debug(`CODEOWNERS team mapping: ${teamRef} → ${users.join(', ')}`);
      }
    }

    return teamMap;
  }

  private parseContent(content: string, sourceUrl: string): CodeownersEntry[] {
    const teamMap = this.buildTeamMap(content);
    const userPaths = new Map<string, Set<string>>();

    const addUser = (username: string, pattern: string) => {
      const paths = userPaths.get(username) ?? new Set<string>();
      paths.add(pattern);
      userPaths.set(username, paths);
    };

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;

      const pattern = parts[0];

      for (let i = 1; i < parts.length; i++) {
        const ref = parts[i];
        if (!ref.startsWith('@')) continue;

        const value = ref.slice(1);

        if (value.includes('/')) {
          const resolved = teamMap.get(value.toLowerCase());
          if (resolved) {
            for (const username of resolved) {
              addUser(username, pattern);
            }
          }
          continue;
        }

        addUser(value.toLowerCase(), pattern);
      }
    }

    return Array.from(userPaths.entries()).map(([username, paths]) => ({
      username,
      paths: Array.from(paths),
      source: sourceUrl,
    }));
  }
}
