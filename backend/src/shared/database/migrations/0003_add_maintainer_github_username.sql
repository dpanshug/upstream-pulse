ALTER TABLE "maintainer_status" ADD COLUMN IF NOT EXISTS "github_username" varchar(255);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintainer_github_username_idx" ON "maintainer_status" ("github_username");--> statement-breakpoint
-- Backfill existing rows from team_members
UPDATE maintainer_status ms SET github_username = tm.github_username
FROM team_members tm WHERE ms.team_member_id = tm.id AND ms.github_username IS NULL;
