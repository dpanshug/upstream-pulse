import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  GitCommit,
  GitPullRequest,
  MessageSquare,
  AlertCircle,
  Users,
  TrendingUp,
  Activity,
  Calendar,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

import {
  DashboardData,
  StatCard,
  ContributionTypeCard,
  PeriodSelector,
  ContributorList,
  LeadershipSection,
  PeriodSummary,
} from '../components/dashboard';

const API_URL = import.meta.env.VITE_API_URL ?? '';

async function fetchProjectDashboard(projectId: string, days: number): Promise<DashboardData> {
  const res = await fetch(
    `${API_URL}/api/metrics/dashboard?days=${days}&projectId=${projectId}`
  );
  if (!res.ok) throw new Error('Failed to fetch project dashboard');
  return res.json();
}

async function fetchProjectInfo(projectId: string) {
  const res = await fetch(`${API_URL}/api/projects`);
  if (!res.ok) throw new Error('Failed to fetch projects');
  const data = await res.json();
  return data.projects?.find((p: any) => p.id === projectId) ?? null;
}

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const daysParam = searchParams.get('days');
  const selectedDays = daysParam !== null ? parseInt(daysParam, 10) : 0;

  const { data: projectInfo } = useQuery({
    queryKey: ['project-info', projectId],
    queryFn: () => fetchProjectInfo(projectId!),
    enabled: !!projectId,
  });

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['dashboard', selectedDays, projectId],
    queryFn: () => fetchProjectDashboard(projectId!, selectedDays),
    refetchInterval: 60000,
    placeholderData: (previousData) => previousData,
    enabled: !!projectId,
  });

  const handlePeriodChange = (days: number) => {
    setSearchParams({ days: days.toString() });
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Activity className="w-12 h-12 text-blue-600 animate-pulse" />
          <p className="text-gray-600">Loading project data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md">
          <h3 className="text-red-800 font-semibold">Error Loading Project</h3>
          <p className="text-red-600 mt-2">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const projectName = projectInfo?.name ?? 'Project';
  const githubOrg = projectInfo?.githubOrg;
  const githubRepo = projectInfo?.githubRepo;

  return (
    <div className="bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm mb-3">
            <Link
              to={`/?days=${selectedDays}`}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Dashboard
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-gray-600">{projectName}</span>
          </nav>

          <div className="flex items-center justify-between">
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
            <div className="flex items-center gap-4">
              <PeriodSelector
                selectedDays={selectedDays}
                onSelect={handlePeriodChange}
                isLoading={isFetching && !isLoading}
              />
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Calendar className="w-4 h-4" />
                <span>
                  {data.summary.periodStart === 'All time'
                    ? 'All time'
                    : `${data.summary.periodStart} to ${data.summary.periodEnd}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
          </div>
        </section>

        {/* Leadership Section */}
        {data.leadership && (
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
              <ContributorList contributors={data.topContributors} limit={10} />
            </div>
          </section>

          {/* Quick Stats */}
          <section>
            <PeriodSummary data={data} />
          </section>
        </div>

        {/* Summary Banner */}
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
      </main>
    </div>
  );
}
