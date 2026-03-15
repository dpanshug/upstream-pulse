import { Shield, Crown, Users, ArrowUpRight } from 'lucide-react';
import { LeadershipData, OrgLeadership, OrgPositionGroup } from './types';
import { LeadershipMemberCard } from './LeadershipMemberCard';

interface LeadershipSectionProps {
  leadership: LeadershipData;
}

function positionColor(type: string) {
  if (type.includes('steering') || type.includes('tsc'))
    return { bg: 'from-purple-50 to-indigo-50', border: 'border-purple-100', text: 'text-purple-800', badge: 'bg-purple-50 text-purple-700 border-purple-200' };
  if (type.includes('chair'))
    return { bg: 'from-amber-50 to-orange-50', border: 'border-amber-100', text: 'text-amber-800', badge: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { bg: 'from-blue-50 to-sky-50', border: 'border-blue-100', text: 'text-blue-800', badge: 'bg-blue-50 text-blue-700 border-blue-200' };
}

function PositionStatCard({ group }: { group: Pick<OrgPositionGroup, 'positionType' | 'roleTitle' | 'teamCount' | 'totalCount'> }) {
  const color = positionColor(group.positionType);
  return (
    <div className={`bg-gradient-to-br ${color.bg} rounded-xl shadow-sm border ${color.border} p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <Crown className={`w-4 h-4 ${color.text}`} />
        <span className={`text-xs font-medium ${color.text}`}>{group.roleTitle}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-gray-900">{group.teamCount}</span>
        {group.totalCount > 0 && (
          <span className="text-xs text-gray-500">of {group.totalCount}</span>
        )}
      </div>
    </div>
  );
}

function roleCategoryOrder(type: string): number {
  if (type.includes('steering') || type.includes('tsc')) return 0;
  if (type.includes('committee')) return 1;
  if (type.includes('chair')) return 2;
  if (type.includes('lead')) return 3;
  return 4;
}

function roleCategoryLabel(type: string): string {
  if (type.includes('steering') || type.includes('tsc')) return 'Steering / TSC';
  if (type.includes('committee')) return 'Committee';
  if (type.includes('chair')) return 'WG Chairs';
  if (type.includes('lead')) return 'WG Tech Leads';
  return 'Members';
}

interface CategoryMember {
  id: string;
  name: string;
  githubUsername: string | null;
  avatarUrl?: string;
  groupName: string;
  positionType: string;
}

function OrgLeadershipBlock({ orgData, showOrgName }: { orgData: OrgLeadership; showOrgName: boolean }) {
  // Aggregate stat cards by position type
  const statMap = new Map<string, { teamCount: number; totalCount: number; positionType: string; roleTitle: string }>();
  for (const group of orgData.positions) {
    const existing = statMap.get(group.positionType);
    if (existing) {
      existing.teamCount += group.teamCount;
      existing.totalCount += group.totalCount;
    } else {
      statMap.set(group.positionType, {
        positionType: group.positionType,
        roleTitle: group.roleTitle,
        teamCount: group.teamCount,
        totalCount: group.totalCount,
      });
    }
  }
  const stats = Array.from(statMap.values())
    .sort((a, b) => roleCategoryOrder(a.positionType) - roleCategoryOrder(b.positionType));

  // Group members by role category
  const categoryMap = new Map<number, { label: string; color: ReturnType<typeof positionColor>; members: CategoryMember[] }>();
  for (const group of orgData.positions) {
    const order = roleCategoryOrder(group.positionType);
    if (!categoryMap.has(order)) {
      categoryMap.set(order, {
        label: roleCategoryLabel(group.positionType),
        color: positionColor(group.positionType),
        members: [],
      });
    }
    const category = categoryMap.get(order)!;
    const gn = group.groupName || group.members[0]?.groupName || '';
    for (const member of group.members) {
      category.members.push({
        ...member,
        groupName: gn,
        positionType: group.positionType,
      });
    }
  }
  const categories = Array.from(categoryMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([, v]) => v)
    .filter(c => c.members.length > 0);

  return (
    <div className="mb-6">
      {showOrgName && (
        <h3 className="text-sm font-semibold text-gray-700 mb-3">{orgData.orgName}</h3>
      )}

      {/* Stat cards */}
      {stats.length > 0 && (
        <div className={`grid grid-cols-2 gap-3 mb-4 ${
          stats.length >= 4 ? 'md:grid-cols-4' :
          stats.length === 3 ? 'md:grid-cols-3' :
          'md:grid-cols-2'
        }`}>
          {stats.map(group => (
            <PositionStatCard key={group.positionType} group={group} />
          ))}
        </div>
      )}

      {/* One card per role category */}
      {categories.map(category => (
        <div
          key={category.label}
          className={`bg-gradient-to-r ${category.color.bg} rounded-xl shadow-sm border ${category.color.border} p-5 mb-3`}
        >
          <h4 className={`text-sm font-medium ${category.color.text} mb-3 flex items-center gap-2`}>
            <Crown className="w-4 h-4" />
            {category.label}
          </h4>
          <div className="flex flex-wrap gap-3">
            {category.members.map(member => (
              <div key={`${member.id}-${member.groupName}`} className="flex items-center gap-3 bg-white rounded-lg px-4 py-3 shadow-sm">
                <img
                  src={member.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=e5e7eb&color=374151`}
                  alt={member.name}
                  className="w-10 h-10 rounded-full ring-2 ring-white shadow-sm"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-gray-900">{member.name}</p>
                    {member.groupName && member.groupName !== orgData.orgName && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${category.color.badge} whitespace-nowrap`}>
                        {member.groupName}
                      </span>
                    )}
                  </div>
                  {member.githubUsername && (
                    <a
                      href={`https://github.com/${member.githubUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-500 hover:text-blue-600 inline-flex items-center gap-0.5"
                    >
                      @{member.githubUsername}
                      <ArrowUpRight className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LeadershipSection({ leadership }: LeadershipSectionProps) {
  const { byOrg, maintainers, teamLeaders } = leadership;
  const hasOrgLeadership = byOrg.some(o => o.positions.length > 0);

  // Members with WG/org leadership roles
  const orgLeaders = teamLeaders.filter(m => m.leadershipRoles && m.leadershipRoles.length > 0);

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-amber-600" />
          <h2 className="text-lg font-semibold text-gray-900">Team Leadership</h2>
        </div>
        <p className="text-sm text-gray-500">
          Team influence in upstream governance
        </p>
      </div>

      {/* Per-org leadership blocks */}
      {byOrg.map(orgData => (
        <OrgLeadershipBlock key={orgData.org} orgData={orgData} showOrgName={byOrg.length > 1} />
      ))}

      {/* Approvers/Reviewers stats */}
      {(maintainers.teamApprovers > 0 || maintainers.teamReviewers > 0) && (
        <div className="mb-6">
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-4 h-4 text-green-500" />
                <span className="text-xs font-medium text-gray-700">Approvers</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-green-600">{maintainers.teamApprovers}</span>
                <span className="text-xs text-gray-500">of {maintainers.totalApprovers}</span>
              </div>
              {(maintainers.rootApprovers != null && maintainers.componentApprovers != null && maintainers.componentApprovers > 0) && (
                <div className="mt-2 flex gap-3 text-xs text-gray-500">
                  <span>Root: {maintainers.rootApprovers}</span>
                  <span>Component: {maintainers.componentApprovers}</span>
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-medium text-gray-700">Reviewers</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-blue-600">{maintainers.teamReviewers}</span>
                <span className="text-xs text-gray-500">of {maintainers.totalReviewers}</span>
              </div>
              {(maintainers.rootReviewers != null && maintainers.componentReviewers != null && maintainers.componentReviewers > 0) && (
                <div className="mt-2 flex gap-3 text-xs text-gray-500">
                  <span>Root: {maintainers.rootReviewers}</span>
                  <span>Component: {maintainers.componentReviewers}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Org-Level Leaders (WG Chairs/Tech Leads not shown above) */}
      {orgLeaders.length > 0 && !hasOrgLeadership && (
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
                  <p className="font-medium text-gray-900">{member.name}</p>
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
                    {member.leadershipRoles?.map((role, idx) => {
                      const c = positionColor(role.positionType);
                      return (
                        <span
                          key={idx}
                          className={`text-xs px-2 py-0.5 rounded border ${c.badge}`}
                          title={role.roleTitle}
                        >
                          {role.groupName}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {orgLeaders.length > 8 && (
            <p className="text-sm text-gray-500 mt-4 text-center">
              +{orgLeaders.length - 8} more leaders
            </p>
          )}
        </div>
      )}

      {/* Project Approvers/Reviewers */}
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
