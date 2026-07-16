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

INSERT INTO "orgs" ("github_org", "name", "governance_model", "strategic_participation", "strategic_leadership") VALUES
  ('kubeflow', 'Kubeflow', 'owners', 'sustaining_participation', 'sustaining_leadership'),
  ('kserve', 'KServe', 'owners', 'sustaining_participation', 'sustaining_leadership'),
  ('argoproj', 'Argo', 'owners', NULL, NULL),
  ('vllm-project', 'vLLM', 'codeowners', 'increasing_participation', 'increasing_leadership'),
  ('kubernetes', 'Kubernetes', 'owners', NULL, NULL),
  ('kubernetes-sigs', 'Kubernetes SIGs', 'owners', NULL, NULL),
  ('ray-project', 'Ray', 'codeowners', 'sustaining_participation', 'sustaining_leadership'),
  ('openvinotoolkit', 'OpenVINO', 'codeowners', NULL, NULL),
  ('ogx-ai', 'ogx', 'codeowners', 'sustaining_participation', 'sustaining_leadership'),
  ('caikit', 'Caikit', 'codeowners', NULL, NULL),
  ('feast-dev', 'Feast', 'owners', NULL, NULL),
  ('llm-d', 'llm-d', 'owners', 'increasing_participation', 'sustaining_leadership'),
  ('containers', 'Containers', 'owners', NULL, NULL),
  ('mlflow', 'MLflow', 'none', 'increasing_participation', 'increasing_leadership'),
  ('huggingface', 'Hugging Face', 'none', NULL, NULL),
  ('berriai', 'BerriAI', 'none', NULL, NULL),
  ('eleutherai', 'EleutherAI', 'none', NULL, NULL),
  ('elyra-ai', 'Elyra', 'none', NULL, NULL),
  ('project-codeflare', 'CodeFlare', 'none', NULL, NULL),
  ('nvidia', 'OpenShell', 'codeowners', 'increasing_participation', 'increasing_leadership'),
  ('seldonio', 'Seldon', 'none', NULL, NULL),
  ('openclaw', 'OpenClaw', 'codeowners', 'increasing_participation', 'increasing_leadership'),
  ('anomalyco', 'OpenCode', 'none', 'increasing_participation', 'increasing_leadership'),
  ('ggml-org', 'llama.cpp', 'codeowners', NULL, NULL),
  ('pytorch', 'PyTorch', 'codeowners', 'increasing_participation', 'increasing_leadership'),
  ('docling-project', 'Docling', 'none', 'sustaining_participation', 'sustaining_leadership'),
  ('aaif', 'Agentic AI Foundation', 'none', 'evaluating_participation', NULL),
  ('kagenti', 'Kagenti', 'codeowners', NULL, NULL),
  ('kuadrant', 'Kuadrant', 'none', NULL, NULL)
ON CONFLICT DO NOTHING;--> statement-breakpoint

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
