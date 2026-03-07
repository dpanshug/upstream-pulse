# Supported Upstream Projects

Upstream Pulse provides contribution tracking and governance insights for the following upstream open-source organizations and projects. This document lists what is currently supported and what is planned next, organized by upstream organization.

**Last updated**: 2026-03-07

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

## Planned Additions

### KServe (`kserve/*`)

Model serving and inference platform for Kubernetes.

| Repo | Description |
|------|-------------|
| `kserve/kserve` | Core model serving framework |
| `kserve/modelmesh-serving` | Multi-model serving layer |
| `kserve/modelmesh` | Core ModelMesh runtime |
| `kserve/modelmesh-runtime-adapter` | Runtime adapter layer |
| `kserve/rest-proxy` | REST proxy for inference |

**Governance**: Has its own community governance. Leadership collector needs to be extended.

---

### vLLM (`vllm-project/*`)

High-performance LLM inference engine. Strategically important for model serving.

| Repo | Description |
|------|-------------|
| `vllm-project/vllm` | LLM inference engine |

**Governance**: Community-driven, uses GitHub CODEOWNERS.

---

### Ray (`ray-project/*`)

Distributed computing framework for AI/ML workloads.

| Repo | Description |
|------|-------------|
| `ray-project/kuberay` | Ray operator for Kubernetes |

**Governance**: Anyscale-led open-source project.

---

### Kubernetes SIGs (`kubernetes-sigs/*`)

Kubernetes Special Interest Groups — infrastructure the team contributes to.

| Repo | Description |
|------|-------------|
| `kubernetes-sigs/kueue` | Job queueing for batch/ML workloads |
| `kubernetes-sigs/gateway-api-inference-extension` | Inference gateway extension for Gateway API |

**Governance**: Kubernetes-style OWNERS files. Similar governance model to Kubeflow.

---

### Argo (`argoproj/*`)

Workflow and CI/CD tooling. Argo Workflows underpins Kubeflow Pipelines.

| Repo | Description |
|------|-------------|
| `argoproj/argo-workflows` | Container-native workflow engine |

**Governance**: Argoproj community governance under CNCF.

---

### Meta Llama (`meta-llama/*`)

Meta's Llama Stack — an emerging area of upstream contribution.

| Repo | Description |
|------|-------------|
| `meta-llama/llama-stack` | Llama Stack framework |
| `meta-llama/llama-stack-client-python` | Python client library |

**Governance**: Meta-led open-source project.

---

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

### Feast (`feast-dev/*`)

Feature store for ML pipelines.

| Repo | Description |
|------|-------------|
| `feast-dev/feast` | Feature store |

**Governance**: Linux Foundation / Tecton-led project.

---

### Individual repos (various orgs)

Additional upstream projects across various organizations.

| Upstream Repo | Description |
|---|---|
| `mlflow/mlflow` | ML experiment tracking & model registry |
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
| **KServe** | 5 | Planned |
| **vLLM** | 1 | Planned |
| **Ray** | 1 | Planned |
| **Kubernetes SIGs** | 2 | Planned |
| **Argo** | 1 | Planned |
| **Meta Llama** | 2 | Planned |
| **OpenVINO** | 4 | Planned |
| **Caikit** | 3 | Planned |
| **Feast** | 1 | Planned |
| **Individual repos** | 8 | Planned |
| **Total** | **40** | 10 tracked, 30 planned |

---

## Multi-Org Support (Implemented)

The following infrastructure is in place to support all upstream organizations listed above:

1. **Org registry** (`backend/src/shared/config/org-registry.ts`) — static config that declares every supported org, its community repo, leadership files, and governance model. Adding a new org is a single PR to this file. See [Adding an Organization](adding-an-org.md).
2. **Configurable leadership collector** — `LeadershipCollector` accepts an org config and dispatches to the appropriate parser. Supports markdown leadership tables (uniform-role and mixed-role), WGs/SIGs YAML, and is extensible per org.
3. **Multiple governance parsers** — Kubernetes/Kubeflow-style `OWNERS` files, GitHub-native `CODEOWNERS` files, and markdown `MAINTAINERS.md` tables are all supported. The `governanceModel` field in the org registry controls which parser runs.
4. **Per-org leadership data** — the `leadershipPositions` table includes a `communityOrg` column. The scheduler dispatches one leadership job per org, and the metrics service returns leadership data grouped by org (`byOrg[]`).
5. **Working Group mappings** — `repoToWorkingGroup` in the org registry replaces the hardcoded Kubeflow WG mapping. Orgs without WGs simply omit this field.
6. **API support** — `GET /api/orgs` returns the org registry. `POST /api/leadership/refresh` accepts an optional `githubOrg` to scope the refresh. `POST /api/projects` auto-triggers a leadership refresh for the new project's org.
