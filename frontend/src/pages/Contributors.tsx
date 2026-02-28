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

const API_URL = import.meta.env.VITE_API_URL ?? '';

interface TeamMember {
  id: string;
  name: string;
  primaryEmail: string;
  githubUsername: string | null;
  department: string | null;
  isActive: boolean;
}

type SortField = 'name' | 'primaryEmail' | 'githubUsername' | 'department' | 'isActive';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const COLUMNS: { label: string; field: SortField }[] = [
  { label: 'Name', field: 'name' },
  { label: 'Email', field: 'primaryEmail' },
  { label: 'GitHub', field: 'githubUsername' },
  { label: 'Department', field: 'department' },
  { label: 'Status', field: 'isActive' },
];

async function fetchTeamMembers() {
  const res = await fetch(`${API_URL}/api/team-members`);
  if (!res.ok) throw new Error('Failed to fetch team members');
  return res.json();
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
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['team-members'],
    queryFn: fetchTeamMembers,
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

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter((m) =>
      m.name?.toLowerCase().includes(q) ||
      m.primaryEmail?.toLowerCase().includes(q) ||
      m.githubUsername?.toLowerCase().includes(q) ||
      m.department?.toLowerCase().includes(q)
    );
  }, [members, searchQuery]);

  const sortedMembers = useMemo(() => {
    return [...filteredMembers].sort((a, b) => {
      const aRaw = a[sortField];
      const bRaw = b[sortField];

      if (sortField === 'isActive') {
        const cmp = (aRaw === bRaw) ? 0 : aRaw ? -1 : 1;
        return sortDirection === 'asc' ? cmp : -cmp;
      }

      const aStr = (aRaw as string | null) ?? '';
      const bStr = (bRaw as string | null) ?? '';
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
      setSortDirection('asc');
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
            {/* Search bar */}
            <div className="mb-4">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, email, GitHub, or department..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {COLUMNS.map(({ label, field }) => (
                      <th
                        key={field}
                        role="columnheader"
                        tabIndex={0}
                        aria-sort={sortField === field ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                        onClick={() => handleSort(field)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort(field); } }}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center">
                          {label}
                          <SortIcon field={field} activeField={sortField} direction={sortDirection} />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedMembers.map((member) => (
                    <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <User className="w-5 h-5 text-gray-400 mr-2" />
                          <span className="text-sm font-medium text-gray-900">
                            {member.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-500">
                          {member.primaryEmail}
                        </span>
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
                        <span className="text-sm text-gray-500">
                          {member.department || '-'}
                        </span>
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
