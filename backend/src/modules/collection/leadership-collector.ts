/**
 * Leadership Collector
 *
 * Config-driven collector that fetches leadership positions from any
 * upstream org's community repository. Dispatches to the appropriate
 * parser based on what's configured in the org registry.
 *
 * Supported sources:
 *   - Markdown leadership tables (steering, TSC, maintainers)
 *   - WG/SIG YAML files (chairs + tech leads)
 */

import { Octokit } from '@octokit/rest';
import * as yaml from 'js-yaml';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';
import type { CommunityRepoConfig, LeadershipFileConfig } from '../../shared/config/org-registry.js';

// ── Output type ─────────────────────────────────────────────────────

export interface LeadershipPosition {
  githubUsername: string;
  name: string;
  organization?: string;
  /** Freeform — whatever the org calls it (steering_committee, tsc_member, lead, wg_chair, …) */
  positionType: string;
  groupName: string;
  termStart?: string;
  termEnd?: string;
  sourceUrl: string;
  isActive: boolean;
}

// ── WG YAML types ───────────────────────────────────────────────────

interface WgsYamlLeader {
  github: string;
  name: string;
  company?: string;
}

interface WgsYamlGroup {
  dir: string;
  name: string;
  leadership?: {
    chairs?: WgsYamlLeader[];
    tech_leads?: WgsYamlLeader[];
  };
}

interface WgsYaml {
  sigs?: WgsYamlGroup[];
  workinggroups?: WgsYamlGroup[];
  usergroups?: WgsYamlGroup[];
  committees?: WgsYamlGroup[];
}

// ── Collector ───────────────────────────────────────────────────────

export class LeadershipCollector {
  private octokit: Octokit;
  private githubOrg: string;
  private communityRepo: CommunityRepoConfig;

  constructor(githubOrg: string, communityRepo: CommunityRepoConfig, token?: string) {
    this.githubOrg = githubOrg;
    this.communityRepo = communityRepo;
    this.octokit = new Octokit({ auth: token || config.githubToken });
  }

  // ── Public entry point ──────────────────────────────────────────

  async getAllLeadershipPositions(): Promise<LeadershipPosition[]> {
    const results: LeadershipPosition[] = [];

    // Parse each configured leadership markdown file
    if (this.communityRepo.leadershipFiles) {
      for (const fileCfg of this.communityRepo.leadershipFiles) {
        const positions = await this.parseLeadershipMarkdown(fileCfg);
        results.push(...positions);
      }
    }

    // Parse WG/SIG YAML if configured
    if (this.communityRepo.wgFile) {
      const wgPositions = await this.fetchWorkingGroupLeadership(this.communityRepo.wgFile);
      results.push(...wgPositions);
    }

    logger.info(`Total leadership positions collected for ${this.githubOrg}`, {
      total: results.length,
      files: this.communityRepo.leadershipFiles?.length ?? 0,
      hasWgFile: !!this.communityRepo.wgFile,
    });

    return results;
  }

  // ── Unified markdown table parser ───────────────────────────────

