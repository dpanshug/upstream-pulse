ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "source_org" varchar(255);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_members_source_org_idx" ON "team_members" ("source_org");--> statement-breakpoint
UPDATE "team_members" SET "source_org" = 'opendatahub-io' WHERE "source" = 'github_org_sync' AND "source_org" IS NULL;
