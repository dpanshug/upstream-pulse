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

function statusPill(pr: PRItem): { label: string; className: string } | null {
  if (pr.isDraft) return { label: 'Draft', className: 'bg-gray-100 text-gray-500' };
  switch (pr.reviewDecision) {
    case 'APPROVED':
      return { label: 'Approved', className: 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-200' };
    case 'CHANGES_REQUESTED':
      return { label: 'Changes', className: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200' };
    case 'REVIEW_REQUIRED':
      return { label: 'Needs review', className: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200' };
    default:
      return null;
  }
}

function PRRow({ pr }: { pr: PRItem }) {
  const status = statusPill(pr);
  const repoShort = pr.repo.split('/')[1] ?? pr.repo;
  const age = relativeAge(pr.createdAt);

  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block py-2.5 px-3 -mx-3 rounded-lg hover:bg-gray-50 transition-colors group"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors">
            {pr.title}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[11px] text-gray-400 font-mono">{repoShort}#{pr.number}</span>
            <span className="text-[11px] text-gray-300">·</span>
            <span className="text-[11px] text-gray-400 tabular-nums">{age}</span>
            {status && (
              <>
                <span className="text-[11px] text-gray-300">·</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${status.className}`}>
                  {status.label}
                </span>
              </>
            )}
          </div>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500 shrink-0 mt-0.5" />
      </div>
    </a>
  );
}

function priorityScore(pr: PRItem): number {
  if (pr.reviewDecision === 'CHANGES_REQUESTED') return 0;
  if (pr.reviewDecision === 'APPROVED') return 1;
  if (pr.reviewDecision === 'REVIEW_REQUIRED') return 2;
  if (pr.isDraft) return 4;
  return 3;
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
  const sorted = [...items].sort((a, b) => priorityScore(a) - priorityScore(b));
  const visible = expanded ? sorted : sorted.slice(0, VISIBLE_LIMIT);
  const remaining = items.length - VISIBLE_LIMIT;
  const hasMore = remaining > 0;

  const badgeColor = count >= 15
    ? 'bg-red-100 text-red-700'
    : count >= 8
      ? 'bg-amber-100 text-amber-700'
      : 'bg-gray-100 text-gray-500';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {count > 0 && (
          <span className={`text-[11px] font-bold min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center ${badgeColor}`}>
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
              className="w-full text-center pt-2.5 text-[11px] font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              {expanded ? 'Show less' : `+${remaining} more`}
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 py-5 px-6">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-700">No open PRs or review requests</p>
            <p className="text-xs text-gray-400 mt-0.5">PRs assigned to you for review and your open PRs will appear here</p>
          </div>
        </div>
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
          <div className="h-10 w-full bg-gray-50 rounded animate-pulse" />
          <div className="h-10 w-full bg-gray-50 rounded animate-pulse" />
          <div className="h-10 w-3/4 bg-gray-50 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}
