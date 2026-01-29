import { ContributionTypeMetric } from './types';
import { ContributionBar } from './ContributionBar';

interface ContributionTypeCardProps {
  title: string;
  metric: ContributionTypeMetric;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  barColor: string;
}

export function ContributionTypeCard({
  title,
  metric,
  icon: Icon,
  color,
  bgColor,
  barColor,
}: ContributionTypeCardProps) {
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
