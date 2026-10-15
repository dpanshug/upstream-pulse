ALTER TABLE "projects" ADD COLUMN "data_source" varchar(20) DEFAULT 'github';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "augur_repo_id" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_data_source_idx" ON "projects" ("data_source");