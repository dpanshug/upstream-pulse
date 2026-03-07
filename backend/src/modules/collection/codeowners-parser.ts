/**
 * CODEOWNERS Parser
 *
 * Parses GitHub-native CODEOWNERS files to extract per-user maintainer entries.
 * Only @username references are captured — @org/team references are skipped
 * because resolving team membership requires `read:org` scope on external orgs.
 *
 * Checks `.github/CODEOWNERS` first, then root `CODEOWNERS`.
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

  private parseContent(content: string, sourceUrl: string): CodeownersEntry[] {
    const userPaths = new Map<string, Set<string>>();

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      // Format: <pattern> @owner1 @owner2 …
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;

      const pattern = parts[0];

      for (let i = 1; i < parts.length; i++) {
        const ref = parts[i];
        if (!ref.startsWith('@')) continue;

        const value = ref.slice(1); // strip leading @
        // Skip org/team references (contain a slash)
        if (value.includes('/')) continue;

        const username = value.toLowerCase();
        if (!userPaths.has(username)) userPaths.set(username, new Set());
        userPaths.get(username)!.add(pattern);
      }
    }

    return Array.from(userPaths.entries()).map(([username, paths]) => ({
      username,
      paths: Array.from(paths),
      source: sourceUrl,
    }));
  }
}
