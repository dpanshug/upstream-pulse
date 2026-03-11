import { Link } from 'react-router-dom';
import { ExternalLink, GitCommit, GitPullRequest, MessageSquare, AlertCircle, Users } from 'lucide-react';

export interface ProjectMetric {
  total: number;
  team: number;
  teamPercent: number;
}

export interface ProjectData {
  id: string;
  name: string;
  githubOrg: string;
  githubRepo: string;
  contributions: {
    commits: ProjectMetric;
    pullRequests: ProjectMetric;
    reviews: ProjectMetric;
    issues: ProjectMetric;
    all: ProjectMetric;
  };
  activeContributors: number;
}

const TYPE_CONFIG = [
  { key: 'commits' as const, label: 'Commits', icon: GitCommit, color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'pullRequests' as const, label: 'PRs', icon: GitPullRequest, color: 'text-purple-600', bg: 'bg-purple-50' },
  { key: 'reviews' as const, label: 'Reviews', icon: MessageSquare, color: 'text-green-600', bg: 'bg-green-50' },
  { key: 'issues' as const, label: 'Issues', icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-50' },
];

interface ProjectCardProps {
  project: ProjectData;
  selectedDays: number;
  orgSlug?: string;
}

export function ProjectCard({ project, selectedDays, orgSlug }: ProjectCardProps) {
  return (
    <Link
      to={`/organizations/${orgSlug ?? project.githubOrg}/projects/${project.id}?days=${selectedDays}`}
      className="block bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-blue-200 transition-all group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
            {project.name}
          </h3>
          <span className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
            {project.githubOrg}/{project.githubRepo}
            <ExternalLink className="w-3 h-3" />
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0 ml-2">
          <Users className="w-3.5 h-3.5" />
          <span>{project.activeContributors}</span>
        </div>
      </div>

      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl font-bold text-gray-900">
          {project.contributions.all.team.toLocaleString()}
        </span>
        <span className="text-sm text-gray-500">Team Contributions</span>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-500">Team's share</span>
          <span className="font-medium text-gray-700">
            {project.contributions.all.teamPercent.toFixed(1)}%
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className="bg-blue-600 h-1.5 rounded-full transition-all"
            style={{ width: `${Math.min(project.contributions.all.teamPercent, 100)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {TYPE_CONFIG.map(({ key, label, icon: Icon, color, bg }) => (
          <div key={key} className="text-center">
            <div className={`inline-flex items-center justify-center w-7 h-7 ${bg} rounded-md mb-1`}>
              <Icon className={`w-3.5 h-3.5 ${color}`} />
            </div>
            <p className="text-sm font-semibold text-gray-900">
              {project.contributions[key].team}
            </p>
            <p className="text-[10px] text-gray-400 leading-tight">{label}</p>
          </div>
        ))}
      </div>
    </Link>
  );
}

interface ProjectCardsProps {
  projects: ProjectData[];
  selectedDays: number;
  orgSlug?: string;
  totalCount?: number;
}

export function ProjectCards({ projects, selectedDays, orgSlug, totalCount }: ProjectCardsProps) {
  if (!projects || projects.length === 0) return null;

  const showViewAll = totalCount !== undefined && totalCount > projects.length;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Top Projects</h2>
        {showViewAll ? (
          <Link to="/projects" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            View all {totalCount} projects →
          </Link>
        ) : (
          <p className="text-sm text-gray-500">{projects.length} tracked projects</p>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            selectedDays={selectedDays}
            orgSlug={orgSlug}
          />
        ))}
      </div>
    </section>
  );
}
