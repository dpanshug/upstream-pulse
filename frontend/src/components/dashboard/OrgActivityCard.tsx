import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Crown, Shield, Users } from 'lucide-react';
import { PrefetchLink } from '../common/PrefetchLink';
import { DEFAULT_PERIOD_DAYS } from './types';
import type { OrgActivity } from './types';

interface OrgActivityCardProps {
  activity: OrgActivity;
  projectCount?: number;
  selectedDays?: number;
}

interface EngagementStatus {
  label: string;
  color: string;
  bg: string;
}

function getEngagementStatus(
  leadershipCount: number,
  maintainerCount: number,
  total: number,
): EngagementStatus {
  const hasGovernance = leadershipCount > 0 || maintainerCount > 0;
  const highGovernance = leadershipCount >= 3 || maintainerCount >= 5;

  if (total === 0 && !hasGovernance) return { label: 'New Entrant', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200' };
  if (highGovernance) return { label: 'Established Leader', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' };
  if (hasGovernance) return { label: 'Core Contributor', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' };
  return { label: 'Active', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200' };
}

export function OrgActivityCard({ activity, projectCount, selectedDays }: OrgActivityCardProps) {
  const {
    org, orgName, total, percentChange, trend, totalTrend,
    leadershipCount, maintainerCount,
    teamSharePercent, activeTeamMembers,
  } = activity;

  const isAllTime = selectedDays === 0 || selectedDays === undefined;
  const showTrend = !isAllTime && percentChange !== undefined;

  const trendDirection = percentChange > 0 ? 'up' : percentChange < 0 ? 'down' : 'flat';
  const TrendIcon = trendDirection === 'up' ? TrendingUp : trendDirection === 'down' ? TrendingDown : Minus;
  const trendPillClass =
    trendDirection === 'up' ? 'text-emerald-600 bg-emerald-50' :
    trendDirection === 'down' ? 'text-red-600 bg-red-50' :
    'text-gray-500 bg-gray-100';

  const sparkColor = '#3b82f6';

  const status = getEngagementStatus(leadershipCount, maintainerCount, total);
  const isUntracked = (projectCount === 0 || projectCount === undefined) && total === 0 && !leadershipCount && !maintainerCount;

  if (isUntracked) {
    return (
      <div className="block bg-white rounded-xl border border-dashed border-gray-200 p-5">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-700 truncate">{orgName}</h3>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap text-gray-500 bg-gray-50 border-gray-200">
            Coming Soon
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-4">
          No projects tracked for this organization yet.
        </p>
      </div>
    );
  }

  const days = selectedDays ?? DEFAULT_PERIOD_DAYS;

  return (
    <PrefetchLink
      to={`/organizations/${org}${selectedDays !== undefined ? `?days=${selectedDays}` : ''}`}
      prefetch={{
        queryKey: ['org-dashboard', org, days],
        url: `/api/metrics/dashboard?days=${days}&githubOrg=${org}`,
      }}
      className="group block bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:border-gray-300 hover:shadow-md transition-all duration-200"
    >
      {/* Row 1: Org name + status badge */}
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
          {orgName}
        </h3>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${status.color} ${status.bg}`}>
          {status.label}
        </span>
      </div>

      {/* Row 2-3: Contribution number + trend */}
      <div className="flex items-baseline gap-2 mb-0.5">
        <p className="text-3xl font-bold text-gray-900">
          {total.toLocaleString()}
        </p>
        {showTrend && (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium ${trendPillClass}`}>
            <TrendIcon className="w-3 h-3" />
            {percentChange > 0 ? '+' : ''}{percentChange.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-3">Team Contributions</p>

      {/* Row 4: Sparkline with legend */}
      {trend.length > 1 && (() => {
        const totalMap = new Map(totalTrend?.map(d => [d.date, d.count]) ?? []);
        const mergedData = trend.map(d => ({
          date: d.date,
          team: d.count,
          total: totalMap.get(d.date) ?? d.count,
        }));
        return (
          <div className="mb-4">
          <div className="flex items-center gap-4 text-[10px] text-gray-400 mb-1.5">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-[2px] rounded-full" style={{ backgroundColor: sparkColor }} />
              Team
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-[2px] rounded-full border-t border-dashed border-gray-400" style={{ borderTopWidth: 2, backgroundColor: 'transparent' }} />
              Total
            </span>
            <span className="ml-auto text-gray-300">Last 30 days</span>
          </div>
          <div className="h-16 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mergedData}>
                <defs>
                  <linearGradient id={`sparkGrad-${org}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={sparkColor} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={sparkColor} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={`sparkGradTotal-${org}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#9ca3af" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#9ca3af" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div className="bg-gray-900 text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-lg">
                        <p className="text-gray-400 mb-1">{new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                        <p>Team: <span className="font-semibold">{d.team}</span></p>
                        <p>Total: <span className="font-semibold">{d.total}</span></p>
                      </div>
                    );
                  }}
                  cursor={{ stroke: '#d1d5db', strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#9ca3af"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  fill={`url(#sparkGradTotal-${org})`}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="team"
                  stroke={sparkColor}
                  strokeWidth={1.5}
                  fill={`url(#sparkGrad-${org})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          </div>
        );
      })()}

      {/* Row 5: Team share bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-gray-500 font-medium">Team share</span>
          <span className="font-semibold text-gray-700">{teamSharePercent.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(teamSharePercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Row 6: Bottom metadata */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Users className="w-3.5 h-3.5 text-gray-400" />
          {activeTeamMembers} active
        </span>

        {leadershipCount > 0 && (
          <span className="flex items-center gap-1">
            <Crown className="w-3.5 h-3.5 text-amber-500" />
            {leadershipCount} {leadershipCount === 1 ? 'leader' : 'leaders'}
          </span>
        )}

        {maintainerCount > 0 && (
          <span className="flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-blue-500" />
            {maintainerCount} {maintainerCount === 1 ? 'maintainer' : 'maintainers'}
          </span>
        )}

        {projectCount !== undefined && projectCount > 0 && (
          <span className="text-gray-400 ml-auto">
            {projectCount} {projectCount === 1 ? 'project' : 'projects'}
          </span>
        )}
      </div>
    </PrefetchLink>
  );
}
