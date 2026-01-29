import { Loader2 } from 'lucide-react';
import { PERIOD_OPTIONS } from './types';

interface PeriodSelectorProps {
  selectedDays: number;
  onSelect: (days: number) => void;
  isLoading: boolean;
}

export function PeriodSelector({
  selectedDays,
  onSelect,
  isLoading,
}: PeriodSelectorProps) {
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
