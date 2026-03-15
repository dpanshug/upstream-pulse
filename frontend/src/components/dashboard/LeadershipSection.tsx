import { useState } from 'react';
import { Shield, Crown, Users, ArrowUpRight, ChevronDown, ChevronUp } from 'lucide-react';
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

function positionTypeOrder(type: string): number {
  if (type.includes('steering') || type.includes('tsc')) return 0;
  if (type.includes('committee')) return 1;
  if (type.includes('project_lead') || type.includes('lead_-_')) return 2;
  if (type.includes('chair')) return 3;
  if (type.includes('lead')) return 4;
  if (type.includes('approver')) return 5;
  if (type.includes('reviewer')) return 6;
  return 7;
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
    .filter(s => s.teamCount > 0)
    .sort((a, b) => positionTypeOrder(a.positionType) - positionTypeOrder(b.positionType));

  // Group members by positionType — labels come from the data, not hardcoded categories
  const roleMap = new Map<string, { label: string; color: ReturnType<typeof positionColor>; order: number; members: CategoryMember[] }>();
  for (const group of orgData.positions) {
    if (!roleMap.has(group.positionType)) {
      roleMap.set(group.positionType, {
        label: group.roleTitle,
        color: positionColor(group.positionType),
        order: positionTypeOrder(group.positionType),
        members: [],
      });
    }
    const entry = roleMap.get(group.positionType)!;
    const gn = group.groupName || group.members[0]?.groupName || '';
    for (const member of group.members) {
      entry.members.push({
        ...member,
        groupName: gn,
        positionType: group.positionType,
      });
    }
  }
  const sections = Array.from(roleMap.values())
    .sort((a, b) => a.order - b.order)
    .filter(s => s.members.length > 0);

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

      {/* One card per position type — label from data */}
      {sections.map(section => (
        <div
          key={section.label}
          className={`bg-gradient-to-r ${section.color.bg} rounded-xl shadow-sm border ${section.color.border} p-5 mb-3`}
        >
          <h4 className={`text-sm font-medium ${section.color.text} mb-3 flex items-center gap-2`}>
            <Crown className="w-4 h-4" />
            {section.label}
          </h4>
          <div className="flex flex-wrap gap-3">
            {section.members.map(member => (
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
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${section.color.badge} whitespace-nowrap`}>
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

function ApproversReviewersSection({ teamLeaders }: { teamLeaders: LeadershipData['teamLeaders'] }) {
  const approversReviewers = teamLeaders
    .filter(m => m.roles && m.roles.length > 0)
    .sort((a, b) => {
      const aHasRoot = a.roles.some(r => r.scope === 'root') ? 0 : 1;
      const bHasRoot = b.roles.some(r => r.scope === 'root') ? 0 : 1;
      if (aHasRoot !== bHasRoot) return aHasRoot - bHasRoot;
      if (b.roles.length !== a.roles.length) return b.roles.length - a.roles.length;
      return a.name.localeCompare(b.name);
    });
  const [expanded, setExpanded] = useState(false);
  const limit = 6;
  const hasMore = approversReviewers.length > limit;
  const visible = expanded ? approversReviewers : approversReviewers.slice(0, limit);

  if (approversReviewers.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-sm font-medium text-gray-600 mb-4">Project Approvers & Reviewers</h3>
      <div className="grid md:grid-cols-2 gap-3">
        {visible.map((member) => (
          <LeadershipMemberCard key={member.id} member={member} />
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 mx-auto mt-4 px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
        >
          {expanded ? (
            <>
              Show Less
              <ChevronUp className="w-4 h-4" />
            </>
          ) : (
            <>
              View All ({approversReviewers.length})
              <ChevronDown className="w-4 h-4" />
            </>
          )}
        </button>
      )}
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

      {/* Governance stats — data-driven per positionType */}
      {(() => {
        const govTypes = maintainers.governanceByType?.filter(g => g.total > 0) ?? [];
        if (govTypes.length === 0 && maintainers.totalApprovers === 0 && maintainers.totalReviewers === 0) return null;

        const cards = govTypes.length > 0
          ? govTypes.sort((a, b) => positionTypeOrder(a.positionType) - positionTypeOrder(b.positionType))
          : [
              ...(maintainers.totalApprovers > 0 ? [{ positionType: 'maintainer', label: 'Approvers', team: maintainers.teamApprovers, total: maintainers.totalApprovers }] : []),
              ...(maintainers.totalReviewers > 0 ? [{ positionType: 'reviewer', label: 'Reviewers', team: maintainers.teamReviewers, total: maintainers.totalReviewers }] : []),
            ];

        if (cards.length === 0) return null;

        return (
          <div className="mb-6">
            <div className={`grid gap-3 mb-3 ${
              cards.length >= 4 ? 'grid-cols-2 md:grid-cols-4' :
              cards.length === 3 ? 'grid-cols-3' :
              cards.length === 2 ? 'grid-cols-2' : 'grid-cols-1'
            }`}>
              {cards.map(g => (
                <div key={g.positionType} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {g.positionType === 'reviewer'
                      ? <Users className="w-4 h-4 text-blue-500" />
                      : <Crown className="w-4 h-4 text-green-500" />
                    }
                    <span className="text-xs font-medium text-gray-700">{g.label}</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-2xl font-bold ${g.positionType === 'reviewer' ? 'text-blue-600' : 'text-green-600'}`}>{g.team}</span>
                    <span className="text-xs text-gray-500">of {g.total}</span>
                  </div>
                  {'teamRoot' in g && 'teamComponent' in g && (g.teamComponent ?? 0) > 0 && (
                    <div className="mt-2 flex gap-3 text-xs text-gray-500">
                      <span>Repo-level: {g.teamRoot}</span>
                      <span>Sub-directory: {g.teamComponent}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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
      <ApproversReviewersSection teamLeaders={teamLeaders} />

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