  /**
   * Parses a markdown file containing a leadership table.
   *
   * Two modes controlled by `fileCfg.positionType`:
   *   1. Uniform role (positionType set) — all rows get the same type.
   *      Example: KUBEFLOW-STEERING-COMMITTEE.md, TECHNICAL-STEERING-COMMITTEE.md
   *   2. Role per row (positionType unset) — reads role from a "Role" / "Project Roles" column.
   *      Example: MAINTAINERS.md with columns like "Maintainer | GitHub | Role | …"
   */
  private async parseLeadershipMarkdown(fileCfg: LeadershipFileConfig): Promise<LeadershipPosition[]> {
    const positions: LeadershipPosition[] = [];
    const sourceUrl = `https://github.com/${this.githubOrg}/${this.communityRepo.repo}/blob/${this.communityRepo.defaultBranch}/${fileCfg.path}`;

    try {
      const response = await this.octokit.repos.getContent({
        owner: this.githubOrg,
        repo: this.communityRepo.repo,
        path: fileCfg.path,
      });

      if (!('content' in response.data)) return positions;

      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      const lines = content.split('\n');

      // Detect column layout from the header row
      let headerIdx = -1;
      let columnMap: Map<string, number> | null = null;

      let inActiveSection = true; // assume top of file is active members

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Track active vs emeritus/alumni sections
        if (/^#{1,3}\s+(emerit|alumni)/i.test(trimmed)) {
          inActiveSection = false;
          continue;
        }
        if (/^#{1,3}\s+/.test(trimmed) && !/(emerit|alumni)/i.test(trimmed)) {
          // Any non-emeritus heading resets to active (e.g. "## Committee members")
          if (headerIdx !== -1) {
            // We already parsed a table — a new heading might start another table
            // so reset header detection
            columnMap = null;
            headerIdx = -1;
          }
          inActiveSection = true;
          continue;
        }

        // Detect header row: a pipe-delimited line followed by a separator line
        if (!columnMap && trimmed.startsWith('|') && i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (nextLine.startsWith('|') && nextLine.includes('---')) {
            columnMap = this.parseHeaderRow(trimmed);
            headerIdx = i;
            continue;
          }
        }

        // Skip separator row
        if (columnMap && trimmed.startsWith('|') && trimmed.includes('---')) continue;

        // Parse data rows
        if (columnMap && trimmed.startsWith('|')) {
          const cells = this.splitTableRow(trimmed);
          if (cells.length < 2) continue;

          const pos = this.extractPosition(cells, columnMap, fileCfg, sourceUrl, inActiveSection);
          if (pos) positions.push(pos);
        }
      }

      logger.info(`Parsed ${positions.length} leadership positions from ${fileCfg.path}`);
    } catch (error) {
      logger.error(`Failed to fetch leadership file ${fileCfg.path}`, { error });
    }

