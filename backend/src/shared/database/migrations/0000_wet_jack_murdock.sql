CREATE TABLE IF NOT EXISTS "collection_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" varchar(100) NOT NULL,
	"project_id" uuid,
	"status" varchar(50) NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"records_processed" integer DEFAULT 0,
	"errors_count" integer DEFAULT 0,
	"error_details" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"team_member_id" uuid,
	"contribution_type" varchar(50) NOT NULL,
	"contribution_date" date NOT NULL,
	"github_id" varchar(255),
	"github_url" varchar(500),
	"lines_added" integer,
	"lines_deleted" integer,
	"files_changed" integer,
	"is_merged" boolean,
	"metadata" jsonb,
	"collected_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "identity_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_member_id" uuid,
	"identity_type" varchar(50) NOT NULL,
	"identity_value" varchar(255) NOT NULL,
	"confidence_score" numeric(3, 2) DEFAULT '1.0',
	"verified" boolean DEFAULT false,
	"verified_at" timestamp,
	"verified_by" varchar(255),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insight_type" varchar(100) NOT NULL,
	"severity" varchar(50),
	"title" varchar(500) NOT NULL,
	"description" varchar(5000) NOT NULL,
	"project_id" uuid,
	"time_range_start" date,
	"time_range_end" date,
	"confidence_score" numeric(3, 2),
	"actionable" boolean DEFAULT false,
	"action_items" jsonb,
	"metadata" jsonb,
	"generated_at" timestamp DEFAULT now(),
	"acknowledged_at" timestamp,
	"acknowledged_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leadership_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"team_member_id" uuid,
	"position_type" varchar(100) NOT NULL,
	"committee_name" varchar(255),
	"role_title" varchar(255),
	"start_date" date NOT NULL,
	"end_date" date,
	"is_active" boolean DEFAULT true,
	"voting_rights" boolean DEFAULT false,
	"source" varchar(100),
	"evidence_url" varchar(500),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "maintainer_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"team_member_id" uuid,
	"position_type" varchar(100) NOT NULL,
	"position_title" varchar(255),
	"granted_date" date,
	"revoked_date" date,
	"is_active" boolean DEFAULT true,
	"source" varchar(100),
	"evidence_url" varchar(500),
	"notes" varchar(1000),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metrics_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"metric_date" date NOT NULL,
	"total_commits" integer DEFAULT 0,
	"total_prs" integer DEFAULT 0,
	"total_reviews" integer DEFAULT 0,
	"total_issues" integer DEFAULT 0,
	"redhat_commits" integer DEFAULT 0,
	"redhat_prs" integer DEFAULT 0,
	"redhat_reviews" integer DEFAULT 0,
	"redhat_issues" integer DEFAULT 0,
	"commit_percentage" numeric(5, 2),
	"pr_percentage" numeric(5, 2),
	"review_percentage" numeric(5, 2),
	"active_contributors" integer DEFAULT 0,
	"new_contributors" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"ecosystem" varchar(100) NOT NULL,
	"github_org" varchar(255) NOT NULL,
	"github_repo" varchar(255) NOT NULL,
	"primary_language" varchar(50),
	"governance_type" varchar(50),
	"tracking_enabled" boolean DEFAULT true,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_type" varchar(100) NOT NULL,
	"format" varchar(50) NOT NULL,
	"time_range_start" date NOT NULL,
	"time_range_end" date NOT NULL,
	"project_ids" jsonb,
	"generated_by" varchar(255),
	"file_path" varchar(500),
	"file_size_bytes" integer,
	"generation_duration_ms" integer,
	"parameters" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"primary_email" varchar(255) NOT NULL,
	"github_username" varchar(255),
	"github_user_id" integer,
	"employee_id" varchar(100),
	"department" varchar(100),
	"role" varchar(100),
	"start_date" date,
	"end_date" date,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "team_members_primary_email_unique" UNIQUE("primary_email"),
	CONSTRAINT "team_members_github_user_id_unique" UNIQUE("github_user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collection_jobs" ADD CONSTRAINT "collection_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contributions" ADD CONSTRAINT "contributions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contributions" ADD CONSTRAINT "contributions_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "identity_mappings" ADD CONSTRAINT "identity_mappings_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "insights" ADD CONSTRAINT "insights_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leadership_positions" ADD CONSTRAINT "leadership_positions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leadership_positions" ADD CONSTRAINT "leadership_positions_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "maintainer_status" ADD CONSTRAINT "maintainer_status_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "maintainer_status" ADD CONSTRAINT "maintainer_status_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metrics_daily" ADD CONSTRAINT "metrics_daily_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_status_idx" ON "collection_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_created_idx" ON "collection_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contributions_date_idx" ON "contributions" USING btree ("contribution_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contributions_project_member_idx" ON "contributions" USING btree ("project_id","team_member_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contributions_type_idx" ON "contributions" USING btree ("contribution_type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_contribution" ON "contributions" USING btree ("project_id","contribution_type","github_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_identity" ON "identity_mappings" USING btree ("identity_type","identity_value");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "identity_team_member_idx" ON "identity_mappings" USING btree ("team_member_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "insights_type_idx" ON "insights" USING btree ("insight_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "insights_generated_idx" ON "insights" USING btree ("generated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leadership_project_member_idx" ON "leadership_positions" USING btree ("project_id","team_member_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leadership_active_idx" ON "leadership_positions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintainer_project_member_idx" ON "maintainer_status" USING btree ("project_id","team_member_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintainer_active_idx" ON "maintainer_status" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_daily_metric" ON "metrics_daily" USING btree ("project_id","metric_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metrics_date_idx" ON "metrics_daily" USING btree ("metric_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_github_repo" ON "projects" USING btree ("github_org","github_repo");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_type_idx" ON "reports" USING btree ("report_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_created_idx" ON "reports" USING btree ("created_at");