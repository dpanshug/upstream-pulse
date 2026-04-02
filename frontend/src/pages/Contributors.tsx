import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  User,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { PageLoading } from '../components/common/PageLoading';
import { PageError } from '../components/common/PageError';
import { PeriodSelector } from '../components/dashboard/PeriodSelector';
import { DEFAULT_PERIOD_DAYS } from '../components/dashboard/types';
import { apiFetch } from '../lib/api';

interface TeamMember {
  id: string;
  name: string;
  primaryEmail: string;
  githubUsername: string | null;
  department: string | null;
  isActive: boolean;
}

interface MergedContributor extends TeamMember {
  total: number;
  commits: number;
  pullRequests: number;
  reviews: number;
  issues: number;
}

type SortField = 'name' | 'githubUsername' | 'isActive' | 'total';

type SortDirection = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const COLUMNS: { label: string; field: SortField }[] = [
  { label: 'Name', field: 'name' },
  { label: 'GitHub', field: 'githubUsername' },
  { label: 'Status', field: 'isActive' },
  { label: 'Contributions', field: 'total' },
];

async function fetchTeamMembers() {
  const res = await apiFetch('/api/team-members');
  if (!res.ok) throw new Error('Failed to fetch team members');
  return res.json();
}

interface ContributorMetric {
  id: string;
  name: string;
  githubUsername: string | null;
  contributions: {
    commits: number;
    prs: number;
    reviews: number;
    issues: number;
    total: number;
  };
}

async function fetchContributors(days: number) {
  const res = await apiFetch(`/api/metrics/contributors?days=${days}&limit=1000`);
  if (!res.ok) throw new Error('Failed to fetch contribution data');
  return res.json() as Promise<{ contributors: ContributorMetric[]; count: number; days: number }>;
}

function SortIcon({ field, activeField, direction }: {
  field: SortField;
  activeField: SortField;
  direction: SortDirection;
}) {
  if (field !== activeField) return <ChevronsUpDown className="w-3.5 h-3.5 ml-1 text-gray-400" />;
  return direction === 'asc'
    ? <ChevronUp className="w-3.5 h-3.5 ml-1 text-gray-700" />
    : <ChevronDown className="w-3.5 h-3.5 ml-1 text-gray-700" />;
}

function getPageRange(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | 'ellipsis')[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);

  if (left > 2) pages.push('ellipsis');
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push('ellipsis');
  if (total > 1) pages.push(total);

  return pages;
}

