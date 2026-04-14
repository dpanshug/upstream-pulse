import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import {
  GitCommit,
  FolderGit2,
  GitMerge,
  UserX,
  Crown,
  ExternalLink,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  DEFAULT_PERIOD_DAYS,
  PeriodSelector,
} from '../components/dashboard';
import type { TrendMetric } from '../components/dashboard/types';
import { PageError } from '../components/common/PageError';
import { StatCardSkeleton, Skeleton } from '../components/common/Skeleton';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { StreakBadge } from '../components/profile/StreakBadge';
import { ContributionHeatmap } from '../components/profile/ContributionHeatmap';
import { ActionQueue, ActionQueueSkeleton } from '../components/profile/ActionQueue';
import { RecentActivityFeed } from '../components/profile/RecentActivityFeed';
import { DiscoverTab, DiscoverTabSkeleton } from '../components/profile/DiscoverTab';
import type { ScoredRecommendation, AIInsight } from '../components/profile/DiscoverTab';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DailyActivity {
  date: string;
  commits: number;
  prs: number;
  reviews: number;
  issues: number;
  total: number;
}

interface ProjectContributions {
  id: string;
  name: string;
  githubOrg: string;
  githubRepo: string;
  commits: number;
  prs: number;
  reviews: number;
  issues: number;
  total: number;
}

interface MaintainerRole {
  projectName: string;
  githubOrg: string;
  positionType: string;
  positionTitle: string;
  scope: string;
}

interface LeadershipRole {
  communityOrg: string;
  positionType: string;
  committeeName: string;
  roleTitle: string;
  votingRights: boolean;
}

interface RecentActivityItem {
  type: string;
  date: string;
  githubUrl: string;
  projectName: string;
  githubOrg: string;
  githubRepo: string;
  title: string | null;
}

interface StreakData {
  current: number;
  longest: number;
  todayActive: boolean;
}

interface HeatmapEntry {
  date: string;
  total: number;
}

