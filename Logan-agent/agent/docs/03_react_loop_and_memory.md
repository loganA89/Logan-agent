# Logan Agent: ReAct Reasoning Engine & Memory Optimization Pipeline

**Document Version:** 1.0.0  
**Status:** Approved Specification (Phase 0 - Step 4)  
**Parent Blueprint:** `docs/00_project_overview.md`  
**Target Module:** Autonomous Reasoning Engine & Active Memory Compaction Controller

---

## 1. Introduction & Architectural Objectives

The core cognitive engine of Logan Agent operates as a deterministic, closed-loop **Reasoning and Acting (ReAct)** system. When presented with a complex software engineering task—such as diagnosing a multi-module architectural regression or refactoring an API interface—simple one-shot LLM completions fail due to incomplete codebase context and cascading syntax errors.

To achieve autonomy, Logan Agent interleaves structured cognitive deduction (`<thought>`) with sandboxed tool execution (`<action>`) and feedback ingestion (`<observation>`). To sustain this iterative loop over extended software development sessions without triggering token exhaustion or exponential cost inflation, the runtime incorporates an active **Background Conversation Compaction & Token Scrubbing Pipeline**. This pipeline dynamically monitors conversation depth, compresses historical interactions using lightweight secondary models, and guarantees predictable context consumption.

---

## 2. The Autonomous ReAct Loop Engine

The autonomous reasoning loop governs the step-by-step execution lifecycle of user tasks. Each cycle progresses through strict state transitions managed by the **ReAct State Orchestrator**.

```
+-----------------------------------------------------------------------------------+
|                            USER PROMPT / TASK INITIATION                          |
+-----------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
|                        STATE 1: COGNITION & PLAN FORMULATION                      |
|           LLM Emits Internal Reasoning: <thought>...</thought> blocks             |
+-----------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
|                    STATE 2: ACTION INVOCATION & TOOL ROUTING                      |
|         LLM Emits Normalized Tool Call JSON Schemas (read, edit, exec)            |
+-----------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
|                   STATE 3: SANDBOXED EXECUTION & OBSERVATION                      |
|      Execute Tool -> Intercept Output -> Scrub Logs -> Emit Observation           |
+-----------------------------------------------------------------------------------+
                                          │
                         ┌────────────────┴────────────────┐
                         ▼                                 ▼
              [Tool Success / Next Step]           [Execution Error / Failure]
                         │                                 │
                         ▼                                 ▼
+-----------------------------------------+   +-------------------------------------+
|      CHECK TERMINATION CONDITION        |   |   FAULT-TOLERANT SELF-CORRECTION    |
|   Has task reached completed status?    |   | Parse Error -> Adjust Plan -> Retry |
+-----------------------------------------+   +-------------------------------------+
        │                        │                             │
 [Yes: Task Done]        [No: Iterate Loop]                    │
        │                        │                             │
        ▼                        └───────────────◄─────────────┘
  EMIT FINAL ANSWER                              │
                                                 ▼
                                     [Check Circuit Breaker]
                            Count > MAX_STEPS (10)? -> Halt & Notify
```

### 2.1 Structured State Transitions & Processing

1. **Cognition State (`<thought>` Formulation):** Before invoking any tool or communicating with the user, the agent must explicitly articulate its diagnosis, working assumptions, and execution plan within `<thought>` XML tags. The orchestrator intercepts and isolates these reasoning streams from the final user UI display.
2. **Action State (JSON-Schema Tool Calling):** Following cognitive planning, the agent emits structured tool invocation payloads matching the PAL `NormalizedToolDefinition` interfaces (e.g., calling `read_file` or `edit_file`).
3. **Observation State (Tool Output Ingestion):** The orchestrator executes the sandboxed tool, processes the output through the Token Scrubber Engine (as specified in `docs/02_vscode_native_tools.md`), and appends the normalized output to the active message array as a `tool_result` content block.

### 2.2 Fault-Tolerant Self-Correction Mechanism

