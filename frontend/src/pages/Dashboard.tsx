import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  GitCommit,
  GitPullRequest,
  MessageSquare,
  AlertCircle,
  Users,
  TrendingUp,
  Activity,
  Calendar,
} from 'lucide-react';

import {
  DashboardData,
  StatCard,
  ContributionTypeCard,
  PeriodSelector,
  ContributorList,
  ProjectCards,
  LeadershipSection,
} from '../components/dashboard';
import { PageLoading } from '../components/common/PageLoading';
import { PageError } from '../components/common/PageError';

const API_URL = import.meta.env.VITE_API_URL ?? '';

async function fetchDashboard(days: number): Promise<DashboardData> {
  const res = await fetch(`${API_URL}/api/metrics/dashboard?days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch dashboard');
  return res.json();
}

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();

  const daysParam = searchParams.get('days');
  const selectedDays = daysParam !== null ? parseInt(daysParam, 10) : 0;

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['dashboard', selectedDays],
    queryFn: () => fetchDashboard(selectedDays),
    refetchInterval: 60000,
    placeholderData: (previousData) => previousData,
  });

  const handlePeriodChange = (days: number) => {
    setSearchParams({ days: days.toString() });
  };

  if (isLoading) {
    return <PageLoading message="Loading dashboard…" />;
  }

  if (error) {
    return (
      <PageError
        title="Error Loading Dashboard"
        message={(error as Error).message}
        hint={`Make sure the backend server is running on ${API_URL || 'the configured host'}`}
        onRetry={() => refetch()}
      />
    );
  }

  if (!data) return null;

  const leadership = data.leadership;

  return (
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">Overview of your team's open source impact</p>
          </div>
          <div className="flex items-center gap-3">
            <PeriodSelector
              selectedDays={selectedDays}
              onSelect={handlePeriodChange}
              isLoading={isFetching && !isLoading}
            />
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {data.summary.periodStart === 'All time'
                  ? 'All time'
                  : `${data.summary.periodStart} – ${data.summary.periodEnd}`}
              </span>
            </div>
          </div>
        </div>
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
            label="Tracked Projects"
            value={data.summary.trackedProjects}
            icon={Activity}
          />
        </div>

        {/* Contribution Breakdown */}
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

        {/* Team Leadership */}
        {leadership && (
          <LeadershipSection leadership={leadership} />
        )}

        {/* Project Cards Grid */}
        <div className="mb-8">
          <ProjectCards projects={data.topProjects} selectedDays={selectedDays} />
        </div>

        {/* Top Contributors */}
        <section className="mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Top Contributors
            </h2>
            <ContributorList contributors={data.topContributors.slice(0, 10)} limit={5} />
          </div>
        </section>

        {/* Total Summary Banner */}
        <section>
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 text-white">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-blue-100 text-sm">Total Team Impact</p>
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
      </div>
    </div>
  );
}
