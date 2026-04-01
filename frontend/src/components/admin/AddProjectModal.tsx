import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  X,
  FolderGit2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Sparkles,
  Play,
  History,
  Search,
  Building2,
  Check,
  Star,
  CircleDot,
  ArrowRight,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL ?? '';

interface Org {
  name: string;
  githubOrg: string;
  projectCount: number;
}

interface RepoInfo {
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  createdAt: string;
}

interface CreateProjectResult {
  success: boolean;
  project: { id: string; name: string; githubOrg: string; githubRepo: string };
  repoCreatedAt: string;
  collection: { jobId: string } | null;
  governance: { jobId: string } | null;
  leadership: { jobId: string } | null;
  jobErrors?: string[];
}

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; result: CreateProjectResult }
  | { status: 'error'; message: string; code?: number };

type RepoLookup =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'found'; info: RepoInfo }
  | { status: 'not_found' }
  | { status: 'error' };

async function fetchOrgs(): Promise<Org[]> {
  const res = await fetch(`${API_URL}/api/orgs?days=0`);
  if (!res.ok) throw new Error('Failed to fetch organizations');
  const data = await res.json();
  return data.orgs ?? [];
}

function humanizeName(repo: string): string {
  return repo
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Searchable Org Combobox ────────────────────────────────────────

interface OrgComboboxProps {
  orgs: Org[];
  value: string;
  onChange: (githubOrg: string) => void;
  disabled?: boolean;
}

function OrgCombobox({ orgs, value, onChange, disabled }: OrgComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const sortedOrgs = useMemo(
    () => [...orgs].sort((a, b) => a.name.localeCompare(b.name)),
    [orgs],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return sortedOrgs;
    const q = search.toLowerCase();
    return sortedOrgs.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.githubOrg.toLowerCase().includes(q),
    );
  }, [sortedOrgs, search]);

  const selected = orgs.find((o) => o.githubOrg === value);

  useEffect(() => {
    setHighlightIdx(0);
  }, [search]);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-org-item]');
    items[highlightIdx]?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, isOpen]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[highlightIdx]) {
          onChange(filtered[highlightIdx].githubOrg);
          setIsOpen(false);
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  }

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`
          w-full flex items-center justify-between pl-3 pr-3 py-2.5 text-sm
          border rounded-xl bg-white outline-none transition-all
          disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
          ${isOpen
            ? 'border-blue-500 ring-2 ring-blue-500'
            : 'border-gray-300 hover:border-gray-400'
          }
        `}
      >
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="truncate font-medium text-gray-900">{selected.name}</span>
            <span className="text-gray-400 flex-shrink-0">{selected.githubOrg}</span>
          </span>
        ) : (
          <span className="text-gray-400">Select an organization...</span>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1.5 w-full bg-white rounded-xl border border-gray-200 shadow-[0_12px_40px_rgba(0,0,0,0.12)] overflow-hidden animate-[dialog-in_150ms_cubic-bezier(0.16,1,0.3,1)]">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search organizations..."
                className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder:text-gray-400"
              />
            </div>
          </div>

          <div ref={listRef} role="listbox" className="max-h-[240px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                No organizations match "{search}"
              </div>
            ) : (
              filtered.map((org, idx) => {
                const isSelected = org.githubOrg === value;
                const isHighlighted = idx === highlightIdx;
                return (
                  <button
                    key={org.githubOrg}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-org-item
                    onClick={() => {
                      onChange(org.githubOrg);
                      setIsOpen(false);
                    }}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors
                      ${isHighlighted ? 'bg-blue-50' : ''}
                      ${isSelected && !isHighlighted ? 'bg-gray-50' : ''}
                    `}
                  >
                    <div className={`
                      w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                      ${isSelected ? 'bg-blue-100' : 'bg-gray-100'}
                    `}>
                      <Building2 className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium truncate ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>
                          {org.name}
                        </span>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {org.githubOrg}
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-400">
                        {org.projectCount} project{org.projectCount !== 1 ? 's' : ''} tracked
                      </span>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Repo info card (shown when repo is found) ──────────────────────

function RepoInfoCard({ info }: { info: RepoInfo }) {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 mt-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            <span className="text-[13px] font-medium text-gray-900 truncate">
              {info.fullName}
            </span>
          </div>
          {info.description && (
            <p className="text-[12px] text-gray-500 mt-1 line-clamp-2 ml-[22px]">
              {info.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 text-[11px] text-gray-400 mt-0.5">
          {info.language && (
            <span className="flex items-center gap-1">
              <CircleDot className="w-3 h-3" />
              {info.language}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Star className="w-3 h-3" />
            {info.stars >= 1000 ? `${(info.stars / 1000).toFixed(1)}k` : info.stars}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Add Project Modal ──────────────────────────────────────────────

interface AddProjectModalProps {
  open: boolean;
  onClose: () => void;
  prefilledOrg?: string;
}

export default function AddProjectModal({ open, onClose, prefilledOrg }: AddProjectModalProps) {
  const queryClient = useQueryClient();
  const repoInputRef = useRef<HTMLInputElement>(null);
  const lookupTimer = useRef<ReturnType<typeof setTimeout>>();

  const [githubOrg, setGithubOrg] = useState(prefilledOrg ?? '');
  const [githubRepo, setGithubRepo] = useState('');
  const [name, setName] = useState('');
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [primaryLanguage, setPrimaryLanguage] = useState('');
  const [startCollection, setStartCollection] = useState(true);
  const [fullHistory, setFullHistory] = useState(true);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const [repoLookup, setRepoLookup] = useState<RepoLookup>({ status: 'idle' });

  const { data: orgs = [] } = useQuery({
    queryKey: ['orgs-list'],
    queryFn: fetchOrgs,
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setGithubOrg(prefilledOrg ?? '');
      setGithubRepo('');
      setName('');
      setNameManuallyEdited(false);
      setPrimaryLanguage('');
      setStartCollection(true);
      setFullHistory(true);
      setSubmitState({ status: 'idle' });
      setRepoLookup({ status: 'idle' });
    }
  }, [open, prefilledOrg]);

  // Debounced repo lookup
  useEffect(() => {
    clearTimeout(lookupTimer.current);

    const org = githubOrg.trim();
    const repo = githubRepo.trim();

    if (!org || !repo) {
      setRepoLookup({ status: 'idle' });
      if (!nameManuallyEdited) setName('');
      setPrimaryLanguage('');
      return;
    }

    if (!nameManuallyEdited) setName(humanizeName(repo));
    setRepoLookup({ status: 'checking' });

    lookupTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/github/repo-info?org=${encodeURIComponent(org)}&repo=${encodeURIComponent(repo)}`);
        if (res.ok) {
          const info: RepoInfo = await res.json();
          setRepoLookup({ status: 'found', info });
          if (!nameManuallyEdited) setName(humanizeName(info.name));
          if (info.language) setPrimaryLanguage(info.language);
        } else if (res.status === 404) {
          setRepoLookup({ status: 'not_found' });
          setPrimaryLanguage('');
        } else {
          setRepoLookup({ status: 'error' });
        }
      } catch {
        setRepoLookup({ status: 'error' });
      }
    }, 600);

    return () => clearTimeout(lookupTimer.current);
  }, [githubOrg, githubRepo]);

  const handleOrgChange = useCallback((slug: string) => {
    setGithubOrg(slug);
    setRepoLookup({ status: 'idle' });
    requestAnimationFrame(() => repoInputRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (submitState.status === 'submitting') return;
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose, submitState.status]);

  const selectedOrg = orgs.find((o) => o.githubOrg === githubOrg);
  const ecosystem = selectedOrg?.name ?? githubOrg ?? 'unknown';
  const repoVerified = repoLookup.status === 'found';
  const canSubmit = githubOrg.trim() && githubRepo.trim() && name.trim() && repoVerified && submitState.status !== 'submitting';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitState({ status: 'submitting' });

    try {
      const res = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          githubOrg: githubOrg.trim(),
          githubRepo: githubRepo.trim(),
          ecosystem,
          primaryLanguage: primaryLanguage.trim() || undefined,
          startCollection,
          fullHistory,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitState({
          status: 'error',
          message: data.error ?? data.message ?? 'Unknown error',
          code: res.status,
        });
        return;
      }

      setSubmitState({ status: 'success', result: data });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['orgs-list'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-projects'] });
    } catch {
      setSubmitState({
        status: 'error',
        message: 'Network error — could not reach the server',
      });
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px] animate-[fade-in_150ms_ease-out]"
        onClick={submitState.status === 'submitting' ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-project-title"
        className="relative bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.04)] w-[480px] max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto animate-[dialog-in_200ms_cubic-bezier(0.16,1,0.3,1)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <FolderGit2 className="w-5 h-5 text-blue-600" strokeWidth={1.7} />
            </div>
            <div>
              <h3 id="add-project-title" className="text-[15px] font-semibold text-gray-900">
                Add Project
              </h3>
              <p className="text-[13px] text-gray-500 mt-0.5">
                Track a new upstream repository
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitState.status === 'submitting'}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success state */}
        {submitState.status === 'success' && (
          <div className="px-6 pb-6">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-emerald-900">
                    Project created successfully
                  </p>
                  <p className="text-[13px] text-emerald-700 mt-1">
                    <span className="font-medium">{submitState.result.project.name}</span>
                    {' '}({submitState.result.project.githubOrg}/{submitState.result.project.githubRepo})
                  </p>
                  <div className="mt-3 space-y-1.5 text-[12px] text-emerald-700">
                    {submitState.result.governance && (
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        Governance collection started
                      </div>
                    )}
                    {submitState.result.leadership && (
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        Leadership refresh queued
                      </div>
                    )}
                    {submitState.result.collection && (
                      <div className="flex items-center gap-1.5">
                        <Play className="w-3.5 h-3.5" />
                        Contribution collection started
                        {submitState.result.repoCreatedAt && (
                          <span className="text-emerald-600">
                            (from {new Date(submitState.result.repoCreatedAt).getFullYear()})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Warning if some jobs couldn't be queued */}
            {submitState.result.jobErrors && submitState.result.jobErrors.length > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mt-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-medium text-amber-800">
                      Some background jobs could not be queued
                    </p>
                    <p className="text-[12px] text-amber-600 mt-0.5">
                      The project was created, but {submitState.result.jobErrors.join(', ')} job{submitState.result.jobErrors.length > 1 ? 's' : ''} failed to queue.
                      You can trigger them manually from the System page.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation links */}
            <div className="mt-3 flex flex-col gap-1.5">
              <Link
                to={`/organizations/${submitState.result.project.githubOrg}/projects/${submitState.result.project.id}`}
                onClick={onClose}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors group"
              >
                <span>View project details</span>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </Link>
              <Link
                to="/system"
                onClick={onClose}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors group"
              >
                <span>Monitor collection progress</span>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </Link>
            </div>

            <div className="flex justify-end mt-4 gap-2.5">
              <button
                onClick={() => {
                  setGithubRepo('');
                  setName('');
                  setNameManuallyEdited(false);
                  setPrimaryLanguage('');
                  setRepoLookup({ status: 'idle' });
                  setSubmitState({ status: 'idle' });
                }}
                className="px-4 py-2 text-[13px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Add Another
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 text-[13px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Form */}
        {submitState.status !== 'success' && (
          <form onSubmit={handleSubmit} className="px-6 pb-6">
            <div className="space-y-4">
              {/* Organization */}
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  Organization <span className="text-red-400">*</span>
                </label>
                <OrgCombobox
                  orgs={orgs}
                  value={githubOrg}
                  onChange={handleOrgChange}
                  disabled={submitState.status === 'submitting'}
                />
              </div>

              {/* Repository */}
              <div>
                <label htmlFor="add-proj-repo" className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  Repository Name <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 select-none pointer-events-none">
                    {githubOrg || '...'} /
                  </span>
                  <input
                    ref={repoInputRef}
                    id="add-proj-repo"
                    type="text"
                    value={githubRepo}
                    onChange={(e) => setGithubRepo(e.target.value)}
                    placeholder="e.g. model-registry"
                    disabled={submitState.status === 'submitting'}
                    style={{ paddingLeft: `${((githubOrg || '...').length + 3) * 0.52 + 0.75}rem` }}
                    className={`w-full pr-10 py-2.5 text-sm border rounded-xl outline-none transition-colors disabled:bg-gray-50 disabled:text-gray-500 ${
                      repoLookup.status === 'found'
                        ? 'border-emerald-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'
                        : repoLookup.status === 'not_found'
                          ? 'border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500'
                          : 'border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                    }`}
                  />
                  {/* Status indicator inside the input */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {repoLookup.status === 'checking' && (
                      <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                    )}
                    {repoLookup.status === 'found' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    )}
                    {repoLookup.status === 'not_found' && (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                </div>

                {/* Repo info or error */}
                {repoLookup.status === 'found' && (
                  <RepoInfoCard info={repoLookup.info} />
                )}
                {repoLookup.status === 'not_found' && (
                  <p className="mt-1.5 text-[12px] text-red-500">
                    Repository {githubOrg}/{githubRepo} was not found on GitHub.
                    {' '}
                    <a
                      href={`https://github.com/${githubOrg}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-red-700"
                    >
                      Browse {githubOrg} repos
                    </a>
                  </p>
                )}
                {repoLookup.status === 'error' && (
                  <p className="mt-1.5 text-[12px] text-amber-600">
                    Could not verify repository. You can still try to add it.
                  </p>
                )}
                {repoLookup.status === 'idle' && githubOrg && githubRepo && (
                  <p className="mt-1.5 text-[12px] text-gray-400">
                    Checking...
                  </p>
                )}
              </div>

              {/* Display Name (auto-filled, editable for overrides) */}
              <div>
                <label htmlFor="add-proj-name" className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  Display Name <span className="text-red-400">*</span>
                  {!nameManuallyEdited && name && (
                    <span className="text-gray-400 font-normal ml-1">auto-filled</span>
                  )}
                </label>
                <input
                  id="add-proj-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameManuallyEdited(true);
                  }}
                  placeholder="Auto-generated from repo name"
                  disabled={submitState.status === 'submitting'}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>

              {/* Primary Language (auto-filled from GitHub, still editable) */}
              <div>
                <label htmlFor="add-proj-lang" className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  Primary Language
                  <span className="text-gray-400 font-normal ml-1">
                    {repoLookup.status === 'found' && repoLookup.info.language ? 'from GitHub' : 'optional'}
                  </span>
                </label>
                <input
                  id="add-proj-lang"
                  type="text"
                  value={primaryLanguage}
                  onChange={(e) => setPrimaryLanguage(e.target.value)}
                  placeholder="e.g. Python, Go, TypeScript"
                  disabled={submitState.status === 'submitting'}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>

              {/* Collection options */}
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-3">
                <p className="text-[13px] font-medium text-gray-700">Collection Options</p>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={startCollection}
                    onChange={(e) => setStartCollection(e.target.checked)}
                    disabled={submitState.status === 'submitting'}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <div>
                    <span className="text-sm text-gray-700 group-hover:text-gray-900 flex items-center gap-1.5">
                      <Play className="w-3.5 h-3.5 text-gray-400" />
                      Start collection immediately
                    </span>
                    <p className="text-[12px] text-gray-400 mt-0.5">
                      Begin collecting contributions right after creation
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={fullHistory}
                    onChange={(e) => setFullHistory(e.target.checked)}
                    disabled={submitState.status === 'submitting' || !startCollection}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <div>
                    <span className={`text-sm flex items-center gap-1.5 ${startCollection ? 'text-gray-700 group-hover:text-gray-900' : 'text-gray-400'}`}>
                      <History className="w-3.5 h-3.5 text-gray-400" />
                      Full history
                    </span>
                    <p className="text-[12px] text-gray-400 mt-0.5">
                      Collect from the repo's creation date (recommended for new projects)
                    </p>
                  </div>
                </label>
              </div>

              {/* Submit error */}
              {submitState.status === 'error' && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-800">
                        {submitState.code === 409
                          ? 'Already tracked'
                          : submitState.code === 404
                            ? 'Repository not found'
                            : 'Failed to create project'}
                      </p>
                      <p className="text-[13px] text-red-600 mt-0.5">
                        {submitState.message}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-6">
              <div className="text-[12px] text-gray-400">
                {repoLookup.status === 'found' && repoLookup.info.createdAt && (
                  <span>
                    Repo created {new Date(repoLookup.info.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitState.status === 'submitting'}
                  className="px-4 py-2 text-[13px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="px-4 py-2 text-[13px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitState.status === 'submitting' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Add Project'
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