export default function Contributors() {
  const [selectedDays, setSelectedDays] = useState(DEFAULT_PERIOD_DAYS);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['team-members'],
    queryFn: fetchTeamMembers,
  });

  const {
    data: contribData,
    isLoading: contribLoading,
  } = useQuery({
    queryKey: ['contributors-metrics', selectedDays],
    queryFn: () => fetchContributors(selectedDays),
  });

  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(inputValue);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const members: TeamMember[] = data?.members ?? [];
  const contributorMetrics = contribData?.contributors ?? [];

  const mergedMembers: MergedContributor[] = useMemo(() => {
    const metricsById = new Map<string, ContributorMetric>();
    for (const c of contributorMetrics) {
      metricsById.set(c.id, c);
    }
    return members.map((m) => {
      const c = metricsById.get(m.id)?.contributions;
      return {
        ...m,
        total: c?.total ?? 0,
        commits: c?.commits ?? 0,
        pullRequests: c?.prs ?? 0,
        reviews: c?.reviews ?? 0,
        issues: c?.issues ?? 0,
      };
    });
  }, [members, contributorMetrics]);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return mergedMembers;
    const q = searchQuery.toLowerCase();
    return mergedMembers.filter((m) =>
      m.name?.toLowerCase().includes(q) ||
      m.primaryEmail?.toLowerCase().includes(q) ||
      m.githubUsername?.toLowerCase().includes(q)
    );
  }, [mergedMembers, searchQuery]);

  const sortedMembers = useMemo(() => {
    return [...filteredMembers].sort((a, b) => {
      if (sortField === 'isActive') {
        const cmp = (a.isActive === b.isActive) ? 0 : a.isActive ? -1 : 1;
        return sortDirection === 'asc' ? cmp : -cmp;
      }

      if (sortField === 'total') {
        const cmp = a.total - b.total;
        return sortDirection === 'asc' ? cmp : -cmp;
      }

      const aStr = (a[sortField] as string | null) ?? '';
      const bStr = (b[sortField] as string | null) ?? '';
      const cmp = aStr.localeCompare(bStr);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filteredMembers, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedMembers.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const paginatedMembers = sortedMembers.slice(startIdx, startIdx + pageSize);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'total' ? 'desc' : 'asc');
    }
    setCurrentPage(1);
  }

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    setCurrentPage(1);
  }

  return (
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Contributors</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Team members contributing to upstream projects
          </p>
        </div>

        {isLoading ? (
          <PageLoading message="Loading contributors…" />
        ) : error ? (
          <PageError
            title="Error Loading Contributors"
            message={(error as Error).message}
            onRetry={() => refetch()}
          />
        ) : (
          <>
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, email, or GitHub..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                />
              </div>
              <PeriodSelector
                selectedDays={selectedDays}
                onSelect={(days) => { setSelectedDays(days); setCurrentPage(1); }}
                isLoading={contribLoading}
              />
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 table-fixed">
                <thead className="bg-gray-50">
                  <tr>
                    {COLUMNS.map(({ label, field }) => {
                      const widthClass =
                        field === 'name' ? 'w-1/3' :
                        field === 'githubUsername' ? 'w-1/4' :
                        field === 'isActive' ? 'w-28' : '';
                      return (
                        <th
                          key={field}
                          role="columnheader"
                          tabIndex={0}
                          aria-sort={sortField === field ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                          onClick={() => handleSort(field)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort(field); } }}
                          className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:bg-gray-100 transition-colors ${widthClass} ${
                            field === 'total' ? 'text-right' : 'text-left'
                          }`}
                        >
                          <div className={`flex items-center ${field === 'total' ? 'justify-end' : ''}`}>
                            {label}
                            <SortIcon field={field} activeField={sortField} direction={sortDirection} />
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedMembers.map((member) => (
                    <tr key={member.id} className="group hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <User className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0" />
                          <span className="text-sm font-medium text-gray-900">
                            {member.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {member.githubUsername ? (
                          <a
                            href={`https://github.com/${member.githubUsername}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            @{member.githubUsername}
                          </a>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            member.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {member.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {contribLoading ? (
                          <div className="h-4 w-10 bg-gray-200 rounded animate-pulse ml-auto" />
                        ) : (
                          <>
                            <span className="text-sm font-bold text-gray-900">{member.total}</span>
                            <div className="hidden group-hover:flex items-center justify-end gap-3 mt-1 text-xs text-gray-500">
                              <span>{member.commits} <span className="text-gray-400">commits</span></span>
                              <span>{member.pullRequests} <span className="text-gray-400">PRs</span></span>
                              <span>{member.reviews} <span className="text-gray-400">reviews</span></span>
                              <span>{member.issues} <span className="text-gray-400">issues</span></span>
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {sortedMembers.length === 0 && (
                <div className="text-center py-12">
                  <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">
                    {searchQuery.trim()
                      ? 'No contributors match your search'
                      : 'No team members configured yet'}
                  </p>
                </div>
              )}

              {/* Pagination */}
              {sortedMembers.length > 0 && (
                <div className="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-3">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>
                      Showing {startIdx + 1}–{Math.min(startIdx + pageSize, sortedMembers.length)} of{' '}
                      {sortedMembers.length}
                    </span>
                    <span className="text-gray-300">|</span>
                    <label className="flex items-center gap-1">
                      Rows:
                      <select
                        value={pageSize}
                        onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                        className="border border-gray-300 rounded px-1.5 py-0.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      >
                        {PAGE_SIZE_OPTIONS.map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      aria-label="Previous page"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    {getPageRange(safePage, totalPages).map((page, idx) =>
                      page === 'ellipsis' ? (
                        <span key={`ellipsis-${idx}`} className="px-2 text-sm text-gray-400">
                          ...
                        </span>
                      ) : (
                        <button
                          key={page}
                          aria-label={`Page ${page}`}
                          aria-current={page === safePage ? 'page' : undefined}
                          onClick={() => setCurrentPage(page)}
                          className={`min-w-[2rem] h-8 rounded text-sm font-medium transition-colors ${
                            page === safePage
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {page}
                        </button>
                      ),
                    )}

                    <button
                      aria-label="Next page"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                      className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
