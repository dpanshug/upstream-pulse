import { Shield, Crown, Users, ArrowUpRight } from 'lucide-react';
import { LeadershipData } from './types';
import { LeadershipMemberCard } from './LeadershipMemberCard';

interface LeadershipSectionProps {
  leadership: LeadershipData;
}

export function LeadershipSection({ leadership }: LeadershipSectionProps) {
  const { summary, teamLeaders, steeringCommittee } = leadership;

  // Count org-level leadership
  const hasOrgLeadership = (summary.steeringCommitteeCount ?? 0) > 0 || 
                           (summary.wgChairsCount ?? 0) > 0 || 
                           (summary.wgTechLeadsCount ?? 0) > 0;

  // Get members with org-level leadership roles
  const orgLeaders = teamLeaders.filter(m => m.leadershipRoles && m.leadershipRoles.length > 0);

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-amber-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Team Leadership
          </h2>
        </div>
        <p className="text-sm text-gray-500">
          Team influence in Kubeflow governance
        </p>
      </div>

      {/* Leadership Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* Steering Committee */}
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl shadow-sm border border-purple-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-4 h-4 text-purple-600" />
            <span className="text-xs font-medium text-purple-800">Steering Committee</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-purple-900">{summary.steeringCommitteeCount ?? 0}</span>
            <span className="text-xs text-purple-600">members</span>
          </div>
        </div>

        {/* WG Chairs */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl shadow-sm border border-amber-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-medium text-amber-800">WG Chairs</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-amber-900">{summary.wgChairsCount ?? 0}</span>
            <span className="text-xs text-amber-600">roles</span>
          </div>
        </div>

        {/* WG Tech Leads */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-medium text-gray-700">WG Tech Leads</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-gray-900">{summary.wgTechLeadsCount ?? 0}</span>
            <span className="text-xs text-gray-500">roles</span>
          </div>
        </div>

        {/* Approvers */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-4 h-4 text-green-500" />
            <span className="text-xs font-medium text-gray-700">Approvers</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-green-600">{summary.teamApprovers}</span>
            <span className="text-xs text-gray-500">of {summary.totalApprovers}</span>
          </div>
        </div>
      </div>

      {/* Steering Committee Members */}
      {steeringCommittee && steeringCommittee.length > 0 && (
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl shadow-sm border border-purple-100 p-5 mb-4">
          <h3 className="text-sm font-medium text-purple-800 mb-3 flex items-center gap-2">
            <Crown className="w-4 h-4" />
            Kubeflow Steering Committee
          </h3>
          <div className="flex flex-wrap gap-3">
            {steeringCommittee.map((member) => (
              <div key={member.id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 shadow-sm">
                <img
                  src={member.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=e5e7eb&color=374151`}
                  alt={member.name}
                  className="w-8 h-8 rounded-full ring-2 ring-purple-200"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{member.name}</p>
                  {member.githubUsername && (
                    <a
                      href={`https://github.com/${member.githubUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-purple-600 hover:underline"
                    >
                      @{member.githubUsername}
                    </a>
                  )}
                </div>
                {member.votingRights && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                    Voting
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Org-Level Leaders (WG Chairs/Tech Leads) */}
      {orgLeaders.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-4">
          <h3 className="text-sm font-medium text-gray-600 mb-4">Working Group Leadership</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {orgLeaders.slice(0, 8).map((member) => (
              <div key={member.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <img
                  src={member.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=e5e7eb&color=374151`}
                  alt={member.name}
                  className="w-10 h-10 rounded-full ring-2 ring-white shadow-sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-gray-900">{member.name}</p>
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
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {member.leadershipRoles?.map((role, idx) => (
                      <span
                        key={idx}
                        className={`text-xs px-2 py-0.5 rounded border ${
                          role.positionType.includes('chair')
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                        title={role.roleTitle}
                      >
                        {role.groupName}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {orgLeaders.length > 8 && (
            <p className="text-sm text-gray-500 mt-4 text-center">
              +{orgLeaders.length - 8} more WG leaders
            </p>
          )}
        </div>
      )}

      {/* Project Approvers/Reviewers - only show members with OWNERS roles */}
      {(() => {
        const approversReviewers = teamLeaders.filter(m => m.roles && m.roles.length > 0);
        return approversReviewers.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-4">Project Approvers & Reviewers</h3>
            <div className="grid md:grid-cols-2 gap-3">
              {approversReviewers.slice(0, 6).map((member) => (
                <LeadershipMemberCard key={member.id} member={member} />
              ))}
            </div>
            {approversReviewers.length > 6 && (
              <p className="text-sm text-gray-500 mt-4 text-center">
                +{approversReviewers.length - 6} more team members
              </p>
            )}
          </div>
        );
      })()}

      {teamLeaders.length === 0 && !hasOrgLeadership && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No leadership data available yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            Sync governance data to discover team leadership roles.
          </p>
        </div>
      )}
    </section>
  );
}
