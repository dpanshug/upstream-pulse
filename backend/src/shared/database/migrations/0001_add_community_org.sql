ALTER TABLE "leadership_positions" ADD COLUMN IF NOT EXISTS "community_org" varchar(100);--> statement-breakpoint
UPDATE "leadership_positions" SET "community_org" = 'kubeflow' WHERE "community_org" IS NULL;
