import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { db } from '../../shared/database/client.js';
import { projects } from '../../shared/database/schema.js';
import { eq } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ThrottledOctokit = Octokit.plugin(throttling as any);

export interface PRItem {
  title: string;
  repo: string;
  number: number;
  url: string;
  isDraft: boolean;
  reviewDecision: string | null;
  createdAt: string;
  updatedAt: string;
  labels: string[];
}

export interface ActionQueueData {
  resolved: true;
  reviewRequests: PRItem[];
  myOpenPRs: PRItem[];
}

interface CacheEntry {
  data: ActionQueueData;
  timestamp: number;
}

const CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_CACHE_SIZE = 100;
const cache = new Map<string, CacheEntry>();

let octokitInstance: InstanceType<typeof ThrottledOctokit> | null = null;

function getOctokit(): InstanceType<typeof ThrottledOctokit> {
  if (!octokitInstance) {
    octokitInstance = new ThrottledOctokit({
      auth: config.githubToken,
      throttle: {
        onRateLimit: (retryAfter: number, options: Record<string, unknown>, _octokit: unknown, retryCount: number) => {
          logger.warn(`Action queue rate limit hit for ${options['method']} ${options['url']}, retrying after ${retryAfter}s (attempt ${retryCount + 1})`);
          return retryCount < 2;
        },
        onSecondaryRateLimit: (retryAfter: number, options: Record<string, unknown>) => {
          logger.warn(`Action queue secondary rate limit for ${options['method']} ${options['url']}, retrying after ${retryAfter}s`);
          return false;
        },
      },
    });
  }
  return octokitInstance;
}

interface GraphQLPRNode {
  title: string;
  number: number;
  url: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  reviewDecision: string | null;
  repository: { nameWithOwner: string };
  labels: { nodes: Array<{ name: string }> };
}

interface GraphQLSearchResponse {
  search: {
    nodes: GraphQLPRNode[];
  };
}

const PR_SEARCH_QUERY = `
  query($searchQuery: String!) {
    search(query: $searchQuery, type: ISSUE, first: 20) {
      nodes {
        ... on PullRequest {
          title
          number
          url
          isDraft
          createdAt
          updatedAt
          reviewDecision
          repository { nameWithOwner }
          labels(first: 5) { nodes { name } }
        }
      }
    }
  }
`;

function buildOrgFilter(orgs: string[]): string {
  if (orgs.length === 0) return '';
  return orgs.map((o) => `org:${o}`).join(' ');
}

function mapPRNodes(nodes: GraphQLPRNode[]): PRItem[] {
  return nodes
    .filter((n) => n.title)
    .map((n) => ({
      title: n.title,
      repo: n.repository.nameWithOwner,
      number: n.number,
      url: n.url,
      isDraft: n.isDraft,
      reviewDecision: n.reviewDecision ?? null,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      labels: n.labels.nodes.map((l) => l.name),
    }));
}

const GITHUB_USERNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

async function fetchFromGitHub(
  githubUsername: string,
  trackedOrgs: string[],
): Promise<ActionQueueData> {
  if (!GITHUB_USERNAME_RE.test(githubUsername)) {
    logger.warn('Invalid GitHub username for action queue, skipping', { githubUsername });
    return { resolved: true, reviewRequests: [], myOpenPRs: [] };
  }

  const octokit = getOctokit();
  const orgFilter = buildOrgFilter(trackedOrgs);

  const reviewQuery = `is:pr is:open review-requested:${githubUsername} ${orgFilter}`.trim();
  const authorQuery = `is:pr is:open author:${githubUsername} ${orgFilter}`.trim();

  const [reviewResult, authorResult]: [GraphQLSearchResponse, GraphQLSearchResponse] = await Promise.all([
    octokit.graphql(PR_SEARCH_QUERY, { searchQuery: reviewQuery }),
    octokit.graphql(PR_SEARCH_QUERY, { searchQuery: authorQuery }),
  ]);

  return {
    resolved: true,
    reviewRequests: mapPRNodes(reviewResult.search.nodes),
    myOpenPRs: mapPRNodes(authorResult.search.nodes),
  };
}

export async function getTrackedOrgs(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ githubOrg: projects.githubOrg })
    .from(projects)
    .where(eq(projects.trackingEnabled, true));

  return rows.map((r) => r.githubOrg);
}

export async function getActionQueue(
  githubUsername: string,
): Promise<ActionQueueData> {
  const cached = cache.get(githubUsername);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const trackedOrgs = await getTrackedOrgs();
  const data = await fetchFromGitHub(githubUsername, trackedOrgs);

  if (cache.size >= MAX_CACHE_SIZE) {
    const oldest = Array.from(cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, 10);
    for (const [key] of oldest) cache.delete(key);
  }

  cache.set(githubUsername, { data, timestamp: Date.now() });
  return data;
}
