import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Database,
  GitCommit,
  Shield,
  Crown,
  Users,
  Timer,
  Layers,
  RefreshCw,
  Zap,
  Server,
  ChevronDown,
  Tag,
} from 'lucide-react';
import { PageLoading } from '../components/common/PageLoading';
import { PageError } from '../components/common/PageError';

const API_URL = import.meta.env.VITE_API_URL ?? '';

interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  total: number;
}

interface WorkerInfo {
  id: string;
  name: string;
  description: string;
  health: 'healthy' | 'warning' | 'error' | 'idle';
  schedule: {
    cron: string;
    human: string;
    nextRun: string;
  };
  queue: QueueStats;
  lastSuccess: string | null;
  jobTypes: string[];
}

interface JobRecord {
  id: string;
  jobType: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  recordsProcessed: number;
  errorsCount: number;
  errorDetails: unknown;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  projectId: string | null;
  scope: string | null;
}

interface SystemStatusData {
  system: {
    status: 'operational' | 'warning' | 'degraded';
    timestamp: string;
    uptime: number;
    version: string;
  };
  workers: WorkerInfo[];
  recentJobs: JobRecord[];
  jobSummary: {
    total: number;
    completed?: number;
    failed?: number;
    running?: number;
    pending?: number;
  };
}

async function fetchSystemStatus(): Promise<SystemStatusData> {
  const res = await fetch(`${API_URL}/api/system/status`);
  if (!res.ok) throw new Error('Failed to fetch system status');
  return res.json();
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) {
    const absDiff = Math.abs(diffMs);
    if (absDiff < 60000) return 'in < 1m';
    if (absDiff < 3600000) return `in ${Math.floor(absDiff / 60000)}m`;
    if (absDiff < 86400000) return `in ${Math.floor(absDiff / 3600000)}h`;
    return `in ${Math.floor(absDiff / 86400000)}d`;
  }

  if (diffMs < 60000) return '< 1m ago';
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
  return `${Math.floor(diffMs / 86400000)}d ago`;
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
}

const workerIcons: Record<string, typeof Activity> = {
  'contribution-collection': GitCommit,
  'governance-refresh': Shield,
  'leadership-refresh': Crown,
  'team-sync': Users,
};

const healthConfig = {
  healthy: {
    label: 'Healthy',
    color: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
    border: 'border-emerald-200/60',
    dot: 'bg-emerald-500',
    ringColor: 'ring-emerald-200',
  },
  warning: {
    label: 'Warning',
    color: 'text-amber-600',
    iconBg: 'bg-amber-50',
    border: 'border-amber-200/60',
    dot: 'bg-amber-500',
    ringColor: 'ring-amber-200',
  },
  error: {
    label: 'Error',
    color: 'text-red-600',
    iconBg: 'bg-red-50',
    border: 'border-red-200/60',
    dot: 'bg-red-500',
    ringColor: 'ring-red-200',
  },
  idle: {
    label: 'Idle',
    color: 'text-gray-500',
    iconBg: 'bg-gray-100',
    border: 'border-gray-200',
    dot: 'bg-gray-400',
    ringColor: 'ring-gray-200',
  },
};

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string; icon: typeof Activity }> = {
  operational: { label: 'All Systems Operational', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2 },
  warning: { label: 'Partial Degradation', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertTriangle },
  degraded: { label: 'System Degraded', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: XCircle },
};

const jobStatusStyles: Record<string, { color: string; bg: string }> = {
  completed: { color: 'text-emerald-700', bg: 'bg-emerald-50' },
  running: { color: 'text-blue-700', bg: 'bg-blue-50' },
  pending: { color: 'text-gray-600', bg: 'bg-gray-100' },
  failed: { color: 'text-red-700', bg: 'bg-red-50' },
};

const jobTypeLabels: Record<string, string> = {
  sync: 'Daily Sync',
  full_sync: 'Full History Sync',
  governance_refresh: 'Governance Refresh',
  leadership_refresh: 'Leadership Refresh',
  team_sync: 'Team Sync',
};

function QueueBar({ stats }: { stats: QueueStats }) {
  const total = stats.completed + stats.failed + stats.active + stats.waiting;
  if (total === 0) return <div className="h-1.5 rounded-full bg-gray-100 w-full" />;
  const segments = [
    { count: stats.completed, color: 'bg-emerald-500' },
    { count: stats.active, color: 'bg-blue-500' },
    { count: stats.waiting, color: 'bg-gray-300' },
    { count: stats.failed, color: 'bg-red-500' },
  ];
  return (
    <div className="h-1.5 rounded-full bg-gray-100 w-full flex overflow-hidden">
      {segments.map((seg, i) =>
        seg.count > 0 ? (
          <div key={i} className={`${seg.color} h-full transition-all duration-700`} style={{ width: `${(seg.count / total) * 100}%` }} />
        ) : null
      )}
    </div>
  );
}

