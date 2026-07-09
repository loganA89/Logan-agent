# Logan Agent: Local RAG & Vector Semantic Search Architecture

**Document Version:** 1.0.0  
**Status:** Approved Specification (Phase 0 - Step 6)  
**Parent Blueprint:** `docs/00_project_overview.md`  
**Target Module:** Zero-Cost Codebase Indexer, Hybrid Search Engine & Retrieval Tooling

---

## 1. Introduction & Architectural Objectives

To autonomously navigate, refactor, and reason about enterprise-scale codebases containing tens of thousands of files, an AI coding assistant must possess rapid, highly accurate codebase retrieval capabilities. However, conventional cloud-based vector database architectures introduce severe bottlenecks: they require shipping proprietary enterprise code to third-party servers (violating strict enterprise data privacy and residency mandates), incur ongoing infrastructure cloud hosting costs, and suffer from network transmission latency.

Conversely, attempting to brute-force code search by injecting entire repositories or unindexed grep dumps into LLM context windows causes immediate token overflow, severe cognitive hallucination, and exorbitant API per-query billing.

Logan Agent solves these limitations by integrating a **Zero-Cost Local Retrieval-Augmented Generation (RAG)** engine directly into the VS Code extension runtime. By embedding a serverless local vector database within the user's hidden workspace directory and coupling it with real-time AST-aware incremental indexing and hybrid lexical-semantic retrieval, Logan Agent achieves instantaneous, deterministic codebase awareness with complete privacy and near-zero ongoing operational costs.

---

## 2. Zero-Cost Local Codebase Indexing Architecture

Unlike cloud-dependent agent extensions that sync codebases to managed Pinecone, Qdrant, or Weaviate clusters, Logan Agent operates a 100% local, embedded vector indexing storage engine.

```
+-----------------------------------------------------------------------------------+
|                            VS CODE LOCAL DEVELOPER WORKSPACE                      |
|                                                                                   |
|  [Project Source Directory]                     [Hidden Workspace Index Directory]|
|  ├── src/                                       └── .vscode/                      |
|  │    ├── controllers/                               └── .logan/                  |
|  │    ├── services/                                       ├── index.db (HNSW Index)|
|  │    └── models/                                         ├── metadata.json       |
|  └── package.json                                         └── bm25_inverted.idx   |
+-----------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
|                        LOCAL SERVERLESS VECTOR ENGINE                             |
|          Managed via lightweight embedded library (`vectra` / `hnswlib-node`)     |
|          • Hierarchical Navigable Small World (HNSW) Graph Search                 |
|          • Zero Cloud Database Hosting Costs                                      |
|          • Absolute Enterprise Privacy & Zero Data Exfiltration                   |
+-----------------------------------------------------------------------------------+
```

### 2.1 Storage & Privacy Specification
* **Embedded Storage Engine:** Logan Agent leverages lightweight, high-performance local vector search libraries (`vectra` or compiled `hnswlib-node` bindings) writing directly to the `.vscode/.logan/index.db` binary file inside the active workspace root.
* **Absolute Data Privacy:** Source code, file paths, and structural indices never leave the developer's local filesystem. Vector representations are generated either locally via embedded ONNX runtime models or securely via ephemeral, stateless embedding endpoints (`text-embedding-3-small`), ensuring absolute compliance with enterprise IP protection standards.
* **Zero Infrastructure Overhead:** Because the index is persisted locally as static flat files within `.vscode/.logan/`, developers incur zero recurring cloud vector database hosting or data transfer costs.

---

## 3. The Incremental Indexing Pipeline

To ensure the local RAG index remains perfectly synchronized with active code edits without consuming excessive CPU cycles or generating redundant embedding API calls, Logan Agent implements a three-stage **Incremental Indexing Pipeline**.

```
[VS Code File Watcher Event: create / change / delete]
                         │
                         ▼
+-----------------------------------------------------------------+
|              STAGE 1: INCREMENTAL TIMESTAMP FILTER              |
|  Compare file mtime & SHA-256 hash against metadata ledger      |
+-----------------------------------------------------------------+
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
 [Hash Unchanged]                  [Dirty / New File]
        │                                 │
        ▼                                 ▼
 Skip Processing                +---------------------------------+
 (Zero Embedding Cost)          |   STAGE 2: AST SMART CHUNKING   |
                                | Parse via Tree-sitter Grammar   |
                                | Extract Class & Function Blocks |
                                +---------------------------------+
                                                  │
                                                  ▼
                                +---------------------------------+
                                | STAGE 3: EMBEDDING GENERATION   |
                                | Send new chunks to PAL endpoint |
                                | Update local HNSW index graph   |
                                +---------------------------------+
```

### 3.1 Workspace File Watcher Integration
The extension registers background event listeners via `vscode.workspace.createFileSystemWatcher('**/*')`. Any file creation, modification, or deletion event within non-ignored directories immediately queues the affected file URI in the indexing background worker.

### 3.2 AST-Aware Smart Chunking Algorithm
Conventional text chunking algorithms split documents by arbitrary line counts (e.g., every 50 lines with a 10-line overlap). When applied to source code, line-based chunking bifurcats function definitions, separates method headers from their implementation logic, and corrupts structural syntax tree semantics.

