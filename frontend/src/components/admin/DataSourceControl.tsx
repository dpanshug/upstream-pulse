import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Loader2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';

export type DataSource = 'github' | 'collectoss';

interface InstanceConfig {
  dataSources?: { collectossEnabled: boolean; default: DataSource };
}

interface CoverageCounts {
  commits: number;
  prs: number;
  reviews: number;
  issues: number;
}

interface CollectossCoverage {
  configured: boolean;
  tracked: boolean;
  repoId?: number;
  days?: number;
  syncedThrough?: string | null;
  counts?: { collectoss: CoverageCounts; upstreamPulse: CoverageCounts };
}

/** Instance-level data source config (from /api/config — public, cached). */
export function useDataSourceConfig() {
  return useQuery<InstanceConfig>({
    queryKey: ['instance-config'],
    queryFn: async () => {
      const res = await apiFetch('/api/config');
      if (!res.ok) throw new Error('Failed to fetch config');
      return res.json();
    },
    staleTime: Infinity,
  });
}

export function DataSourceBadge({ dataSource }: { dataSource: DataSource }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${
        dataSource === 'collectoss' ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-600'
      }`}
      title={dataSource === 'collectoss' ? 'Contributions collected from CollectOSS' : 'Contributions collected from the GitHub API'}
    >
      <Database className="w-3 h-3" />
      {dataSource === 'collectoss' ? 'CollectOSS' : 'GitHub'}
    </span>
  );
}

const COUNT_LABELS: [keyof CoverageCounts, string][] = [
  ['commits', 'Commits'],
  ['prs', 'PRs'],
  ['reviews', 'Reviews'],
  ['issues', 'Issues'],
];

/**
 * Admin control on the project page: shows the active data source and lets
 * admins switch between GitHub and CollectOSS after reviewing CollectOSS
 * coverage for the repo. Non-admins only see the badge.
 */
export function DataSourceControl({
  projectId,
  dataSource,
  isAdmin,
}: {
  projectId: string;
  dataSource: DataSource;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: instanceConfig } = useDataSourceConfig();
  const collectossEnabled = instanceConfig?.dataSources?.collectossEnabled ?? false;

  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const target: DataSource = dataSource === 'collectoss' ? 'github' : 'collectoss';

  const { data: coverage, isLoading: coverageLoading, error: coverageError } = useQuery<CollectossCoverage>({
    queryKey: ['collectoss-coverage', projectId],
    queryFn: async () => {
      const res = await apiFetch(`/api/admin/projects/${projectId}/collectoss?days=90`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to check CollectOSS coverage');
      }
      return res.json();
    },
    enabled: open && isAdmin && collectossEnabled,
    staleTime: 5 * 60 * 1000,
  });

  const handleSwitch = useCallback(async () => {
    setSwitching(true);
    setMessage(null);
    try {
      const res = await apiFetch(`/api/admin/projects/${projectId}/data-source`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataSource: target }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: err.error || 'Failed to switch data source' });
        return;
      }
      setMessage({
        type: 'success',
        text: `Switched to ${target === 'collectoss' ? 'CollectOSS' : 'GitHub'} — applies from the next collection run`,
      });
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project-info', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
      ]);
    } catch {
      setMessage({ type: 'error', text: 'Failed to switch data source' });
    } finally {
      setSwitching(false);
    }
  }, [projectId, target, queryClient]);

  // Switching back to GitHub is always allowed; switching to CollectOSS requires it to be configured
  const canSwitch = isAdmin && (dataSource === 'collectoss' || collectossEnabled);
  const blockedByCoverage = target === 'collectoss' && coverage != null && !coverage.tracked;

  return (
    <div className="relative inline-flex items-center gap-2">
      <DataSourceBadge dataSource={dataSource} />
      {canSwitch && (
        <button
          type="button"
          onClick={() => { setOpen(o => !o); setMessage(null); }}
          className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
        >
          {open ? 'Close' : 'Change source'}
        </button>
      )}
      {message && (
        <span className={`text-xs font-medium ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
          {message.text}
        </span>
      )}

      {open && (
        <div className="absolute left-0 top-full mt-2 z-20 w-[22rem] bg-white rounded-xl border border-gray-200 shadow-lg p-4 text-left">
          <p className="text-sm font-semibold text-gray-900 mb-1">
            Switch to {target === 'collectoss' ? 'CollectOSS' : 'GitHub API'}?
          </p>
          <p className="text-xs text-gray-500 mb-3">
            Existing contributions are kept. Future collection runs use the selected source; records are
            matched by GitHub IDs so switching does not create duplicates.
          </p>

          {collectossEnabled && (
            <div className="mb-3 rounded-lg bg-gray-50 border border-gray-100 p-3">
              <p className="text-[11px] font-mono uppercase tracking-wider text-gray-400 mb-2">
                CollectOSS coverage · last 90 days
              </p>
              {coverageLoading && (
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Checking CollectOSS…
                </p>
              )}
              {coverageError && <p className="text-xs text-red-600">{(coverageError as Error).message}</p>}
              {coverage && !coverage.tracked && (
                <p className="text-xs text-amber-700">This repository is not tracked in CollectOSS.</p>
              )}
              {coverage?.tracked && coverage.counts && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="text-left font-normal pb-1" />
                      <th className="text-right font-normal pb-1">CollectOSS</th>
                      <th className="text-right font-normal pb-1">Stored now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COUNT_LABELS.map(([key, label]) => (
                      <tr key={key}>
                        <td className="text-gray-600 py-0.5">{label}</td>
                        <td className="text-right font-mono text-gray-800">
                          {coverage.counts?.collectoss[key].toLocaleString()}
                        </td>
                        <td className="text-right font-mono text-gray-500">
                          {coverage.counts?.upstreamPulse[key].toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSwitch}
              disabled={switching || blockedByCoverage || (target === 'collectoss' && coverageLoading)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {switching && <Loader2 className="w-3 h-3 animate-spin" />}
              Switch to {target === 'collectoss' ? 'CollectOSS' : 'GitHub'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
