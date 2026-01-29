/**
 * Leadership Collector
 * 
 * Fetches and parses leadership positions from Kubeflow community repository:
 * - Steering Committee from KUBEFLOW-STEERING-COMMITTEE.md
 * - WG/SIG Chairs and Tech Leads from wgs.yaml
 */

import { Octokit } from '@octokit/rest';
import * as yaml from 'js-yaml';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';

// Types for parsed leadership data
export interface LeadershipPosition {
  githubUsername: string;
  name: string;
  organization?: string;
  positionType: 'steering_committee' | 'wg_chair' | 'wg_tech_lead' | 'sig_chair' | 'sig_tech_lead';
  groupName: string; // e.g., 'Kubeflow Steering Committee', 'WG Data', 'SIG Feature Store'
  termStart?: string;
  termEnd?: string;
  sourceUrl: string;
}

// Types for wgs.yaml structure
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

export class LeadershipCollector {
  private octokit: Octokit;
  
  // Default community repo - can be extended for other orgs
  private communityOrg = 'kubeflow';
  private communityRepo = 'community';

  constructor(token?: string) {
    this.octokit = new Octokit({
      auth: token || config.githubToken,
    });
  }

  /**
   * Fetch and parse steering committee members from markdown file
   */
  async fetchSteeringCommittee(): Promise<LeadershipPosition[]> {
    const positions: LeadershipPosition[] = [];
    const filePath = 'KUBEFLOW-STEERING-COMMITTEE.md';
    const sourceUrl = `https://github.com/${this.communityOrg}/${this.communityRepo}/blob/master/${filePath}`;

    try {
      const response = await this.octokit.repos.getContent({
        owner: this.communityOrg,
        repo: this.communityRepo,
        path: filePath,
      });

      if ('content' in response.data) {
        const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
        
        // Parse the markdown table for current members
        // Format: | Name | Organization | GitHub | Term Start | Term End |
        let inCurrentMembersSection = false;
        
        const lines = content.split('\n');
        for (const line of lines) {
          // Track which section we're in
          if (line.includes('## Committee members') || line.includes('current membership')) {
            inCurrentMembersSection = true;
            continue;
          }
          if (line.includes('## Emeritus')) {
            inCurrentMembersSection = false;
            continue;
          }
          if (line.startsWith('## ') && !line.includes('Committee members') && !line.includes('Emeritus')) {
            inCurrentMembersSection = false;
            continue;
          }

          // Only parse current members, skip emeritus and header rows
          if (!inCurrentMembersSection) continue;
          if (line.includes('| Name |') || line.includes('| ---')) continue;

          // Parse table row
          const rowMatch = line.match(/\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*\[([^\]]+)\]\([^)]+\)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);
          if (rowMatch) {
            const [, name, organization, githubUsername, termStart, termEnd] = rowMatch;
            positions.push({
              githubUsername: githubUsername.trim(),
              name: name.trim(),
              organization: organization.trim(),
              positionType: 'steering_committee',
              groupName: 'Kubeflow Steering Committee',
              termStart: termStart.trim(),
              termEnd: termEnd.trim(),
              sourceUrl,
            });
          }
        }

        logger.info(`Parsed ${positions.length} steering committee members`);
      }
    } catch (error) {
      logger.error('Failed to fetch steering committee', { error });
    }

    return positions;
  }

  /**
   * Fetch and parse WG/SIG leadership from wgs.yaml
   */
  async fetchWorkingGroupLeadership(): Promise<LeadershipPosition[]> {
    const positions: LeadershipPosition[] = [];
    const filePath = 'wgs.yaml';
    const sourceUrl = `https://github.com/${this.communityOrg}/${this.communityRepo}/blob/master/${filePath}`;

    try {
      const response = await this.octokit.repos.getContent({
        owner: this.communityOrg,
        repo: this.communityRepo,
        path: filePath,
      });

      if ('content' in response.data) {
        const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
        const wgsData = yaml.load(content) as WgsYaml;

        // Process SIGs
        if (wgsData.sigs) {
          for (const sig of wgsData.sigs) {
            if (sig.leadership) {
              // Chairs
              if (sig.leadership.chairs) {
                for (const chair of sig.leadership.chairs) {
                  positions.push({
                    githubUsername: chair.github,
                    name: chair.name,
                    organization: chair.company,
                    positionType: 'sig_chair',
                    groupName: `SIG ${sig.name}`,
                    sourceUrl,
                  });
                }
              }
              // Tech Leads
              if (sig.leadership.tech_leads) {
                for (const lead of sig.leadership.tech_leads) {
                  // Avoid duplicates if same person is both chair and tech lead
                  const isDuplicate = positions.some(
                    p => p.githubUsername === lead.github && 
                         p.groupName === `SIG ${sig.name}` &&
                         p.positionType === 'sig_chair'
                  );
                  if (!isDuplicate) {
                    positions.push({
                      githubUsername: lead.github,
                      name: lead.name,
                      organization: lead.company,
                      positionType: 'sig_tech_lead',
                      groupName: `SIG ${sig.name}`,
                      sourceUrl,
                    });
                  }
                }
              }
            }
          }
        }

        // Process Working Groups
        if (wgsData.workinggroups) {
          for (const wg of wgsData.workinggroups) {
            if (wg.leadership) {
              // Chairs
              if (wg.leadership.chairs) {
                for (const chair of wg.leadership.chairs) {
                  positions.push({
                    githubUsername: chair.github,
                    name: chair.name,
                    organization: chair.company,
                    positionType: 'wg_chair',
                    groupName: `WG ${wg.name}`,
                    sourceUrl,
                  });
                }
              }
              // Tech Leads
              if (wg.leadership.tech_leads) {
                for (const lead of wg.leadership.tech_leads) {
                  // Avoid duplicates if same person is both chair and tech lead
                  const isDuplicate = positions.some(
                    p => p.githubUsername === lead.github && 
                         p.groupName === `WG ${wg.name}` &&
                         p.positionType === 'wg_chair'
                  );
                  if (!isDuplicate) {
                    positions.push({
                      githubUsername: lead.github,
                      name: lead.name,
                      organization: lead.company,
                      positionType: 'wg_tech_lead',
                      groupName: `WG ${wg.name}`,
                      sourceUrl,
                    });
                  }
                }
              }
            }
          }
        }

        logger.info(`Parsed ${positions.length} WG/SIG leadership positions`);
      }
    } catch (error) {
      logger.error('Failed to fetch WG leadership', { error });
    }

    return positions;
  }

  /**
   * Fetch all leadership positions
   */
  async getAllLeadershipPositions(): Promise<LeadershipPosition[]> {
    const [steeringCommittee, wgLeadership] = await Promise.all([
      this.fetchSteeringCommittee(),
      this.fetchWorkingGroupLeadership(),
    ]);

    const allPositions = [...steeringCommittee, ...wgLeadership];
    
    logger.info(`Total leadership positions collected: ${allPositions.length}`, {
      steeringCommittee: steeringCommittee.length,
      wgLeadership: wgLeadership.length,
    });

    return allPositions;
  }

  /**
   * Get unique GitHub usernames from all positions
   */
  async getUniqueLeaders(): Promise<Map<string, LeadershipPosition[]>> {
    const positions = await this.getAllLeadershipPositions();
    const leaderMap = new Map<string, LeadershipPosition[]>();

    for (const pos of positions) {
      const username = pos.githubUsername.toLowerCase();
      if (!leaderMap.has(username)) {
        leaderMap.set(username, []);
      }
      leaderMap.get(username)!.push(pos);
    }

    return leaderMap;
  }
}

// Export singleton
export const leadershipCollector = new LeadershipCollector();
