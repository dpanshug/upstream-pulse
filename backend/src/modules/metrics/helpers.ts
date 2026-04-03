import type {
  DateRange,
  ContributionCounts,
  ContributionTypeMetric,
  TrendMetric,
  MetricsQueryOptions,
} from './types.js';

export function getDateRange(options: MetricsQueryOptions): DateRange | null {
  if (options.dateRange) {
    return options.dateRange;
  }
  const days = options.days ?? 0;

  if (days === 0) {
    return null;
  }

  return {
    start: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
    end: new Date(),
  };
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// postgres-js may return date columns as Date objects despite Drizzle typing them as string
export function normalizeDateValue(value: string | unknown): string {
  if (value instanceof Date) return formatDate(value);
  return String(value);
}

export function buildCounts(rows: { type: string; count: number }[]): ContributionCounts {
  const counts: ContributionCounts = {
    commits: 0,
    prs: 0,
    reviews: 0,
    issues: 0,
    total: 0,
  };

  for (const row of rows) {
    switch (row.type) {
      case 'commit':
        counts.commits = row.count;
        break;
      case 'pr':
        counts.prs = row.count;
        break;
      case 'review':
        counts.reviews = row.count;
        break;
      case 'issue':
        counts.issues = row.count;
        break;
    }
  }
  counts.total = counts.commits + counts.prs + counts.reviews + counts.issues;
  return counts;
}

export function calculatePercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return parseFloat(((part / total) * 100).toFixed(2));
}

export function buildTrend(current: number, previous: number): TrendMetric {
  const changePercent = previous === 0
    ? (current > 0 ? 100 : 0)
    : parseFloat((((current - previous) / previous) * 100).toFixed(1));

  return {
    current,
    previous,
    changePercent,
    direction: changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'flat',
  };
}

export function buildTypeMetric(total: number, team: number): ContributionTypeMetric {
  return {
    total,
    team,
    teamPercent: calculatePercentage(team, total),
  };
}
