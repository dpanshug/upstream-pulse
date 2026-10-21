-- Per-project contribution data source: 'github' (GitHub API) or 'collectoss' (CollectOSS DB).
-- IF NOT EXISTS keeps this safe for dev databases that applied the earlier draft of this migration.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "data_source" varchar(20) NOT NULL DEFAULT 'github';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "collectoss_repo_id" bigint;--> statement-breakpoint
-- High-water mark of CollectOSS data_collection_date already ingested (incremental sync cursor)
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "collectoss_synced_through" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_data_source_idx" ON "projects" ("data_source");
