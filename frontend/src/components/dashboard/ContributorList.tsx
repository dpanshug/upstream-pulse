import { useState } from 'react';
import { ArrowUpRight, ChevronDown, ChevronUp } from 'lucide-react';
import { ContributorRanking } from './types';

interface ContributorRowProps {
  contributor: ContributorRanking;
}

function ContributorRow({ contributor }: ContributorRowProps) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0">
      <span className="w-6 text-center text-sm font-medium text-gray-400">
        {contributor.rank}
      </span>
      
      <img
        src={contributor.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(contributor.name)}&background=e5e7eb&color=374151`}
        alt={contributor.name}
        className="w-10 h-10 rounded-full"
      />
      
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{contributor.name}</p>
        {contributor.githubUsername && (
          <a
            href={`https://github.com/${contributor.githubUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-500 hover:text-blue-600 flex items-center gap-1"
          >
            @{contributor.githubUsername}
            <ArrowUpRight className="w-3 h-3" />
          </a>
        )}
      </div>
      
      <div className="text-right">
        <p className="font-bold text-gray-900">{contributor.total}</p>
        <p className="text-xs text-gray-500">contributions</p>
      </div>
    </div>
  );
}

interface ContributorBreakdownProps {
  contributor: ContributorRanking;
}

function ContributorBreakdown({ contributor }: ContributorBreakdownProps) {
  return (
    <div className="grid grid-cols-4 gap-2 text-center text-xs">
      <div>
        <p className="font-medium text-gray-900">{contributor.commits}</p>
        <p className="text-gray-500">Commits</p>
      </div>
      <div>
        <p className="font-medium text-gray-900">{contributor.pullRequests}</p>
        <p className="text-gray-500">PRs</p>
      </div>
      <div>
        <p className="font-medium text-gray-900">{contributor.reviews}</p>
        <p className="text-gray-500">Reviews</p>
      </div>
      <div>
        <p className="font-medium text-gray-900">{contributor.issues}</p>
        <p className="text-gray-500">Issues</p>
      </div>
    </div>
  );
}

interface ContributorListProps {
  contributors: ContributorRanking[];
  limit?: number;
}

export function ContributorList({ contributors, limit = 5 }: ContributorListProps) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = contributors.length > limit;
  const visible = expanded ? contributors : contributors.slice(0, limit);

  if (contributors.length === 0) {
    return (
      <p className="text-gray-500 text-center py-8">
        No contributions from team members yet
      </p>
    );
  }

  return (
    <div>
      <div className="space-y-1">
        {visible.map((contributor) => (
          <div key={contributor.id} className="group">
            <ContributorRow contributor={contributor} />
            <div className="hidden group-hover:block pl-10 pr-4 pb-3">
              <ContributorBreakdown contributor={contributor} />
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 mx-auto mt-4 px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
        >
          {expanded ? (
            <>
              Show Less
              <ChevronUp className="w-4 h-4" />
            </>
          ) : (
            <>
              View All ({contributors.length})
              <ChevronDown className="w-4 h-4" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
