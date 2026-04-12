import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import {
  GitCommit,
  GitPullRequest,
  MessageSquare,
  AlertCircle,
  FolderGit2,
  BarChart3,
  Star,
  Calendar,
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
  StatCard,
  PeriodSelector,
} from '../components/dashboard';
import type { TrendMetric } from '../components/dashboard/types';
import { PageError } from '../components/common/PageError';
import { StatCardSkeleton, Skeleton } from '../components/common/Skeleton';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';

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
}

interface MyContributionsUnresolved {
  resolved: false;
  username: string;
  email: string;
}

type MyContributionsData = MyContributionsResolved | MyContributionsUnresolved;

async function fetchMyContributions(days: number): Promise<MyContributionsData> {
  const res = await apiFetch(`/api/metrics/me?days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch personal metrics');
  return res.json();
}

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
          We couldn't match your login to a team member profile. Your personal
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

interface BreakdownCardProps {
  title: string;
  count: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

function BreakdownCard({ title, count, icon: Icon, color, bgColor }: BreakdownCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-2 rounded-lg ${bgColor}`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <span className="text-sm font-medium text-gray-600">{title}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">
        {count.toLocaleString()}
      </p>
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
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Project
              </th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Commits
              </th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                PRs
              </th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Reviews
              </th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Issues
              </th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr
                key={p.id}
                className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
              >
                <td className="py-3 px-4">
                  <Link
                    to={`/projects/${p.id}`}
                    className="font-medium text-gray-900 hover:text-blue-600 transition-colors"
                  >
                    {p.name}
                  </Link>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {p.githubOrg}/{p.githubRepo}
                  </p>
                </td>
                <td className="text-right py-3 px-4 tabular-nums text-gray-700">{p.commits}</td>
                <td className="text-right py-3 px-4 tabular-nums text-gray-700">{p.prs}</td>
                <td className="text-right py-3 px-4 tabular-nums text-gray-700">{p.reviews}</td>
                <td className="text-right py-3 px-4 tabular-nums text-gray-700">{p.issues}</td>
                <td className="text-right py-3 px-4 tabular-nums font-semibold text-gray-900">
                  {p.total}
                </td>
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
          {expanded
            ? 'Show less'
            : `Show all ${projects.length} projects`}
        </button>
      )}
    </div>
  );
}

const ACRONYMS = new Set(['wg', 'tsc', 'sig', 'cd', 'ci', 'ai', 'ml', 'api']);
const KNOWN_NAMES: Record<string, string> = {
  kserve: 'KServe',
  kubeflow: 'Kubeflow',
  kubernetes: 'Kubernetes',
  'kubernetes-sigs': 'Kubernetes SIGs',
  argoproj: 'Argoproj',
  istio: 'Istio',
  knative: 'Knative',
  'vllm-project': 'vLLM',
};

