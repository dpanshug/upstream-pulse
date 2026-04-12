import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface HeatmapEntry {
  date: string;
  total: number;
}

interface StreakInfo {
  current: number;
  longest: number;
}

interface ContributionHeatmapProps {
  data: HeatmapEntry[];
  streak: StreakInfo;
  onYearChange?: (year: number | null) => void;
  onDateSelect?: (date: string | null) => void;
  selectedDate?: string | null;
  memberSince?: string | null;
}

function getIntensity(count: number): string {
  if (count === 0) return 'bg-gray-100';
  if (count <= 3) return 'bg-blue-200';
  if (count <= 7) return 'bg-blue-400';
  return 'bg-blue-600';
}

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CELL_SIZE = 14;
const CELL_GAP = 3;

interface DayCell {
  date: string;
  total: number;
  dayOfWeek: number;
}

interface WeekColumn {
  days: Array<DayCell | null>;
  monthLabel: string | null;
}

interface TooltipData {
  date: string;
  total: number;
  x: number;
  y: number;
}

function buildWeeks(data: HeatmapEntry[]): WeekColumn[] {
  if (data.length === 0) return [];

  const dateMap = new Map(data.map((d) => [d.date, d.total]));

  const allDates = data.map((d) => d.date).sort();
  const endDate = new Date(allDates[allDates.length - 1] + 'T00:00:00');
  const startDate = new Date(allDates[0] + 'T00:00:00');

  const startDow = startDate.getDay();
  if (startDow !== 0) startDate.setDate(startDate.getDate() - startDow);

  const weeks: WeekColumn[] = [];
  const cursor = new Date(startDate);
  let prevMonth = -1;
  const firstDataDate = new Date(allDates[0] + 'T00:00:00');

  while (cursor <= endDate) {
    const week: WeekColumn = { days: [], monthLabel: null };
    for (let dow = 0; dow < 7; dow++) {
      const ds = cursor.toISOString().split('T')[0];
      const month = cursor.getMonth();

      if (dow === 0 && month !== prevMonth) {
        week.monthLabel = MONTH_NAMES[month];
        prevMonth = month;
      }

      if (cursor > endDate || cursor < firstDataDate) {
        week.days.push(null);
      } else {
        week.days.push({ date: ds, total: dateMap.get(ds) ?? 0, dayOfWeek: dow });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
}

function formatTooltipDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function getAvailableYears(memberSince?: string | null): number[] {
  const currentYear = new Date().getFullYear();
  const memberYear = memberSince ? new Date(memberSince).getFullYear() : currentYear;
  const startYear = Math.min(memberYear, currentYear - 3);
  const years: number[] = [];
  for (let y = currentYear; y >= startYear; y--) years.push(y);
  return years;
}

export function ContributionHeatmap({ data, streak, onYearChange, onDateSelect, selectedDate, memberSince }: ContributionHeatmapProps) {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [yearOpen, setYearOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const yearDropdownRef = useRef<HTMLDivElement>(null);

  const weeks = useMemo(() => buildWeeks(data), [data]);
  const yearTotal = useMemo(() => data.reduce((sum, d) => sum + d.total, 0), [data]);
  const availableYears = useMemo(() => getAvailableYears(memberSince), [memberSince]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(e.target as Node)) setYearOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleYearSelect = useCallback((year: number | null) => {
    setSelectedYear(year);
    setYearOpen(false);
    onYearChange?.(year);
  }, [onYearChange]);

  const handleCellHover = useCallback((e: React.MouseEvent, day: DayCell) => {
    const gridRect = gridRef.current?.getBoundingClientRect();
    if (!gridRect) return;
    const cellRect = (e.target as HTMLElement).getBoundingClientRect();
    setTooltip({
      date: day.date,
      total: day.total,
      x: cellRect.left - gridRect.left + cellRect.width / 2,
      y: cellRect.top - gridRect.top - 8,
    });
  }, []);

  const handleCellLeave = useCallback(() => setTooltip(null), []);

  const handleCellClick = useCallback((day: DayCell) => {
    if (!onDateSelect) return;
    onDateSelect(selectedDate === day.date ? null : day.date);
  }, [onDateSelect, selectedDate]);

  const yearLabel = selectedYear ? String(selectedYear) : 'Last 12 months';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-gray-900">Contribution Heatmap</h2>
        <div className="relative" ref={yearDropdownRef}>
          <button
            onClick={() => setYearOpen(!yearOpen)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              yearOpen
                ? 'bg-white border-blue-300 ring-2 ring-blue-100 text-gray-700'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            {yearLabel}
            <ChevronDown className={`w-3 h-3 transition-transform ${yearOpen ? 'rotate-180' : ''}`} />
          </button>
          {yearOpen && (
            <div className="absolute top-full right-0 mt-1.5 z-30 w-44 bg-white rounded-xl shadow-lg border border-gray-200 py-1 max-h-56 overflow-y-auto">
              <button
                onClick={() => handleYearSelect(null)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${
                  selectedYear === null ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {selectedYear === null ? <Check className="w-3 h-3 text-blue-600 shrink-0" /> : <div className="w-3 shrink-0" />}
                Last 12 months
              </button>
              <div className="border-t border-gray-100 my-1" />
              {availableYears.map((y) => (
                <button
                  key={y}
                  onClick={() => handleYearSelect(y)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${
                    selectedYear === y ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {selectedYear === y ? <Check className="w-3 h-3 text-blue-600 shrink-0" /> : <div className="w-3 shrink-0" />}
                  {y}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Grid container */}
      <div className="relative" ref={gridRef}>
        <div className="overflow-x-auto overflow-y-visible">
          <div className="min-w-fit mx-auto w-fit pb-1">
            {/* Tooltip */}
            {tooltip && (
              <div
                className="absolute z-20 pointer-events-none whitespace-nowrap -translate-x-1/2 -translate-y-full"
                style={{ left: tooltip.x, top: tooltip.y }}
              >
                <div className="bg-gray-900 text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-lg mb-1">
                  <span className="font-semibold">{tooltip.total}</span>
                  {' '}contribution{tooltip.total !== 1 ? 's' : ''} on {formatTooltipDate(tooltip.date)}
                </div>
                <div className="w-2 h-2 bg-gray-900 rotate-45 mx-auto -mt-2" />
              </div>
            )}

            {/* Month labels row */}
            <div className="flex" style={{ paddingLeft: 32 }}>
              {weeks.map((w, i) => (
                <div
                  key={i}
                  className="text-[10px] text-gray-400 leading-none"
                  style={{ width: CELL_SIZE, marginRight: CELL_GAP }}
                >
                  {w.monthLabel ?? ''}
                </div>
              ))}
            </div>

            <div className="flex mt-1">
              {/* Day-of-week labels */}
              <div className="flex flex-col shrink-0" style={{ width: 28, marginRight: 4 }}>
                {DAY_LABELS.map((label, i) => (
                  <div
                    key={i}
                    className="text-[10px] text-gray-400 text-right pr-1"
                    style={{ height: CELL_SIZE, marginBottom: CELL_GAP, lineHeight: `${CELL_SIZE}px` }}
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* Week columns */}
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col" style={{ marginRight: CELL_GAP }}>
                  {week.days.map((day, di) => {
                    const isSelected = day != null && selectedDate === day.date;
                    return (
                      <div
                        key={di}
                        className={`rounded-[3px] transition-all duration-75 ${
                          day
                            ? `${getIntensity(day.total)} cursor-pointer ${
                                isSelected
                                  ? 'ring-2 ring-blue-600 ring-offset-1 scale-125 z-10'
                                  : 'hover:ring-2 hover:ring-blue-500 hover:ring-offset-1 hover:scale-125'
                              }`
                            : ''
                        }`}
                        style={{
                          width: CELL_SIZE,
                          height: CELL_SIZE,
                          marginBottom: CELL_GAP,
                        }}
                        onClick={day ? () => handleCellClick(day) : undefined}
                        onMouseEnter={day ? (e) => handleCellHover(e, day) : undefined}
                        onMouseLeave={day ? handleCellLeave : undefined}
                        aria-label={day ? `${day.total} contributions on ${day.date}` : undefined}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Footer: streak stats + legend */}
      <div className="flex flex-wrap items-center justify-between mt-4 pt-3 border-t border-gray-100 gap-y-2">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {streak.current > 0 && (
            <span>Current streak: <span className="font-semibold text-gray-700">{streak.current} days</span></span>
          )}
          {streak.longest > 0 && (
            <span>Longest: <span className="font-semibold text-gray-700">{streak.longest} days</span></span>
          )}
          <span><span className="font-semibold text-gray-700">{yearTotal.toLocaleString()}</span> this year</span>
        </div>

        <div className="flex items-center gap-1 text-[10px] text-gray-400">
          <span>Less</span>
          <div className="w-[10px] h-[10px] rounded-[2px] bg-gray-100" />
          <div className="w-[10px] h-[10px] rounded-[2px] bg-blue-200" />
          <div className="w-[10px] h-[10px] rounded-[2px] bg-blue-400" />
          <div className="w-[10px] h-[10px] rounded-[2px] bg-blue-600" />
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
