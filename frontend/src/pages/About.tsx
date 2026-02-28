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
} from 'lucide-react';
import { PageLoading } from '../components/common/PageLoading';

const API_URL = import.meta.env.VITE_API_URL ?? '';

interface AppConfig {
  orgName: string;
  orgDescription: string;
  orgDocsUrl: string;
  adminContactName?: string;
  adminContactUrl?: string;
  version: string;
}

async function fetchConfig(): Promise<AppConfig> {
  const res = await fetch(`${API_URL}/api/config`);
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
    description: 'Identity resolution maps contributors to your team members via email and GitHub org',
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
  { icon: GitCommit, label: 'Commits', description: 'Code changes merged into project repositories', color: 'text-blue-600' },
  { icon: GitPullRequest, label: 'Pull Requests', description: 'Proposed changes submitted for review', color: 'text-purple-600' },
  { icon: MessageSquare, label: 'Code Reviews', description: 'Feedback and approvals on others\' pull requests', color: 'text-green-600' },
  { icon: AlertCircle, label: 'Issues', description: 'Bug reports, feature requests, and discussions', color: 'text-orange-600' },
];

const resources = [
  { label: 'Source Code', href: 'https://github.com/dpanshug/upstream-pulse', icon: Github },
  { label: 'Governance Models', href: 'https://github.com/dpanshug/upstream-pulse/blob/main/docs/governance-models.md', icon: BookOpen },
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
                Upstream Pulse tracks maintainer status, OWNERS file entries, steering committee
                membership, and working group chairs/leads. This data is collected from project
                governance files and GitHub organization roles.
              </p>
            </div>
            {/* Identity resolution */}
            <div className="p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                Team identification
              </h3>
              <p className="text-[13px] text-gray-500 leading-relaxed">
                Contributors are matched to your team using email domain
                {hasOrg ? ` and ${orgName}'s GitHub organization membership` : ' and GitHub organization membership'}.
                This enables accurate team-vs-community contribution comparisons.
              </p>
            </div>
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

        {/* Admin contact — only shown when configured */}
        {config?.adminContactName && (
          <section className="mb-10">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100/60 p-5">
              <div className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Mail className="w-[18px] h-[18px] text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] text-gray-700 leading-relaxed">
                    Need an upstream project onboarded to the tracking pipeline, or want to adjust contribution metrics and coverage?{' '}
                    {config.adminContactUrl ? (
                      <a
                        href={config.adminContactUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-2 decoration-blue-300 hover:decoration-blue-500 transition-colors"
                      >
                        Reach out to {config.adminContactName}
                      </a>
                    ) : (
                      <span className="font-semibold text-gray-900">
                        Reach out to {config.adminContactName}
                      </span>
                    )}
                    {' '}to get it configured.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

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
