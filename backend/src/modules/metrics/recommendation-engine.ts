import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import { createHash } from 'crypto';
import { db } from '../../shared/database/client.js';
import { contributions, projects, maintainerStatus, openOpportunities } from '../../shared/database/schema.js';
import { eq, and, gte, or, sql, desc, inArray, notInArray, isNotNull } from 'drizzle-orm';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LanguageWeight {
  language: string;
  weight: number;
}

interface ContributorProfile {
  teamMemberId: string;
  topLanguages: LanguageWeight[];
  activeRepoKeys: string[];
  contributionMix: { commits: number; prs: number; reviews: number; issues: number };
  totalContributions: number;
  governanceRepos: string[];
  isExperienced: boolean;
  contributedGithubUrls: string[];
}

export interface ScoredRecommendation {
  githubId: string;
  githubNumber: number | null;
  githubUrl: string;
  title: string;
  labels: string[];
  org: string;
  repo: string;
  language: string | null;
  score: number;
  matchLevel: 'strong' | 'good' | 'explore';
  category: 'personalized' | 'exploration' | 'getting-started';
  freshness: string;
  commentsCount: number;
  reactionsCount: number;
  assigneeCount: number;
  aiExplanation?: string;
}

export interface AIInsight {
  githubId: string;
  explanation: string;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_SIZE = 200;
const profileCache = new Map<string, CacheEntry<ContributorProfile>>();
const recommendationCache = new Map<string, CacheEntry<ScoredRecommendation[]>>();
const aiCache = new Map<string, CacheEntry<AIInsight[]>>();

function getFromCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setInCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldest = Array.from(cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, 10);
    for (const [k] of oldest) cache.delete(k);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

export function clearRecommendationCache(teamMemberId: string): void {
  recommendationCache.delete(teamMemberId);
  for (const key of aiCache.keys()) {
    if (key.startsWith(teamMemberId)) aiCache.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Stage A: Contributor Profile
// ---------------------------------------------------------------------------

async function buildContributorProfile(teamMemberId: string): Promise<ContributorProfile> {
  const cached = getFromCache(profileCache, teamMemberId);
  if (cached) return cached;

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const contribRows = await db
    .select({
      projectId: contributions.projectId,
      type: contributions.contributionType,
      count: sql<number>`count(*)::int`,
    })
    .from(contributions)
    .where(and(
      eq(contributions.teamMemberId, teamMemberId),
      gte(contributions.contributionDate, ninetyDaysAgo),
    ))
    .groupBy(contributions.projectId, contributions.contributionType);

  const projectIds = [...new Set(contribRows.map(r => r.projectId).filter(Boolean))] as string[];

  const projectRows = projectIds.length > 0
    ? await db.select({
        id: projects.id,
        githubOrg: projects.githubOrg,
        githubRepo: projects.githubRepo,
        primaryLanguage: projects.primaryLanguage,
      }).from(projects).where(inArray(projects.id, projectIds))
    : [];

  const projectMap = new Map(projectRows.map(p => [p.id, p]));

  const langCounts = new Map<string, number>();
  const repoKeys = new Set<string>();
  const mix = { commits: 0, prs: 0, reviews: 0, issues: 0 };
  let total = 0;

  for (const row of contribRows) {
    const count = Number(row.count);
    total += count;
    switch (row.type) {
      case 'commit': mix.commits += count; break;
      case 'pr': mix.prs += count; break;
      case 'review': mix.reviews += count; break;
      case 'issue': mix.issues += count; break;
    }
    if (row.projectId) {
      const p = projectMap.get(row.projectId);
      if (p) {
        repoKeys.add(`${p.githubOrg}/${p.githubRepo}`);
        if (p.primaryLanguage) {
          langCounts.set(p.primaryLanguage, (langCounts.get(p.primaryLanguage) ?? 0) + count);
        }
      }
    }
  }

  const langTotal = Array.from(langCounts.values()).reduce((s, c) => s + c, 0) || 1;
  const topLanguages = Array.from(langCounts.entries())
    .map(([language, count]) => ({ language, weight: count / langTotal }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  const govRows = await db.select({
    githubOrg: projects.githubOrg,
    githubRepo: projects.githubRepo,
  })
    .from(maintainerStatus)
    .innerJoin(projects, eq(maintainerStatus.projectId, projects.id))
    .where(and(
      eq(maintainerStatus.teamMemberId, teamMemberId),
      eq(maintainerStatus.isActive, true),
    ));

  const governanceRepos = govRows.map(r => `${r.githubOrg}/${r.githubRepo}`);

  const recentUrls = await db.select({ url: contributions.githubUrl })
    .from(contributions)
    .where(and(
      eq(contributions.teamMemberId, teamMemberId),
      gte(contributions.contributionDate, ninetyDaysAgo),
      isNotNull(contributions.githubUrl),
    ))
    .limit(500);

  const contributedGithubUrls = recentUrls
    .map(r => r.url)
    .filter((u): u is string => u !== null);

  const profile: ContributorProfile = {
    teamMemberId,
    topLanguages,
    activeRepoKeys: Array.from(repoKeys),
    contributionMix: mix,
    totalContributions: total,
    governanceRepos,
    isExperienced: total > 50,
    contributedGithubUrls,
  };

  setInCache(profileCache, teamMemberId, profile);
  return profile;
}

// ---------------------------------------------------------------------------
// Stage B: Rule-based Scoring
// ---------------------------------------------------------------------------

function formatFreshness(date: Date | null): string {
  if (!date) return 'unknown';
  const daysAgo = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
  if (daysAgo === 0) return 'today';
  if (daysAgo === 1) return 'yesterday';
  if (daysAgo < 7) return `${daysAgo} days ago`;
  if (daysAgo < 30) return `${Math.floor(daysAgo / 7)} weeks ago`;
  return `${Math.floor(daysAgo / 30)} months ago`;
}

function scoreOpportunity(
  opp: typeof openOpportunities.$inferSelect,
  profile: ContributorProfile,
): number {
  let score = 0;
  const repoKey = `${opp.org}/${opp.repo}`;
  const labels = (opp.labels as string[]) || [];
  const labelSet = new Set(labels.map(l => l.toLowerCase().replace(/\s+/g, '-')));

  // Language match (0-25), weighted by contribution share
  const oppLang = opp.language;
  if (oppLang) {
    const langEntry = profile.topLanguages.find(
      l => l.language.toLowerCase() === oppLang.toLowerCase(),
    );
    if (langEntry) {
      score += Math.round(langEntry.weight * 25);
    }
  }

  // Repo familiarity (0-20)
  if (profile.activeRepoKeys.includes(repoKey)) {
    score += 20;
  }

  // Governance alignment (0-20)
  if (profile.governanceRepos.includes(repoKey)) {
    score += 20;
  }

  // Label signal (0-15)
  if (!profile.isExperienced && (labelSet.has('good-first-issue') || labelSet.has('good first issue'))) {
    score += 15;
  } else if (profile.isExperienced && (labelSet.has('help-wanted') || labelSet.has('help wanted'))) {
    score += 15;
  } else if (labelSet.has('help-wanted') || labelSet.has('help wanted') || labelSet.has('good-first-issue') || labelSet.has('good first issue')) {
    score += 8;
  }

  // Freshness (0-10), continuous decay over 90 days
  if (opp.githubCreatedAt) {
    const ageDays = (Date.now() - opp.githubCreatedAt.getTime()) / (24 * 60 * 60 * 1000);
    score += Math.round(10 * Math.max(0, 1 - ageDays / 90));
  }

  // Engagement sweet spot (0-10)
  const comments = opp.commentsCount ?? 0;
  if (comments >= 1 && comments <= 5) score += 10;
  else if (comments === 0) score += 5;
  else if (comments <= 10) score += 3;
  const reactions = opp.reactionsCount ?? 0;
  if (reactions > 5) score += 3;

  // Availability penalty (-15)
  if ((opp.assigneeCount ?? 0) > 0) {
    score -= 15;
  }

  return Math.max(0, Math.min(100, score));
}

function matchLevel(score: number): 'strong' | 'good' | 'explore' {
  if (score >= 70) return 'strong';
  if (score >= 40) return 'good';
  return 'explore';
}

function toRecommendation(
  opp: typeof openOpportunities.$inferSelect,
  score: number,
  category: ScoredRecommendation['category'],
): ScoredRecommendation {
  return {
    githubId: opp.githubId,
    githubNumber: opp.githubNumber,
    githubUrl: opp.githubUrl,
    title: opp.title,
    labels: (opp.labels as string[]) || [],
    org: opp.org,
    repo: opp.repo,
    language: opp.language,
    score,
    matchLevel: category === 'exploration' ? 'explore' : matchLevel(score),
    category,
    freshness: formatFreshness(opp.githubUpdatedAt),
    commentsCount: opp.commentsCount ?? 0,
    reactionsCount: opp.reactionsCount ?? 0,
    assigneeCount: opp.assigneeCount ?? 0,
  };
}

async function getGettingStartedRecommendations(): Promise<ScoredRecommendation[]> {
  const rows = await db.select()
    .from(openOpportunities)
    .where(eq(openOpportunities.state, 'open'))
    .orderBy(desc(openOpportunities.reactionsCount), desc(openOpportunities.githubUpdatedAt))
    .limit(7);

  return rows.map(r => toRecommendation(r, 50, 'getting-started'));
}

// ---------------------------------------------------------------------------
// Exported: getRecommendations
// ---------------------------------------------------------------------------

export async function getRecommendations(
  teamMemberId: string,
  forceRefresh = false,
): Promise<ScoredRecommendation[]> {
  if (!forceRefresh) {
    const cached = getFromCache(recommendationCache, teamMemberId);
    if (cached) return cached;
  }

  const profile = await buildContributorProfile(teamMemberId);

  if (profile.totalContributions < 10) {
    const recs = await getGettingStartedRecommendations();
    setInCache(recommendationCache, teamMemberId, recs);
    return recs;
  }

  const topLangs = profile.topLanguages.map(l => l.language);
  const activeOrgs = [...new Set(profile.activeRepoKeys.map(k => k.split('/')[0]))];

  const conditions = [eq(openOpportunities.state, 'open')];

  const langFilter = topLangs.length > 0 ? inArray(openOpportunities.language, topLangs) : null;
  const orgFilter = activeOrgs.length > 0 ? inArray(openOpportunities.org, activeOrgs) : null;
  const langOrgFilter = langFilter && orgFilter
    ? or(langFilter, orgFilter)
    : langFilter ?? orgFilter;

  if (langOrgFilter) conditions.push(langOrgFilter);

  const excludeUrls = profile.contributedGithubUrls.slice(0, 200);
  if (excludeUrls.length > 0) {
    conditions.push(notInArray(openOpportunities.githubUrl, excludeUrls));
  }

  const candidates = await db.select()
    .from(openOpportunities)
    .where(and(...conditions))
    .orderBy(desc(openOpportunities.githubUpdatedAt))
    .limit(500);

  const scored = candidates
    .map(opp => ({ opp, score: scoreOpportunity(opp, profile) }))
    .sort((a, b) => b.score - a.score);

  // Deduplicate: max 2 per repo
  const repoCounts = new Map<string, number>();
  const personalized: ScoredRecommendation[] = [];
  for (const { opp, score } of scored) {
    const repoKey = `${opp.org}/${opp.repo}`;
    const count = repoCounts.get(repoKey) ?? 0;
    if (count >= 2) continue;
    repoCounts.set(repoKey, count + 1);
    personalized.push(toRecommendation(opp, score, 'personalized'));
    if (personalized.length >= 5) break;
  }

  // Exploration: issues from repos the contributor hasn't worked on
  const explorationConditions = [eq(openOpportunities.state, 'open')];
  if (activeOrgs.length > 0) {
    explorationConditions.push(notInArray(openOpportunities.org, activeOrgs));
  }
  const explorationRows = await db.select()
    .from(openOpportunities)
    .where(and(...explorationConditions))
    .orderBy(desc(openOpportunities.reactionsCount), desc(openOpportunities.githubUpdatedAt))
    .limit(20);

  const usedGithubIds = new Set(personalized.map(r => r.githubId));
  const exploration: ScoredRecommendation[] = [];
  for (const opp of explorationRows) {
    if (usedGithubIds.has(opp.githubId)) continue;
    exploration.push(toRecommendation(opp, 30, 'exploration'));
    if (exploration.length >= 2) break;
  }

  const results = [...personalized, ...exploration];
  setInCache(recommendationCache, teamMemberId, results);
  return results;
}

// ---------------------------------------------------------------------------
// Stage C: Claude AI Insights
// ---------------------------------------------------------------------------

let vertexClient: AnthropicVertex | null = null;

function getVertexClient(): AnthropicVertex | null {
  if (!config.vertexProjectId) return null;
  if (!vertexClient) {
    vertexClient = new AnthropicVertex({
      projectId: config.vertexProjectId,
      region: config.vertexRegion,
    });
  }
  return vertexClient;
}

function buildAiCacheKey(teamMemberId: string, recommendations: ScoredRecommendation[]): string {
  const ids = recommendations.map(r => r.githubId).sort().join(',');
  const hash = createHash('md5').update(ids).digest('hex').slice(0, 12);
  return `${teamMemberId}:${hash}`;
}

export async function getAIInsights(teamMemberId: string): Promise<AIInsight[] | null> {
  const recommendations = await getRecommendations(teamMemberId);
  if (recommendations.length === 0) return [];

  const cacheKey = buildAiCacheKey(teamMemberId, recommendations);
  const cached = getFromCache(aiCache, cacheKey);
  if (cached) return cached;

  const client = getVertexClient();
  if (!client) {
    logger.warn('Vertex AI not configured, AI insights unavailable');
    return null;
  }

  const profile = await buildContributorProfile(teamMemberId);

  const profileSummary = [
    `Languages: ${profile.topLanguages.map(l => `${l.language} (${Math.round(l.weight * 100)}%)`).join(', ') || 'none'}`,
    `Active repos: ${profile.activeRepoKeys.slice(0, 5).join(', ') || 'none'}`,
    `Contributions (90d): ${profile.totalContributions} (${profile.contributionMix.commits} commits, ${profile.contributionMix.prs} PRs, ${profile.contributionMix.reviews} reviews, ${profile.contributionMix.issues} issues)`,
    `Governance roles: ${profile.governanceRepos.join(', ') || 'none'}`,
    `Experience level: ${profile.isExperienced ? 'experienced' : 'newer contributor'}`,
  ].join('\n');

  const issueDescriptions = recommendations.map((r, i) => {
    return [
      `Issue ${i + 1}: ${r.githubId}`,
      `Title: ${r.title}`,
      `Repo: ${r.org}/${r.repo} (${r.language || 'unknown language'})`,
      `Labels: ${r.labels.join(', ') || 'none'}`,
      `Engagement: ${r.commentsCount} comments, ${r.reactionsCount} reactions`,
      `Category: ${r.category}`,
    ].join('\n');
  }).join('\n\n');

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-haiku@20241022',
      max_tokens: 1024,
      system: 'You are a developer advisor for open source contributors. For each issue, explain in 1-2 concise sentences why it is a good match for this contributor\'s skills and interests. Be specific about the connection between their experience and the issue.',
      messages: [{
        role: 'user',
        content: `## Contributor Profile\n${profileSummary}\n\n## Recommended Issues\n${issueDescriptions}\n\nFor each issue, provide a brief explanation of why it's a good fit for this contributor. Return a JSON array of objects with "githubId" and "explanation" fields.`,
      }],
      tools: [{
        name: 'provide_explanations',
        description: 'Provide personalized explanations for why each issue is a good match for the contributor',
        input_schema: {
          type: 'object' as const,
          properties: {
            explanations: {
              type: 'array' as const,
              items: {
                type: 'object' as const,
                properties: {
                  githubId: { type: 'string' as const, description: 'The issue identifier (e.g. org/repo#123)' },
                  explanation: { type: 'string' as const, description: 'Brief explanation of why this issue is a good match' },
                },
                required: ['githubId', 'explanation'],
              },
            },
          },
          required: ['explanations'],
        },
      }],
      tool_choice: { type: 'tool', name: 'provide_explanations' },
    });

    const toolBlock = response.content.find(b => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      logger.warn('Claude did not return tool use block');
      return null;
    }

    const input = toolBlock.input as { explanations: AIInsight[] };
    const insights = input.explanations || [];

    setInCache(aiCache, cacheKey, insights);
    return insights;
  } catch (error) {
    logger.error('Claude AI insights request failed', {
      error: (error as Error).message,
      teamMemberId,
    });
    return null;
  }
}