function WorkerCard({ worker }: { worker: WorkerInfo }) {
  const hc = healthConfig[worker.health];
  const Icon = workerIcons[worker.id] || Activity;
  const isActive = worker.queue.active > 0;

  return (
    <div className={`
      relative bg-white rounded-2xl border ${hc.border} p-5 shadow-sm
      transition-all duration-300 hover:shadow-md hover:border-gray-300
    `}>
      {isActive && (
        <div className="absolute top-3.5 right-3.5">
          <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
            <span className="sys-processing-dot-light" />
            PROCESSING
          </div>
        </div>
      )}

      <div className="flex items-start gap-3.5 mb-4">
        <div className={`w-10 h-10 rounded-xl ${hc.iconBg} flex items-center justify-center flex-shrink-0 ring-1 ${hc.ringColor}`}>
          <Icon className={`w-[18px] h-[18px] ${hc.color}`} strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{worker.name}</h3>
            <span className={`sys-health-dot ${hc.dot} ${worker.health === 'healthy' ? 'sys-dot-pulse-light' : ''}`} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5 leading-snug">{worker.description}</p>
        </div>
      </div>

      <div className="mb-3">
        <QueueBar stats={worker.queue} />
        <div className="flex justify-between mt-2 text-xs font-mono text-gray-500">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />{worker.queue.completed} done</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />{worker.queue.active} active</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />{worker.queue.waiting} queued</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />{worker.queue.failed} err</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-gray-400 mb-0.5">Last Success</p>
          <p className="text-sm font-medium text-gray-700">{formatRelativeTime(worker.lastSuccess)}</p>
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-gray-400 mb-0.5">Next Run</p>
          <p className="text-sm font-medium text-gray-700">{formatRelativeTime(worker.schedule.nextRun)}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <Clock className="w-3 h-3 text-gray-400" />
        <span className="text-xs font-mono text-gray-400">{worker.schedule.human}</span>
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function JobRow({ job, isExpanded, onToggle }: { job: JobRecord; isExpanded: boolean; onToggle: () => void }) {
  const style = jobStatusStyles[job.status] || jobStatusStyles.pending;
  const label = jobTypeLabels[job.jobType] || job.jobType;
  const isRunning = job.status === 'running';
  const duration =
    job.startedAt && job.completedAt
      ? Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)
      : job.startedAt && isRunning
        ? Math.round((Date.now() - new Date(job.startedAt).getTime()) / 1000)
        : null;
  const hasErrors = job.errorsCount > 0 && !!job.errorDetails;
  const clickable = !!hasErrors;

  return (
    <>
      <tr
        className={`group border-b border-gray-50 hover:bg-gray-50/60 transition-colors ${clickable ? 'cursor-pointer' : ''}`}
        onClick={clickable ? onToggle : undefined}
      >
        <td className="py-3 px-4">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-semibold ${style.color} ${style.bg}`}>
            {isRunning && <span className="sys-processing-dot-light" />}
            {job.status.toUpperCase()}
          </span>
        </td>
        <td className="py-3 px-4">
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </td>
        <td className="py-3 px-4">
          {job.scope ? (
            <span className="inline-flex items-center gap-1 text-xs font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">
              <Tag className="w-3 h-3 text-gray-400" />
              {job.scope}
            </span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )}
        </td>
        <td className="py-3 px-4 text-sm text-gray-500 font-mono">{formatDateTime(job.startedAt || job.createdAt)}</td>
        <td className="py-3 px-4">
          {duration !== null ? (
            <span className={`text-sm font-mono ${isRunning ? 'text-blue-600' : 'text-gray-500'}`}>
              {formatDuration(duration)}{isRunning ? '...' : ''}
            </span>
          ) : (
            <span className="text-sm text-gray-300">—</span>
          )}
        </td>
        <td className="py-3 px-4 text-right">
          <span className="text-sm font-mono text-gray-500">{job.recordsProcessed > 0 ? job.recordsProcessed.toLocaleString() : '—'}</span>
        </td>
        <td className="py-3 px-4 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <span className={`text-sm font-mono ${job.errorsCount > 0 ? 'text-red-600 font-semibold' : 'text-gray-300'}`}>
              {job.errorsCount > 0 ? job.errorsCount : '—'}
            </span>
            {hasErrors && (
              <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
            )}
          </div>
        </td>
      </tr>
      {isExpanded && hasErrors && (
        <tr className="border-b border-gray-50">
          <td colSpan={7} className="px-4 py-3 bg-red-50/50">
            <pre className="text-xs font-mono text-red-700 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
              {typeof job.errorDetails === 'string' ? job.errorDetails : JSON.stringify(job.errorDetails, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

export default function SystemStatus() {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatus,
    refetchInterval: 15000,
    placeholderData: (prev) => prev,
  });

  if (isLoading) return <PageLoading message="Initializing system diagnostics..." />;

  if (error) {
    return (
      <PageError
        title="System Status Unavailable"
        message={(error as Error).message}
        hint="The backend server or Redis instance may be unreachable"
        onRetry={() => refetch()}
      />
    );
  }

  if (!data) return null;

  const sysStatus = statusConfig[data.system.status] || statusConfig.operational;
  const SysIcon = sysStatus.icon;

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">System Status</h1>
            <p className="text-sm text-gray-500 mt-0.5">Worker health & data pipeline monitoring</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
              <Activity className="w-3.5 h-3.5" />
              <span>Auto-refreshes every 15s</span>
            </div>
          </div>
        </div>

        {/* System overview banner */}
        <div className={`rounded-2xl border ${sysStatus.border} ${sysStatus.bg} p-5 mb-6`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${sysStatus.bg} border ${sysStatus.border} flex items-center justify-center`}>
                <SysIcon className={`w-6 h-6 ${sysStatus.color}`} />
              </div>
              <div>
                <h2 className={`text-lg font-bold ${sysStatus.color}`}>{sysStatus.label}</h2>
                <p className="text-xs font-mono text-gray-500 mt-0.5">
                  Last checked: {new Date(data.system.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZoneName: 'short' })}
                </p>
              </div>
            </div>
            <div className="flex gap-6">
              {[
                { icon: Tag, label: 'Version', value: data.system.version },
                { icon: Timer, label: 'Uptime', value: formatUptime(data.system.uptime) },
                { icon: Layers, label: 'Workers', value: String(data.workers.length) },
                { icon: Zap, label: 'Jobs (recent)', value: String(data.jobSummary.total) },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <div className="flex items-center gap-1.5 text-gray-400 mb-0.5 justify-center">
                    <item.icon className="w-3 h-3" />
                    <span className="text-xs font-mono uppercase tracking-wider">{item.label}</span>
                  </div>
                  <p className="text-base font-bold font-mono text-gray-900">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Worker Cards */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Server className="w-4 h-4 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Data Pipeline Workers</h2>
          </div>
          {data.workers.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
              <Server className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No workers configured</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.workers.map((worker) => (
                <WorkerCard key={worker.id} worker={worker} />
              ))}
            </div>
          )}
        </section>

        {/* Job Summary Stats */}
        <section className="mb-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Completed', count: data.jobSummary.completed || 0, icon: CheckCircle2, color: 'text-emerald-600', iconBg: 'bg-emerald-50', border: 'border-emerald-100' },
              { label: 'Running', count: data.jobSummary.running || 0, icon: Activity, color: 'text-blue-600', iconBg: 'bg-blue-50', border: 'border-blue-100' },
              { label: 'Pending', count: data.jobSummary.pending || 0, icon: Clock, color: 'text-gray-600', iconBg: 'bg-gray-100', border: 'border-gray-200' },
              { label: 'Failed', count: data.jobSummary.failed || 0, icon: XCircle, color: 'text-red-600', iconBg: 'bg-red-50', border: 'border-red-100' },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-xl border ${stat.border} bg-white p-4 flex items-center gap-3 shadow-sm`}>
                <div className={`w-9 h-9 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <div>
                  <p className={`text-xl font-bold font-mono ${stat.color}`}>{stat.count}</p>
                  <p className="text-xs font-mono uppercase tracking-wider text-gray-400">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recent Jobs Table */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">Recent Job Executions</h2>
            </div>
            <span className="text-xs font-mono text-gray-400">Last {data.recentJobs.length} jobs</span>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Status</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Job Type</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Scope</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Started</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Duration</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase py-3 px-4">Records</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase py-3 px-4">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentJobs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-sm text-gray-400">
                        No job executions recorded yet
                      </td>
                    </tr>
                  ) : (
                    data.recentJobs.map((job) => (
                      <JobRow
                        key={job.id}
                        job={job}
                        isExpanded={expandedJobId === job.id}
                        onToggle={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
