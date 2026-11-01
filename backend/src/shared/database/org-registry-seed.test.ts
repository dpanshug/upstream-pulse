/**
 * Regression tests for org seeding behavior.
 *
 * 1. Migrations must not seed baseline org rows — the org list is
 *    deployment-specific and managed via the UI/API. A previous version of
 *    migration 0007 hardcoded one deployment's 29-org portfolio, so every
 *    fresh database started with unrelated orgs (and their strategic
 *    classifications) on the strategy page.
 * 2. The opt-in registry autoseed (ORG_REGISTRY_AUTOSEED) inserts the
 *    ORG_REGISTRY collection defaults without touching existing rows.
 */
import { describe, it, expect } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db } from './client.js';
import { orgs } from './schema.js';
import { seedOrgsFromRegistry } from './org-registry-seed.js';
import { ORG_REGISTRY } from '../config/org-registry.js';

describe('org seeding', () => {
  it('migrations do not seed baseline org rows', async () => {
    // global-setup applies migrations (and the test seed, which does not
    // write to orgs) to a fresh database. The orgs table must therefore
    // start empty — no migration file may hardcode a baseline org list.
    const rows = await db.select({ githubOrg: orgs.githubOrg }).from(orgs);
    expect(rows).toEqual([]);
  });

  it('registry autoseed inserts ORG_REGISTRY orgs and is idempotent', async () => {
    const registryOrgs = ORG_REGISTRY.map(cfg => cfg.githubOrg.toLowerCase());

    // Clean slate for the registry orgs
    await db.delete(orgs).where(inArray(orgs.githubOrg, registryOrgs));

    try {
      const first = await seedOrgsFromRegistry();
      expect(first).toBe(ORG_REGISTRY.length);

      const inserted = await db.select().from(orgs).where(inArray(orgs.githubOrg, registryOrgs));
      expect(inserted).toHaveLength(ORG_REGISTRY.length);
      for (const row of inserted) {
        expect(row.governanceModel).toBe('none');
        expect(row.strategicParticipation).toBeNull();
      }

      // Second run must not duplicate or modify anything
      const second = await seedOrgsFromRegistry();
      expect(second).toBe(0);
      const after = await db.select().from(orgs).where(inArray(orgs.githubOrg, registryOrgs));
      expect(after).toHaveLength(ORG_REGISTRY.length);
    } finally {
      await db.delete(orgs).where(inArray(orgs.githubOrg, registryOrgs));
    }
  });

  it('autoseed leaves non-registry orgs untouched', async () => {
    const sentinel = 'sentinel-org-test';
    await db.insert(orgs).values({
      githubOrg: sentinel,
      name: 'Sentinel',
      governanceModel: 'owners',
      strategicParticipation: 'sustaining_participation',
      updatedBy: 'test',
    }).onConflictDoNothing();

    try {
      await seedOrgsFromRegistry();

      const [row] = await db.select().from(orgs).where(inArray(orgs.githubOrg, [sentinel]));
      expect(row.name).toBe('Sentinel');
      expect(row.governanceModel).toBe('owners');
      expect(row.strategicParticipation).toBe('sustaining_participation');
      expect(row.updatedBy).toBe('test');
    } finally {
      await db.delete(orgs).where(inArray(orgs.githubOrg, [sentinel]));
      const registryOrgs = ORG_REGISTRY.map(cfg => cfg.githubOrg.toLowerCase());
      await db.delete(orgs).where(inArray(orgs.githubOrg, registryOrgs));
    }
  });
});
