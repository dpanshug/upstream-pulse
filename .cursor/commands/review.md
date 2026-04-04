Run a full review of all uncommitted changes. Do every step — don't skip or summarize. Do NOT commit or push — only fix mechanical issues and report findings.

## Step 1 — Scope

Run `git status` and `git diff HEAD --name-only` to get the full list of modified, staged, and untracked files. This is the scope for all subsequent steps. Note which files are new (untracked) — they need special handling in Step 4.

## Step 2 — TypeScript (auto-fix)

Run based on which files changed:

- **Backend files changed**: `cd backend && npx tsc --noEmit`
- **Frontend files changed**: `cd frontend && npx tsc --noEmit`

Run both if both sides have changes. If there are errors, **fix them** before continuing.

## Step 3 — Lint (auto-fix)

Run `ReadLints` on every changed file. **Fix** any new lint errors introduced by the changes. Don't fix pre-existing lint issues.

## Step 4 — File-by-File Code Review (report only)

For each changed file, read the full diff. Use `git diff HEAD <file>` for tracked files and read the full file for new untracked files. **Report** any issues found — do not fix them without asking. Check for:

- Logic errors — wrong conditions, off-by-one, incorrect comparisons
- Null/undefined handling — no `!` non-null assertions, explicit guards for optional values
- Unused imports/variables — `noUnusedLocals` is strict in this project
- Console.log / debug leftovers — backend must use `logger`, not `console.log`
- Hardcoded values — no secrets, API keys, URLs, or magic numbers that should be config
- Secrets / credentials — flag any `.env` files, tokens, or passwords in the diff
- Return types — TypeScript return types match what callers expect
- Missing error handling — async calls need try/catch where appropriate

## Step 5 — Regression & Breaking Changes (report only)

**Report** any risks found — do not make changes. Check:

- **Shared type/interface changed** → grep for imports of that type, check all consumers still compile
- **API response shape changed** → find the frontend fetch function that consumes it and verify it still works
- **Database query changed** → confirm column names and types match the schema
- **Exported symbols renamed/removed** → grep for old name, confirm all references updated
- **UI components changed** → check existing pages that use them are not broken
- **Cross-org impact** → is the change org-specific when it shouldn't be, or vice versa?

## Step 6 — Frontend Build (if frontend files changed)

Run `cd frontend && npm run build` to verify the Vite bundle compiles and chunks are valid. If it fails, **report** the error — do not fix without asking.

## Step 7 — Verdict

Print a summary table:

| Check | Status | Notes |
|-------|--------|-------|
| TypeScript | pass/fixed/fail | ... |
| Lint | pass/fixed/fail | ... |
| Code review | clean/has findings | ... |
| Regressions | none/risks found | ... |
| Build | pass/fail/N/A | ... |

List any findings from Steps 4–5 as bullet points below the table.

End with a clear **safe to commit** or **needs fixes** verdict.

If safe, suggest a commit message using project format: `<type>: <what changed>` (types: feat, fix, refactor, chore, docs, style). Do NOT actually commit — just suggest the message.
