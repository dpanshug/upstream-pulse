CREATE TABLE IF NOT EXISTS "org_strategy" (
  "github_org" varchar(255) PRIMARY KEY,
  "strategic_participation" varchar(50),
  "strategic_leadership" varchar(50),
  "updated_by" varchar(255),
  "updated_at" timestamp DEFAULT now()
);
