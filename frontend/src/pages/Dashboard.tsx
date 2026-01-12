import { useQuery } from '@tanstack/react-query';
import { GitCommit, Users, TrendingUp, UserPlus, Activity } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function fetchDashboardMetrics() {
  const res = await fetch(`${API_URL}/api/metrics/overview`);
  if (!res.ok) throw new Error('Failed to fetch metrics');
  return res.json();
}

function MetricCard({
  title,
  value,
  change,
  description,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  change?: number;
  description?: string;
  icon: React.ElementType;
}) {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
          {change !== undefined && (
            <p
              className={`text-sm mt-2 flex items-center ${
                isPositive
                  ? 'text-green-600'
                  : isNegative
                  ? 'text-red-600'
                  : 'text-gray-600'
              }`}
            >
              {isPositive && '+'}
              {change.toFixed(1)}%{' '}
              <span className="text-gray-500 ml-1">vs last period</span>
            </p>
          )}
          {description && (
            <p className="text-xs text-gray-500 mt-1">{description}</p>
          )}
        </div>
        <div className="ml-4">
          <div className="p-3 bg-blue-50 rounded-lg">
            <Icon className="w-6 h-6 text-blue-600" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: fetchDashboardMetrics,
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Activity className="w-12 h-12 text-blue-600 animate-pulse" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h3 className="text-red-800 font-semibold">Error Loading Dashboard</h3>
          <p className="text-red-600 mt-2">{(error as Error).message}</p>
          <p className="text-sm text-red-500 mt-4">
            Make sure the backend server is running on {API_URL}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Upstream Pulse
              </h1>
              <p className="text-gray-600 mt-1">
                Red Hat AI OSS Contributions Dashboard
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-gray-500">Tracking</p>
                <p className="text-lg font-semibold text-gray-900">
                  {metrics?.projectCount || 0} projects
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* KPI Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <MetricCard
            title="Total Contributions (30d)"
            value={metrics?.contributions30d?.toLocaleString() || '0'}
            change={metrics?.contributions30dChange}
            icon={GitCommit}
          />

          <MetricCard
            title="Maintainer Positions"
            value={metrics?.maintainerCount || 0}
            change={metrics?.maintainerCountChange}
            description={`Across ${metrics?.projectCount || 0} projects`}
            icon={Users}
          />

          <MetricCard
            title="Average Contribution %"
            value={`${metrics?.avgContributionPct?.toFixed(1) || '0.0'}%`}
            description="Across tracked projects"
            icon={TrendingUp}
          />

          <MetricCard
            title="Active Contributors"
            value={metrics?.activeContributors || 0}
            change={metrics?.activeContributorsChange}
            description="Last 30 days"
            icon={UserPlus}
          />
        </div>

        {/* Content Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
          {/* Placeholder for Charts */}
          <div className="lg:col-span-4 bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Contribution Trends
            </h3>
            <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
              <p className="text-gray-500">Chart will be implemented here</p>
            </div>
          </div>

          {/* Placeholder for AI Insights */}
          <div className="lg:col-span-3 bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              AI Insights
            </h3>
            <div className="space-y-4">
              {metrics?.latestInsights?.length > 0 ? (
                metrics.latestInsights.map((insight: any, idx: number) => (
                  <div key={idx} className="p-3 bg-blue-50 rounded">
                    <p className="text-sm text-gray-700">{insight.title}</p>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">No insights yet</p>
                  <p className="text-sm text-gray-400 mt-2">
                    AI insights will appear after data collection
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Getting Started Section */}
        {metrics?.projectCount === 0 && (
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-blue-900 font-semibold text-lg mb-2">
              Getting Started
            </h3>
            <p className="text-blue-800 mb-4">
              Your dashboard is ready! Follow these steps to start tracking contributions:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-blue-700">
              <li>Add team members to the database</li>
              <li>Configure projects to track</li>
              <li>Run your first data collection</li>
              <li>View insights and metrics here</li>
            </ol>
            <div className="mt-4 pt-4 border-t border-blue-200">
              <p className="text-sm text-blue-600">
                📚 See{' '}
                <a
                  href="/QUICKSTART.md"
                  className="underline font-medium"
                  target="_blank"
                >
                  QUICKSTART.md
                </a>{' '}
                for detailed setup instructions
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
