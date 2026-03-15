ALTER TABLE "maintainer_status" ADD COLUMN IF NOT EXISTS "scope" varchar(20) DEFAULT 'root';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintainer_scope_idx" ON "maintainer_status" ("scope");--> statement-breakpoint
ALTER TABLE "maintainer_status" ALTER COLUMN "notes" TYPE varchar(5000);
