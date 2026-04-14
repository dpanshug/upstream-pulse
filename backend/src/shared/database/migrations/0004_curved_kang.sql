CREATE TABLE IF NOT EXISTS "open_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"github_id" varchar(100) NOT NULL,
	"github_number" integer,
	"github_url" varchar(500) NOT NULL,
	"title" varchar(500) NOT NULL,
	"body" varchar(5000),
	"labels" jsonb DEFAULT '[]'::jsonb,
	"language" varchar(100),
	"repo" varchar(200) NOT NULL,
	"org" varchar(200) NOT NULL,
	"state" varchar(20) DEFAULT 'open' NOT NULL,
	"issue_type" varchar(50),
	"assignee_count" integer DEFAULT 0,
	"comments_count" integer DEFAULT 0,
	"reactions_count" integer DEFAULT 0,
	"github_created_at" timestamp,
	"github_updated_at" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"last_refreshed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "last_opportunity_refresh_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "open_opp_github_id_idx" ON "open_opportunities" ("github_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "open_opp_project_idx" ON "open_opportunities" ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "open_opp_state_idx" ON "open_opportunities" ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "open_opp_org_repo_idx" ON "open_opportunities" ("org","repo");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "open_opp_language_idx" ON "open_opportunities" ("language");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "open_opportunities" ADD CONSTRAINT "open_opportunities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