    return positions;
  }

  /** Map normalized column names to their index. */
  private parseHeaderRow(line: string): Map<string, number> {
    const cells = this.splitTableRow(line);
    const map = new Map<string, number>();
    for (let i = 0; i < cells.length; i++) {
      const key = cells[i].toLowerCase().replace(/[^a-z ]/g, '').trim();
      map.set(key, i);
    }
    return map;
  }

  /** Split a markdown table row into cell strings (strips outer pipes). */
  private splitTableRow(line: string): string[] {
    return line.split('|').slice(1, -1).map(c => c.trim());
  }

  /** Extract a LeadershipPosition from a parsed table row. */
  private extractPosition(
    cells: string[],
    columns: Map<string, number>,
    fileCfg: LeadershipFileConfig,
    sourceUrl: string,
    isActive: boolean,
  ): LeadershipPosition | null {
    // Find GitHub username — look in any cell for [username](url) pattern
    let githubUsername: string | null = null;
    for (const cell of cells) {
      const match = cell.match(/\[([^\]]+)\]\(https?:\/\/github\.com\/[^)]+\)/);
      if (match) {
        githubUsername = match[1].trim();
        break;
      }
    }
    // Fallback: column explicitly named "github" or "github id"
    if (!githubUsername) {
      const ghColIdx = columns.get('github') ?? columns.get('github id');
      if (ghColIdx !== undefined && ghColIdx < cells.length) {
        const val = cells[ghColIdx].replace(/\[([^\]]+)\].*/, '$1').trim();
        if (val && val !== '-') githubUsername = val;
      }
    }

    if (!githubUsername) return null;

    // Name
    const nameIdx = columns.get('name') ?? columns.get('maintainer') ?? columns.get('member');
    const name = nameIdx !== undefined && nameIdx < cells.length
      ? cells[nameIdx].replace(/\[([^\]]+)\].*/, '$1').trim()
      : githubUsername;

    // Organization / Affiliation
    const orgIdx = columns.get('organization') ?? columns.get('affiliation') ?? columns.get('company');
    const organization = orgIdx !== undefined && orgIdx < cells.length
      ? cells[orgIdx].replace(/\[([^\]]+)\].*/, '$1').trim() || undefined
      : undefined;

    // Position type
    let positionType = fileCfg.positionType;
    if (!positionType) {
      const roleIdx = columns.get('project roles') ?? columns.get('role') ?? columns.get('roles');
      if (roleIdx !== undefined && roleIdx < cells.length) {
        positionType = cells[roleIdx].trim().toLowerCase().replace(/\s+/g, '_') || 'member';
      } else {
        positionType = 'member';
      }
    }

    // Term dates (optional)
    const startIdx = columns.get('term start') ?? columns.get('start');
    const endIdx = columns.get('term end') ?? columns.get('end');
    const termStart = startIdx !== undefined && startIdx < cells.length ? cells[startIdx].trim() : undefined;
    const termEnd = endIdx !== undefined && endIdx < cells.length ? cells[endIdx].trim() : undefined;

    return {
      githubUsername,
      name,
      organization,
      positionType,
      groupName: fileCfg.groupName,
      termStart: termStart && termStart !== '-' ? termStart : undefined,
      termEnd: termEnd && termEnd !== '-' ? termEnd : undefined,
      sourceUrl,
      isActive,
    };
  }

  // ── WG/SIG YAML parser ─────────────────────────────────────────

  private async fetchWorkingGroupLeadership(wgFile: string): Promise<LeadershipPosition[]> {
    const positions: LeadershipPosition[] = [];
    const sourceUrl = `https://github.com/${this.githubOrg}/${this.communityRepo.repo}/blob/${this.communityRepo.defaultBranch}/${wgFile}`;

    try {
      const response = await this.octokit.repos.getContent({
        owner: this.githubOrg,
        repo: this.communityRepo.repo,
        path: wgFile,
      });

      if (!('content' in response.data)) return positions;

      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      const wgsData = yaml.load(content) as WgsYaml;

      const processGroups = (
        groups: WgsYamlGroup[] | undefined,
        prefix: string,
        chairType: string,
        leadType: string,
      ) => {
        if (!groups) return;
        for (const group of groups) {
          if (!group.leadership) continue;
          if (group.leadership.chairs) {
            for (const chair of group.leadership.chairs) {
              positions.push({
                githubUsername: chair.github,
                name: chair.name,
                organization: chair.company,
                positionType: chairType,
                groupName: `${prefix} ${group.name}`,
                sourceUrl,
                isActive: true,
              });
            }
          }
          if (group.leadership.tech_leads) {
            for (const lead of group.leadership.tech_leads) {
              const isDuplicate = positions.some(
                p => p.githubUsername === lead.github &&
                     p.groupName === `${prefix} ${group.name}` &&
                     p.positionType === chairType,
              );
              if (!isDuplicate) {
                positions.push({
                  githubUsername: lead.github,
                  name: lead.name,
                  organization: lead.company,
                  positionType: leadType,
                  groupName: `${prefix} ${group.name}`,
                  sourceUrl,
                  isActive: true,
                });
              }
            }
          }
        }
      };

      processGroups(wgsData.sigs, 'SIG', 'sig_chair', 'sig_tech_lead');
      processGroups(wgsData.workinggroups, 'WG', 'wg_chair', 'wg_tech_lead');

      logger.info(`Parsed ${positions.length} WG/SIG leadership positions from ${wgFile}`);
    } catch (error) {
      logger.error(`Failed to fetch WG leadership from ${wgFile}`, { error });
    }

    return positions;
  }

  // ── Convenience: unique leaders map ─────────────────────────────

  async getUniqueLeaders(): Promise<Map<string, LeadershipPosition[]>> {
    const positions = await this.getAllLeadershipPositions();
    const leaderMap = new Map<string, LeadershipPosition[]>();
    for (const pos of positions) {
      const username = pos.githubUsername.toLowerCase();
      if (!leaderMap.has(username)) leaderMap.set(username, []);
      leaderMap.get(username)!.push(pos);
    }
    return leaderMap;
  }
}
