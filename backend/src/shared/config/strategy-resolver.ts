import { db } from '../database/client.js';
import { orgStrategy } from '../database/schema.js';

export interface StrategyOverride {
  githubOrg: string;
  strategicParticipation: string | null;
  strategicLeadership: string | null;
  updatedBy: string | null;
  updatedAt: Date | null;
}

export type StrategyMap = Map<string, StrategyOverride>;

export async function loadStrategyOverrides(): Promise<StrategyMap> {
  try {
    const rows = await db.select().from(orgStrategy);
    return new Map(rows.map(r => [r.githubOrg, r as StrategyOverride]));
  } catch {
    return new Map();
  }
}

export function resolveStrategy(
  githubOrg: string,
  registryConfig: { strategicParticipation?: string | null; strategicLeadership?: string | null } | undefined,
  strategyMap: StrategyMap,
): { strategicParticipation: string | null; strategicLeadership: string | null } {
  const override = strategyMap.get(githubOrg);
  if (override) {
    return {
      strategicParticipation: override.strategicParticipation,
      strategicLeadership: override.strategicLeadership,
    };
  }
  return {
    strategicParticipation: registryConfig?.strategicParticipation ?? null,
    strategicLeadership: registryConfig?.strategicLeadership ?? null,
  };
}
