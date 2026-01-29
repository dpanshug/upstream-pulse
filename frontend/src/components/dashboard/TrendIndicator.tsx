import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { TrendMetric } from './types';

interface TrendIndicatorProps {
  trend: TrendMetric;
}

export function TrendIndicator({ trend }: TrendIndicatorProps) {
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
