/**
 * OWNERS Parser
 *
 * Turns a Kubernetes-style OWNERS file into per-user owner entries.
 *
 * Handles:
 *   1. Top-level role lists (`approvers`, `reviewers`, and custom keys such
 *      as `project-leads`)
 *   2. `filters:` blocks, where role lists are nested under file-path regexes
 *      (e.g. `filters: { ".*": { approvers: [...] } }`)
 *   3. OWNERS_ALIASES references, matched like prow does: case-insensitively
 *      and with or without a leading `@`
 *   4. Usernames written with a leading `@` (e.g. `- @alice`). `@` is a
 *      reserved YAML indicator, so files that fail to parse are retried with
 *      those items quoted.
 *
 * Spec: https://www.kubernetes.dev/docs/guide/owners/
 */

import * as yaml from 'js-yaml';

export interface OwnersEntry {
  username: string;
  role: 'approver' | 'reviewer';
  roleKey: string; // Original OWNERS key name (e.g., 'approvers', 'project-leads', 'owners')
  path: string; // Directory path where OWNERS file was found
  source: string; // Full path to the OWNERS file
}

// Keys that never hold owner usernames. `filters` is expanded separately.
const OWNERS_SKIP_KEYS = new Set([
  'labels', 'options', 'filters',
  'emeritus_approvers', 'emeritus_reviewers', 'emeritus_maintainers',
  'security_contacts', 'auto-assign',
]);

// Keys whose users review but cannot approve. Every other key maps to approver.
const REVIEWER_KEYS = new Set(['reviewers', 'required_reviewers']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Quote list items that start with `@` so the file parses as YAML.
 * Strict parsers reject `- @username`, which some repos (e.g. velero-io/velero)
 * use in OWNERS files.
 */
export function quoteAtPrefixedItems(content: string): string {
  return content.replace(/^([ \t]*-[ \t]+)(@[^\s#]+)/gm, '$1"$2"');
}

/**
 * Normalize an OWNERS username: trim, drop a leading `@`, lowercase.
 */
export function normalizeOwnerUsername(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

/**
 * Index aliases by normalized name. A known alias without a valid member
 * list resolves to nobody.
 */
function normalizeAliases(aliases: Record<string, unknown>): Map<string, string[]> {
  const aliasMap = new Map<string, string[]>();
  for (const [name, members] of Object.entries(aliases)) {
    aliasMap.set(normalizeOwnerUsername(name), Array.isArray(members) ? members.filter(isString) : []);
  }
  return aliasMap;
}

/**
 * Extract owner entries from a parsed OWNERS file.
 *
 * Role lists are read from the top level and from every `filters` block.
 * Users listed under a narrower filter (e.g. `\.go$`) are still owners of
 * this directory for governance purposes, so filter patterns are not
 * tracked separately.
 */
export function extractOwnersEntries(
  parsed: unknown,
  aliases: Record<string, unknown>,
  directoryPath: string,
  source: string,
): OwnersEntry[] {
  if (!isRecord(parsed)) return [];

  const roleBlocks: Record<string, unknown>[] = [parsed];
  if (isRecord(parsed.filters)) {
    for (const block of Object.values(parsed.filters)) {
      if (isRecord(block)) roleBlocks.push(block);
    }
  }

  const aliasMap = normalizeAliases(aliases);
  const entries: OwnersEntry[] = [];

  for (const block of roleBlocks) {
    for (const [key, value] of Object.entries(block)) {
      if (OWNERS_SKIP_KEYS.has(key)) continue;
      if (!Array.isArray(value)) continue;
      if (!value.every(isString)) continue;

      const role: 'approver' | 'reviewer' = REVIEWER_KEYS.has(key) ? 'reviewer' : 'approver';

      for (const entry of value) {
        const members = aliasMap.get(normalizeOwnerUsername(entry)) ?? [entry];
        for (const member of members) {
          const username = normalizeOwnerUsername(member);
          // Team references (e.g. `kubernetes/dep-approvers`) aren't GitHub logins
          if (!username || username.includes('/')) continue;
          entries.push({ username, role, roleKey: key, path: directoryPath, source });
        }
      }
    }
  }

  return entries;
}

/**
 * Parse raw OWNERS file content into owner entries.
 * Throws if the content is not valid YAML even after quoting `@` items.
 */
export function parseOwnersContent(
  content: string,
  aliases: Record<string, unknown>,
  directoryPath: string,
  source: string,
): OwnersEntry[] {
  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch {
    // Only rewrite files that don't parse as-is, so valid YAML is never altered
    parsed = yaml.load(quoteAtPrefixedItems(content));
  }
  return extractOwnersEntries(parsed, aliases, directoryPath, source);
}