Logan Agent replaces line-slicing with **AST-Aware Smart Chunking**:
1. **Tree-Sitter Parsing:** The incoming source code buffer is parsed using lightweight Tree-Sitter WebAssembly grammars corresponding to the file language (`TypeScript`, `Python`, `Go`, `Rust`, `Java`).
2. **Semantic Boundary Extraction:** The AST traversal traverses the syntax tree and extracts self-contained semantic nodes:
   * Class declarations and interface definitions.
   * Standalone function definitions and class method implementations.
   * Module-level configuration and exported constant blocks.
3. **Chunk Metadata Enrichment:** Each chunk is wrapped with structured contextual headers before embedding generation:
   ```text
   [File: src/services/AuthService.ts] [Class: AuthService] [Method: validateToken]
   public async validateToken(token: string): Promise<UserSession> { ... }
   ```

### 3.3 Cost-Saving Incremental Update Mechanism
Generating vector embeddings for an entire 10,000-file repository on every save would result in unnecessary latency and token costs.
* **SHA-256 State Ledger:** The index engine maintains an internal ledger (`metadata.json`) mapping every workspace file URI to its last indexed modification timestamp (`mtime`) and content SHA-256 checksum.
* **Selective Invalidation:** When a file change event triggers, the engine hashes the new buffer. If the hash matches existing ledger entries, the file is bypassed immediately. If dirty, only the modified file's chunks are sent to the lightweight embedding endpoint (`text-embedding-3-small`), and their corresponding vectors are updated in-place inside `index.db`. untouched repository files preserve their existing embeddings indefinitely.

---

## 4. Hybrid Semantic & Lexical Search Tool (`search_codebase`)

When solving software engineering tasks, queries fall into two distinct categories:
1. **Exact Lexical Lookups:** Finding specific variable identifiers, error codes, config keys, or function names (e.g., `MAX_RETRY_LIMIT` or `handleAuthException()`).
2. **Conceptual Semantic Queries:** Finding architectural patterns or functional behaviors described in natural language (e.g., *"Where is user JWT login authentication processed?"* or *"How are database connection pool timeouts configured?"*).

Pure vector search struggles with exact keyword and symbol matching, while pure BM25 keyword search fails on conceptual natural language queries. Logan Agent exposes a unified **Hybrid Search Tool** (`search_codebase`) that fuses both retrieval methodologies.

### 4.1 `search_codebase` Tool Schema Specification

```typescript
export const SearchCodebaseToolSchema = {
  name: 'search_codebase',
  description: 'Execute a high-precision hybrid semantic and keyword search across the local codebase index.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language conceptual query OR exact symbol name.'
      },
      topK: {
        type: 'number',
        description: 'Number of results to retrieve (Defaults strictly to 5 to preserve token budget).'
      }
    },
    required: ['query']
  }
};
```

### 4.2 Reciprocal Rank Fusion (RRF) Architecture

When the ReAct engine invokes `search_codebase`, the local retrieval engine executes two parallel searches across the local index:

```
                  ReAct Tool Invocation: search_codebase(query)
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
  +---------------------------+                 +---------------------------+
  |    EXACT LEXICAL SEARCH   |                 |   DENSE SEMANTIC SEARCH   |
  |     Inverted BM25 Index   |                 |    Local Vector Index     |
  |  Scores exact symbol hits |                 |  Cosine Similarity Score  |
  +---------------------------+                 +---------------------------+
                │                                             │
                ▼                                             ▼
       Ranked Lexical List                           Ranked Vector List
                │                                             │
                └──────────────────────┬──────────────────────┘
                                       ▼
+-----------------------------------------------------------------------------+
|                     RECIPROCAL RANK FUSION (RRF) ENGINE                     |
|            Score(chunk) = 1/(60 + Rank_BM25) + 1/(60 + Rank_Vector)          |
|            Sort by combined score -> Extract strictly Top-5 Chunks          |
+-----------------------------------------------------------------------------+
                                       │
                                       ▼
             Optimized Context Payload Injected into ReAct Loop
```

1. **Lexical BM25 Ranking:** Scores chunks based on exact keyword density, identifier matches, and symbol frequency.
2. **Dense Vector Similarity:** Computes cosine similarity between the embedded query vector and the HNSW chunk vectors.
3. **Reciprocal Rank Fusion (RRF):** The engine merges both ranked lists using the standard RRF formula:
   $$RRF\_Score(d) = \sum_{m \in \{BM25, Vector\}} \frac{1}{k + r_m(d)}$$
   where $r_m(d)$ is the rank position of chunk $d$ in system $m$, and smoothing constant $k=60$.

### 4.3 Strict Top-5 Context Injection Safeguard

To guarantee strict context economy and prevent prompt window saturation, the hybrid retrieval pipeline enforces an absolute ceiling on output payload size:
* **Top-5 Cutoff:** Regardless of query breadth, the tool formats and injects **ONLY the top 5 highest-ranked code chunks** into the ReAct observation stream.
* **Token Economy:** By delivering 5 highly relevant, self-contained AST function/class chunks (~150–200 lines total) instead of massive raw file dumps, Logan Agent keeps retrieval token expenditure close to zero while supplying the reasoning engine with the exact architectural context required to formulate accurate code modifications.
