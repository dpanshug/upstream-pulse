import { useState, useRef } from 'react';
import { Flame, Zap, Trophy } from 'lucide-react';

interface StreakBadgeProps {
  current: number;
  longest: number;
  todayActive: boolean;
}

function getStreakTier(days: number): { label: string; gradient: string; ring: string; icon: React.ElementType; glow: string } {
  if (days >= 30) return { label: 'On fire', gradient: 'from-orange-500 to-red-500', ring: 'ring-orange-300', icon: Flame, glow: 'shadow-orange-200' };
  if (days >= 14) return { label: 'Blazing', gradient: 'from-amber-500 to-orange-500', ring: 'ring-amber-300', icon: Flame, glow: 'shadow-amber-200' };
  if (days >= 7) return { label: 'Rolling', gradient: 'from-yellow-400 to-amber-500', ring: 'ring-yellow-300', icon: Zap, glow: 'shadow-yellow-200' };
  return { label: 'Building', gradient: 'from-blue-400 to-indigo-500', ring: 'ring-blue-300', icon: Zap, glow: 'shadow-blue-200' };
}

export function StreakBadge({ current, longest, todayActive }: StreakBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const hasActiveStreak = current > 0;
  const tier = hasActiveStreak ? getStreakTier(current) : null;
  const Icon = tier?.icon ?? Flame;
  const isPersonalBest = hasActiveStreak && current >= longest && longest > 0;

  return (
    <div
      className="relative"
      ref={ref}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Badge */}
      {hasActiveStreak ? (
        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full cursor-default bg-gradient-to-r ${tier!.gradient} text-white text-xs font-bold shadow-md ${tier!.glow} ring-2 ${tier!.ring} ring-offset-1`}>
          <Icon className="w-3.5 h-3.5 animate-pulse" />
          <span>{current}-day streak</span>
        </div>
      ) : (
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full cursor-default bg-gray-100 text-gray-500 text-xs font-semibold">
          <Flame className="w-3.5 h-3.5 text-gray-400" />
          <span>{longest > 0 ? `Best: ${longest}d` : 'No streak'}</span>
        </div>
      )}

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2.5 z-30">
          <div className="w-2.5 h-2.5 bg-gray-900 rotate-45 mx-auto -mb-1.5" />
          <div className="bg-gray-900 text-white rounded-xl shadow-xl px-4 py-3.5 w-56">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                hasActiveStreak
                  ? `bg-gradient-to-br ${tier!.gradient}`
                  : 'bg-gray-700'
              }`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold">
                  {hasActiveStreak ? tier!.label : 'No active streak'}
                </p>
                <p className="text-[11px] text-gray-400">
                  {hasActiveStreak ? `${current} consecutive days` : 'Start contributing to build one'}
                </p>
              </div>
            </div>

            <div className="space-y-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-gray-400">Today</span>
                <span className={todayActive ? 'text-green-400 font-medium' : 'text-gray-500'}>
                  {todayActive ? 'Active' : 'Not yet'}
                </span>
              </div>

              {hasActiveStreak && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Current streak</span>
                  <span className="text-white font-medium">{current} days</span>
                </div>
              )}

              {longest > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Longest streak</span>
                  <span className="text-white font-medium flex items-center gap-1">
                    {isPersonalBest && <Trophy className="w-3 h-3 text-amber-400" />}
                    {longest} days
                  </span>
                </div>
              )}

              {isPersonalBest && (
                <div className="pt-1.5 mt-1.5 border-t border-gray-700 text-center">
                  <span className="text-amber-400 font-semibold text-[10px] uppercase tracking-wider">Personal best!</span>
                </div>
              )}

              {!todayActive && hasActiveStreak && (
                <div className="pt-1.5 mt-1.5 border-t border-gray-700 text-center">
                  <span className="text-gray-500 text-[10px]">Contribute today to keep it going</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
