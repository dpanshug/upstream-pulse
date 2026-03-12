/**
 * Org Registry — static config defining all supported upstream organizations.
 *
 * Adding a new org = PR that adds an entry here.
 * Parsers live in code; this file only declares *what* to parse and *where*.
 */

// ── Interfaces ──────────────────────────────────────────────────────

export interface LeadershipFileConfig {
  /** Path relative to the community repo root, e.g. 'KUBEFLOW-STEERING-COMMITTEE.md' */
  path: string;
  /** Human-readable group name, e.g. 'Kubeflow Steering Committee' */
  groupName: string;
  /**
   * If set, every row in the table gets this position type (e.g. 'steering_committee', 'tsc_member').
   * If unset, the parser reads the role from each row's "Project Roles" / "Role" column.
   * Not used for 'sig_sections' format.
   */
  positionType?: string;
  /**
   * Parser format. Defaults to 'table' (markdown table with columns).
   * - 'table': standard markdown table (Name, GitHub ID, Role columns)
   * - 'sig_sections': markdown with ### SIG {Name} sections and > Leadership: [Name](url) blockquotes
   * - 'bullet_list': markdown bullet list with `- [Name](https://github.com/username)` entries
   */
  format?: 'table' | 'sig_sections' | 'bullet_list';
  /**
   * Optional heading to scope parsing to a specific section.
   * Only content under this heading (until the next heading of equal or higher level) is parsed.
   * Example: 'Core Members' to parse only the ## Core Members section.
   */
  sectionHeading?: string;
}

export interface CommunityRepoConfig {
  /** Repo name (not full URL), e.g. 'community' */
  repo: string;
  /** Default branch, e.g. 'main' or 'master' */
  defaultBranch: string;
  /** Leadership files to parse — supports multiple formats via the `format` field */
  leadershipFiles?: LeadershipFileConfig[];
  /** YAML file listing WGs/SIGs with chairs + tech leads, e.g. 'wgs.yaml' */
  wgFile?: string;
}

export interface UpstreamOrgConfig {
  /** Human-readable display name */
  name: string;
  /** GitHub organization slug, e.g. 'kubeflow' */
  githubOrg: string;
  /** Community repo with leadership & WG data. undefined = no leadership collection */
  communityRepo?: CommunityRepoConfig;
  /** Which maintainer-file format this org uses at the repo level */
  governanceModel: 'owners' | 'codeowners' | 'none';
  /** Per-repo override of governanceModel. Repos not listed use the org-level default. */
  repoGovernanceOverride?: Record<string, 'owners' | 'codeowners' | 'none'>;
  /** Maps repo names to their owning working groups (only relevant for orgs with WGs) */
  repoToWorkingGroup?: Record<string, string[]>;
}

// ── Registry ────────────────────────────────────────────────────────

