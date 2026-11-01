/**
 * Org registry seeding — inserts the orgs declared in ORG_REGISTRY
 * (collection/parsing config) into the `orgs` table.
 *
 * Called at backend startup only when ORG_REGISTRY_AUTOSEED is enabled.
 * Existing rows are never modified (ON CONFLICT DO NOTHING), so this is
 * safe to run repeatedly. Deployments that want the registry orgs can set
 * ORG_REGISTRY_AUTOSEED=true; by default the org list is managed via the
 * UI/API so fresh deployments do not inherit the registry defaults.
 */
import { db } from './client.js';
import { orgs } from './schema.js';
import { ORG_REGISTRY } from '../config/org-registry.js';

export async function seedOrgsFromRegistry(): Promise<number> {
  let inserted = 0;
  for (const cfg of ORG_REGISTRY) {
    const rows = await db.insert(orgs).values({
      githubOrg: cfg.githubOrg.toLowerCase(),
      name: cfg.githubOrg,
      governanceModel: 'none',
    }).onConflictDoNothing().returning({ githubOrg: orgs.githubOrg });
    inserted += rows.length;
  }
  return inserted;
}