Software engineering tasks routinely encounter unexpected compiler errors, failed unit tests, or mismatched file signatures. Logan Agent implements deterministic self-correction protocols:
* **Automated Diagnostic Diagnosis:** When a terminal execution or file edit tool returns a failure status (`isError: true`), the orchestrator prevents immediate task termination. Instead, it feeds the scrubbed error observation back into the cognition loop.
* **Reflective Recovery Strategy:** The agent is instructed via system prompt instructions to analyze the failure root cause, formulate a corrective hypothesis (e.g., missing type import, improper indentation, or outdated API signature), and generate an adjusted action plan.
* **Retry Ceilings:** To prevent endless localized retry cycles on unrecoverable errors, any single tool target enforces a maximum local retry threshold of $R_{local} = 3$. If three consecutive attempts on the same file fail, the agent escalates to a broader workspace search or requests user intervention.

### 2.3 The Safety Circuit Breaker ($MAX\_STEPS = 10$)

Autonomous agents operating on token-metered APIs pose a financial risk if caught in non-converging execution loops. To enforce absolute cost and execution safety, the ReAct loop implements a hard runtime **Safety Circuit Breaker**:

$$\text{Step Count } (S) \le MAX\_STEPS = 10$$

* **Iteration Monitoring:** The orchestrator increments step counter $S$ after every full `Thought -> Action -> Observation` cycle.
* **Threshold Interception:** If $S$ reaches 10 without emitting a final conversational conclusion, the runtime forcibly interrupts active provider streams, freezes the ReAct state machine, and presents a diagnostic modal to the user:
  > *"Logan Agent has reached the autonomous safety execution limit (10 steps). Please review current progress in the diff viewer and choose to continue execution or take manual control."*

---

## 3. Strict English-Only Reasoning Enforcement

A major cause of token inefficiency, semantic drift, and syntax generation errors in multi-lingual LLM interactions is language switching within internal chain-of-thought blocks. When an agent attempts internal reasoning in morphologically complex or non-Latin script languages (e.g., Persian, Arabic, Japanese), tokenizers split words into fragmented byte-pair sub-tokens, doubling context consumption and degrading logical coherence.

To guarantee maximum architectural precision, Logan Agent enforces a strict **English-Only Cognitive Sandbox** across all internal reasoning layers.

### 3.1 System Prompt Enforcement Specification

Every system prompt injected into the Provider Abstraction Layer embeds inviolable directives governing language utilization:

```text
[CRITICAL SYSTEM DIRECTIVE: STRICT ENGLISH COGNITION]
Regardless of the language used by the user in chat prompts (e.g., Persian, Spanish, Chinese) or the domain language of comments in the target codebase:
1. INTERNAL REASONING: All cognitive deductions enclosed within <thought>, <plan>, and <reflection> tags MUST be formulated exclusively in concise, professional English.
2. TOOL ARGUMENTATION: All tool input parameters, search queries, file paths, and structural code mutations MUST be constructed in standard technical English.
3. USER RESPONSE TRANSLATION: Only the final conversational response addressed directly to the user outside of tool calls and thought blocks may be localized into the user's native prompt language.
```

### 3.2 Architectural Benefits
* **Tokenizer Optimization:** English technical terminology maps to 1:1 or 1:2 token ratios on modern BPE tokenizers (OpenAI `cl100k_base`, Anthropic vocabulary), whereas non-Latin scripts average 3:1 to 6:1 token inflation ratios. Enforcing English reasoning cuts cognitive token overhead by up to **65%** during multi-lingual user sessions.
* **Cross-Model Alignment:** Open-weights coding models (such as GapGPT Qwen 3.6) exhibit superior instruction-following accuracy and tool-call schema adherence when reasoning internal chains in English.

---

## 4. Background Conversation Compaction & Token Scrubbing Pipeline

As an autonomous coding task progresses through multiple tool invocations and large file inspections, raw conversation context grows linearly, rapidly approaching provider context ceilings ($N > 64,000$ tokens). Logan Agent prevents context collapse via an asynchronous **Background Summarization & Compaction Pipeline**.

