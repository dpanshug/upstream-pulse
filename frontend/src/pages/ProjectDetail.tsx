import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  GitCommit,
  GitPullRequest,
  MessageSquare,
  AlertCircle,
  Users,
  TrendingUp,
  Activity,
  Calendar,
  ExternalLink,
} from 'lucide-react';

import {
  DashboardData,
  DEFAULT_PERIOD_DAYS,
  StatCard,
  ContributionTypeCard,
  PeriodSelector,
  ContributorList,
  LeadershipSection,
  PeriodSummary,
} from '../components/dashboard';
import { Breadcrumb } from '../components/ui/Breadcrumb';
import { PageError } from '../components/common/PageError';
import {
  StatCardSkeleton,
  ContributionCardSkeleton,
  ContributorRowSkeleton,
  Skeleton,
} from '../components/common/Skeleton';
import { apiFetch } from '../lib/api';

async function fetchProjectDashboard(projectId: string, days: number): Promise<DashboardData> {
  const res = await apiFetch(
    `/api/metrics/dashboard?days=${days}&projectId=${projectId}`
  );
  if (!res.ok) throw new Error('Failed to fetch project dashboard');
  return res.json();
}

export default function ProjectDetail() {
  const { projectId, org } = useParams<{ projectId: string; org?: string }>();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const daysParam = searchParams.get('days');
  const selectedDays = daysParam !== null ? parseInt(daysParam, 10) : DEFAULT_PERIOD_DAYS;

  const { data: projectInfo } = useQuery({
    queryKey: ['project-info', projectId],
    queryFn: () => {
      const cached: any = queryClient.getQueryData(['projects']);
      const match = cached?.projects?.find((p: any) => p.id === projectId);
      if (match) return match;
      return apiFetch('/api/projects')
        .then(r => { if (!r.ok) throw new Error('Failed to fetch projects'); return r.json(); })
        .then(d => d.projects?.find((p: any) => p.id === projectId) ?? null);
    },
    enabled: !!projectId,
    staleTime: Infinity,
  });

  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } = useQuery({
    queryKey: ['dashboard', selectedDays, projectId],
    queryFn: () => fetchProjectDashboard(projectId!, selectedDays),
    refetchInterval: 60000,
    placeholderData: (previousData) => previousData,
    enabled: !!projectId,
  });

  const handlePeriodChange = (days: number) => {
    setSearchParams({ days: days.toString() });
  };

  if (error) {
    return (
      <PageError
        title="Error Loading Project"
        message={(error as Error).message}
        onRetry={() => refetch()}
      />
    );
  }

  const projectName = projectInfo?.name ?? 'Project';
  const githubOrg = projectInfo?.githubOrg;
  const githubRepo = projectInfo?.githubRepo;
  const isRefetching = isFetching && !isLoading;

  return (
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Breadcrumb */}
        <Breadcrumb
          segments={
            org
              ? [
                  { label: 'Organizations', to: '/organizations' },
                  { label: githubOrg ?? org, to: `/organizations/${org}` },
                  { label: projectName },
                ]
              : [
                  { label: 'Projects', to: '/projects' },
                  { label: projectName },
                ]
          }
        />

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{projectName}</h1>
            {githubOrg && githubRepo && (
              <a
                href={`https://github.com/${githubOrg}/${githubRepo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-500 hover:text-blue-600 flex items-center gap-1 mt-0.5"
              >
                {githubOrg}/{githubRepo}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-3">
            <PeriodSelector
              selectedDays={selectedDays}
              onSelect={handlePeriodChange}
              isLoading={isRefetching}
            />
            {data && (
              <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
                <Calendar className="w-3.5 h-3.5" />
                <span>
                  {data.summary.periodStart === 'All time'
                    ? 'All time'
                    : `${data.summary.periodStart} – ${data.summary.periodEnd}`}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className={`transition-opacity duration-300 ${isPlaceholderData ? 'opacity-60' : ''}`}>
        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {isLoading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : data && (
            <>
              <StatCard
                label="Team Contributions"
                value={data.contributions.all.team.toLocaleString()}
                trend={data.trends.contributions}
                icon={GitCommit}
              />
              <StatCard
                label="Team's Share"
                value={`${data.contributions.all.teamPercent.toFixed(1)}%`}
                icon={TrendingUp}
              />
              <StatCard
                label="Active Contributors"
                value={data.summary.activeContributors}
                trend={data.trends.activeContributors}
                icon={Users}
              />
              <StatCard
                label="Total Activity"
                value={data.contributions.all.total.toLocaleString()}
                icon={Activity}
              />
            </>
          )}
        </div>

        {/* Contribution Breakdown Section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Contribution Breakdown
            </h2>
            <p className="text-sm text-gray-500">
              Team vs Total contributions by type
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {isLoading ? (
              <>
                <ContributionCardSkeleton />
                <ContributionCardSkeleton />
                <ContributionCardSkeleton />
                <ContributionCardSkeleton />
              </>
            ) : data && (
              <>
                <ContributionTypeCard
                  title="Commits"
                  metric={data.contributions.commits}
                  icon={GitCommit}
                  color="text-blue-600"
                  bgColor="bg-blue-50"
                  barColor="bg-blue-600"
                />
                <ContributionTypeCard
                  title="Pull Requests"
                  metric={data.contributions.pullRequests}
                  icon={GitPullRequest}
                  color="text-purple-600"
                  bgColor="bg-purple-50"
                  barColor="bg-purple-600"
                />
                <ContributionTypeCard
                  title="Code Reviews"
                  metric={data.contributions.reviews}
                  icon={MessageSquare}
                  color="text-green-600"
                  bgColor="bg-green-50"
                  barColor="bg-green-600"
                />
                <ContributionTypeCard
                  title="Issues"
                  metric={data.contributions.issues}
                  icon={AlertCircle}
                  color="text-orange-600"
                  bgColor="bg-orange-50"
                  barColor="bg-orange-600"
                />
              </>
            )}
          </div>
        </section>

        {/* Leadership Section */}
        {data?.leadership && (
          <LeadershipSection leadership={data.leadership} />
        )}

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Top Contributors */}
          <section className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Top Contributors
              </h2>
              {isLoading ? (
                <div className="divide-y divide-gray-100">
                  {Array.from({ length: 5 }, (_, i) => (
                    <ContributorRowSkeleton key={i} />
                  ))}
                </div>
              ) : data && (
                <ContributorList contributors={data.topContributors} limit={10} />
              )}
            </div>
          </section>

          {/* Quick Stats */}
          <section>
            {isLoading ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : data && (
              <PeriodSummary data={data} />
            )}
          </section>
        </div>

        {/* Summary Banner */}
        {data && (
          <section className="mt-8">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 text-white">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-blue-100 text-sm">{projectName} - Team Impact</p>
                  <p className="text-3xl font-bold">
                    {data.contributions.all.team.toLocaleString()} contributions
                  </p>
                  <p className="text-blue-200 mt-1">
                    {data.contributions.all.teamPercent.toFixed(1)}% of all project activity
                  </p>
                </div>
                <div className="flex gap-6">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{data.contributions.commits.team}</p>
                    <p className="text-blue-200 text-sm">Commits</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{data.contributions.pullRequests.team}</p>
                    <p className="text-blue-200 text-sm">PRs</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{data.contributions.reviews.team}</p>
                    <p className="text-blue-200 text-sm">Reviews</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{data.contributions.issues.team}</p>
                    <p className="text-blue-200 text-sm">Issues</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
        </div>
      </div>
    </div>
  );
}
