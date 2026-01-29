import { DashboardData } from './types';
import { TrendIndicator } from './TrendIndicator';

interface PeriodSummaryProps {
  data: DashboardData;
}

export function PeriodSummary({ data }: PeriodSummaryProps) {
  return (
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
  );
}