export const ORG_REGISTRY: UpstreamOrgConfig[] = [
  // ─── Kubeflow ───────────────────────────────
  {
    name: 'Kubeflow',
    githubOrg: 'kubeflow',
    communityRepo: {
      repo: 'community',
      defaultBranch: 'master',
      leadershipFiles: [
        {
          path: 'KUBEFLOW-STEERING-COMMITTEE.md',
          groupName: 'Kubeflow Steering Committee',
          positionType: 'steering_committee',
        },
      ],
      wgFile: 'wgs.yaml',
    },
    governanceModel: 'owners',
    repoToWorkingGroup: {
      'model-registry': ['WG Data'],
      'spark-operator': ['WG Data'],
      'pipelines': ['WG Pipelines'],
      'sdk': ['WG Pipelines'],
      'trainer': ['WG Training'],
      'training-operator': ['WG Training'],
      'katib': ['WG AutoML'],
      'notebooks': ['WG Notebooks'],
      'manifests': ['WG Manifests'],
      'kserve': ['WG Serving'],
      'modelmesh': ['WG Serving'],
      'kubeflow': ['WG Deployment', 'WG Manifests'],
    },
  },

  // ─── KServe ─────────────────────────────────
  {
    name: 'KServe',
    githubOrg: 'kserve',
    communityRepo: {
      repo: 'community',
      defaultBranch: 'main',
      leadershipFiles: [
        {
          path: 'TECHNICAL-STEERING-COMMITTEE.md',
          groupName: 'KServe TSC',
          positionType: 'tsc_member',
        },
        {
          path: 'MAINTAINERS.md',
          groupName: 'KServe',
          // positionType unset → parser reads role from each row
        },
      ],
    },
    governanceModel: 'owners',
  },

  // ─── Argo ───────────────────────────────────
  {
    name: 'Argo',
    githubOrg: 'argoproj',
    communityRepo: {
      repo: 'argoproj',
      defaultBranch: 'master',
      leadershipFiles: [
        {
          path: 'MAINTAINERS.md',
          groupName: 'Argoproj',
          // positionType unset → parser reads role from each row (e.g. "Lead - Workflows", "Approver - CD")
        },
      ],
    },
    governanceModel: 'owners',
  },

  // ─── vLLM ───────────────────────────────────
  {
    name: 'vLLM',
    githubOrg: 'vllm-project',
    governanceModel: 'codeowners',
  },

  // ─── Kubernetes ────────────────────────────
  {
    name: 'Kubernetes',
    githubOrg: 'kubernetes',
    communityRepo: {
      repo: 'community',
      defaultBranch: 'master',
      wgFile: 'sigs.yaml',
    },
    governanceModel: 'owners',
  },

  // ─── Kubernetes SIGs ────────────────────────
  {
    name: 'Kubernetes SIGs',
    githubOrg: 'kubernetes-sigs',
    governanceModel: 'owners',
  },

  // ─── Ray (KubeRay) ─────────────────────────
  {
    name: 'Ray',
    githubOrg: 'ray-project',
    governanceModel: 'codeowners',
  },

  // ─── OpenVINO ───────────────────────────────
  {
    name: 'OpenVINO',
    githubOrg: 'openvinotoolkit',
    governanceModel: 'codeowners',
  },

  // ─── Llama Stack (moved from meta-llama) ────
  {
    name: 'Llama Stack',
    githubOrg: 'llamastack',
    governanceModel: 'codeowners',
  },

  // ─── Caikit ─────────────────────────────────
  {
    name: 'Caikit',
    githubOrg: 'caikit',
    governanceModel: 'codeowners',
  },

  // ─── Feast ──────────────────────────────────
  {
    name: 'Feast',
    githubOrg: 'feast-dev',
    governanceModel: 'owners',
  },

  // ─── llm-d ────────────────────────────────
  {
    name: 'llm-d',
    githubOrg: 'llm-d',
    communityRepo: {
      repo: 'llm-d',
      defaultBranch: 'main',
      leadershipFiles: [
        {
          path: 'MAINTAINERS.md',
          groupName: 'llm-d',
          positionType: 'project_lead',
        },
        {
          path: 'SIGS.md',
          groupName: 'llm-d',
          format: 'sig_sections',
        },
      ],
    },
    governanceModel: 'owners',
  },

  // ─── Containers (Podman, AI Lab Recipes, RamaLama, OLOT) ────
  // No communityRepo — the org has no centralized leadership file.
  // Podman's MAINTAINERS.md only covers Podman, not the whole org.
  {
    name: 'Containers',
    githubOrg: 'containers',
    governanceModel: 'owners',
    repoGovernanceOverride: {
      'ramalama': 'codeowners',
      'ai-lab-recipes': 'none',
      'ramalama-stack': 'none',
      'olot': 'none',
    },
  },

  // ─── Individual repos (various orgs) ────────
  {
    name: 'MLflow',
    githubOrg: 'mlflow',
    communityRepo: {
      repo: 'mlflow',
      defaultBranch: 'master',
      leadershipFiles: [
        {
          path: 'README.md',
          groupName: 'MLflow Core Members',
          positionType: 'core_member',
          format: 'bullet_list',
          sectionHeading: 'Core Members',
        },
      ],
    },
    governanceModel: 'none',
  },
  {
    name: 'Hugging Face',
    githubOrg: 'huggingface',
    governanceModel: 'none',
  },
  {
    name: 'BerriAI',
    githubOrg: 'BerriAI',
    governanceModel: 'none',
  },
  {
    name: 'EleutherAI',
    githubOrg: 'EleutherAI',
    governanceModel: 'none',
  },
  {
    name: 'Elyra',
    githubOrg: 'elyra-ai',
    governanceModel: 'none',
  },
  {
    name: 'CodeFlare',
    githubOrg: 'project-codeflare',
    governanceModel: 'none',
  },
  {
    name: 'NVIDIA',
    githubOrg: 'NVIDIA',
    governanceModel: 'codeowners',
  },
  {
    name: 'Seldon',
    githubOrg: 'SeldonIO',
    governanceModel: 'none',
  },
];

// ── Lookup helpers ──────────────────────────────────────────────────

const orgByGithubOrg = new Map(ORG_REGISTRY.map(o => [o.githubOrg.toLowerCase(), o]));

/** Look up an org config by its GitHub org slug (case-insensitive). */
export function getOrgConfig(githubOrg: string): UpstreamOrgConfig | undefined {
  return orgByGithubOrg.get(githubOrg.toLowerCase());
}

/** All orgs that have a communityRepo configured (eligible for leadership collection). */
export function getOrgsWithCommunityRepo(): UpstreamOrgConfig[] {
  return ORG_REGISTRY.filter(o => o.communityRepo != null);
}
