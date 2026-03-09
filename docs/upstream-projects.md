# Supported Upstream Projects

Upstream Pulse provides contribution tracking and governance insights for the following upstream open-source organizations and projects. This document lists what is currently supported and what is planned next, organized by upstream organization.

**Last updated**: 2026-03-09

---

## Currently Tracked

### Kubeflow (`kubeflow/*`)

The primary upstream org for Kubernetes-native ML platform components.

| Repo | Description | Status |
|------|-------------|--------|
| `kubeflow/model-registry` | ML model registry | **Tracked** |
| `kubeflow/trainer` | Training API (v2) | **Tracked** |
| `kubeflow/pipelines` | ML workflow pipelines | **Tracked** |
| `kubeflow/spark-operator` | Apache Spark on Kubernetes | **Tracked** |
| `kubeflow/katib` | Hyperparameter tuning | **Tracked** |
| `kubeflow/sdk` | Pipelines Python SDK | **Tracked** |
| `kubeflow/notebooks` | Notebook controller | **Tracked** |
| `kubeflow/kale` | Notebook-to-pipeline conversion | **Tracked** |
| `kubeflow/manifests` | Deployment manifests | **Tracked** |
| `kubeflow/mpi-operator` | MPI distributed training | **Tracked** |
| `kubeflow/kubeflow` | Main umbrella repo | Not tracked |
| `kubeflow/training-operator` | Distributed training (v1, separate from `trainer`) | Not tracked |

**Governance**: Leadership data sourced from `kubeflow/community` (steering committee, WG/SIG chairs). OWNERS files supported.

---

### KServe (`kserve/*`)

Model serving and inference platform for Kubernetes.

| Repo | Description | Status |
|------|-------------|--------|
| `kserve/kserve` | Core model serving framework | **Tracked** |
| `kserve/modelmesh-serving` | Multi-model serving layer | **Tracked** |
| `kserve/modelmesh` | Core ModelMesh runtime | **Tracked** |
| `kserve/modelmesh-runtime-adapter` | Runtime adapter layer | **Tracked** |
| `kserve/rest-proxy` | REST proxy for inference | **Tracked** |

**Governance**: Leadership data sourced from `kserve/community` (TSC, maintainers). OWNERS files supported.

---

### vLLM (`vllm-project/*`)

High-performance LLM inference engine. Strategically important for model serving.

| Repo | Description | Status |
|------|-------------|--------|
| `vllm-project/vllm` | LLM inference engine | **Tracked** |
| `vllm-project/semantic-router` | Intelligent router for Mixture-of-Models | **Tracked** |

**Governance**: Community-driven, uses GitHub CODEOWNERS.

---

### Feast (`feast-dev/*`)

Feature store for ML pipelines.

| Repo | Description | Status |
|------|-------------|--------|
| `feast-dev/feast` | Feature store | **Tracked** |

**Governance**: OWNERS files supported. Linux Foundation / Tecton-led project.

---

### Llama Stack (`llamastack/*`)

Llama Stack framework and Kubernetes operator. Strategically important — 30.5% team share in core repo, 82.5% in k8s operator.

| Repo | Description | Status |
|------|-------------|--------|
| `llamastack/llama-stack` | Llama Stack framework (core) | **Tracked** |
| `llamastack/llama-stack-k8s-operator` | Kubernetes operator for Llama Stack | **Tracked** |

**Governance**: Uses CODEOWNERS.

---

### llm-d (`llm-d/*`)

Distributed LLM inference on Kubernetes. 24.6% team share in core repo.

| Repo | Description | Status |
|------|-------------|--------|
| `llm-d/llm-d` | Core distributed inference framework | **Tracked** |
| `llm-d/llm-d-inference-scheduler` | Intelligent request routing | **Tracked** |
| `llm-d/llm-d-kv-cache` | Distributed KV cache scheduling | **Tracked** |
| `llm-d/llm-d-inference-sim` | Inference simulator | **Tracked** |
| `llm-d/llm-d-benchmark` | Benchmark scripts and tooling | **Tracked** |
| `llm-d/llm-d-workload-variant-autoscaler` | Variant optimization autoscaler | **Tracked** |

**Governance**: Leadership from `MAINTAINERS.md` (project leads). OWNERS files supported. SIG structure defined in `SIGS.md`.

---

### MLflow (`mlflow/*`)

ML experiment tracking, model registry, and AI agent development platform. LF AI & Data Foundation project.

| Repo | Description | Status |
|------|-------------|--------|
| `mlflow/mlflow` | ML experiment tracking & model registry | **Tracked** |

**Governance**: No OWNERS/CODEOWNERS. Leadership (Core Members) sourced from `mlflow/mlflow` README.md.

---

### Kubernetes SIGs (`kubernetes-sigs/*`)

Kubernetes Special Interest Groups — infrastructure the team contributes to.

