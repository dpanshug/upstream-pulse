import { describe, it, expect } from 'vitest';
import { auditBody } from './admin-guard.js';

describe('auditBody', () => {
  it('passes small bodies through unchanged', () => {
    const body = { name: 'Alice', githubUsername: 'alice' };

    expect(auditBody(body)).toEqual(body);
  });

  it('omits large bodies and reports their size and array shapes', () => {
    const people = Array.from({ length: 500 }, (_, i) => ({
      name: `Person ${i}`,
      email: `person${i}@redhat.com`,
    }));

    const result = auditBody({ source: 'org_pulse_roster', people }) as {
      omitted: boolean;
      bytes: number;
      arrays?: string;
    };

    expect(result.omitted).toBe(true);
    expect(result.bytes).toBeGreaterThan(2000);
    expect(result.arrays).toBe('people:500');
  });

  it('returns undefined for a missing body', () => {
    expect(auditBody(undefined)).toBeUndefined();
    expect(auditBody(null)).toBeUndefined();
  });
});
