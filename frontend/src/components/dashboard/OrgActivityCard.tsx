import { Link } from 'react-router-dom';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Crown, Shield } from 'lucide-react';
import type { OrgActivity } from './types';

interface OrgActivityCardProps {
  activity: OrgActivity;
  governanceModel?: string;
  projectCount?: number;
  selectedDays?: number;
}

export function OrgActivityCard({ activity, governanceModel, projectCount, selectedDays }: OrgActivityCardProps) {
  const { org, orgName, total, percentChange, trend, leadershipCount, maintainerCount } = activity;

  const trendIcon =
    percentChange > 0 ? <TrendingUp className="w-3.5 h-3.5" /> :
    percentChange < 0 ? <TrendingDown className="w-3.5 h-3.5" /> :
    <Minus className="w-3.5 h-3.5" />;

  const trendColor =
    percentChange > 0 ? 'text-emerald-600' :
    percentChange < 0 ? 'text-red-500' :
    'text-gray-400';

  const trendLabel =
    percentChange === 0 ? 'flat' : `${Math.abs(percentChange)}%`;

  return (
    <Link
      to={`/organizations/${org}${selectedDays !== undefined ? `?days=${selectedDays}` : ''}`}
      className="group block bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-gray-300 hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
          {orgName}
        </h3>
        {governanceModel && governanceModel !== 'none' && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
            {governanceModel}
          </span>
        )}
      </div>

      <p className="text-2xl font-bold text-gray-900 mb-1">
        {total.toLocaleString()}
      </p>
      <p className="text-xs text-gray-500 mb-3">contributions</p>

      {trend.length > 1 && (
        <div className="h-10 mb-3 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend}>
              <defs>
                <linearGradient id={`sparkGrad-${org}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="count"
                stroke="#3b82f6"
                strokeWidth={1.5}
                fill={`url(#sparkGrad-${org})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex items-center gap-3 text-xs">
        <span className={`flex items-center gap-1 font-medium ${trendColor}`}>
          {trendIcon}
          {trendLabel}
        </span>

        {leadershipCount > 0 && (
          <span className="flex items-center gap-1 text-gray-500">
            <Crown className="w-3 h-3 text-amber-500" />
            {leadershipCount}
          </span>
        )}

        {maintainerCount > 0 && (
          <span className="flex items-center gap-1 text-gray-500">
            <Shield className="w-3 h-3 text-blue-500" />
            {maintainerCount}
          </span>
        )}

        {projectCount !== undefined && projectCount > 0 && (
          <span className="text-gray-400 ml-auto">
            {projectCount} {projectCount === 1 ? 'project' : 'projects'}
          </span>
        )}
      </div>
    </Link>
  );
}
