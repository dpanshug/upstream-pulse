import { useQuery } from '@tanstack/react-query';
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
import { Breadcrumb } from '../components/ui/Breadcrumb';
import { PageLoading } from '../components/common/PageLoading';
import { PageError } from '../components/common/PageError';

const API_URL = import.meta.env.VITE_API_URL ?? '';

async function fetchOrgDashboard(githubOrg: string, days: number): Promise<DashboardData> {
  const res = await fetch(
    `${API_URL}/api/metrics/dashboard?days=${days}&githubOrg=${githubOrg}`
  );
  if (!res.ok) throw new Error('Failed to fetch organization data');
  return res.json();
}

async function fetchOrgName(githubOrg: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/orgs`);
  if (!res.ok) return githubOrg;
  const data = await res.json();
  const match = data.orgs?.find((o: any) => o.githubOrg === githubOrg);
  return match?.name ?? githubOrg;
}

export default function OrganizationDetail() {
  const { org } = useParams<{ org: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const daysParam = searchParams.get('days');
  const selectedDays = daysParam !== null ? parseInt(daysParam, 10) : 0;

  const { data: orgName } = useQuery({
    queryKey: ['org-name', org],
    queryFn: () => fetchOrgName(org!),
    enabled: !!org,
    staleTime: Infinity,
  });

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['org-dashboard', org, selectedDays],
    queryFn: () => fetchOrgDashboard(org!, selectedDays),
    refetchInterval: 60000,
    placeholderData: (prev) => prev,
    enabled: !!org,
  });

  const handlePeriodChange = (days: number) => {
    setSearchParams({ days: days.toString() });
  };

  if (isLoading) return <PageLoading message="Loading organization data…" />;
  if (error) {
    return (
      <PageError
        title="Error Loading Organization"
        message={(error as Error).message}
        onRetry={() => refetch()}
      />
    );
  }
  if (!data) return null;

  const displayName = orgName ?? org ?? 'Organization';

  return (
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Breadcrumb
          segments={[
            { label: 'Organizations', to: '/organizations' },
            { label: displayName },
          ]}
        />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Team engagement in {displayName} projects
            </p>
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

        {/* Leadership */}
        {data.leadership && (
          <LeadershipSection leadership={data.leadership} />
        )}

        {/* Projects */}
        {data.topProjects?.length > 0 && (
          <div className="mb-8">
            <ProjectCards projects={data.topProjects} selectedDays={selectedDays} orgSlug={org} />
          </div>
        )}

        {/* Top Contributors */}
        <section className="mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Top Contributors
            </h2>
            <ContributorList contributors={data.topContributors.slice(0, 10)} limit={5} />
          </div>
        </section>
      </div>
    </div>
  );
}
