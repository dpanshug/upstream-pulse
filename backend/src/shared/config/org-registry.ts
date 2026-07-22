/**
 * Org Registry — collection/parser config for upstream organizations.
 *
 * This file only declares *what* to collect and *how* to parse it.
 * The master org list (identity, governance model, strategic classifications)
 * lives in the `orgs` DB table and is managed via the UI.
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
   * - 'rst_sections': RST file with underline headings and `-  Name (\`user <github_url>\`__)` entries
   */
  format?: 'table' | 'sig_sections' | 'bullet_list' | 'rst_sections';
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

export interface OrgCollectionConfig {
  /** GitHub organization slug, e.g. 'kubeflow' */
  githubOrg: string;
  /** Community repo with leadership & WG data. undefined = no leadership collection */
  communityRepo?: CommunityRepoConfig;
  /** Per-repo override of governanceModel. Repos not listed use the org-level default from the DB. */
  repoGovernanceOverride?: Record<string, 'owners' | 'codeowners' | 'none'>;
  /** Maps repo names to their owning working groups (only relevant for orgs with WGs) */
  repoToWorkingGroup?: Record<string, string[]>;
  /** Whether this org's repos are available in the CollectOSS/Augur database. Informational only — actual toggle is per-project. */
  augurAvailable?: boolean;
}

// ── Registry ────────────────────────────────────────────────────────

export const ORG_REGISTRY: OrgCollectionConfig[] = [
  // ─── Kubeflow ───────────────────────────────
  {
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
    repoToWorkingGroup: {
      'model-registry': ['WG Data'],
      'spark-operator': ['WG Data'],
      'pipelines': ['WG Pipelines'],
      'sdk': ['WG Training'],
      'trainer': ['WG Training'],
      'mpi-operator': ['WG Training'],
      'katib': ['WG AutoML'],
      'kale': ['WG ML Experience'],
      'notebooks': ['WG Notebooks'],
      'manifests': ['WG Manifests'],
      'kubeflow': ['WG Deployment', 'WG Manifests'],
    },
  },

  // ─── KServe ─────────────────────────────────
  {
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
        },
      ],
    },
  },

  // ─── Argo ───────────────────────────────────
  {
    githubOrg: 'argoproj',
    communityRepo: {
      repo: 'argoproj',
      defaultBranch: 'main',
      leadershipFiles: [
        {
          path: 'MAINTAINERS.md',
          groupName: 'Argoproj',
        },
      ],
    },
  },

  // ─── Kubernetes ────────────────────────────
  {
    githubOrg: 'kubernetes',
    communityRepo: {
      repo: 'community',
      defaultBranch: 'master',
      wgFile: 'sigs.yaml',
    },
  },

  // ─── llm-d ────────────────────────────────
  {
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
  },

  // ─── Containers (Podman, AI Lab Recipes, RamaLama, OLOT) ────
  {
    githubOrg: 'containers',
    repoGovernanceOverride: {
      'ramalama': 'codeowners',
      'ai-lab-recipes': 'none',
      'ramalama-stack': 'none',
      'olot': 'none',
    },
  },

  // ─── MLflow ─────────────────────────────────
  {
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
  },

  // ─── PyTorch ──────────────────────────────────
  {
    githubOrg: 'pytorch',
    communityRepo: {
      repo: 'pytorch',
      defaultBranch: 'main',
      leadershipFiles: [
        {
          path: 'docs/source/community/persons_of_interest.rst',
          groupName: 'PyTorch',
          format: 'rst_sections',
        },
      ],
    },
  },

  // ─── Docling ──────────────────────────────────
  {
    githubOrg: 'docling-project',
    communityRepo: {
      repo: 'community',
      defaultBranch: 'main',
      leadershipFiles: [
        {
          path: 'GOVERNANCE.md',
          groupName: 'Docling TSC',
          positionType: 'tsc_member',
          format: 'bullet_list',
          sectionHeading: 'TSC member',
        },
        {
          path: 'GOVERNANCE.md',
          groupName: 'Docling Committers',
          positionType: 'committer',
          format: 'bullet_list',
          sectionHeading: 'Committer',
        },
      ],
    },
  },

  // ─── Kagenti ────────────────────
  {
    githubOrg: 'kagenti',
    communityRepo: {
      repo: 'kagenti',
      defaultBranch: 'main',
      leadershipFiles: [
        {
          path: 'MAINTAINERS.md',
          groupName: 'Kagenti Maintainers',
          positionType: 'maintainer',
        },
      ],
    },
    repoGovernanceOverride: {
      'kagenti': 'none',
    },
  },

  // ─── Kuadrant ────────────────────
  {
    githubOrg: 'Kuadrant',
    communityRepo: {
      repo: 'kuadrant-operator',
      defaultBranch: 'main',
      leadershipFiles: [
        {
          path: 'MAINTAINERS.md',
          groupName: 'Kuadrant',
          positionType: 'maintainer',
          format: 'bullet_list',
        },
      ],
    },
  },
];

// ── Lookup helpers ──────────────────────────────────────────────────

const orgByGithubOrg = new Map(ORG_REGISTRY.map(o => [o.githubOrg.toLowerCase(), o]));

/** Look up an org collection config by its GitHub org slug (case-insensitive). */
export function getOrgConfig(githubOrg: string): OrgCollectionConfig | undefined {
  return orgByGithubOrg.get(githubOrg.toLowerCase());
}

/** All orgs that have a communityRepo configured (eligible for leadership collection). */
export function getOrgsWithCommunityRepo(): OrgCollectionConfig[] {
  return ORG_REGISTRY.filter(o => o.communityRepo != null);
}
