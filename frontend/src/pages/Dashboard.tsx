import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  GitCommit,
  GitPullRequest,
  MessageSquare,
  AlertCircle,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Calendar,
  ArrowUpRight,
  Loader2,
} from 'lucide-react';

// Period options for the selector
const PERIOD_OPTIONS = [
  { label: '7d', value: 7, description: 'Last 7 days' },
  { label: '30d', value: 30, description: 'Last 30 days' },
  { label: '90d', value: 90, description: 'Last 90 days' },
  { label: '1y', value: 365, description: 'Last year' },
  { label: 'All time', value: 0, description: 'Since beginning' },
] as const;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Types matching the new API response
interface ContributionTypeMetric {
  total: number;
  team: number;
  teamPercent: number;
}

interface TrendMetric {
  current: number;
  previous: number;
  changePercent: number;
  direction: 'up' | 'down' | 'flat';
}

interface ContributorRanking {
  rank: number;
  id: string;
  name: string;
  githubUsername: string | null;
  avatarUrl?: string;
  commits: number;
  pullRequests: number;
  reviews: number;
  issues: number;
  total: number;
}

interface DashboardData {
  summary: {
    periodDays: number;
    periodStart: string;
    periodEnd: string;
    trackedProjects: number;
    activeContributors: number;
  };
  contributions: {
    commits: ContributionTypeMetric;
    pullRequests: ContributionTypeMetric;
    reviews: ContributionTypeMetric;
    issues: ContributionTypeMetric;
    all: ContributionTypeMetric;
  };
  trends: {
    contributions: TrendMetric;
    activeContributors: TrendMetric;
  };
  topContributors: ContributorRanking[];
  topProjects: any[];
  dailyBreakdown: any[];
}

async function fetchDashboard(days: number): Promise<DashboardData> {
  const url = days === 0 
    ? `${API_URL}/api/metrics/dashboard?days=0`
    : `${API_URL}/api/metrics/dashboard?days=${days}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch dashboard');
  return res.json();
}

// Trend indicator component
function TrendIndicator({ trend }: { trend: TrendMetric }) {
  const Icon = trend.direction === 'up' ? TrendingUp : trend.direction === 'down' ? TrendingDown : Minus;
  const colorClass = trend.direction === 'up' 
    ? 'text-green-600 bg-green-50' 
    : trend.direction === 'down' 
    ? 'text-red-600 bg-red-50' 
    : 'text-gray-600 bg-gray-50';

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}>
      <Icon className="w-3 h-3" />
      {trend.direction !== 'flat' && (trend.changePercent > 0 ? '+' : '')}
      {trend.changePercent.toFixed(1)}%
    </span>
  );
}

// Progress bar for contribution breakdown
function ContributionBar({ metric, bgColor }: { metric: ContributionTypeMetric; bgColor: string }) {
  return (
    <div className="w-full">
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div 
          className={`h-full ${bgColor} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(metric.teamPercent, 100)}%` }}
        />
      </div>
    </div>
  );
}

// Individual contribution type card
function ContributionTypeCard({
  title,
  metric,
  icon: Icon,
  color,
  bgColor,
  barColor,
}: {
  title: string;
  metric: ContributionTypeMetric;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  barColor: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2 rounded-lg ${bgColor}`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <span className={`text-2xl font-bold ${color}`}>
          {metric.teamPercent.toFixed(1)}%
        </span>
      </div>
      
      <h3 className="text-sm font-medium text-gray-600 mb-1">{title}</h3>
      
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-xl font-bold text-gray-900">{metric.team}</span>
        <span className="text-sm text-gray-500">of {metric.total}</span>
      </div>
      
      <ContributionBar metric={metric} bgColor={barColor} />
      
      <p className="text-xs text-gray-500 mt-2">Team's share of total</p>
    </div>
  );
}

// Summary stat card
function StatCard({
  label,
  value,
  trend,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  trend?: TrendMetric;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-gray-50 rounded-lg">
          <Icon className="w-4 h-4 text-gray-600" />
        </div>
        <span className="text-sm font-medium text-gray-600">{label}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        {trend && <TrendIndicator trend={trend} />}
      </div>
    </div>
  );
}

