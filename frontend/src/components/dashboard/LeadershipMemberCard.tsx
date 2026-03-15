import { ArrowUpRight, Crown } from 'lucide-react';
import { LeadershipMember } from './types';

interface LeadershipMemberCardProps {
  member: LeadershipMember;
}

export function LeadershipMemberCard({ member }: LeadershipMemberCardProps) {
  const activeApproverRoles = member.roles.filter(r => r.roleType === 'approver' && r.isActive);
  const activeReviewerRoles = member.roles.filter(r => r.roleType === 'reviewer' && r.isActive);

  // Determine primary role
  const isApprover = activeApproverRoles.length > 0;
  const isReviewerOnly = !isApprover && activeReviewerRoles.length > 0;

  // Get unique projects (deduplicated)
  const projectsMap = new Map<string, { name: string; canApprove: boolean }>();
  for (const role of activeApproverRoles) {
    projectsMap.set(role.projectId, { name: role.projectName, canApprove: true });
  }
  for (const role of activeReviewerRoles) {
    if (!projectsMap.has(role.projectId)) {
      projectsMap.set(role.projectId, { name: role.projectName, canApprove: false });
    }
  }
  const projects = Array.from(projectsMap.values());

  return (
    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
      <img
        src={member.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=e5e7eb&color=374151`}
        alt={member.name}
        className="w-10 h-10 rounded-full ring-2 ring-white shadow-sm"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-gray-900">{member.name}</p>
          {isApprover && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
              <Crown className="w-3 h-3" />
              {activeApproverRoles[0]?.roleLabel || 'Approver'}
            </span>
          )}
          {isReviewerOnly && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
              {activeReviewerRoles[0]?.roleLabel || 'Reviewer'}
            </span>
          )}
        </div>
        {member.githubUsername && (
          <a
            href={`https://github.com/${member.githubUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-500 hover:text-blue-600 inline-flex items-center gap-1"
          >
            @{member.githubUsername}
            <ArrowUpRight className="w-3 h-3" />
          </a>
        )}
        {projects.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {projects.map((proj, idx) => (
              <span
                key={idx}
                className={`text-xs px-2 py-0.5 rounded ${
                  proj.canApprove 
                    ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}
                title={proj.canApprove ? `Can approve PRs in ${proj.name}` : `Can review PRs in ${proj.name}`}
              >
                {proj.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
