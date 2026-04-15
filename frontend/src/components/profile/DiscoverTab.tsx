import { useState } from 'react';
import {
  Sparkles,
  ExternalLink,
  Loader2,
  RefreshCw,
  Compass,
  Rocket,
  ArrowRight,
} from 'lucide-react';
import { Skeleton } from '../common/Skeleton';

export interface ScoredRecommendation {
  githubId: string;
  githubNumber: number | null;
  githubUrl: string;
  title: string;
  labels: string[];
  org: string;
  repo: string;
  language: string | null;
  score: number;
  matchLevel: 'strong' | 'good' | 'explore';
  category: 'personalized' | 'exploration' | 'getting-started';
  freshness: string;
  commentsCount: number;
  reactionsCount: number;
  assigneeCount: number;
  aiExplanation?: string;
}

export interface AIInsight {
  githubId: string;
  explanation: string;
}

const LABEL_COLORS = [
  'bg-blue-50 text-blue-700 border-blue-200',
  'bg-purple-50 text-purple-700 border-purple-200',
  'bg-green-50 text-green-700 border-green-200',
  'bg-amber-50 text-amber-700 border-amber-200',
  'bg-pink-50 text-pink-700 border-pink-200',
  'bg-cyan-50 text-cyan-700 border-cyan-200',
  'bg-indigo-50 text-indigo-700 border-indigo-200',
];

function hashLabelColor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = ((hash << 5) - hash + label.charCodeAt(i)) | 0;
  }
  return LABEL_COLORS[Math.abs(hash) % LABEL_COLORS.length];
}

const MATCH_BADGE: Record<string, { label: string; className: string }> = {
  strong: { label: 'Strong match', className: 'bg-green-50 text-green-700 border-green-200' },
  good: { label: 'Good match', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  explore: { label: 'New for you', className: 'bg-purple-50 text-purple-700 border-purple-200' },
};

const CATEGORY_BADGE: Record<string, { label: string; className: string }> = {
  'getting-started': { label: 'Great starter', className: 'bg-amber-50 text-amber-700 border-amber-200' },
};

function MatchBadge({ matchLevel, category }: { matchLevel: string; category: string }) {
  const badge = category === 'getting-started'
    ? CATEGORY_BADGE['getting-started']
    : MATCH_BADGE[matchLevel] || MATCH_BADGE['good'];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border ${badge.className}`}>
      {badge.label}
    </span>
  );
}

function RecommendationCard({
  rec,
  aiInsight,
  showAiShimmer,
}: {
  rec: ScoredRecommendation;
  aiInsight?: string;
  showAiShimmer: boolean;
}) {
  const explanation = aiInsight || rec.aiExplanation;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 transition-all hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <MatchBadge matchLevel={rec.matchLevel} category={rec.category} />
            <span className="text-xs text-gray-400">{rec.org}/{rec.repo}#{rec.githubNumber}</span>
          </div>

          <a
            href={rec.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-gray-900 hover:text-blue-600 transition-colors line-clamp-2"
          >
            {rec.title}
          </a>

          {rec.labels.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {rec.labels.slice(0, 4).map((label) => (
                <span
                  key={label}
                  className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded border ${hashLabelColor(label)}`}
                >
                  {label}
                </span>
              ))}
              {rec.labels.length > 4 && (
                <span className="text-[10px] text-gray-400">+{rec.labels.length - 4}</span>
              )}
            </div>
          )}

          {explanation && (
            <div className="mt-3 flex items-start gap-1.5 animate-in slide-in-from-top-2 duration-300">
              <Sparkles className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0" />
              <p className="text-xs text-gray-600 leading-relaxed">{explanation}</p>
            </div>
          )}

          {showAiShimmer && !explanation && (
            <div className="mt-3 flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-purple-200 animate-pulse" />
              <div className="h-3 w-48 rounded bg-gray-100 animate-pulse" />
            </div>
          )}

          <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-400">
            <span>{rec.freshness}</span>
            {rec.language && <span>{rec.language}</span>}
            <span>{rec.commentsCount} comments</span>
            {rec.reactionsCount > 0 && <span>{rec.reactionsCount} reactions</span>}
          </div>
        </div>

        <a
          href={rec.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          title="Open in GitHub"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

export function DiscoverTabSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-xl" />
      ))}
    </div>
  );
}

interface DiscoverTabProps {
  recommendations: ScoredRecommendation[];
  isLoading: boolean;
  aiInsights: AIInsight[] | null;
  isAiLoading: boolean;
  aiError: boolean;
  onRequestAI: () => void;
  onRefresh: () => void;
  lastUpdated: Date | null;
}

export function DiscoverTab({
  recommendations,
  isLoading,
  aiInsights,
  isAiLoading,
  aiError,
  onRequestAI,
  onRefresh,
  lastUpdated,
}: DiscoverTabProps) {
  const [showAll, setShowAll] = useState(false);
  const DEFAULT_SHOW = 5;

  if (isLoading) {
    return <DiscoverTabSkeleton />;
  }

  if (recommendations.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-4">
          <Compass className="w-7 h-7 text-purple-400" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 mb-2">
          Scanning for opportunities
        </h3>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          We&apos;re scanning open issues across your tracked projects. Recommendations will appear within a few hours.
        </p>
      </div>
    );
  }

  const insightMap = new Map<string, string>();
  if (aiInsights) {
    for (const insight of aiInsights) {
      insightMap.set(insight.githubId, insight.explanation);
    }
  }

  const hasGettingStarted = recommendations[0]?.category === 'getting-started';
  const visibleRecs = showAll ? recommendations : recommendations.slice(0, DEFAULT_SHOW);
  const hasMore = recommendations.length > DEFAULT_SHOW;

  const minutesAgo = lastUpdated
    ? Math.max(0, Math.floor((Date.now() - lastUpdated.getTime()) / 60000))
    : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          {hasGettingStarted ? (
            <>
              <Rocket className="w-5 h-5 text-amber-500" />
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Popular starter issues</h2>
                <p className="text-xs text-gray-500">Across your tracked projects</p>
              </div>
            </>
          ) : (
            <>
              <Compass className="w-5 h-5 text-purple-500" />
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Recommended for you</h2>
                <p className="text-xs text-gray-500">Based on your skills and activity</p>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!hasGettingStarted && !aiInsights && !isAiLoading && (
            <button
              onClick={onRequestAI}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 rounded-lg border border-purple-200 hover:bg-purple-100 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Why these?
            </button>
          )}
          {isAiLoading && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-purple-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Analyzing...
            </span>
          )}
          {aiError && (
            <button
              onClick={onRequestAI}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:text-red-700"
            >
              Failed — try again
            </button>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {visibleRecs.map((rec) => (
          <RecommendationCard
            key={rec.githubId}
            rec={rec}
            aiInsight={insightMap.get(rec.githubId)}
            showAiShimmer={isAiLoading}
          />
        ))}
      </div>

      {/* Show more / less */}
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full flex items-center justify-center gap-1.5 py-3 mt-3 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
        >
          {showAll ? 'Show less' : `Show ${recommendations.length - DEFAULT_SHOW} more`}
          {!showAll && <ArrowRight className="w-3.5 h-3.5" />}
        </button>
      )}

      {/* Footer */}
      <div className="flex items-center justify-center gap-2 mt-4 text-[11px] text-gray-400">
        {minutesAgo !== null && (
          <span>Updated {minutesAgo === 0 ? 'just now' : `${minutesAgo}m ago`}</span>
        )}
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-1 text-gray-400 hover:text-blue-600 transition-colors"
          title="Refresh recommendations"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>
    </div>
  );
}