function prettifyName(raw: string): string {
  if (KNOWN_NAMES[raw]) return KNOWN_NAMES[raw];
  return raw
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function formatRoleTitle(raw: string): string {
  const cleaned = raw.replace(' - ', ' \u2014 ');
  return cleaned
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map((w) => {
      if (w === '\u2014') return w;
      return ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

const PRESTIGE_ORDER: Record<string, number> = {
  steering_committee: 1,
  tsc_member: 2,
  project_lead: 3,
  wg_chair: 4,
  wg_tech_lead: 5,
  lead: 6,
  sig_chair: 7,
  sig_tech_lead: 8,
};

function getPrestige(positionType: string): number {
  return PRESTIGE_ORDER[positionType] ?? 20;
}

interface GovernanceSummaryGroup {
  title: string;
  positionType: string;
  byOrg: Map<string, string[]>;
}

function buildGovernanceSummary(
  maintainer: MaintainerRole[],
  leadershipTitles: Set<string>,
): GovernanceSummaryGroup[] {
  const typeMap = new Map<string, GovernanceSummaryGroup>();

  for (const r of maintainer) {
    const key = r.positionTitle.toLowerCase();
    if (leadershipTitles.has(key)) continue;

    if (!typeMap.has(r.positionTitle)) {
      typeMap.set(r.positionTitle, {
        title: prettifyName(r.positionTitle),
        positionType: r.positionType,
        byOrg: new Map(),
      });
    }
    const group = typeMap.get(r.positionTitle)!;
    if (!group.byOrg.has(r.githubOrg)) {
      group.byOrg.set(r.githubOrg, []);
    }
    group.byOrg.get(r.githubOrg)!.push(r.projectName);
  }

  return Array.from(typeMap.values()).sort((a, b) => {
    const aTotal = Array.from(a.byOrg.values()).reduce((s, p) => s + p.length, 0);
    const bTotal = Array.from(b.byOrg.values()).reduce((s, p) => s + p.length, 0);
    return bTotal - aTotal;
  });
}

function RolesSection({
  maintainer,
  leadership,
}: {
  maintainer: MaintainerRole[];
  leadership: LeadershipRole[];
}) {
  if (maintainer.length === 0 && leadership.length === 0) return null;

  const sortedLeadership = [...leadership].sort(
    (a, b) => getPrestige(a.positionType) - getPrestige(b.positionType),
  );

  const leadershipTypesByOrg = new Set(
    leadership.map((l) => `${l.communityOrg}::${l.positionType}`),
  );
  const leadershipTitles = new Set(
    maintainer
      .filter((m) => leadershipTypesByOrg.has(`${m.githubOrg}::${m.positionType}`))
      .map((m) => m.positionTitle.toLowerCase()),
  );

  const governanceGroups = buildGovernanceSummary(maintainer, leadershipTitles);

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Community Standing
      </h2>

      {/* Leadership highlight cards */}
      {sortedLeadership.length > 0 && (
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${sortedLeadership.length >= 4 ? 'lg:grid-cols-4' : sortedLeadership.length === 3 ? 'lg:grid-cols-3' : ''} gap-3 ${governanceGroups.length > 0 ? 'mb-4' : ''}`}>
          {sortedLeadership.map((r, i) => {
            const isTop = getPrestige(r.positionType) <= 3;
            return (
              <div
                key={i}
                className={`relative overflow-hidden rounded-xl p-4 ${
                  isTop
                    ? 'border border-amber-200 bg-gradient-to-br from-amber-50 via-amber-50/50 to-orange-50/60'
                    : 'border border-amber-100/80 bg-gradient-to-br from-amber-50/40 via-white to-orange-50/20'
                }`}
              >
                <div className="absolute top-3 right-3">
                  <Crown className={`w-5 h-5 ${isTop ? 'text-amber-400/50' : 'text-amber-300/40'}`} />
                </div>
                <p className="text-sm font-bold text-gray-900 pr-6">
                  {formatRoleTitle(r.roleTitle)}
                </p>
                {r.committeeName && (
                  <p className="text-xs text-gray-500 mt-1">{r.committeeName}</p>
                )}
                <div className="flex items-center gap-2 mt-2.5">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    isTop
                      ? 'text-amber-800 bg-amber-200/70'
                      : 'text-amber-700 bg-amber-100/70'
                  }`}>
                    {prettifyName(r.communityOrg)}
                  </span>
                  {r.votingRights && (
                    <span className="text-[10px] font-bold text-amber-900 bg-amber-300/50 px-1.5 py-0.5 rounded-full tracking-wide">
                      VOTING
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Governance - role cards with project lists */}
      {governanceGroups.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {governanceGroups.map((group, i) => {
            const orgs = Array.from(group.byOrg.entries());
            const projectCount = orgs.reduce((s, [, p]) => s + p.length, 0);
            return (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      group.positionType === 'reviewer'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    }`}
                  >
                    {group.title}
                  </span>
                  <span className="text-xs text-gray-400">
                    {projectCount} {projectCount === 1 ? 'project' : 'projects'}
                  </span>
                </div>
                <div className="space-y-3">
                  {orgs.map(([org, projects]) => (
                    <div key={org}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                        {prettifyName(org)}
                      </p>
                      <div className="space-y-0.5">
                        {projects.map((p, j) => (
                          <p key={j} className="text-sm text-gray-700 leading-relaxed pl-2 border-l-2 border-gray-100">
                            {p}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function MyContributions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const daysParam = searchParams.get('days');
  const selectedDays =
    daysParam !== null ? parseInt(daysParam, 10) : DEFAULT_PERIOD_DAYS;

  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } = useQuery({
    queryKey: ['my-contributions', selectedDays],
    queryFn: () => fetchMyContributions(selectedDays),
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });

  const handlePeriodChange = (days: number) => {
    setSearchParams({ days: days.toString() });
  };

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

  const topProject = resolved?.projects?.[0];
  const topType = resolved ? (() => {
    const { commits, pullRequests, reviews, issues, total } = resolved.contributions;
    const types = [
      { label: 'Commits', count: commits },
      { label: 'Pull Requests', count: pullRequests },
      { label: 'Code Reviews', count: reviews },
      { label: 'Issues', count: issues },
    ];
    const best = types.reduce((a, b) => (b.count > a.count ? b : a));
    const pct = total > 0 ? ((best.count / total) * 100).toFixed(0) : '0';
    return { label: best.label, count: best.count, pct };
  })() : null;

  return (
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Profile header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            {isLoading ? (
              <Skeleton className="w-14 h-14 rounded-full" />
            ) : resolved?.profile.avatarUrl ? (
              <img
                src={resolved.profile.avatarUrl}
                alt={resolved.profile.name}
                className="w-14 h-14 rounded-full border-2 border-white shadow-sm"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center">
                <span className="text-xl font-bold text-gray-500">
                  {resolved?.profile.name?.charAt(0) ?? '?'}
                </span>
              </div>
            )}
            <div>
              {isLoading ? (
                <>
                  <Skeleton className="h-6 w-40 mb-1" />
                  <Skeleton className="h-4 w-28" />
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {resolved?.profile.name}
                  </h1>
                  <p className="text-sm text-gray-500 mt-0.5">My open source contributions</p>
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
                      <span className="text-sm text-gray-400">
                        Member since {resolved.profile.memberSince}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <PeriodSelector
              selectedDays={selectedDays}
              onSelect={handlePeriodChange}
              isLoading={isRefetching}
            />
            {resolved && (
              <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
                <Calendar className="w-3.5 h-3.5" />
                <span>
                  {resolved.summary.periodStart === 'All time'
                    ? 'All time'
                    : `${resolved.summary.periodStart} – ${resolved.summary.periodEnd}`}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className={`transition-opacity duration-300 ${isPlaceholderData ? 'opacity-60' : ''}`}>
          {/* Summary stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {isLoading ? (
              <>
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
              </>
            ) : resolved ? (
              <>
                <StatCard
                  label="My Contributions"
                  value={resolved.summary.totalContributions.toLocaleString()}
                  trend={resolved.trend}
                  icon={GitCommit}
                />
                <StatCard
                  label="Active Projects"
                  value={resolved.summary.activeProjects}
                  icon={FolderGit2}
                />
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-gray-50 rounded-lg">
                      <Star className="w-4 h-4 text-gray-600" />
                    </div>
                    <span className="text-sm font-medium text-gray-600">Most Active In</span>
                  </div>
                  {topProject ? (
                    <>
                      <p className="text-lg font-bold text-gray-900 truncate" title={topProject.name}>
                        {topProject.name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {topProject.total.toLocaleString()} contributions
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400">No activity</p>
                  )}
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-gray-50 rounded-lg">
                      <BarChart3 className="w-4 h-4 text-gray-600" />
                    </div>
                    <span className="text-sm font-medium text-gray-600">Top Type</span>
                  </div>
                  {topType && topType.count > 0 ? (
                    <>
                      <p className="text-lg font-bold text-gray-900 truncate" title={topType.label}>
                        {topType.label}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {topType.count.toLocaleString()} ({topType.pct}% of total)
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400">No activity</p>
                  )}
                </div>
              </>
            ) : null}
          </div>

          {/* Activity over time */}
          <section className="mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Activity Over Time
                </h2>
                <div className="flex items-center gap-4 text-[11px] text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    Commits
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                    PRs
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    Reviews
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    Issues
                  </span>
                </div>
              </div>
              {isLoading ? (
                <Skeleton className="h-56 w-full rounded-lg" />
              ) : resolved ? (
                <ActivityChart data={resolved.dailyActivity} />
              ) : null}
            </div>
          </section>

          {/* Contribution breakdown */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Contribution Breakdown
              </h2>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {isLoading ? (
                <>
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                </>
              ) : resolved ? (
                <>
                  <BreakdownCard
                    title="Commits"
                    count={resolved.contributions.commits}
                    icon={GitCommit}
                    color="text-blue-600"
                    bgColor="bg-blue-50"
                  />
                  <BreakdownCard
                    title="Pull Requests"
                    count={resolved.contributions.pullRequests}
                    icon={GitPullRequest}
                    color="text-purple-600"
                    bgColor="bg-purple-50"
                  />
                  <BreakdownCard
                    title="Code Reviews"
                    count={resolved.contributions.reviews}
                    icon={MessageSquare}
                    color="text-green-600"
                    bgColor="bg-green-50"
                  />
                  <BreakdownCard
                    title="Issues"
                    count={resolved.contributions.issues}
                    icon={AlertCircle}
                    color="text-orange-600"
                    bgColor="bg-orange-50"
                  />
                </>
              ) : null}
            </div>
          </section>

          {/* Roles */}
          {resolved && (
            <RolesSection
              maintainer={resolved.roles.maintainer}
              leadership={resolved.roles.leadership}
            />
          )}

          {/* My projects */}
          <section className="mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                My Projects
              </h2>
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
      </div>
    </div>
  );
}
