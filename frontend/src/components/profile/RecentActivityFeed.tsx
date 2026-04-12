import { useState, useMemo, useRef, useEffect } from 'react';
import { GitCommit, GitPullRequest, MessageSquare, AlertCircle, ExternalLink, ChevronDown, Check, FolderGit2 } from 'lucide-react';

interface RecentActivityItem {
  type: string;
  date: string;
  githubUrl: string;
  projectName: string;
  githubOrg: string;
  githubRepo: string;
  title: string | null;
}

interface RecentActivityFeedProps {
  items: RecentActivityItem[];
  dateFilter?: string | null;
  onClearDateFilter?: () => void;
}

const PAGE_SIZE = 15;

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bgColor: string; label: string }> = {
  commit: { icon: GitCommit, color: 'text-blue-600', bgColor: 'bg-blue-50', label: 'Commit' },
  pr: { icon: GitPullRequest, color: 'text-purple-600', bgColor: 'bg-purple-50', label: 'PR' },
  review: { icon: MessageSquare, color: 'text-green-600', bgColor: 'bg-green-50', label: 'Review' },
  issue: { icon: AlertCircle, color: 'text-amber-600', bgColor: 'bg-amber-50', label: 'Issue' },
};

const ALL_TYPES = ['commit', 'pr', 'review', 'issue'] as const;

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr + 'T12:00:00').getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'Today';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function ProjectDropdown({
  projects,
  selected,
  onSelect,
}: {
  projects: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const label = selected === 'all' ? 'All projects' : selected.split('/').pop() ?? selected;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
          open
            ? 'bg-white border-blue-300 ring-2 ring-blue-100 text-gray-700'
            : selected === 'all'
              ? 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
        }`}
      >
        <FolderGit2 className="w-3 h-3" />
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-30 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-1 max-h-64 overflow-y-auto">
          <button
            onClick={() => { onSelect('all'); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${
              selected === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            {selected === 'all' && <Check className="w-3 h-3 text-blue-600 shrink-0" />}
            {selected !== 'all' && <div className="w-3 shrink-0" />}
            All projects
          </button>
          <div className="border-t border-gray-100 my-1" />
          {projects.map((p) => (
            <button
              key={p}
              onClick={() => { onSelect(p); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${
                selected === p ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {selected === p && <Check className="w-3 h-3 text-blue-600 shrink-0" />}
              {selected !== p && <div className="w-3 shrink-0" />}
              <span className="truncate">{p}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RecentActivityFeed({ items, dateFilter, onClearDateFilter }: RecentActivityFeedProps) {
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(ALL_TYPES));
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const projects = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) set.add(`${item.githubOrg}/${item.githubRepo}`);
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (dateFilter && item.date !== dateFilter) return false;
      if (!activeTypes.has(item.type)) return false;
      if (selectedProject !== 'all' && `${item.githubOrg}/${item.githubRepo}` !== selectedProject) return false;
      return true;
    });
  }, [items, activeTypes, selectedProject, dateFilter]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const toggleType = (type: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
    setVisibleCount(PAGE_SIZE);
  };

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Recent Activity</h2>
        <p className="text-sm text-gray-400 py-6 text-center">No recent activity with links</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Recent Activity</h2>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Type chips */}
        <div className="flex gap-1.5">
          {ALL_TYPES.map((type) => {
            const cfg = TYPE_CONFIG[type];
            const active = activeTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? `${cfg.bgColor} ${cfg.color} ring-1 ring-inset ring-current/20`
                    : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                }`}
              >
                <cfg.icon className="w-3 h-3" />
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Project dropdown */}
        {projects.length > 1 && (
          <ProjectDropdown
            projects={projects}
            selected={selectedProject}
            onSelect={(v) => { setSelectedProject(v); setVisibleCount(PAGE_SIZE); }}
          />
        )}

        {/* Date filter chip */}
        {dateFilter && (
          <button
            onClick={onClearDateFilter}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-100 transition-colors"
          >
            {new Date(dateFilter + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            <span className="text-blue-400 hover:text-blue-600">&times;</span>
          </button>
        )}

        <span className="text-[11px] text-gray-400 ml-auto">
          {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">No matches for selected filters</p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 px-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-20">Type</th>
                <th className="text-left py-2 px-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Project</th>
                <th className="text-left py-2 px-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Title</th>
                <th className="text-right py-2 px-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-20">Date</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {visible.map((item, i) => {
                const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.commit;
                const Icon = cfg.icon;
                return (
                  <tr
                    key={`${item.type}-${item.githubUrl}-${i}`}
                    className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors group"
                  >
                    <td className="py-2 px-2">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-xs text-gray-500 font-mono">{item.githubOrg}/{item.githubRepo}</td>
                    <td className="py-2 px-2 text-sm text-gray-700 truncate max-w-[300px]">
                      {item.title || <span className="text-gray-300 italic">No title</span>}
                    </td>
                    <td className="py-2 px-2 text-right text-xs text-gray-400 tabular-nums whitespace-nowrap">
                      {relativeTime(item.date)}
                    </td>
                    <td className="py-2 px-1">
                      <a
                        href={item.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-300 hover:text-blue-500 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && (
        <button
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="w-full text-center pt-3 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
        >
          Show {Math.min(PAGE_SIZE, filtered.length - visibleCount)} more
        </button>
      )}
    </div>
  );
}
