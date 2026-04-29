# Supported Upstream Projects

Upstream Pulse provides contribution tracking and governance insights for the following upstream open-source organizations and projects. This document lists what is currently supported and what is planned next, organized by upstream organization.

**Last updated**: 2026-04-15

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
| `kubeflow/community` | Community proposals and governance | **Tracked** |
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
| `kserve/community` | Community docs for contributions and process | **Tracked** |
| `kserve/website` | User documentation for KServe | **Tracked** |

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

### ogx (`ogx-ai/*`)

ogx (Open GenAI Stack, formerly Llama Stack) — unified open-source API server for agentic AI. Strategically important — 30.5% team share in core repo, 82.5% in k8s operator.

| Repo | Description | Status |
|------|-------------|--------|
| `ogx-ai/ogx` | ogx framework (core) | **Tracked** |
| `ogx-ai/ogx-k8s-operator` | Kubernetes operator for ogx | **Tracked** |

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

### Kubernetes (`kubernetes/*`)

Core Kubernetes project — production-grade container orchestration. Red Hat leads or co-leads 16 of 24 SIGs and 6 of 9 WGs.

| Repo | Description | Status |
|------|-------------|--------|
| `kubernetes/kubernetes` | Core container orchestration platform | **Tracked** |
| `kubernetes/community` | Community governance, SIGs, and proposals | **Tracked** |
| `kubernetes/enhancements` | Kubernetes Enhancement Proposals (KEPs) | **Tracked** |
| `kubernetes/kubectl` | Kubernetes CLI | **Tracked** |
| `kubernetes/autoscaler` | Cluster and pod autoscaling | **Tracked** |
| `kubernetes/client-go` | Go client library | **Tracked** |
| `kubernetes/ingress-nginx` | NGINX ingress controller | **Tracked** |

**Governance**: Leadership data sourced from `kubernetes/community` `sigs.yaml` (24 SIGs, 9 WGs, 3 committees). OWNERS files supported.

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
| `kubernetes-sigs/ai-conformance` | AI Conformance definitions, proposals, and tests | **Tracked** |
| `kubernetes-sigs/wg-serving` | WG Serving proposals and prototypes | **Tracked** |

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

### NVIDIA (`NVIDIA/*`)

NVIDIA AI/ML infrastructure — large-scale training, inference, and LLM security tooling.

| Repo | Description | Status |
|------|-------------|--------|
| `NVIDIA/NeMo-Guardrails` | Programmable guardrails for LLM-based systems | **Tracked** |
| `NVIDIA/garak` | LLM vulnerability scanner | **Tracked** |
| `NVIDIA/TensorRT-LLM` | High-performance LLM inference with TensorRT | **Tracked** |
| `NVIDIA/Megatron-LM` | Large-scale transformer training at scale | **Tracked** |

**Governance**: Uses GitHub CODEOWNERS. NVIDIA-led open-source projects.

---

### Containers (`containers/*`)

Container tooling ecosystem — Podman, RamaLama, AI Lab Recipes, OLOT. Mixed governance: podman uses OWNERS, ramalama uses CODEOWNERS, others have neither. Per-repo governance overrides handle this.

| Repo | Description | Status |
|------|-------------|--------|
| `containers/podman` | OCI container management tool | **Tracked** |
| `containers/ramalama` | Local AI model serving with containers | **Tracked** |
| `containers/ai-lab-recipes` | AI application recipes for containers | **Tracked** |
| `containers/ramalama-stack` | ogx provider for RamaLama | **Tracked** |
| `containers/olot` | OCI Layers On Top — append layers to OCI images | **Tracked** |

**Governance**: Leadership from `containers/podman` MAINTAINERS.md (6 Core Maintainers, 5 Maintainers, 10 Reviewers, 3 Community Managers). Podman uses OWNERS (27 approvers, 14 reviewers). RamaLama uses CODEOWNERS (11 owners). Uses `repoGovernanceOverride` for per-repo model selection.

---

### GGML (`ggml-org/*`)

High-performance LLM inference in C/C++. Home of `llama.cpp` (102k+ stars) — the leading open-source local LLM inference engine.

