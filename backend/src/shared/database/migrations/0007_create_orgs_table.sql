CREATE TABLE IF NOT EXISTS "orgs" (
  "github_org" varchar(255) PRIMARY KEY,
  "name" varchar(255) NOT NULL,
  "governance_model" varchar(50) NOT NULL DEFAULT 'none',
  "strategic_participation" varchar(50),
  "strategic_leadership" varchar(50),
  "updated_by" varchar(255),
  "updated_at" timestamp DEFAULT now(),
  "created_at" timestamp DEFAULT now()
);--> statement-breakpoint

-- Baseline org rows are intentionally NOT seeded here: the org list is
-- deployment-specific and managed via the UI/API. Existing deployments
-- migrate their strategy data from "org_strategy" below. Deployments that
-- want the ORG_REGISTRY collection defaults inserted at startup can set
-- ORG_REGISTRY_AUTOSEED=true.

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'org_strategy') THEN
    UPDATE "orgs" SET
      "strategic_participation" = s."strategic_participation",
      "strategic_leadership" = s."strategic_leadership",
      "updated_by" = s."updated_by",
      "updated_at" = s."updated_at"
    FROM "org_strategy" s
    WHERE "orgs"."github_org" = s."github_org";
  END IF;
END $$;--> statement-breakpoint

DROP TABLE IF EXISTS "org_strategy";
