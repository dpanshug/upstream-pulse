import { useState } from 'react';
import { ExternalLink, CheckCircle2 } from 'lucide-react';

interface PRItem {
  title: string;
  repo: string;
  number: number;
  url: string;
  isDraft: boolean;
  reviewDecision: string | null;
  createdAt: string;
  updatedAt: string;
  labels: string[];
}

interface ActionQueueProps {
  reviewRequests: PRItem[];
  myOpenPRs: PRItem[];
}

const VISIBLE_LIMIT = 5;

function relativeAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

function statusPill(pr: PRItem): { label: string; className: string } {
  if (pr.isDraft) return { label: 'Draft', className: 'bg-gray-100 text-gray-600' };
  switch (pr.reviewDecision) {
    case 'APPROVED':
      return { label: 'Approved', className: 'bg-green-100 text-green-700' };
    case 'CHANGES_REQUESTED':
      return { label: 'Changes', className: 'bg-amber-100 text-amber-700' };
    case 'REVIEW_REQUIRED':
      return { label: 'Needs review', className: 'bg-blue-100 text-blue-700' };
    default:
      return { label: 'Open', className: 'bg-blue-50 text-blue-600' };
  }
}

function PRRow({ pr }: { pr: PRItem }) {
  const status = statusPill(pr);
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 py-2.5 px-3 -mx-3 rounded-lg hover:bg-gray-50 transition-colors group"
    >
      <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${status.className}`}>
        {status.label}
      </span>
      <span className="text-xs text-gray-400 shrink-0 font-mono">
        {pr.repo.split('/')[1]}#{pr.number}
      </span>
      <span className="text-sm text-gray-700 truncate flex-1">{pr.title}</span>
      <span className="text-xs text-gray-400 shrink-0 tabular-nums">{relativeAge(pr.createdAt)}</span>
      <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-gray-500 shrink-0" />
    </a>
  );
}

function PRGroup({
  title,
  count,
  items,
}: {
  title: string;
  count: number;
  items: PRItem[];
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, VISIBLE_LIMIT);
  const hasMore = items.length > VISIBLE_LIMIT;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {count > 0 && (
          <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="flex items-center gap-2 py-3 text-sm text-gray-400">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          All clear
        </div>
      ) : (
        <>
          <div className="divide-y divide-gray-50">
            {visible.map((pr) => (
              <PRRow key={`${pr.repo}-${pr.number}`} pr={pr} />
            ))}
          </div>
          {hasMore && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full text-center pt-2 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              {expanded ? 'Show less' : `Show ${items.length - VISIBLE_LIMIT} more`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function ActionQueue({ reviewRequests, myOpenPRs }: ActionQueueProps) {
  const allClear = reviewRequests.length === 0 && myOpenPRs.length === 0;

  if (allClear) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-400 bg-white rounded-xl shadow-sm border border-gray-100">
        <CheckCircle2 className="w-4 h-4 text-green-400" />
        All clear — nothing needs your attention
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <PRGroup title="Needs Your Review" count={reviewRequests.length} items={reviewRequests} />
      <PRGroup title="My Open PRs" count={myOpenPRs.length} items={myOpenPRs} />
    </div>
  );
}

export function ActionQueueSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {[0, 1].map((i) => (
        <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
          <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
          <div className="h-8 w-full bg-gray-50 rounded animate-pulse" />
          <div className="h-8 w-full bg-gray-50 rounded animate-pulse" />
          <div className="h-8 w-3/4 bg-gray-50 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}