interface PRItem {
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

interface ActionQueueData {
  resolved: true;
  reviewRequests: PRItem[];
  myOpenPRs: PRItem[];
}

interface MyContributionsResolved {
  resolved: true;
  profile: {
    id: string;
    name: string;
    githubUsername: string | null;
    avatarUrl: string | null;
    memberSince: string | null;
  };
  summary: {
    periodDays: number;
    periodStart: string;
    periodEnd: string;
    totalContributions: number;
    activeProjects: number;
    teamSharePercent: number;
    teamRank: number;
    teamSize: number;
  };
  contributions: {
    commits: number;
    pullRequests: number;
    reviews: number;
    issues: number;
    total: number;
  };
  trend: TrendMetric;
  dailyActivity: DailyActivity[];
  projects: ProjectContributions[];
  roles: {
    maintainer: MaintainerRole[];
    leadership: LeadershipRole[];
  };
  recentActivity: RecentActivityItem[];
  mergeRate: { mergeRate: number; prsMerged: number; prsTotal: number };
  streak: StreakData;
  heatmap: HeatmapEntry[];
}

interface MyContributionsUnresolved {
  resolved: false;
  username: string;
  email: string;
}

type MyContributionsData = MyContributionsResolved | MyContributionsUnresolved;

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchMyContributions(days: number, heatmapYear?: number | null): Promise<MyContributionsData> {
  const params = new URLSearchParams({ days: String(days) });
  if (heatmapYear) params.set('heatmapYear', String(heatmapYear));
  const res = await apiFetch(`/api/metrics/me?${params}`);
  if (!res.ok) throw new Error('Failed to fetch personal metrics');
  return res.json();
}

async function fetchActionQueue(): Promise<ActionQueueData | null> {
  const res = await apiFetch('/api/metrics/me/action-queue');
  if (!res.ok) throw new Error('Failed to fetch action queue');
  const data = await res.json();
  if (!data.resolved) return null;
  return data;
}

async function fetchRecommendations(refresh = false): Promise<ScoredRecommendation[]> {
  const params = refresh ? '?refresh=true' : '';
  const res = await apiFetch(`/api/metrics/me/recommendations${params}`);
  if (!res.ok) throw new Error('Failed to fetch recommendations');
  const data = await res.json();
  if (!data.resolved) return [];
  return data.recommendations;
}

async function fetchAIInsights(): Promise<AIInsight[]> {
  const res = await apiFetch('/api/metrics/me/recommendations/ai', { method: 'POST' });
  if (!res.ok) throw new Error('AI insights unavailable');
  const data = await res.json();
  if (!data.resolved) throw new Error('AI insights unavailable');
  return data.insights;
}

// ---------------------------------------------------------------------------
// Sub-components (kept from original page)
// ---------------------------------------------------------------------------

function UnlinkedState({ username, email }: { username: string; email: string }) {
  return (
    <div className="bg-gray-50 min-h-[60vh] flex items-center justify-center">
      <div className="max-w-md mx-auto text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-5">
          <UserX className="w-8 h-8 text-gray-400" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Account not linked
        </h2>
        <p className="text-sm text-gray-500 mb-4 leading-relaxed">
          We couldn&apos;t match your login to a team member profile. Your personal
          contribution dashboard will appear once your account is linked.
        </p>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-left text-sm">
          <p className="text-gray-500 mb-1">Signed in as</p>
          <p className="font-medium text-gray-900">{username}</p>
          {email && <p className="text-gray-500 mt-0.5">{email}</p>}
        </div>
        <p className="text-xs text-gray-400 mt-4">
          Ask your admin to add your email or GitHub username to the team roster.
        </p>
      </div>
    </div>
  );
}

function ActivityChart({ data }: { data: DailyActivity[] }) {
  if (data.length === 0) return null;

  const hasActivity = data.some((d) => d.total > 0);
  if (!hasActivity) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-gray-400">
        No activity in this period
      </div>
    );
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="myCommits" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="myPrs" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="myReviews" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="myIssues" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(d: string) =>
              new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload as DailyActivity;
              return (
                <div className="bg-gray-900 text-white text-[11px] px-3 py-2 rounded-lg shadow-lg">
                  <p className="text-gray-400 mb-1.5">
                    {new Date(d.date).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                  {d.commits > 0 && (
                    <p>
                      <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1.5" />
                      Commits: <span className="font-semibold">{d.commits}</span>
                    </p>
                  )}
                  {d.prs > 0 && (
                    <p>
                      <span className="inline-block w-2 h-2 rounded-full bg-purple-500 mr-1.5" />
                      PRs: <span className="font-semibold">{d.prs}</span>
                    </p>
                  )}
                  {d.reviews > 0 && (
                    <p>
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
                      Reviews: <span className="font-semibold">{d.reviews}</span>
                    </p>
                  )}
                  {d.issues > 0 && (
                    <p>
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5" />
                      Issues: <span className="font-semibold">{d.issues}</span>
                    </p>
                  )}
                  <p className="mt-1 pt-1 border-t border-gray-700 font-semibold">
                    Total: {d.total}
                  </p>
                </div>
              );
            }}
            cursor={{ stroke: '#d1d5db', strokeWidth: 1 }}
          />
          <Area type="monotone" dataKey="issues" stackId="1" stroke="#f59e0b" strokeWidth={1.5} fill="url(#myIssues)" isAnimationActive={false} />
          <Area type="monotone" dataKey="reviews" stackId="1" stroke="#10b981" strokeWidth={1.5} fill="url(#myReviews)" isAnimationActive={false} />
          <Area type="monotone" dataKey="prs" stackId="1" stroke="#8b5cf6" strokeWidth={1.5} fill="url(#myPrs)" isAnimationActive={false} />
          <Area type="monotone" dataKey="commits" stackId="1" stroke="#3b82f6" strokeWidth={1.5} fill="url(#myCommits)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const PROJECTS_LIMIT = 5;