```
Active Message Array (messages[]) - Turning Count Approaching Limit
  ├── [Turn 1]: User Initial Architecture Request
  ├── [Turn 2]: Agent Thought + Read File (src/index.ts - 340 lines)
  ├── [Turn 3]: Observation (Full AST dump of index.ts)
  ├── [Turn 4]: Agent Thought + Edit File Patch
  ├── [Turn 5]: Observation (Edit Success confirmed)
  └── ... [Turn 11]: Active Turn Triggering Compaction Threshold
                           │
                           ▼
+-----------------------------------------------------------------+
|               ACTIVE CONTEXT THRESHOLD DETECTED                 |
|   Condition: Turn Count > 10 OR Total Tokens > 70% Max Window   |
+-----------------------------------------------------------------+
                           │
                           ▼
+-----------------------------------------------------------------+
|             SPAWN ASYNCHRONOUS COMPACTION WORKER                |
|   Route historical turns [1 ... 8] to lightweight model:        |
|   Gemini 2.5 Flash Lite (Economy) or Claude 3.5 Haiku (Pro)    |
+-----------------------------------------------------------------+
                           │
                           ▼
+-----------------------------------------------------------------+
|            SYNTHESIZE CONCISE TECHNICAL STATE REPORT            |
|   Extracts: • Completed Architectural Goals                     |
|             • File Modifications Applied (Paths & Signatures)   |
|             • Pending Tasks & Unresolved Error States           |
+-----------------------------------------------------------------+
                           │
                           ▼
+-----------------------------------------------------------------+
|              IN-PLACE MESSAGE ARRAY REPLACEMENT                 |
|   Replace raw historical turns [1...8] with unified summary stub: |
|   System Context: <compacted_history> [Technical State Report]   |
+-----------------------------------------------------------------+
                           │
                           ▼
             Token Consumption Reduced by up to 80%
```

### 4.1 Active Context Threshold Trigger Conditions

The compaction engine monitors real-time context array metrics prior to executing any PAL request. Compaction is triggered automatically when either of two thresholds is breached:
1. **Turn Count Threshold:** Total conversational exchange turns exceed $T = 10$.
2. **Context Saturation Threshold:** Total estimated token count exceeds $70\%$ of the active model's maximum window capacity ($C_{current} > 0.70 \times C_{max}$).

### 4.2 Summarization Engine Architecture

When triggered, the orchestrator freezes the primary reasoning loop briefly and dispatches the historical slice ($M_{history} = messages[0 \dots N-3]$) to a high-speed, ultra-low-cost summarization endpoint (**Gemini 2.5 Flash Lite** in Economy Plan; **Claude 3.5 Haiku** in Pro Plan).

#### Technical State Report Structure:
The summarization endpoint is instructed via structured schemas to compress the conversational history into a dense **Technical State Report** capturing three critical dimensions:
1. **Resolved Objectives:** Bulleted summary of engineering goals successfully verified and completed.
2. **File System Delta State:** A strict manifest of all workspace files modified during the session, noting exact function names altered and diff status.
3. **Active Diagnostic Environment:** Current compilation state, pending errors, and the exact immediate goal scheduled for the next ReAct cycle.

### 4.3 In-Place Array Replacement & Token Savings

Once the summary is generated, the orchestrator rewrites the active `messages[]` array in memory:

```typescript
// Conceptual array mutation during compaction
const compactedMessages: NormalizedMessage[] = [
  messages[0], // Preserve immutable top-level System Prompt
  {
    role: 'system',
    content: `[SYSTEM CONTEXT COMPACTION - HISTORICAL STATE REPORT]\n${synthesizedStateReport}`
  },
  ...messages.slice(-3) // Preserve recent immediate conversational context
];
```

* **Efficiency Gain:** By stripping raw file read dumps, verbose diff patches, and resolved error traces from early conversation turns, the compaction pipeline achieves an average context compression ratio of **5:1**, reducing per-turn token expenditure by up to **80%** while preserving complete semantic continuity for ongoing coding workflows.
