import { describe, it, expect } from 'vitest';
import { metricsService } from './metrics-service.js';
import { IDS } from '../../test/seed.js';

/**
 * Integration tests for MetricsService.
 *
 * These run against a real Postgres database seeded with deterministic
 * fixture data (see src/test/seed.ts for the exact numbers).
 *
 * Expected totals (current 30-day window):
 *   Team contributions: 28  (alice 16, bob 6, carol 6)
 *   All  contributions: 40  (team 28 + external 12)
 *
 * Previous 30-day window:
 *   Team contributions: 11  (alice 8, bob 3)
 *   All  contributions: 16  (team 11 + external 5)
 */

describe('MetricsService', () => {
  // ────────────────────────────────────────────────────────────────
  // getContributionBreakdown
  // ────────────────────────────────────────────────────────────────
  describe('getContributionBreakdown', () => {
    it('returns correct totals for the 30-day window', async () => {
      const result = await metricsService.getContributionBreakdown({ days: 30 });

      expect(result.all.total).toBe(40);
      expect(result.team.total).toBe(28);
      expect(result.percentage).toBeCloseTo(70, 0);

      // Spot-check type breakdown
      expect(result.all.commits).toBe(20);   // 5+3+4 + 2+1 + 3+2
      expect(result.team.commits).toBe(13);  // 5+3 + 2 + 3
      expect(result.all.prs).toBe(9);        // 3+2+1 + 1 + 1+1
      expect(result.team.prs).toBe(7);       // 3+2 + 1 + 1
    });

    it('filters by projectId', async () => {
      const result = await metricsService.getContributionBreakdown({
        days: 30,
        projectId: IDS.projAlpha,
      });

      // proj-alpha current: team=17 (alice 11 + bob 6), all=24 (team 17 + ext 7)
      expect(result.all.total).toBe(24);
      expect(result.team.total).toBe(17);
    });

    it('filters by githubOrg', async () => {
      const result = await metricsService.getContributionBreakdown({
        days: 30,
        githubOrg: 'testorg',
      });

      // testorg = proj-alpha + proj-beta current:
      //   team = 17 + 6 = 23, all = 24 + 8 = 32
      expect(result.all.total).toBe(32);
      expect(result.team.total).toBe(23);
    });

    it('returns all-time data when days=0', async () => {
      const result = await metricsService.getContributionBreakdown({ days: 0 });

      // current + previous: team=28+11=39, all=40+16=56
      expect(result.all.total).toBe(56);
      expect(result.team.total).toBe(39);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // getActiveContributorCount
  // ────────────────────────────────────────────────────────────────
  describe('getActiveContributorCount', () => {
    it('counts distinct team contributors in 30-day window', async () => {
      const count = await metricsService.getActiveContributorCount({ days: 30 });
      // alice, bob, carol are active in last 30 days
      expect(count).toBe(3);
    });

    it('filters by project', async () => {
      const count = await metricsService.getActiveContributorCount({
        days: 30,
        projectId: IDS.projBeta,
      });
      // Only carol contributes to proj-beta in current period
      expect(count).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // getTopContributors
  // ────────────────────────────────────────────────────────────────
  describe('getTopContributors', () => {
    it('returns contributors ranked by total, with correct counts', async () => {
      const result = await metricsService.getTopContributors({ days: 30, topN: 10 });

      expect(result.length).toBe(3);

      // alice: 11 (alpha) + 5 (gamma) = 16
      expect(result[0].name).toBe('Alice');
      expect(result[0].contributions.total).toBe(16);
      expect(result[0].contributions.commits).toBe(8);  // 5+3
      expect(result[0].contributions.prs).toBe(4);       // 3+1
      expect(result[0].contributions.reviews).toBe(3);   // 2+1

      // bob: 6 (alpha)
      // carol: 6 (beta)
      const bobAndCarol = result.slice(1);
      const totals = bobAndCarol.map(c => c.contributions.total);
      expect(totals).toEqual([6, 6]);
    });

    it('respects topN limit', async () => {
      const result = await metricsService.getTopContributors({ days: 30, topN: 2 });
      expect(result.length).toBe(2);
      expect(result[0].contributions.total).toBe(16);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // getTopProjects
  // ────────────────────────────────────────────────────────────────
  describe('getTopProjects', () => {
    it('returns projects sorted by team contribution count', async () => {
      const result = await metricsService.getTopProjects({ days: 30, topN: 10 });

      expect(result.length).toBe(3);

      // proj-alpha: team=17, proj-beta: team=6, proj-gamma: team=5
      expect(result[0].name).toBe('Project Alpha');
      expect(result[0].contributions.team.total).toBe(17);
      expect(result[0].activeContributors).toBe(2); // alice, bob

      expect(result[1].name).toBe('Project Beta');
      expect(result[1].contributions.team.total).toBe(6);
      expect(result[1].activeContributors).toBe(1); // carol

      expect(result[2].name).toBe('Project Gamma');
      expect(result[2].contributions.team.total).toBe(5);
      expect(result[2].activeContributors).toBe(1); // alice
    });
  });

  // ────────────────────────────────────────────────────────────────
  // getDailyTrend
  // ────────────────────────────────────────────────────────────────
  describe('getDailyTrend', () => {
    it('returns one entry per day in the range', async () => {
      const result = await metricsService.getDailyTrend({ days: 30 });

      // Should have exactly 30 (or 31) entries, one per day
      expect(result.length).toBeGreaterThanOrEqual(30);
      expect(result.length).toBeLessThanOrEqual(31);

      // Every entry has correct shape
      for (const day of result) {
        expect(day).toHaveProperty('date');
        expect(day.all).toHaveProperty('commits');
        expect(day.team).toHaveProperty('commits');
      }

      // Sum across all days should equal our known totals
      const allTotal = result.reduce((sum, d) => sum + d.all.total, 0);
      const teamTotal = result.reduce((sum, d) => sum + d.team.total, 0);
      expect(allTotal).toBe(40);
      expect(teamTotal).toBe(28);
    });

    it('entries are sorted by date ascending', async () => {
      const result = await metricsService.getDailyTrend({ days: 30 });

      for (let i = 1; i < result.length; i++) {
        expect(result[i].date >= result[i - 1].date).toBe(true);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────
  // getContributionTrend (period comparison)
  // ────────────────────────────────────────────────────────────────
  describe('getContributionTrend', () => {
    it('computes correct trend direction and percentage', async () => {
      const trend = await metricsService.getContributionTrend({ days: 30 });

      // Current team: 28, Previous team: 11
      expect(trend.current).toBe(28);
      expect(trend.previous).toBe(11);
      expect(trend.direction).toBe('up');
      // Change = (28-11)/11 * 100 ≈ 154.5%
      expect(trend.changePercent).toBeCloseTo(154.5, 0);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // getActiveContributorTrend
  // ────────────────────────────────────────────────────────────────
  describe('getActiveContributorTrend', () => {
    it('computes trend for active contributor count', async () => {
      const trend = await metricsService.getActiveContributorTrend({ days: 30 });

      // Current: alice, bob, carol = 3
      // Previous: alice (alpha), bob (gamma) = 2
      expect(trend.current).toBe(3);
      expect(trend.previous).toBe(2);
      expect(trend.direction).toBe('up');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // getDashboard (main endpoint aggregate)
  // ────────────────────────────────────────────────────────────────
  describe('getDashboard', () => {
    it('returns complete dashboard with all sections', async () => {
      const result = await metricsService.getDashboard({ days: 30 });

      // Summary
      expect(result.summary.trackedProjects).toBe(3);
      expect(result.summary.activeContributors).toBe(3);
      expect(result.summary.periodDays).toBe(30);

      // Contributions
      expect(result.contributions.all.total).toBe(40);
      expect(result.contributions.all.team).toBe(28);
      expect(result.contributions.commits).toBeDefined();
      expect(result.contributions.pullRequests).toBeDefined();
      expect(result.contributions.reviews).toBeDefined();
      expect(result.contributions.issues).toBeDefined();

      // Trends
      expect(result.trends.contributions.current).toBe(28);
      expect(result.trends.contributions.direction).toBe('up');
      expect(result.trends.activeContributors.current).toBe(3);

      // Top contributors
      expect(result.topContributors.length).toBeGreaterThanOrEqual(3);
      expect(result.topContributors[0].total).toBe(16); // alice

      // Top projects
      expect(result.topProjects.length).toBe(3);
      expect(result.topProjects[0].name).toBe('Project Alpha');

      // Daily breakdown
      expect(result.dailyBreakdown.length).toBeGreaterThanOrEqual(30);

      // Leadership
      expect(result.leadership).toBeDefined();
      expect(result.leadership.maintainers).toBeDefined();
      expect(result.leadership.maintainers.teamApprovers).toBeGreaterThanOrEqual(2); // alice, carol

      // Org activity
      expect(result.orgActivity).toBeDefined();
    });

    it('filters by githubOrg', async () => {
      const result = await metricsService.getDashboard({ days: 30, githubOrg: 'testorg' });

      // testorg has 2 projects (alpha, beta)
      expect(result.summary.trackedProjects).toBe(2);
      expect(result.contributions.all.team).toBe(23); // alpha 17 + beta 6
    });

    it('filters by projectId', async () => {
      const result = await metricsService.getDashboard({ days: 30, projectId: IDS.projAlpha });

      expect(result.contributions.all.team).toBe(17);
      // When filtering by project, topProjects should be empty
      expect(result.topProjects.length).toBe(0);
    });

    it('returns consistent types across the response', async () => {
      const result = await metricsService.getDashboard({ days: 30 });

      // Verify every contribution type metric has the right shape
      for (const key of ['commits', 'pullRequests', 'reviews', 'issues', 'all'] as const) {
        const metric = result.contributions[key];
        expect(typeof metric.total).toBe('number');
        expect(typeof metric.team).toBe('number');
        expect(typeof metric.teamPercent).toBe('number');
        expect(metric.teamPercent).toBeGreaterThanOrEqual(0);
        expect(metric.teamPercent).toBeLessThanOrEqual(100);
      }

      // Verify trend shape
      for (const trend of [result.trends.contributions, result.trends.activeContributors]) {
        expect(typeof trend.current).toBe('number');
        expect(typeof trend.previous).toBe('number');
        expect(typeof trend.changePercent).toBe('number');
        expect(['up', 'down', 'flat']).toContain(trend.direction);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────
  // getOrgActivity
  // ────────────────────────────────────────────────────────────────
  describe('getOrgActivity', () => {
    it('returns per-org summaries sorted by contribution count', async () => {
      const result = await metricsService.getOrgActivity({ days: 30 });

      // We have 2 orgs with contributions
      expect(result.length).toBeGreaterThanOrEqual(2);

      const testorg = result.find(r => r.org === 'testorg');
      const otherorg = result.find(r => r.org === 'otherorg');

      expect(testorg).toBeDefined();
      expect(otherorg).toBeDefined();

      // testorg team total: alpha 17 + beta 6 = 23
      expect(testorg!.total).toBe(23);
      // otherorg team total: gamma 5
      expect(otherorg!.total).toBe(5);

      // testorg should come first (higher total)
      expect(result[0].org).toBe('testorg');
    });

    it('includes sparkline trend data', async () => {
      const result = await metricsService.getOrgActivity({ days: 30 });
      const testorg = result.find(r => r.org === 'testorg')!;

      expect(Array.isArray(testorg.trend)).toBe(true);
      expect(Array.isArray(testorg.totalTrend)).toBe(true);
    });

    it('includes leadership and maintainer counts', async () => {
      const result = await metricsService.getOrgActivity({ days: 30 });
      const testorg = result.find(r => r.org === 'testorg')!;

      // alice has steering_committee in testorg
      expect(testorg.leadershipCount).toBeGreaterThanOrEqual(1);
      // alice (maintainer) + bob (reviewer) + carol (maintainer) in testorg projects
      expect(testorg.maintainerCount).toBeGreaterThanOrEqual(2);
    });
  });
});