function ProjectsTable({ projects }: { projects: ProjectContributions[] }) {
  const [expanded, setExpanded] = useState(false);

  if (projects.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-6 text-center">
        No project contributions in this period
      </p>
    );
  }

  const visible = expanded ? projects : projects.slice(0, PROJECTS_LIMIT);
  const hasMore = projects.length > PROJECTS_LIMIT;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Project</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Commits</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">PRs</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Reviews</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Issues</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="py-3 px-4">
                  <Link to={`/projects/${p.id}`} className="font-medium text-gray-900 hover:text-blue-600 transition-colors">
                    {p.name}
                  </Link>
                  <p className="text-xs text-gray-400 mt-0.5">{p.githubOrg}/{p.githubRepo}</p>
                </td>
                <td className="text-right py-3 px-4 tabular-nums text-gray-700">{p.commits}</td>
                <td className="text-right py-3 px-4 tabular-nums text-gray-700">{p.prs}</td>
                <td className="text-right py-3 px-4 tabular-nums text-gray-700">{p.reviews}</td>
                <td className="text-right py-3 px-4 tabular-nums text-gray-700">{p.issues}</td>
                <td className="text-right py-3 px-4 tabular-nums font-semibold text-gray-900">{p.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-center py-3 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
        >
          {expanded ? 'Show less' : `Show all ${projects.length} projects`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roles section (kept from original page)
// ---------------------------------------------------------------------------

const ACRONYMS = new Set(['wg', 'tsc', 'sig', 'cd', 'ci', 'ai', 'ml', 'api']);
const KNOWN_NAMES: Record<string, string> = {
  kserve: 'KServe', kubeflow: 'Kubeflow', kubernetes: 'Kubernetes',
  'kubernetes-sigs': 'Kubernetes SIGs', argoproj: 'Argoproj',
  istio: 'Istio', knative: 'Knative', 'vllm-project': 'vLLM',
};

function prettifyName(raw: string): string {
  if (KNOWN_NAMES[raw]) return KNOWN_NAMES[raw];
  return raw.replace(/[-_]/g, ' ').split(' ')
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function formatRoleTitle(raw: string): string {
  return raw.replace(' - ', ' \u2014 ').replace(/[-_]/g, ' ').split(' ')
    .map((w) => (w === '\u2014' ? w : ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

const PRESTIGE_ORDER: Record<string, number> = {
  steering_committee: 1, tsc_member: 2, project_lead: 3,
  wg_chair: 4, wg_tech_lead: 5, lead: 6, sig_chair: 7, sig_tech_lead: 8,
};

function getPrestige(positionType: string): number {
  return PRESTIGE_ORDER[positionType] ?? 20;
}

interface UnifiedRole {
  title: string;
  org: string;
  scope: string | null;
  prestige: number;
  voting: boolean;
  category: 'leadership' | 'governance';
}

function buildUnifiedRoles(maintainer: MaintainerRole[], leadership: LeadershipRole[]): Map<string, UnifiedRole[]> {
  const byOrg = new Map<string, UnifiedRole[]>();

  for (const r of leadership) {
    const org = r.communityOrg || 'Other';
    if (!byOrg.has(org)) byOrg.set(org, []);
    byOrg.get(org)!.push({
      title: formatRoleTitle(r.roleTitle),
      org,
      scope: r.committeeName || null,
      prestige: getPrestige(r.positionType),
      voting: r.votingRights,
      category: 'leadership',
    });
  }

  const leadershipTypesByOrg = new Set(leadership.map((l) => `${l.communityOrg}::${l.positionType}`));
  for (const r of maintainer) {
    if (leadershipTypesByOrg.has(`${r.githubOrg}::${r.positionType}`)) continue;
    const org = r.githubOrg;
    if (!byOrg.has(org)) byOrg.set(org, []);
    byOrg.get(org)!.push({
      title: prettifyName(r.positionTitle),
      org,
      scope: r.projectName,
      prestige: getPrestige(r.positionType) + 10,
      voting: false,
      category: 'governance',
    });
  }

  for (const roles of byOrg.values()) {
    roles.sort((a, b) => a.prestige - b.prestige);
  }

  const sorted = Array.from(byOrg.entries()).sort(([, a], [, b]) => {
    const aMin = Math.min(...a.map((r) => r.prestige));
    const bMin = Math.min(...b.map((r) => r.prestige));
    return aMin - bMin;
  });

  return new Map(sorted);
}

function RolePill({ role }: { role: UnifiedRole }) {
  const isLeadership = role.category === 'leadership';
  const isTop = role.prestige <= 3;

  return (
    <div className={`flex items-center gap-3 py-3 ${isLeadership ? '' : ''}`}>
      <div className={`w-1 self-stretch rounded-full shrink-0 ${
        isTop ? 'bg-amber-400' : isLeadership ? 'bg-amber-200' : 'bg-blue-200'
      }`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-semibold ${isTop ? 'text-gray-900' : 'text-gray-800'}`}>
            {role.title}
          </span>
          {isLeadership && (
            <Crown className={`w-3.5 h-3.5 shrink-0 ${isTop ? 'text-amber-400' : 'text-amber-300'}`} />
          )}
        </div>
        {role.scope && (
          <p className="text-xs text-gray-500 mt-0.5">{role.scope}</p>
        )}
      </div>
    </div>
  );
}

function RolesSection({ maintainer, leadership }: { maintainer: MaintainerRole[]; leadership: LeadershipRole[] }) {
  if (maintainer.length === 0 && leadership.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
        <Crown className="w-8 h-8 text-gray-200 mx-auto mb-3" />
        <p className="text-sm text-gray-500">No leadership or governance roles yet</p>
        <p className="text-xs text-gray-400 mt-1">Roles will appear here as you gain maintainer or leadership positions in upstream projects</p>
      </div>
    );
  }

  const rolesByOrg = buildUnifiedRoles(maintainer, leadership);
  const totalRoles = Array.from(rolesByOrg.values()).reduce((s, r) => s + r.length, 0);

  return (
    <div>
      {/* Summary strip */}
      <div className="flex items-center gap-4 mb-5 text-xs text-gray-500">
        <span><span className="font-semibold text-gray-700">{totalRoles}</span> {totalRoles === 1 ? 'role' : 'roles'} across <span className="font-semibold text-gray-700">{rolesByOrg.size}</span> {rolesByOrg.size === 1 ? 'organization' : 'organizations'}</span>
      </div>

      {/* Org groups */}
      <div className="space-y-4">
        {Array.from(rolesByOrg.entries()).map(([org, roles]) => (
          <div key={org} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{prettifyName(org)}</h3>
              <span className="text-[11px] text-gray-400">{roles.length} {roles.length === 1 ? 'role' : 'roles'}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {roles.map((role, i) => (
                <RolePill key={`${role.title}-${role.scope}-${i}`} role={role} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type TabId = 'overview' | 'activity' | 'governance' | 'discover';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'governance', label: 'Governance' },
  { id: 'discover', label: 'Discover' },
];

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function MyContributions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [heatmapYear, setHeatmapYear] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { user } = useAuth();

  const daysParam = searchParams.get('days');
  const selectedDays = daysParam !== null ? parseInt(daysParam, 10) : DEFAULT_PERIOD_DAYS;
  const activeTab = (searchParams.get('tab') as TabId) || 'overview';

  const switchTab = (tab: TabId) => {
    setSelectedDate(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  };

  const handlePeriodChange = (days: number) => {
    setSelectedDate(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('days', days.toString());
      return next;
    });
  };

  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } = useQuery({
    queryKey: ['my-contributions', selectedDays, heatmapYear],
    queryFn: () => fetchMyContributions(selectedDays, heatmapYear),
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });

  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ['my-action-queue'],
    queryFn: fetchActionQueue,
    refetchInterval: 120_000,
    retry: 3,
  });

  const recFetchedAt = useRef<Date | null>(null);
  const { data: recData, isLoading: recLoading, refetch: refetchRecs } = useQuery({
    queryKey: ['my-recommendations'],
    queryFn: async () => {
      const recs = await fetchRecommendations();
      recFetchedAt.current = new Date();
      return recs;
    },
    enabled: activeTab === 'discover',
    refetchInterval: 300_000,
    retry: 2,
  });

  const aiMutation = useMutation({
    mutationFn: fetchAIInsights,
  });

  if (error) {
    return (
      <PageError
        title="Error Loading My Contributions"
        message={(error as Error).message}
        hint="Make sure the backend server is running"
        onRetry={() => refetch()}
      />
    );
  }

  if (!isLoading && data && !data.resolved) {
    const unresolved = data as MyContributionsUnresolved;
    return (
      <UnlinkedState
        username={unresolved.username || user?.username || 'unknown'}
        email={unresolved.email || user?.email || ''}
      />
    );
  }

  const resolved = data as MyContributionsResolved | undefined;
  const isRefetching = isFetching && !isLoading;

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Profile header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            {isLoading ? (
              <Skeleton className="w-12 h-12 rounded-full" />
            ) : resolved?.profile.avatarUrl ? (
              <img
                src={resolved.profile.avatarUrl}
                alt={resolved.profile.name}
                className="w-12 h-12 rounded-full border-2 border-white shadow-sm"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                <span className="text-lg font-bold text-gray-500">{resolved?.profile.name?.charAt(0) ?? '?'}</span>
              </div>
            )}
            <div>
              {isLoading ? (
                <>
                  <Skeleton className="h-6 w-36 mb-1" />
                  <Skeleton className="h-4 w-24" />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2.5">
                    <h1 className="text-xl font-bold text-gray-900">{resolved?.profile.name}</h1>
                    {resolved?.streak && (
                      <StreakBadge current={resolved.streak.current} longest={resolved.streak.longest} todayActive={resolved.streak.todayActive} />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {resolved?.profile.githubUsername && (
                      <a
                        href={`https://github.com/${resolved.profile.githubUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-500 hover:text-blue-600 transition-colors flex items-center gap-1"
                      >
                        @{resolved.profile.githubUsername}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {resolved?.profile.memberSince && (
                      <span className="text-sm text-gray-400">Member since {resolved.profile.memberSince}</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="mb-6 border-b border-gray-200" role="tablist" aria-label="Profile sections">
          <div className="flex gap-6">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`tabpanel-${tab.id}`}
                onClick={() => switchTab(tab.id)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className={`transition-opacity duration-200 ${isPlaceholderData ? 'opacity-60' : ''}`}>
          {activeTab === 'overview' && (
            <div id="tabpanel-overview" role="tabpanel" aria-labelledby="tab-overview">
              {/* Action queue */}
              <section className="mb-6">
                {queueLoading ? (
                  <ActionQueueSkeleton />
                ) : queueData ? (
                  <ActionQueue reviewRequests={queueData.reviewRequests} myOpenPRs={queueData.myOpenPRs} />
                ) : null}
              </section>

              {/* Period selector */}
              <div className="flex justify-end mb-4">
                <PeriodSelector
                  selectedDays={selectedDays}
                  onSelect={handlePeriodChange}
                  isLoading={isRefetching}
                />
              </div>

              {/* Pulse strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {isLoading ? (
                  <>
                    <StatCardSkeleton />
                    <StatCardSkeleton />
                    <StatCardSkeleton />
                    <StatCardSkeleton />
                  </>
                ) : resolved ? (
                  <>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 relative overflow-hidden">
                      <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full bg-blue-50/80" />
                      <GitCommit className="w-5 h-5 text-blue-500 mb-3 relative z-10" />
                      <p className="text-2xl font-bold text-gray-900 tabular-nums">{resolved.summary.totalContributions.toLocaleString()}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500">Contributions</span>
                        {resolved.trend.direction !== 'flat' && (
                          <span className={`text-[11px] font-semibold ${resolved.trend.direction === 'up' ? 'text-green-600' : 'text-red-500'}`}>
                            {resolved.trend.direction === 'up' ? '+' : ''}{resolved.trend.changePercent}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 relative overflow-hidden">
                      <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full bg-purple-50/80" />
                      <FolderGit2 className="w-5 h-5 text-purple-500 mb-3 relative z-10" />
                      <p className="text-2xl font-bold text-gray-900 tabular-nums">{resolved.summary.activeProjects}</p>
                      <span className="text-xs text-gray-500 mt-1">Active Projects</span>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 relative overflow-hidden">
                      <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full bg-green-50/80" />
                      <GitMerge className="w-5 h-5 text-green-500 mb-3 relative z-10" />
                      <p className="text-2xl font-bold text-gray-900 tabular-nums">{resolved.mergeRate?.prsMerged.toLocaleString() ?? '—'}</p>
                      <span className="text-xs text-gray-500 mt-1">PRs Merged</span>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 relative overflow-hidden">
                      <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full bg-amber-50/80" />
                      <GitMerge className="w-5 h-5 text-amber-500 mb-3 relative z-10" />
                      <p className="text-2xl font-bold text-gray-900 tabular-nums">{resolved.mergeRate ? `${resolved.mergeRate.mergeRate}%` : '—'}</p>
                      <span className="text-xs text-gray-500 mt-1">Merge Rate</span>
                    </div>
                  </>
                ) : null}
              </div>

              {/* Activity over time */}
              <section className="mb-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-gray-900">Activity Over Time</h2>
                    <div className="flex items-center gap-4 text-[11px] text-gray-400">
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" />Commits</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" />PRs</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />Reviews</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />Issues</span>
                    </div>
                  </div>
                  {isLoading ? (
                    <Skeleton className="h-56 w-full rounded-lg" />
                  ) : resolved ? (
                    <ActivityChart data={resolved.dailyActivity} />
                  ) : null}
                </div>
              </section>

              {/* Top projects compact bar */}
              {!isLoading && resolved && resolved.projects.length > 0 && (
                <section className="mb-6">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h2 className="text-sm font-semibold text-gray-900 mb-4">Top Projects</h2>
                    <div className="space-y-2.5">
                      {resolved.projects.slice(0, 5).map((p) => {
                        const maxTotal = resolved.projects[0].total;
                        const pct = maxTotal > 0 ? (p.total / maxTotal) * 100 : 0;
                        return (
                          <div key={p.id} className="flex items-center gap-3">
                            <Link to={`/projects/${p.id}`} className="text-sm text-gray-700 hover:text-blue-600 transition-colors w-36 truncate shrink-0 font-medium">
                              {p.name}
                            </Link>
                            <div className="flex-1 h-5 bg-gray-50 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-100 rounded-full flex items-center pl-2"
                                style={{ width: `${Math.max(pct, 8)}%` }}
                              >
                                <span className="text-[11px] font-semibold text-blue-700 tabular-nums">{p.total}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              )}

            </div>
          )}

          {activeTab === 'activity' && (
            <div id="tabpanel-activity" role="tabpanel" aria-labelledby="tab-activity">
              {/* Contribution heatmap */}
              {isLoading ? (
                <Skeleton className="h-52 w-full rounded-xl mb-6" />
              ) : resolved?.heatmap ? (
                <div className="mb-6">
                  <ContributionHeatmap
                    data={resolved.heatmap}
                    streak={{ current: resolved.streak.current, longest: resolved.streak.longest }}
                    onYearChange={setHeatmapYear}
                    onDateSelect={setSelectedDate}
                    selectedDate={selectedDate}
                    memberSince={resolved.profile.memberSince}
                  />
                </div>
              ) : null}

              {/* Recent activity (full width) */}
              {isLoading ? (
                <div className="mb-8"><Skeleton className="h-80 w-full rounded-xl" /></div>
              ) : resolved ? (
                <div className="mb-8">
                  <RecentActivityFeed
                    items={resolved.recentActivity}
                    dateFilter={selectedDate}
                    onClearDateFilter={() => setSelectedDate(null)}
                  />
                </div>
              ) : null}

              {/* My projects */}
              <section className="mb-8">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">My Projects</h2>
                  {isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }, (_, i) => (
                        <Skeleton key={i} className="h-12 w-full rounded" />
                      ))}
                    </div>
                  ) : resolved ? (
                    <ProjectsTable projects={resolved.projects} />
                  ) : null}
                </div>
              </section>

            </div>
          )}

          {activeTab === 'governance' && (
            <div id="tabpanel-governance" role="tabpanel" aria-labelledby="tab-governance">
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-24 w-full rounded-xl" />
                  <Skeleton className="h-24 w-full rounded-xl" />
                </div>
              ) : resolved ? (
                <RolesSection
                  maintainer={resolved.roles.maintainer}
                  leadership={resolved.roles.leadership}
                />
              ) : null}
            </div>
          )}

          {activeTab === 'discover' && (
            <div id="tabpanel-discover" role="tabpanel" aria-labelledby="tab-discover">
              {recLoading ? (
                <DiscoverTabSkeleton />
              ) : (
                <DiscoverTab
                  recommendations={recData ?? []}
                  isLoading={recLoading}
                  aiInsights={aiMutation.data ?? null}
                  isAiLoading={aiMutation.isPending}
                  aiError={aiMutation.isError}
                  onRequestAI={() => aiMutation.mutate()}
                  onRefresh={async () => {
                    recFetchedAt.current = new Date();
                    await refetchRecs();
                  }}
                  lastUpdated={recFetchedAt.current}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
