import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import {
  Folder,
  ExternalLink,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Table2,
  Plus,
} from 'lucide-react';
import { PageError } from '../components/common/PageError';
import { TableRowSkeleton } from '../components/common/Skeleton';
import { PeriodSelector } from '../components/dashboard/PeriodSelector';
import { ProjectCard } from '../components/dashboard/ProjectCards';
import { DashboardData, DEFAULT_PERIOD_DAYS } from '../components/dashboard/types';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';

const AddProjectModal = lazy(() => import('../components/admin/AddProjectModal'));

interface Project {
  id: string;
  name: string;
  githubOrg: string;
  githubRepo: string;
  ecosystem: string | null;
  trackingEnabled: boolean;
}

interface MergedProject extends Project {
  teamContributions: number;
}

type SortField = 'name' | 'githubOrg' | 'trackingEnabled' | 'teamContributions';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'table' | 'grid';

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const GRID_PAGE_SIZE = 12;

const COLUMNS: { label: string; field: SortField }[] = [
  { label: 'Project', field: 'name' },
  { label: 'Organization', field: 'githubOrg' },
  { label: 'Status', field: 'trackingEnabled' },
  { label: 'Team Contributions', field: 'teamContributions' },
];

async function fetchProjects() {
  const res = await apiFetch('/api/projects');
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

async function fetchDashboard(days: number): Promise<DashboardData> {
  const res = await apiFetch(`/api/metrics/dashboard?days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch project metrics');
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

function Pagination({ startIdx, pageSize, totalItems, currentPage, totalPages, onPageChange, onPageSizeChange, showPageSizeSelector, className }: {
  startIdx: number;
  pageSize: number;
  totalItems: number;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  showPageSizeSelector?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between border-t border-gray-200 bg-white px-6 py-3 ${className ?? ''}`}>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span>
          Showing {startIdx + 1}–{Math.min(startIdx + pageSize, totalItems)} of {totalItems}
        </span>
        {showPageSizeSelector && onPageSizeChange && (
          <>
            <span className="text-gray-300">|</span>
            <label className="flex items-center gap-1">
              Rows:
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="border border-gray-300 rounded px-1.5 py-0.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          aria-label="Previous page"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {getPageRange(currentPage, totalPages).map((page, idx) =>
          page === 'ellipsis' ? (
            <span key={`ellipsis-${idx}`} className="px-2 text-sm text-gray-400">...</span>
          ) : (
            <button
              key={page}
              aria-label={`Page ${page}`}
              aria-current={page === currentPage ? 'page' : undefined}
              onClick={() => onPageChange(page)}
              className={`min-w-[2rem] h-8 rounded text-sm font-medium transition-colors ${
                page === currentPage ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {page}
            </button>
          ),
        )}
        <button
          aria-label="Next page"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function Projects() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [selectedDays, setSelectedDays] = useState(DEFAULT_PERIOD_DAYS);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });

  const {
    data: dashboardData,
    isLoading: dashboardLoading,
  } = useQuery({
    queryKey: ['dashboard-projects', selectedDays],
    queryFn: () => fetchDashboard(selectedDays),
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

  const projects: Project[] = data?.projects ?? [];
  const topProjects: any[] = dashboardData?.topProjects ?? [];

  const mergedProjects: MergedProject[] = useMemo(() => {
    const metricsById = new Map<string, any>();
    for (const p of topProjects) {
      metricsById.set(p.id, p);
    }
    return projects.map((p) => {
      const m = metricsById.get(p.id);
      return {
        ...p,
        teamContributions: m?.contributions?.all?.team ?? 0,
      };
    });
  }, [projects, topProjects]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return mergedProjects;
    const q = searchQuery.toLowerCase();
    return mergedProjects.filter((p) =>
      p.name?.toLowerCase().includes(q) ||
      p.githubOrg?.toLowerCase().includes(q) ||
      p.githubRepo?.toLowerCase().includes(q) ||
      p.ecosystem?.toLowerCase().includes(q)
    );
  }, [mergedProjects, searchQuery]);

  const sortedProjects = useMemo(() => {
    return [...filteredProjects].sort((a, b) => {
      if (sortField === 'trackingEnabled') {
        const cmp = (a.trackingEnabled === b.trackingEnabled) ? 0 : a.trackingEnabled ? -1 : 1;
        return sortDirection === 'asc' ? cmp : -cmp;
      }

      if (sortField === 'teamContributions') {
        const cmp = a.teamContributions - b.teamContributions;
        return sortDirection === 'asc' ? cmp : -cmp;
      }

      const aStr = (a[sortField] as string | null) ?? '';
      const bStr = (b[sortField] as string | null) ?? '';
      const cmp = aStr.localeCompare(bStr);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filteredProjects, sortField, sortDirection]);

  // Grid view: filter dashboard topProjects
  const gridProjects = useMemo(() => {
    const topProjects = dashboardData?.topProjects ?? [];
    if (!searchQuery.trim()) return topProjects;
    const q = searchQuery.toLowerCase();
    return topProjects.filter((p: any) =>
      p.name?.toLowerCase().includes(q) ||
      p.githubOrg?.toLowerCase().includes(q) ||
      p.githubRepo?.toLowerCase().includes(q)
    );
  }, [dashboardData, searchQuery]);

  const activePageSize = viewMode === 'grid' ? GRID_PAGE_SIZE : pageSize;
  const activeList = viewMode === 'grid' ? gridProjects : sortedProjects;
  const totalPages = Math.max(1, Math.ceil(activeList.length / activePageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * activePageSize;
  const paginatedProjects = sortedProjects.slice(startIdx, startIdx + pageSize);
  const paginatedGridProjects = gridProjects.slice(startIdx, startIdx + GRID_PAGE_SIZE);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'teamContributions' ? 'desc' : 'asc');
    }
    setCurrentPage(1);
  }

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    setCurrentPage(1);
  }

  function handleViewChange(mode: ViewMode) {
    setViewMode(mode);
    setCurrentPage(1);
  }

  return (
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
            <p className="text-sm text-gray-500 mt-0.5">Tracked upstream repositories</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setAddModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Project
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {COLUMNS.map(({ label, field }) => (
                    <th key={field} className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase ${field === 'teamContributions' ? 'text-right' : 'text-left'}`}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Array.from({ length: 8 }, (_, i) => (
                  <TableRowSkeleton key={i} cols={4} />
                ))}
              </tbody>
            </table>
          </div>
        ) : error ? (
          <PageError
            title="Error Loading Projects"
            message={(error as Error).message}
            onRetry={() => refetch()}
          />
        ) : (
          <>
            {/* Toolbar: search, period selector, view toggle */}
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, org, repo, or ecosystem..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                />
              </div>
              <div className="flex items-center gap-3">
                <PeriodSelector
                  selectedDays={selectedDays}
                  onSelect={(days) => { setSelectedDays(days); setCurrentPage(1); }}
                  isLoading={dashboardLoading}
                />
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => handleViewChange('table')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                      viewMode === 'table'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <Table2 className="w-4 h-4" />
                    Table
                  </button>
                  <button
                    onClick={() => handleViewChange('grid')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                      viewMode === 'grid'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                    Cards
                  </button>
                </div>
              </div>
            </div>

            {/* Table view */}
            {viewMode === 'table' && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {COLUMNS.map(({ label, field }) => {
                        const isContrib = field === 'teamContributions';
                        return (
                          <th
                            key={field}
                            role="columnheader"
                            tabIndex={0}
                            aria-sort={sortField === field ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                            onClick={() => handleSort(field)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort(field); } }}
                            className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:bg-gray-100 transition-colors ${
                              isContrib ? 'text-right' : 'text-left'
                            }`}
                          >
                            <div className={`flex items-center ${isContrib ? 'justify-end' : ''}`}>
                              {label}
                              <SortIcon field={field} activeField={sortField} direction={sortDirection} />
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedProjects.map((project) => (
                      <tr
                        key={project.id}
                        onClick={() => navigate(`/organizations/${project.githubOrg}/projects/${project.id}`)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <Folder className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0" />
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-gray-900 block truncate">
                                {project.name}
                              </span>
                              <a
                                href={`https://github.com/${project.githubOrg}/${project.githubRepo}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-0.5 mt-0.5"
                              >
                                {project.githubOrg}/{project.githubRepo}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Link
                            to={`/organizations/${project.githubOrg}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {project.githubOrg}
                          </Link>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              project.trackingEnabled
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {project.trackingEnabled ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {dashboardLoading ? (
                            <div className="h-4 w-10 bg-gray-200 rounded animate-pulse ml-auto" />
                          ) : (
                            <span className="text-sm text-gray-900">{project.teamContributions}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {sortedProjects.length === 0 && (
                  <div className="text-center py-12">
                    <Folder className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">
                      {searchQuery.trim()
                        ? 'No projects match your search'
                        : 'No projects configured yet'}
                    </p>
                  </div>
                )}

                {sortedProjects.length > 0 && (
                  <Pagination
                    startIdx={startIdx}
                    pageSize={pageSize}
                    totalItems={sortedProjects.length}
                    currentPage={safePage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={handlePageSizeChange}
                    showPageSizeSelector
                  />
                )}
              </div>
            )}

            {/* Grid view */}
            {viewMode === 'grid' && (
              dashboardLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                      <div className="animate-pulse space-y-3">
                        <div className="h-5 bg-gray-200 rounded w-3/4" />
                        <div className="h-3 bg-gray-200 rounded w-1/2" />
                        <div className="h-7 bg-gray-200 rounded w-1/3" />
                        <div className="h-1.5 bg-gray-200 rounded-full w-full" />
                        <div className="flex gap-3">
                          <div className="h-3 bg-gray-200 rounded w-14" />
                          <div className="h-3 bg-gray-200 rounded w-14" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {paginatedGridProjects.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {paginatedGridProjects.map((project: any) => (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          selectedDays={selectedDays}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Folder className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">
                        {searchQuery.trim()
                          ? 'No projects match your search'
                          : 'No projects configured yet'}
                      </p>
                    </div>
                  )}

                  {gridProjects.length > GRID_PAGE_SIZE && (
                    <Pagination
                      startIdx={startIdx}
                      pageSize={GRID_PAGE_SIZE}
                      totalItems={gridProjects.length}
                      currentPage={safePage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                      className="mt-4 rounded-lg shadow"
                    />
                  )}
                </>
              )
            )}
          </>
        )}
      </div>

      {isAdmin && addModalOpen && (
        <Suspense fallback={null}>
          <AddProjectModal
            open={addModalOpen}
            onClose={() => setAddModalOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