// Contributor leaderboard row
function ContributorRow({ contributor }: { contributor: ContributorRanking }) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0">
      <span className="w-6 text-center text-sm font-medium text-gray-400">
        {contributor.rank}
      </span>
      
      <img
        src={contributor.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(contributor.name)}&background=e5e7eb&color=374151`}
        alt={contributor.name}
        className="w-10 h-10 rounded-full"
      />
      
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{contributor.name}</p>
        {contributor.githubUsername && (
          <a
            href={`https://github.com/${contributor.githubUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-500 hover:text-blue-600 flex items-center gap-1"
          >
            @{contributor.githubUsername}
            <ArrowUpRight className="w-3 h-3" />
          </a>
        )}
      </div>
      
      <div className="text-right">
        <p className="font-bold text-gray-900">{contributor.total}</p>
        <p className="text-xs text-gray-500">contributions</p>
      </div>
    </div>
  );
}

// Contribution breakdown mini table
function ContributorBreakdown({ contributor }: { contributor: ContributorRanking }) {
  return (
    <div className="grid grid-cols-4 gap-2 text-center text-xs">
      <div>
        <p className="font-medium text-gray-900">{contributor.commits}</p>
        <p className="text-gray-500">Commits</p>
      </div>
      <div>
        <p className="font-medium text-gray-900">{contributor.pullRequests}</p>
        <p className="text-gray-500">PRs</p>
      </div>
      <div>
        <p className="font-medium text-gray-900">{contributor.reviews}</p>
        <p className="text-gray-500">Reviews</p>
      </div>
      <div>
        <p className="font-medium text-gray-900">{contributor.issues}</p>
        <p className="text-gray-500">Issues</p>
      </div>
    </div>
  );
}

// Period selector button group
function PeriodSelector({
  selectedDays,
  onSelect,
  isLoading,
}: {
  selectedDays: number;
  onSelect: (days: number) => void;
  isLoading: boolean;
}) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
      {PERIOD_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onSelect(option.value)}
          title={option.description}
          className={`
            px-3 py-1.5 text-sm font-medium rounded-md transition-all
            ${selectedDays === option.value
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }
          `}
        >
          {option.label}
        </button>
      ))}
      {isLoading && (
        <Loader2 className="w-4 h-4 text-gray-400 animate-spin ml-2" />
      )}
    </div>
  );
}

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Get days from URL, default to 0 (all time)
  const daysParam = searchParams.get('days');
  const selectedDays = daysParam !== null ? parseInt(daysParam, 10) : 0;
  
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['dashboard', selectedDays],
    queryFn: () => fetchDashboard(selectedDays),
    refetchInterval: 60000,
    // Keep previous data while fetching new data for seamless transition
    placeholderData: (previousData) => previousData,
  });
  
  // Handle period selection
  const handlePeriodChange = (days: number) => {
    setSearchParams({ days: days.toString() });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Activity className="w-12 h-12 text-blue-600 animate-pulse" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md">
          <h3 className="text-red-800 font-semibold">Error Loading Dashboard</h3>
          <p className="text-red-600 mt-2">{(error as Error).message}</p>
          <p className="text-sm text-red-500 mt-4">
            Make sure the backend server is running on {API_URL}
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Upstream Pulse</h1>
              <p className="text-sm text-gray-500">Red Hat AI Open Source Contributions</p>
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
                    : `${data.summary.periodStart} to ${data.summary.periodEnd}`
                  }
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
            label="Tracked Projects"
            value={data.summary.trackedProjects}
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

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Top Contributors */}
          <section className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Top Contributors
              </h2>
              
              {data.topContributors.length > 0 ? (
                <div className="space-y-1">
                  {data.topContributors.slice(0, 5).map((contributor) => (
                    <div key={contributor.id} className="group">
                      <ContributorRow contributor={contributor} />
                      <div className="hidden group-hover:block pl-10 pr-4 pb-3">
                        <ContributorBreakdown contributor={contributor} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">
                  No contributions from team members yet
                </p>
              )}
            </div>
          </section>

          {/* Quick Stats & Info */}
          <section>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Period Summary
              </h2>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-gray-600">Total Contributions</span>
                  <span className="font-semibold text-gray-900">
                    {data.contributions.all.total.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-gray-600">Team Contributions</span>
                  <span className="font-semibold text-gray-900">
                    {data.contributions.all.team.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-gray-600">External Contributions</span>
                  <span className="font-semibold text-gray-900">
                    {(data.contributions.all.total - data.contributions.all.team).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600">Team's Share</span>
                  <span className="font-semibold text-blue-600">
                    {data.contributions.all.teamPercent.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Trend comparison */}
              <div className="mt-6 pt-4 border-t border-gray-100">
                <h3 className="text-sm font-medium text-gray-600 mb-3">vs Previous Period</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Contributions</span>
                    <TrendIndicator trend={data.trends.contributions} />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Active Contributors</span>
                    <TrendIndicator trend={data.trends.activeContributors} />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Total Summary Banner */}
        <section className="mt-8">
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
      </main>
    </div>
  );
}
