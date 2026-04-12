import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { PeriodSelector, OrgActivityCard, DEFAULT_PERIOD_DAYS } from '../components/dashboard';
import { PageError } from '../components/common/PageError';
import { OrgCardSkeleton } from '../components/common/Skeleton';
import { apiFetch } from '../lib/api';

interface OrgSummary {
  name: string;
  githubOrg: string;
  governanceModel: string;
  hasCommunityRepo: boolean;
  contributionCount: number;
  trend: Array<{ date: string; count: number }>;
  totalTrend: Array<{ date: string; count: number }>;
  percentChange: number;
  leadershipCount: number;
  maintainerCount: number;
  totalContributions: number;
  teamSharePercent: number;
  activeTeamMembers: number;
  projectCount: number;
}

async function fetchOrgs(days: number): Promise<{ orgs: OrgSummary[] }> {
  const res = await apiFetch(`/api/orgs?days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch organizations');
  return res.json();
}

export default function Organizations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const daysParam = searchParams.get('days');
  const selectedDays = daysParam !== null ? parseInt(daysParam, 10) : DEFAULT_PERIOD_DAYS;

  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } = useQuery({
    queryKey: ['orgs', selectedDays],
    queryFn: () => fetchOrgs(selectedDays),
    placeholderData: (prev) => prev,
  });

  const handlePeriodChange = (days: number) => {
    setSearchParams({ days: days.toString() });
  };

  if (error) {
    return (
      <PageError
        title="Error Loading Organizations"
        message={(error as Error).message}
        onRetry={() => refetch()}
      />
    );
  }

  const orgs = data?.orgs ?? [];
  const sorted = [...orgs].sort((a, b) => b.contributionCount - a.contributionCount);
  const isRefetching = isFetching && !isLoading;

  return (
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Team activity across upstream communities
            </p>
          </div>
          <div className="flex items-center gap-3">
            <PeriodSelector
              selectedDays={selectedDays}
              onSelect={handlePeriodChange}
              isLoading={isRefetching}
            />
          </div>
        </div>

        <div className={`transition-opacity duration-300 ${isPlaceholderData ? 'opacity-60' : ''}`}>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <OrgCardSkeleton />
            <OrgCardSkeleton />
            <OrgCardSkeleton />
            <OrgCardSkeleton />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No organizations configured yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sorted.map((org) => (
              <OrgActivityCard
                key={org.githubOrg}
                activity={{
                  org: org.githubOrg,
                  orgName: org.name,
                  total: org.contributionCount,
                  commits: 0,
                  prs: 0,
                  reviews: 0,
                  issues: 0,
                  trend: org.trend,
                  totalTrend: org.totalTrend,
                  percentChange: org.percentChange,
                  leadershipCount: org.leadershipCount,
                  maintainerCount: org.maintainerCount,
                  totalContributions: org.totalContributions,
                  teamSharePercent: org.teamSharePercent,
                  activeTeamMembers: org.activeTeamMembers,
                }}
                projectCount={org.projectCount}
                selectedDays={selectedDays}
              />
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
