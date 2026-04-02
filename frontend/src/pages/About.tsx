import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  GitCommit,
  GitPullRequest,
  MessageSquare,
  AlertCircle,
  Database,
  TrendingUp,
  BarChart3,
  Shield,
  Users,
  ArrowRight,
  ExternalLink,
  BookOpen,
  Github,
  Mail,
  Bug,
  Lightbulb,
  PlusCircle,
  UserCog,
} from 'lucide-react';
import { PageLoading } from '../components/common/PageLoading';
import { apiFetch } from '../lib/api';

interface AppConfig {
  orgName: string;
  orgDescription: string;
  orgDocsUrl: string;
  adminContactName?: string;
  adminContactUrl?: string;
  version: string;
}

async function fetchConfig(): Promise<AppConfig> {
  const res = await apiFetch('/api/config');
  if (!res.ok) throw new Error('Failed to fetch config');
  return res.json();
}

const pipelineSteps = [
  {
    icon: Github,
    title: 'Collect',
    description: 'Automated collection of commits, PRs, reviews, and issues from GitHub repositories',
    color: 'text-gray-700',
    bg: 'bg-gray-100',
  },
  {
    icon: Users,
    title: 'Identify',
    description: 'Contributors are matched to your team by GitHub username against org members',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    icon: TrendingUp,
    title: 'Analyze',
    description: 'Automated trend detection and insight generation from aggregated contribution data',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
  {
    icon: BarChart3,
    title: 'Report',
    description: 'Executive dashboards with KPIs, contribution breakdowns, and leadership tracking',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
];

const contributionTypes = [
  { icon: GitCommit, label: 'Commits', description: 'All commits on the default branch, excluding merge commits', color: 'text-blue-600' },
  { icon: GitPullRequest, label: 'Pull Requests', description: 'All PRs created — open, merged, and closed', color: 'text-purple-600' },
  { icon: MessageSquare, label: 'Code Reviews', description: 'Count of reviews submitted on pull requests', color: 'text-green-600' },
  { icon: AlertCircle, label: 'Issues', description: 'All issues created across tracked repositories', color: 'text-orange-600' },
];

const resources = [
  { label: 'Source Code', href: 'https://github.com/dpanshug/upstream-pulse', icon: Github },
  { label: 'Architecture', href: 'https://github.com/dpanshug/upstream-pulse/blob/main/docs/ARCHITECTURE.md', icon: BookOpen },
  { label: 'Contributing Guide', href: 'https://github.com/dpanshug/upstream-pulse/blob/main/CONTRIBUTING.md', icon: BookOpen },
];

export default function About() {
  const { data: config, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: fetchConfig,
    staleTime: Infinity,
  });

  if (isLoading) {
    return <PageLoading message="Loading…" />;
  }

  const orgName = config?.orgName || 'your organization';
  const hasOrg = config?.orgName && config.orgName !== 'My Organization';
  const orgDescription = config?.orgDescription;
  const orgDocsUrl = config?.orgDocsUrl;

  return (
    <div className="bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Hero */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Upstream Pulse</h1>
          </div>
          {hasOrg ? (
            <p className="text-gray-600 text-[15px] leading-relaxed max-w-2xl">
              {orgDescription || (
                <>Tracking open source contributions and community leadership for <span className="font-semibold text-gray-900">{orgName}</span> across upstream projects.</>
              )}
            </p>
          ) : (
            <p className="text-gray-600 text-[15px] leading-relaxed max-w-2xl">
              Track and analyze your organization's contributions across upstream open source
              communities with automated, data-driven insights.
            </p>
          )}
        </div>

        {/* What does it answer? */}
        <section className="mb-10">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Questions Upstream Pulse answers
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                'How is our team showing up in upstream communities?',
                'Where do we hold maintainer or leadership positions?',
                'What is our contribution share vs the overall community?',
                'What are the historic trends in our involvement?',
              ].map((q) => (
                <div key={q} className="flex items-start gap-2.5 text-[14px] text-gray-700 bg-gray-50 rounded-lg px-3.5 py-2.5">
                  <ArrowRight className="w-3.5 h-3.5 mt-0.5 text-blue-500 flex-shrink-0" />
                  <span>{q}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Key Concepts */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">What we track</h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
            {/* Contribution types */}
            <div className="p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Database className="w-4 h-4 text-gray-400" />
                Contribution types
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {contributionTypes.map((type) => (
                  <div key={type.label} className="flex items-start gap-3">
                    <type.icon className={`w-4 h-4 mt-0.5 ${type.color} flex-shrink-0`} />
                    <div>
                      <p className="text-[13px] font-medium text-gray-900">{type.label}</p>
                      <p className="text-[12px] text-gray-500">{type.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Leadership */}
            <div className="p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4 text-gray-400" />
                Leadership & governance
              </h3>
              <p className="text-[13px] text-gray-500 leading-relaxed">
                Upstream Pulse tracks community leadership positions and governance roles across
                upstream organizations — including maintainer status from OWNERS and CODEOWNERS files,
                steering committees, TSCs, and working group chairs. Data is collected automatically
                from project governance files.
              </p>
            </div>
            {/* Identity resolution */}
            <div className="p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                Team identification
              </h3>
              <p className="text-[13px] text-gray-500 leading-relaxed">
                Team members are synced from
                {hasOrg ? ` ${orgName}'s` : ' your'} GitHub organization. When contributions are
                collected, each author's GitHub username is matched against this list - matched
                contributions count as "Team", everything else counts as "External".
              </p>
            </div>
          </div>
        </section>

        {/* How it works — Pipeline */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">How it works</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {pipelineSteps.map((step, i) => (
              <div
                key={step.title}
                className="relative bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-lg ${step.bg} flex items-center justify-center`}>
                    <step.icon className={`w-4 h-4 ${step.color}`} />
                  </div>
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Step {i + 1}
                  </span>
                </div>
                <h3 className="text-[15px] font-semibold text-gray-900 mb-1.5">{step.title}</h3>
                <p className="text-[13px] text-gray-500 leading-relaxed">{step.description}</p>
                {i < pipelineSteps.length - 1 && (
                  <ArrowRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 z-10" />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Resources & Links */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Resources</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {orgDocsUrl && (
              <a
                href={orgDocsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-gray-200 hover:shadow transition-all group"
              >
                <BookOpen className="w-5 h-5 text-blue-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                    {orgName} Docs
                  </p>
                  <p className="text-[12px] text-gray-400 truncate">Team documentation</p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-400 transition-colors" />
              </a>
            )}
            {resources.map((r) => (
              <a
                key={r.label}
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-gray-200 hover:shadow transition-all group"
              >
                <r.icon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                    {r.label}
                  </p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-400 transition-colors" />
              </a>
            ))}
          </div>
        </section>

        {/* Help & Feedback */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Help & feedback</h2>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Public — GitHub Issues */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Github className="w-4 h-4 text-gray-700" />
                </div>
                <h3 className="text-[14px] font-semibold text-gray-900">Open Source Requests</h3>
              </div>
              <p className="text-[13px] text-gray-500 leading-relaxed mb-4">
                For improvements to the project that benefit all deployments — filed publicly on GitHub.
              </p>
              <div className="space-y-2 mb-4 flex-1">
                {[
                  { icon: PlusCircle, label: 'Request a new project or org', template: 'add-project.yml' },
                  { icon: Bug, label: 'Report a data collection bug', template: 'data-correction.yml' },
                  { icon: Lightbulb, label: 'Suggest a feature or improvement', template: 'general-feedback.yml' },
                ].map((item) => (
                  <a
                    key={item.template}
                    href={`https://github.com/dpanshug/upstream-pulse/issues/new?template=${item.template}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 text-[13px] text-gray-700 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 rounded-lg px-3 py-2 transition-colors group"
                  >
                    <item.icon className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 flex-shrink-0 transition-colors" />
                    <span className="flex-1">{item.label}</span>
                    <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-blue-400 transition-colors" />
                  </a>
                ))}
              </div>
              <a
                href="https://github.com/dpanshug/upstream-pulse/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-gray-400 hover:text-blue-500 transition-colors flex items-center gap-1"
              >
                View all issues <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Private — Admin Contact */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100/60 p-5 flex flex-col">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <UserCog className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="text-[14px] font-semibold text-gray-900">Your Team's Data</h3>
              </div>
              <p className="text-[13px] text-gray-600 leading-relaxed mb-4">
                For issues specific to this dashboard instance — these involve internal team information and are handled privately.
              </p>
              <div className="space-y-2 mb-4 flex-1">
                {[
                  'Wrong seat count or team member list',
                  'Identity merge (same person, multiple entries)',
                  'Missing or misattributed contributions',
                  'Stale maintainer or leadership data',
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2.5 text-[13px] text-gray-600 bg-blue-100/40 rounded-lg px-3 py-2"
                  >
                    <ArrowRight className="w-3 h-3 text-blue-400 flex-shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              {config?.adminContactName ? (
                <div className="flex items-center gap-2.5 pt-2 border-t border-blue-100/60">
                  <Mail className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <p className="text-[13px] text-gray-700">
                    Contact{' '}
                    {config.adminContactUrl ? (
                      <a
                        href={config.adminContactUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-2 decoration-blue-300 hover:decoration-blue-500 transition-colors"
                      >
                        {config.adminContactName}
                      </a>
                    ) : (
                      <span className="font-semibold text-gray-900">{config.adminContactName}</span>
                    )}
                  </p>
                </div>
              ) : (
                <p className="text-[12px] text-gray-400 pt-2 border-t border-blue-100/60">
                  Admin contact not configured. Set <code className="text-[11px] bg-blue-100/50 px-1 py-0.5 rounded">ADMIN_CONTACT_NAME</code> to enable.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Footer meta */}
        <div className="text-center pb-4">
          <p className="text-[12px] text-gray-400">
            Upstream Pulse v{config?.version || '1.0.0'} · Apache License 2.0
          </p>
        </div>

      </div>
    </div>
  );
}