| Repo | Description | Status |
|------|-------------|--------|
| `kubernetes-sigs/kueue` | Job queueing for batch/ML workloads | **Tracked** |
| `kubernetes-sigs/gateway-api-inference-extension` | Inference gateway extension for Gateway API | **Tracked** |
| `kubernetes-sigs/wg-ai-gateway` | AI Gateway Working Group proposals & prototypes | **Tracked** |
| `kubernetes-sigs/jobset` | K8s native API for distributed ML training | **Tracked** |
| `kubernetes-sigs/lws` | LeaderWorkerSet for deploying pod groups | **Tracked** |

**Governance**: Kubernetes-style OWNERS files. Similar governance model to Kubeflow.

---

### Ray (`ray-project/*`)

Distributed computing framework for AI/ML workloads.

| Repo | Description | Status |
|------|-------------|--------|
| `ray-project/kuberay` | Ray operator for Kubernetes | **Tracked** |

**Governance**: Anyscale-led open-source project. Uses CODEOWNERS.

---

### Argo (`argoproj/*`)

Workflow and CI/CD tooling under CNCF. Yuan Tang (Red Hat) is Argo Workflows project Lead.

| Repo | Description | Status |
|------|-------------|--------|
| `argoproj/argo-workflows` | Container-native workflow engine | **Tracked** |
| `argoproj/argo-cd` | Declarative GitOps continuous delivery | **Tracked** |

**Governance**: Leadership data sourced from `argoproj/argoproj` MAINTAINERS.md (authoritative, all subprojects). OWNERS files supported.

---

## Planned Additions

### OpenVINO (`openvinotoolkit/*`)

Intel's inference optimization toolkit.

| Repo | Description |
|------|-------------|
| `openvinotoolkit/openvino` | Core OpenVINO runtime |
| `openvinotoolkit/model_server` | OpenVINO Model Server (OVMS) |
| `openvinotoolkit/openvino_contrib` | Community contributions |
| `openvinotoolkit/openvino_tokenizers` | Tokenizer support |

**Governance**: Intel-led open-source project.

---

### Caikit (`caikit/*`)

AI toolkit for model management and inference.

| Repo | Description |
|------|-------------|
| `caikit/caikit` | Core AI toolkit |
| `caikit/caikit-tgis-backend` | TGIS inference backend |
| `caikit/caikit-nlp` | NLP module |

**Governance**: IBM-led open-source project.

---

### Individual repos (various orgs)

Additional upstream projects across various organizations.

| Upstream Repo | Description |
|---|---|
| `huggingface/text-generation-inference` | Text Generation Inference (TGI) |
| `BerriAI/litellm` | LLM proxy / unified API |
| `EleutherAI/lm-evaluation-harness` | LLM evaluation framework |
| `elyra-ai/elyra` | Notebook pipeline editor |
| `project-codeflare/codeflare-operator` | Distributed computing operator |
| `NVIDIA/NeMo-Guardrails` | AI safety guardrails |
| `SeldonIO/MLServer` | ML model server (used by KServe) |

---

## Summary

| Organization | Repos | Status |
|---|---|---|
| **Kubeflow** | 12 | 10 tracked, 2 to add |
| **KServe** | 5 | 5 tracked |
| **vLLM** | 2 | 2 tracked |
| **Feast** | 1 | 1 tracked |
| **Llama Stack** | 2 | 2 tracked |
| **llm-d** | 6 | 6 tracked |
| **MLflow** | 1 | 1 tracked |
| **Kubernetes SIGs** | 5 | 5 tracked |
| **Ray** | 1 | 1 tracked |
| **Argo** | 2 | 2 tracked |
| **OpenVINO** | 4 | Planned |
| **Caikit** | 3 | Planned |
| **Individual repos** | 7 | Planned |
| **Total** | **51** | 35 tracked, 16 planned |

---

## Multi-Org Support (Implemented)

The following infrastructure is in place to support all upstream organizations listed above:

1. **Org registry** (`backend/src/shared/config/org-registry.ts`) — static config that declares every supported org, its community repo, leadership files, and governance model. Adding a new org is a single PR to this file. See [Adding an Organization](adding-an-org.md).
2. **Configurable leadership collector** — `LeadershipCollector` accepts an org config and dispatches to the appropriate parser. Supports markdown leadership tables (uniform-role and mixed-role), WGs/SIGs YAML, bullet-list formats (e.g. MLflow Core Members), and is extensible per org.
3. **Multiple governance parsers** — Kubernetes/Kubeflow-style `OWNERS` files, GitHub-native `CODEOWNERS` files, and markdown `MAINTAINERS.md` tables are all supported. The `governanceModel` field in the org registry controls which parser runs.
4. **Per-org leadership data** — the `leadershipPositions` table includes a `communityOrg` column. The scheduler dispatches one leadership job per org, and the metrics service returns leadership data grouped by org (`byOrg[]`).
5. **Working Group mappings** — `repoToWorkingGroup` in the org registry replaces the hardcoded Kubeflow WG mapping. Orgs without WGs simply omit this field.
6. **API support** — `GET /api/orgs` returns the org registry. `POST /api/leadership/refresh` accepts an optional `githubOrg` to scope the refresh. `POST /api/projects` auto-triggers a leadership refresh for the new project's org.
