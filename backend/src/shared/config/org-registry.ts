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
   */
  positionType?: string;
}

export interface CommunityRepoConfig {
  /** Repo name (not full URL), e.g. 'community' */
  repo: string;
  /** Default branch, e.g. 'main' or 'master' */
  defaultBranch: string;
  /** Markdown leadership table files to parse */
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
      repo: 'argo-workflows',
      defaultBranch: 'main',
      leadershipFiles: [
        {
          path: 'MAINTAINERS.md',
          groupName: 'Argo Workflows',
          // positionType unset → parser reads role from each row
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

  // ─── Individual repos (various orgs) ────────
  {
    name: 'MLflow',
    githubOrg: 'mlflow',
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
    governanceModel: 'none',
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