| Repo | Description | Status |
|------|-------------|--------|
| `ggml-org/llama.cpp` | LLM inference in C/C++ | **Tracked** |

**Governance**: Uses GitHub CODEOWNERS (~100 owner entries). No community repo or structured leadership files. Led by @ggerganov.

---

### PyTorch (`pytorch/*`)

Meta's open-source deep learning framework. Tracking for emerging team contributions.

| Repo | Description | Status |
|------|-------------|--------|
| `pytorch/pytorch` | Tensors and dynamic neural networks with GPU acceleration | **Tracked** |

**Governance**: Uses GitHub CODEOWNERS (~150 owner entries). Leadership data sourced from `pytorch/pytorch` `persons_of_interest.rst` (BDFL, core maintainers, module maintainers across 25+ modules). Meta-led open-source project.

---

### Kuadrant (`Kuadrant/*`)

Gateway policies for Kubernetes — API management, rate limiting, DNS, and auth.

| Repo | Description | Status |
|------|-------------|--------|
| `Kuadrant/authorino` | Kubernetes-native auth service | **Tracked** |
| `Kuadrant/limitador` | Rate limiting service | **Tracked** |
| `Kuadrant/wasm-shim` | Wasm extension for Envoy | **Tracked** |

**Governance**: Leadership from `kuadrant-operator/MAINTAINERS.md` (13 org-level maintainers, bullet-list format). Tracked repos have no OWNERS/CODEOWNERS.

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
| `SeldonIO/MLServer` | ML model server (used by KServe) |

---

## Summary

| Organization | Repos | Status |
|---|---|---|
| **Kubeflow** | 13 | 11 tracked, 2 to add |
| **KServe** | 7 | 7 tracked |
| **vLLM** | 2 | 2 tracked |
| **Feast** | 1 | 1 tracked |
| **ogx** | 2 | 2 tracked |
| **llm-d** | 6 | 6 tracked |
| **MLflow** | 1 | 1 tracked |
| **Kubernetes** | 7 | 7 tracked |
| **Kubernetes SIGs** | 7 | 7 tracked |
| **Ray** | 1 | 1 tracked |
| **Argo** | 2 | 2 tracked |
| **NVIDIA** | 4 | 4 tracked |
| **Containers** | 5 | 5 tracked |
| **GGML** | 1 | 1 tracked |
| **PyTorch** | 1 | 1 tracked |
| **Kuadrant** | 3 | 3 tracked |
| **OpenVINO** | 4 | Planned |
| **Caikit** | 3 | Planned |
| **Individual repos** | 6 | Planned |
| **Total** | **76** | 61 tracked, 15 planned |

---

## Multi-Org Support (Implemented)

The following infrastructure is in place to support all upstream organizations listed above:

1. **Org registry** (`backend/src/shared/config/org-registry.ts`) — static config that declares every supported org, its community repo, leadership files, and governance model. Adding a new org is a single PR to this file. See [Adding an Organization](adding-an-org.md).
2. **Configurable leadership collector** — `LeadershipCollector` accepts an org config and dispatches to the appropriate parser. Supports markdown leadership tables (uniform-role and mixed-role), WGs/SIGs YAML, bullet-list formats (e.g. MLflow Core Members), and is extensible per org.
3. **Multiple governance parsers** — Kubernetes/Kubeflow-style `OWNERS` files, GitHub-native `CODEOWNERS` files, and markdown `MAINTAINERS.md` tables are all supported. The `governanceModel` field in the org registry controls which parser runs. `repoGovernanceOverride` allows per-repo overrides for mixed-governance orgs (e.g. `containers`: podman uses OWNERS, ramalama uses CODEOWNERS).
4. **Per-org leadership data** — the `leadershipPositions` table includes a `communityOrg` column. The scheduler dispatches one leadership job per org, and the metrics service returns leadership data grouped by org (`byOrg[]`).
5. **Working Group mappings** — `repoToWorkingGroup` in the org registry replaces the hardcoded Kubeflow WG mapping. Orgs without WGs simply omit this field.
6. **API support** — `GET /api/orgs` returns the org registry. `POST /api/leadership/refresh` accepts an optional `githubOrg` to scope the refresh. `POST /api/projects` auto-triggers a leadership refresh for the new project's org.
