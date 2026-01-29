import { ContributionTypeMetric } from './types';

interface ContributionBarProps {
  metric: ContributionTypeMetric;
  bgColor: string;
}

export function ContributionBar({ metric, bgColor }: ContributionBarProps) {
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
