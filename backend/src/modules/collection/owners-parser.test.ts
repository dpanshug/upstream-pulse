import { describe, it, expect } from 'vitest';
import {
  normalizeOwnerUsername,
  parseOwnersContent,
  quoteAtPrefixedItems,
} from './owners-parser.js';

const SOURCE = 'https://github.com/example/repo/blob/main/OWNERS';

function parse(content: string, aliases: Record<string, unknown> = {}) {
  return parseOwnersContent(content, aliases, '/', SOURCE);
}

function summarize(entries: ReturnType<typeof parse>) {
  return entries.map(e => `${e.username}:${e.role}:${e.roleKey}`);
}

describe('normalizeOwnerUsername', () => {
  it('strips a leading @, whitespace, and case', () => {
    expect(normalizeOwnerUsername('  @Lyndon-Li ')).toBe('lyndon-li');
    expect(normalizeOwnerUsername('alice')).toBe('alice');
  });
});

describe('quoteAtPrefixedItems', () => {
  it('quotes only list items that start with @', () => {
    const input = [
      'reviewers:',
      '- @alice',
      '  - @bob # comment',
      '- carol',
      '- "@dave"',
    ].join('\n');
    expect(quoteAtPrefixedItems(input)).toBe([
      'reviewers:',
      '- "@alice"',
      '  - "@bob" # comment',
      '- carol',
      '- "@dave"',
    ].join('\n'));
  });
});

describe('parseOwnersContent', () => {
  it('reads top-level approvers and reviewers', () => {
    const entries = parse(`
approvers:
  - Alice
reviewers:
  - bob
`);
    expect(summarize(entries)).toEqual([
      'alice:approver:approvers',
      'bob:reviewer:reviewers',
    ]);
    expect(entries[0]).toMatchObject({ path: '/', source: SOURCE });
  });

  it('parses unquoted @-prefixed usernames (velero-io/velero style)', () => {
    const entries = parse(`
# List of usernames who may use /lgtm
reviewers:
- @Lyndon-Li
- @sseago

# List of usernames who may use /approve
approvers:
- @Lyndon-Li
`);
    expect(summarize(entries)).toEqual([
      'lyndon-li:reviewer:reviewers',
      'sseago:reviewer:reviewers',
      'lyndon-li:approver:approvers',
    ]);
  });

  it('reads role lists nested under filters, resolving aliases (kubevirt style)', () => {
    const aliases = {
      approvers: ['brybacki', 'sseago'],
      'code-reviewers': ['tbaransk', 'sseago'],
    };
    const entries = parse(`
filters:
  ".*":
    reviewers:
      - code-reviewers
    approvers:
      - approvers
`, aliases);

    expect(summarize(entries)).toEqual([
      'tbaransk:reviewer:reviewers',
      'sseago:reviewer:reviewers',
      'brybacki:approver:approvers',
      'sseago:approver:approvers',
    ]);
  });

  it('combines top-level lists with every filter block', () => {
    const entries = parse(`
approvers:
  - alice
filters:
  ".*":
    reviewers:
      - bob
    labels:
      - sig/storage
  "\\\\.go$":
    approvers:
      - carol
`);
    expect(summarize(entries)).toEqual([
      'alice:approver:approvers',
      'bob:reviewer:reviewers',
      'carol:approver:approvers',
    ]);
  });

  it('skips non-owner keys', () => {
    const entries = parse(`
approvers:
  - alice
emeritus_approvers:
  - old-timer
labels:
  - area/foo
options:
  no_parent_owners: true
`);
    expect(summarize(entries)).toEqual(['alice:approver:approvers']);
  });

  it('normalizes alias members and ignores prototype keys as aliases', () => {
    const entries = parse(`
approvers:
  - maintainers
  - constructor
`, { maintainers: ['@Alice', 'bob', 42] });
    expect(summarize(entries)).toEqual([
      'alice:approver:approvers',
      'bob:approver:approvers',
      'constructor:approver:approvers',
    ]);
  });

  it('matches alias references case-insensitively and with a leading @', () => {
    const entries = parse(`
approvers:
- @Maintainers
- Reviewers
`, { maintainers: ['alice'], reviewers: ['bob'] });
    expect(summarize(entries)).toEqual([
      'alice:approver:approvers',
      'bob:approver:approvers',
    ]);
  });

  it('parses @-prefixed usernames inside filters blocks', () => {
    const entries = parse(`
filters:
  ".*":
    reviewers:
    - @Carol
`);
    expect(summarize(entries)).toEqual(['carol:reviewer:reviewers']);
  });

  it('treats required_reviewers as reviewers', () => {
    const entries = parse(`
filters:
  "go\\\\.(mod|sum)$":
    required_reviewers:
      - dave
`);
    expect(summarize(entries)).toEqual(['dave:reviewer:required_reviewers']);
  });

  it('skips team references that are not GitHub logins', () => {
    const entries = parse(`
approvers:
  - alice
  - kubernetes/dep-approvers
`);
    expect(summarize(entries)).toEqual(['alice:approver:approvers']);
  });

  it('leaves valid YAML untouched when it mentions @ inside a scalar', () => {
    const entries = parse(`
approvers:
- alice
options:
  note: "see
    - @alice
    above"
`);
    expect(summarize(entries)).toEqual(['alice:approver:approvers']);
  });

  it('ignores malformed values', () => {
    const entries = parse(`
approvers:
  - broken-alias
  - empty-member
reviewers:
  nested: true
filters:
  ".*": null
`, { 'broken-alias': 'not-a-list', 'empty-member': ['', 'erin'] });
    expect(summarize(entries)).toEqual(['erin:approver:approvers']);
  });

  it('throws on content that is not valid YAML', () => {
    expect(() => parse('approvers: [alice')).toThrow();
  });

  it('returns no entries for empty or non-mapping content', () => {
    expect(parse('')).toEqual([]);
    expect(parse('- alice')).toEqual([]);
  });
});
