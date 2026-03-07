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

## Prerequisites for Multi-Org Support

Before adding non-Kubeflow projects, the following codebase changes are needed:

1. **Leadership collector** — currently hardcoded to `kubeflow/community`. Needs to be configurable per org or disabled for orgs without structured governance.
2. **Working Group mappings** — `metrics-service.ts` maps Kubeflow repos to WGs. Needs a generic, config-driven approach.
3. **Governance (OWNERS files)** — works for Kubernetes/Kubeflow-style OWNERS. Projects using CODEOWNERS or MAINTAINERS.md need alternative parsers.
4. **GitHub API rate limiting** — 40 repos will significantly increase API usage. Needs smarter batching and rate-limit awareness.
5. **Ecosystem/org field on projects** — the `ecosystem` field in the DB should consistently map to the upstream org for grouping.
