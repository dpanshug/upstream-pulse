import { TrendMetric } from './types';
import { TrendIndicator } from './TrendIndicator';

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: TrendMetric;
  icon: React.ElementType;
}

export function StatCard({
  label,
  value,
  trend,
  icon: Icon,
}: StatCardProps) {
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
