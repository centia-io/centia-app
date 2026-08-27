# Centia Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An embedded AI agent for centia-app (reusable in vidi): always-available chat panel that can inspect AND provision/style a Centia database via the MCP server, with every write gated by an in-chat confirmation, running on AWS Bedrock (switchable to Anthropic direct or a local OpenAI-compatible model).

**Architecture:** New repo `~/Source/centia-agent` — pnpm workspace with `@centia-io/agent-protocol` (shared types), `@centia-io/agent-server` (Hono service: agentic loop, LLM adapters, per-token MCP process pool, guardrails), `@centia-io/agent-ui` (framework-light React chat component, no antd). Stateless NDJSON protocol; two-phase write confirmation (server emits `confirm_request` + opaque snapshot, client re-POSTs with decisions). centia-app adds an AI button + antd Drawer hosting the component.

**Tech Stack:** TypeScript (strict, ESM, `.js` import extensions), Hono + @hono/node-server, @anthropic-ai/sdk + @anthropic-ai/bedrock-sdk (`AnthropicBedrockMantle`), openai (local models), @modelcontextprotocol/sdk (stdio client), React 18, react-markdown + remark-gfm, node:test via tsx.

**Spec:** `docs/superpowers/specs/2026-08-27-centia-agent-design.md` (in centia-app repo)

## Global Constraints

- New repo path: `~/Source/centia-agent`. centia-app changes happen in `~/Source/centia-app` on a feature branch.
- ESM throughout (`"type": "module"`); relative imports use `.js` extensions even in `.ts` files (gc2-chat convention).
- Strict TS; read env as `process.env["NAME"]` (indexed access), never dot access.
- The Anthropic `Tool` shape (`Anthropic.Tool`) is the canonical tool format everywhere; adapters convert.
- `@centia-io/agent-ui` must NOT depend on antd — own scoped CSS with `ca-` class prefix and CSS variables for theming.
- No credentials in code or committed `.env`. User tokens arrive per-request only; never in env.
- Default model on Bedrock: `anthropic.claude-opus-5`. Danish default UI copy; code/comments/commits in English.
- Tests: `node:test` + `assert/strict` via tsx, dependency-injected fakes — no live LLM/MCP in tests.
- NEVER run `pnpm link` from inside a dependency repo, and never as part of a compound `cd X && pnpm link` command (past incident: self-link corrupted the SDK repo). Run link commands from the consumer repo as a standalone command.
- gc2-chat (`~/Source/gc2-chat`) is reference source only — never modify it.

---

### Task 1: Scaffold the centia-agent workspace + protocol package

**Files:**
- Create: `~/Source/centia-agent/package.json`
- Create: `~/Source/centia-agent/pnpm-workspace.yaml`
- Create: `~/Source/centia-agent/.gitignore`
- Create: `~/Source/centia-agent/tsconfig.base.json`
- Create: `~/Source/centia-agent/packages/protocol/package.json`
- Create: `~/Source/centia-agent/packages/protocol/tsconfig.json`
- Create: `~/Source/centia-agent/packages/protocol/src/index.ts`

**Interfaces:**
- Produces: the `@centia-io/agent-protocol` package with the exact types below. Every later task imports from it. The `AgentEvent`, `ChatRequest`, `PendingToolRequest`, `ToolDecision`, `ResumePayload`, `AppContext`, `TextMessage` names are load-bearing — do not rename.

- [ ] **Step 1: Create repo and workspace files**

```bash
mkdir -p ~/Source/centia-agent/packages/{protocol,server,ui}
cd ~/Source/centia-agent && git init
```

`~/Source/centia-agent/package.json`:

```json
{
  "name": "centia-agent",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test"
  }
}
```

`~/Source/centia-agent/pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
```

`~/Source/centia-agent/.gitignore`:

```
node_modules/
dist/
.env
*.tsbuildinfo
```

`~/Source/centia-agent/tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 2: Create the protocol package**

`packages/protocol/package.json`:

```json
{
  "name": "@centia-io/agent-protocol",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc -b --noEmit",
    "test": "echo 'no tests'"
  }
}
```

`packages/protocol/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

`packages/protocol/src/index.ts`:

```typescript
/** Wire protocol between @centia-io/agent-ui and @centia-io/agent-server. */

export type Role = "user" | "assistant";

/** Plain text history entry — the only message shape the client persists. */
export type TextMessage = { role: Role; content: string };

/** Host-app context injected into the system prompt. */
export type AppContext = {
  /** Host application id, e.g. "centia-app". */
  app: string;
  /** Optional free-text description of where the user is. */
  description?: string;
  /** Structured context: page, schema, activeLayers, ... */
  data?: Record<string, unknown>;
};

/** A tool call the model requested but the server has not executed yet. */
export type PendingToolRequest = {
  id: string;
  name: string;
  input: unknown;
  /** true = WRITE tool: needs an explicit user decision before execution. */
  requiresApproval: boolean;
};

export type ToolDecision = { toolUseId: string; approved: boolean };

/** Echo of a confirm_request plus the user's decisions. */
export type ResumePayload = {
  /** Opaque adapter state from the confirm_request event. Echo unchanged. */
  snapshot: unknown;
  pending: PendingToolRequest[];
  /** One decision per requiresApproval request. */
  decisions: ToolDecision[];
};

export type ChatRequest = {
  messages: TextMessage[];
  context?: AppContext;
  resume?: ResumePayload;
};

/** NDJSON events streamed from POST /api/chat. */
export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError: boolean }
  | { type: "confirm_request"; pending: PendingToolRequest[]; snapshot: unknown }
  | { type: "done"; stopReason: string | null; iterations: number; truncated: boolean }
  | { type: "error"; error: string };
```

- [ ] **Step 3: Install and verify**

```bash
cd ~/Source/centia-agent && pnpm install && pnpm -r build
```

Expected: protocol package compiles, `packages/protocol/dist/index.js` + `.d.ts` exist.

- [ ] **Step 4: Commit**

```bash
cd ~/Source/centia-agent && git add -A && git commit -m "chore: scaffold workspace + @centia-io/agent-protocol"
```

---

### Task 2: Guardrails module (server)

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/guardrails.ts`
- Test: `packages/server/test/guardrails.test.ts`

**Interfaces:**
- Produces: `classifyTool(name: string): "read" | "write" | "deny"`, `isReadOnlySql(q: unknown): boolean`, `filterExposedTools<T extends {name: string}>(tools: T[]): T[]` (removes DENY, sorts by name for prompt-cache stability).

- [ ] **Step 1: Create the server package skeleton**

`packages/server/package.json`:

```json
{
  "name": "@centia-io/agent-server",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "typecheck": "tsc -b --noEmit",
    "build": "tsc -b --noEmit",
    "test": "tsx --test test/*.test.ts"
  },
  "dependencies": {
    "@centia-io/agent-protocol": "workspace:*"
  }
}
```

`packages/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true },
  "include": ["src", "test"]
}
```

Then from the workspace root:

```bash
cd ~/Source/centia-agent
pnpm --filter @centia-io/agent-server add @anthropic-ai/sdk @anthropic-ai/bedrock-sdk openai @modelcontextprotocol/sdk hono @hono/node-server
pnpm --filter @centia-io/agent-server add -D tsx @types/node typescript
```

- [ ] **Step 2: Write the failing tests**

`packages/server/test/guardrails.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTool, isReadOnlySql, filterExposedTools } from "../src/guardrails.js";

test("get* tools are read", () => {
  assert.equal(classifyTool("getSchema"), "read");
  assert.equal(classifyTool("getLayer"), "read");
  assert.equal(classifyTool("getKeyvalue"), "read");
});

test("postSql is read (regex-guarded elsewhere)", () => {
  assert.equal(classifyTool("postSql"), "read");
});

test("write tools require approval", () => {
  assert.equal(classifyTool("postSchema"), "write");
  assert.equal(classifyTool("patchLayer"), "write");
  assert.equal(classifyTool("deleteTable"), "write");
  assert.equal(classifyTool("postLayerClass"), "write");
  assert.equal(classifyTool("patchKeyvalue"), "write");
});

test("auth-sensitive tools are denied", () => {
  for (const name of [
    "postOauth", "postDevice", "postClient", "patchClient", "deleteClient",
    "postUser", "patchUser", "deleteUsers", "postSqlNoToken",
  ]) {
    assert.equal(classifyTool(name), "deny", name);
  }
});

test("unknown names are denied", () => {
  assert.equal(classifyTool("dropEverything"), "deny");
});

test("read-only SQL guard", () => {
  assert.equal(isReadOnlySql("SELECT 1"), true);
  assert.equal(isReadOnlySql("  with x as (select 1) select * from x"), true);
  assert.equal(isReadOnlySql("-- comment\nEXPLAIN SELECT 1"), true);
  assert.equal(isReadOnlySql("DELETE FROM t"), false);
  assert.equal(isReadOnlySql("INSERT INTO t VALUES (1)"), false);
  assert.equal(isReadOnlySql(42), false);
});

test("filterExposedTools removes deny and sorts by name", () => {
  const tools = [
    { name: "postSchema" }, { name: "deleteUsers" }, { name: "getTable" },
  ];
  assert.deepEqual(
    filterExposedTools(tools).map((t) => t.name),
    ["getTable", "postSchema"],
  );
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd ~/Source/centia-agent/packages/server && pnpm test
```

Expected: FAIL — cannot find module `../src/guardrails.js`.

- [ ] **Step 4: Implement `src/guardrails.ts`**

```typescript
/**
 * Tool classification for the agent's guardrails.
 *
 * read  — auto-executed (inspection + read-only SQL).
 * write — provisioning/mutation: requires an explicit per-call user
 *         confirmation in the chat UI before execution.
 * deny  — never exposed to the model. Auth/account management stays in
 *         the regular UI; postSqlNoToken bypasses the user's token.
 *
 * Unknown names default to deny so new MCP tools fail closed until
 * classified here.
 */

const DENY = new Set([
  "postOauth",
  "postDevice",
  "postClient",
  "patchClient",
  "deleteClient",
  "postUser",
  "patchUser",
  "deleteUsers",
  "postSqlNoToken",
]);

const READ_EXTRA = new Set(["postSql", "postCallDry", "postGraphQL"]);

export type ToolClass = "read" | "write" | "deny";

export const classifyTool = (name: string): ToolClass => {
  if (DENY.has(name)) return "deny";
  if (name.startsWith("get") || READ_EXTRA.has(name)) return "read";
  if (/^(post|patch|delete)[A-Z]/.test(name)) return "write";
  return "deny";
};

/** SELECT / WITH / EXPLAIN / SHOW after leading comments and whitespace. */
const SQL_READ_ONLY =
  /^(?:\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)*(select|with|explain|show)\b/i;

export const isReadOnlySql = (q: unknown): boolean =>
  typeof q === "string" && SQL_READ_ONLY.test(q);

/** Tools shown to the model: deny removed, sorted for prompt-cache stability. */
export const filterExposedTools = <T extends { name: string }>(tools: T[]): T[] =>
  tools
    .filter((t) => classifyTool(t.name) !== "deny")
    .sort((a, b) => a.name.localeCompare(b.name));
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd ~/Source/centia-agent/packages/server && pnpm test && pnpm typecheck
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
cd ~/Source/centia-agent && git add -A && git commit -m "feat(server): guardrail tool classification + read-only SQL guard"
```

---

### Task 3: LLM adapters + provider factory (server)

**Files:**
- Create: `packages/server/src/llm.ts` (port of `~/Source/gc2-chat/src/server/llm.ts`)
- Create: `packages/server/src/provider.ts`
- Test: `packages/server/test/llm.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `llm.ts`: `LlmAdapter` interface with `createInitialTurn({systemBlocks, tools, messages})`, `createToolResultTurn({previousResponse, systemBlocks, tools, toolResults})`, `isProviderError(err)`, `readonly provider: string`, `readonly model: string`; types `IncomingMessage {role, content}`, `ToolExecutionResult {toolUseId, content, isError}`, `ToolRequest {id, name, input}`, `ModelTurn {textEvents, toolRequests, stopReason, rawResponse}`, `LlmEvent`; classes `AnthropicAdapter` (constructor `(model, opts?: {clientFactory?})`), `OpenAIAdapter` (constructor `(model, opts?: {baseURL?})`); helper `parseAnthropicContent`.
  - `provider.ts`: `createAdapterFromEnv(env: Record<string, string | undefined>): LlmAdapter` — provider from `LLM_PROVIDER` (`bedrock` default | `anthropic` | `openai`).

- [ ] **Step 1: Port llm.ts from gc2-chat**

Copy `~/Source/gc2-chat/src/server/llm.ts` to `packages/server/src/llm.ts`, then apply these changes:

1. **Delete the advisor entirely**: remove `advisorResultEvent`, `ADVISOR_BETA`, `ADVISOR_MAX_USES`, `MAX_PAUSE_RESUMPTIONS`, `AdvisorConfig`, the `advisor` field/branch in `AnthropicAdapter` (keep only the non-beta `messages.create` path in `createTurn`), and the `advisor_tool_result` branch in `parseAnthropicContent` (keep `text`, `tool_use`, `server_tool_use` branches).
2. **Shrink `AnthropicClientLike`** to only the non-beta surface:

```typescript
/** Minimal slice of the Anthropic client the adapter uses — injectable for
 * tests, and satisfied by both `Anthropic` and `AnthropicBedrockMantle`. */
export type AnthropicClientLike = {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
};
```

3. **`AnthropicAdapter`** constructor becomes `constructor(model: string, opts?: { clientFactory?: () => AnthropicClientLike; provider?: string })`; store `readonly provider = opts?.provider ?? "anthropic"` (typed `string`, so `"bedrock"` fits). Change `LlmProvider` to `export type LlmProvider = string;` and change `LlmAdapter.provider` to `readonly provider: string`.
4. **`createTurn`** keeps `max_tokens: 16_384`, `thinking: { type: "adaptive" as const }`, `output_config: { effort: "medium" as const }`, ephemeral `cache_control` on system blocks — unchanged from gc2-chat.
5. **`OpenAIAdapter`** constructor becomes `constructor(model: string, opts?: { baseURL?: string })`; `getClient()` becomes `new OpenAI(this.baseURL ? { baseURL: this.baseURL, apiKey: process.env["OPENAI_API_KEY"] ?? "local" } : {})` (local endpoints like Ollama need a dummy key). Keep the Responses-API implementation as-is otherwise.
6. Remove `parseProvider` (replaced by `provider.ts`).
7. **Simplify `logAnthropicUsage`**: signature becomes `(usage: Anthropic.Messages.Usage): void` and the advisor `iterations` logging block is deleted — keep only the single `[anthropic cache]` console line.

- [ ] **Step 2: Write `src/provider.ts`**

```typescript
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import Anthropic from "@anthropic-ai/sdk";
import {
  AnthropicAdapter,
  OpenAIAdapter,
  type AnthropicClientLike,
  type LlmAdapter,
} from "./llm.js";

const DEFAULT_BEDROCK_MODEL = "anthropic.claude-opus-5";
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";
const DEFAULT_OPENAI_MODEL = "gpt-5.1";

/**
 * Provider selection:
 *   bedrock (default) — AnthropicBedrockMantle, creds via the standard AWS
 *                        chain (env/profile/IAM role), AWS_REGION required.
 *   anthropic         — direct API (ANTHROPIC_API_KEY), for development.
 *   openai            — OpenAI-compatible endpoint; set OPENAI_BASE_URL to
 *                        point at Ollama / LM Studio / vLLM.
 */
export const createAdapterFromEnv = (
  env: Record<string, string | undefined>,
): LlmAdapter => {
  const provider = env["LLM_PROVIDER"]?.trim() || "bedrock";
  if (provider === "bedrock") {
    const region = env["AWS_REGION"];
    if (!region) throw new Error("LLM_PROVIDER=bedrock requires AWS_REGION");
    const model = env["BEDROCK_MODEL"]?.trim() || DEFAULT_BEDROCK_MODEL;
    return new AnthropicAdapter(model, {
      provider: "bedrock",
      clientFactory: () =>
        new AnthropicBedrockMantle({ awsRegion: region }) as unknown as AnthropicClientLike,
    });
  }
  if (provider === "anthropic") {
    const model = env["ANTHROPIC_MODEL"]?.trim() || DEFAULT_ANTHROPIC_MODEL;
    return new AnthropicAdapter(model, {
      clientFactory: () => new Anthropic() as AnthropicClientLike,
    });
  }
  if (provider === "openai") {
    const model = env["OPENAI_MODEL"]?.trim() || DEFAULT_OPENAI_MODEL;
    return new OpenAIAdapter(model, { baseURL: env["OPENAI_BASE_URL"]?.trim() || undefined });
  }
  throw new Error(`Invalid LLM_PROVIDER "${provider}". Expected bedrock | anthropic | openai.`);
};
```

- [ ] **Step 3: Write the tests**

`packages/server/test/llm.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { AnthropicAdapter, parseAnthropicContent } from "../src/llm.js";
import { createAdapterFromEnv } from "../src/provider.js";

test("parseAnthropicContent maps text and tool_use", () => {
  const content = [
    { type: "text", text: "hello" },
    { type: "tool_use", id: "t1", name: "getSchema", input: { namesOnly: true } },
  ] as unknown as readonly Anthropic.Beta.BetaContentBlock[];
  const parsed = parseAnthropicContent(content);
  assert.equal(parsed.textEvents.length, 2);
  assert.deepEqual(parsed.toolRequests, [
    { id: "t1", name: "getSchema", input: { namesOnly: true } },
  ]);
});

test("factory defaults to bedrock and requires AWS_REGION", () => {
  assert.throws(() => createAdapterFromEnv({}), /AWS_REGION/);
  const adapter = createAdapterFromEnv({ AWS_REGION: "eu-central-1" });
  assert.equal(adapter.provider, "bedrock");
  assert.equal(adapter.model, "anthropic.claude-opus-5");
});

test("factory selects anthropic and openai", () => {
  assert.equal(createAdapterFromEnv({ LLM_PROVIDER: "anthropic" }).provider, "anthropic");
  const local = createAdapterFromEnv({
    LLM_PROVIDER: "openai",
    OPENAI_MODEL: "llama3",
    OPENAI_BASE_URL: "http://localhost:11434/v1",
  });
  assert.equal(local.provider, "openai");
  assert.equal(local.model, "llama3");
  assert.throws(() => createAdapterFromEnv({ LLM_PROVIDER: "nope" }), /Invalid LLM_PROVIDER/);
});

test("AnthropicAdapter turn round-trip with injected fake client", async () => {
  const fake = {
    messages: {
      async create(params: Anthropic.MessageCreateParamsNonStreaming) {
        return {
          content: [
            { type: "text", text: `saw ${params.messages.length} messages` },
            { type: "tool_use", id: "t1", name: "getTable", input: { schema: "s" } },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 1, output_tokens: 1 },
        } as unknown as Anthropic.Message;
      },
    },
  };
  const adapter = new AnthropicAdapter("m", { clientFactory: () => fake });
  const turn = await adapter.createInitialTurn({
    systemBlocks: ["sys"],
    tools: [],
    messages: [{ role: "user", content: "hi" }],
  });
  assert.equal(turn.stopReason, "tool_use");
  assert.equal(turn.toolRequests.length, 1);
  // rawResponse is the running MessageParam[] incl. the assistant turn
  const history = turn.rawResponse as Anthropic.MessageParam[];
  assert.equal(history.length, 2);
  assert.equal(history[1]?.role, "assistant");
});
```

- [ ] **Step 4: Run tests**

```bash
cd ~/Source/centia-agent/packages/server && pnpm test && pnpm typecheck
```

Expected: all PASS (guardrails tests keep passing too).

- [ ] **Step 5: Commit**

```bash
cd ~/Source/centia-agent && git add -A && git commit -m "feat(server): LLM adapters (Bedrock Mantle / Anthropic / OpenAI-compatible)"
```

---

### Task 4: MCP session pool (server)

**Files:**
- Create: `packages/server/src/mcpPool.ts`
- Test: `packages/server/test/mcpPool.test.ts`

**Interfaces:**
- Consumes: `filterExposedTools` from Task 2.
- Produces:

```typescript
export type McpSession = {
  tools: Anthropic.Tool[];                       // deny-filtered, name-sorted
  callTool(name: string, input: unknown): Promise<{ content: string; isError: boolean }>;
  close(): Promise<void>;
};
export type SessionFactory = (token: string) => Promise<McpSession>;
export class McpPool {
  constructor(opts?: { factory?: SessionFactory; ttlMs?: number; maxSessions?: number; now?: () => number });
  acquire(token: string): Promise<McpSession>;   // spawn or reuse, updates lastUsed
  reap(): Promise<void>;                          // close sessions idle > ttlMs
  size(): number;
}
export const stdioSessionFactory: SessionFactory; // spawns the real mcp-server
```

- [ ] **Step 1: Write the failing tests**

`packages/server/test/mcpPool.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { McpPool, type McpSession } from "../src/mcpPool.js";

const makeFake = (log: string[]) => {
  let n = 0;
  return async (token: string): Promise<McpSession> => {
    const id = `${token}#${n++}`;
    log.push(`open ${id}`);
    return {
      tools: [],
      callTool: async () => ({ content: "{}", isError: false }),
      close: async () => { log.push(`close ${id}`); },
    };
  };
};

test("same token reuses the session; different token spawns", async () => {
  const log: string[] = [];
  const pool = new McpPool({ factory: makeFake(log) });
  const a1 = await pool.acquire("tokA");
  const a2 = await pool.acquire("tokA");
  await pool.acquire("tokB");
  assert.equal(a1, a2);
  assert.equal(pool.size(), 2);
  assert.deepEqual(log, ["open tokA#0", "open tokB#1"]);
});

test("reap closes idle sessions only", async () => {
  const log: string[] = [];
  let clock = 0;
  const pool = new McpPool({ factory: makeFake(log), ttlMs: 100, now: () => clock });
  await pool.acquire("tokA");
  clock = 50;
  await pool.acquire("tokB");
  clock = 130; // tokA idle 130 > 100; tokB idle 80
  await pool.reap();
  assert.equal(pool.size(), 1);
  assert.ok(log.includes("close tokA#0"));
});

test("evicts least-recently-used at maxSessions", async () => {
  const log: string[] = [];
  let clock = 0;
  const pool = new McpPool({ factory: makeFake(log), maxSessions: 2, now: () => clock++ });
  await pool.acquire("tokA");
  await pool.acquire("tokB");
  await pool.acquire("tokC");
  assert.equal(pool.size(), 2);
  assert.ok(log.includes("close tokA#0"));
});

test("failed spawn is not cached", async () => {
  let calls = 0;
  const pool = new McpPool({
    factory: async () => {
      calls++;
      if (calls === 1) throw new Error("boom");
      return { tools: [], callTool: async () => ({ content: "", isError: false }), close: async () => {} };
    },
  });
  await assert.rejects(pool.acquire("tokA"), /boom/);
  await pool.acquire("tokA"); // retries instead of returning the rejected promise
  assert.equal(calls, 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/Source/centia-agent/packages/server && pnpm test
```

Expected: FAIL — cannot find module `../src/mcpPool.js`.

- [ ] **Step 3: Implement `src/mcpPool.ts`**

```typescript
import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type Anthropic from "@anthropic-ai/sdk";
import { filterExposedTools } from "./guardrails.js";

const MAX_RESULT_CHARS = 200_000;

export type McpSession = {
  tools: Anthropic.Tool[];
  callTool(name: string, input: unknown): Promise<{ content: string; isError: boolean }>;
  close(): Promise<void>;
};

export type SessionFactory = (token: string) => Promise<McpSession>;

const truncate = (s: string): string =>
  s.length <= MAX_RESULT_CHARS
    ? s
    : s.slice(0, MAX_RESULT_CHARS) +
      `\n…[truncated ${s.length - MAX_RESULT_CHARS} chars of ${s.length} total. ` +
      "Add LIMIT/OFFSET, narrow the query, or paginate to see more.]";

/**
 * Spawn the Centia MCP server as a stdio child with the user's token in its
 * env (API_TOKEN is how today's mcp-server receives auth). One process per
 * distinct token; the pool below bounds and reaps them.
 */
export const stdioSessionFactory: SessionFactory = async (token) => {
  const command = process.env["MCP_COMMAND"] ?? "node";
  const argsRaw = process.env["MCP_ARGS"];
  if (!argsRaw) throw new Error("Missing required env var: MCP_ARGS");
  const args = argsRaw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);

  const transport = new StdioClientTransport({
    command,
    args,
    env: {
      ...(process.env["PATH"] ? { PATH: process.env["PATH"] } : {}),
      API_TOKEN: token,
      API_BASE_URL: process.env["API_BASE_URL"] ?? "https://api.centia.io",
    },
    stderr: "inherit",
  });
  const client = new Client({ name: "centia-agent", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);

  const { tools } = await client.listTools();
  const exposed = filterExposedTools(tools).map(
    (t): Anthropic.Tool => ({
      name: t.name,
      description: t.description ?? `Centia MCP tool: ${t.name}`,
      input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
    }),
  );

  return {
    tools: exposed,
    callTool: async (name, input) => {
      const args2 =
        typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
      const result = await client.callTool({ name, arguments: args2 });
      const content = Array.isArray(result.content) ? result.content : [];
      const text = content
        .map((b) =>
          typeof b === "object" && b !== null && (b as { type?: unknown }).type === "text"
            ? String((b as { text?: unknown }).text ?? "")
            : JSON.stringify(b),
        )
        .join("\n");
      return { content: truncate(text), isError: result.isError === true };
    },
    close: async () => {
      await client.close();
    },
  };
};

type Entry = { session: McpSession; lastUsed: number };

export class McpPool {
  private readonly factory: SessionFactory;
  private readonly ttlMs: number;
  private readonly maxSessions: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, Promise<Entry>>();

  constructor(opts?: {
    factory?: SessionFactory;
    ttlMs?: number;
    maxSessions?: number;
    now?: () => number;
  }) {
    this.factory = opts?.factory ?? stdioSessionFactory;
    this.ttlMs = opts?.ttlMs ?? 10 * 60_000;
    this.maxSessions = opts?.maxSessions ?? 20;
    this.now = opts?.now ?? Date.now;
  }

  size(): number {
    return this.entries.size;
  }

  async acquire(token: string): Promise<McpSession> {
    const key = createHash("sha256").update(token).digest("hex");
    const existing = this.entries.get(key);
    if (existing) {
      const entry = await existing;
      entry.lastUsed = this.now();
      return entry.session;
    }
    const created = this.factory(token).then((session) => ({
      session,
      lastUsed: this.now(),
    }));
    // Cache the promise so concurrent requests share one spawn; drop on failure.
    this.entries.set(key, created);
    let entry: Entry;
    try {
      entry = await created;
    } catch (err) {
      this.entries.delete(key);
      throw err;
    }
    await this.evictOverflow(key);
    return entry.session;
  }

  private async evictOverflow(keep: string): Promise<void> {
    while (this.entries.size > this.maxSessions) {
      let oldestKey: string | null = null;
      let oldest = Infinity;
      for (const [k, p] of this.entries) {
        if (k === keep) continue;
        const e = await p.catch(() => null);
        if (e && e.lastUsed < oldest) {
          oldest = e.lastUsed;
          oldestKey = k;
        }
      }
      if (!oldestKey) return;
      await this.closeEntry(oldestKey);
    }
  }

  async reap(): Promise<void> {
    const cutoff = this.now() - this.ttlMs;
    for (const [k, p] of [...this.entries]) {
      const e = await p.catch(() => null);
      if (!e) {
        this.entries.delete(k);
      } else if (e.lastUsed <= cutoff) {
        await this.closeEntry(k);
      }
    }
  }

  private async closeEntry(key: string): Promise<void> {
    const p = this.entries.get(key);
    this.entries.delete(key);
    const e = await p?.catch(() => null);
    await e?.session.close().catch(() => undefined);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd ~/Source/centia-agent/packages/server && pnpm test && pnpm typecheck
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/Source/centia-agent && git add -A && git commit -m "feat(server): per-token MCP session pool with TTL reaping and LRU cap"
```

---

### Task 5: Agent loop with confirmation gate (server)

**Files:**
- Create: `packages/server/src/chat.ts`
- Test: `packages/server/test/chat.test.ts`

**Interfaces:**
- Consumes: `LlmAdapter`, `ToolExecutionResult`, `ToolRequest`, `IncomingMessage` from Task 3 `llm.js`; `classifyTool`, `isReadOnlySql` from Task 2; `McpSession` from Task 4; `AgentEvent`, `PendingToolRequest`, `ResumePayload` from `@centia-io/agent-protocol`.
- Produces:

```typescript
export const MAX_ITERATIONS = 20;
export type ExecuteFn = (req: ToolRequest) => Promise<ToolExecutionResult>;
export const mcpExecutor: (session: McpSession) => ExecuteFn;
export function runAgentStream(deps: {
  adapter: LlmAdapter;
  systemBlocks: string[];
  tools: Anthropic.Tool[];
  messages: IncomingMessage[];
  resume?: ResumePayload;
  execute: ExecuteFn;
  maxIterations?: number;
}): AsyncGenerator<AgentEvent>;
```

- [ ] **Step 1: Write the failing tests**

`packages/server/test/chat.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import type { AgentEvent } from "@centia-io/agent-protocol";
import { runAgentStream } from "../src/chat.js";
import type { LlmAdapter, ModelTurn, ToolRequest } from "../src/llm.js";

/** Adapter that replays scripted turns. */
const scripted = (turns: ModelTurn[]): LlmAdapter => {
  let i = 0;
  return {
    provider: "fake",
    model: "fake",
    createInitialTurn: async () => turns[i++]!,
    createToolResultTurn: async () => turns[i++]!,
    isProviderError: () => ({ matched: false }),
  };
};

const turn = (
  toolRequests: ToolRequest[],
  stopReason = toolRequests.length ? "tool_use" : "end_turn",
): ModelTurn => ({
  textEvents: toolRequests.map((r) => ({ type: "tool_use" as const, ...r })),
  toolRequests,
  stopReason,
  rawResponse: { marker: "snapshot" },
});

const collect = async (gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> => {
  const out: AgentEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
};

const base = {
  systemBlocks: ["sys"],
  tools: [] as Anthropic.Tool[],
  messages: [{ role: "user" as const, content: "hi" }],
};

test("read tools execute automatically", async () => {
  const executed: string[] = [];
  const events = await collect(
    runAgentStream({
      ...base,
      adapter: scripted([turn([{ id: "r1", name: "getSchema", input: {} }]), turn([])]),
      execute: async (req) => {
        executed.push(req.name);
        return { toolUseId: req.id, content: "{}", isError: false };
      },
    }),
  );
  assert.deepEqual(executed, ["getSchema"]);
  assert.equal(events.filter((e) => e.type === "tool_result").length, 1);
  assert.equal(events.at(-1)?.type, "done");
});

test("a write tool pauses the loop with confirm_request", async () => {
  const executed: string[] = [];
  const events = await collect(
    runAgentStream({
      ...base,
      adapter: scripted([
        turn([
          { id: "w1", name: "postSchema", input: { name: "x" } },
          { id: "r1", name: "getTable", input: {} },
        ]),
      ]),
      execute: async (req) => {
        executed.push(req.name);
        return { toolUseId: req.id, content: "{}", isError: false };
      },
    }),
  );
  assert.deepEqual(executed, []); // nothing runs before confirmation
  const confirm = events.find((e) => e.type === "confirm_request");
  assert.ok(confirm && confirm.type === "confirm_request");
  assert.deepEqual(
    confirm.pending.map((p) => [p.name, p.requiresApproval]),
    [["postSchema", true], ["getTable", false]],
  );
  assert.deepEqual(confirm.snapshot, { marker: "snapshot" });
  const done = events.at(-1);
  assert.ok(done?.type === "done" && done.stopReason === "awaiting_confirmation");
});

test("resume executes approved writes and reads, denies the rest", async () => {
  const executed: string[] = [];
  const events = await collect(
    runAgentStream({
      ...base,
      adapter: scripted([turn([])]), // one final model turn after tool results
      resume: {
        snapshot: { marker: "snapshot" },
        pending: [
          { id: "w1", name: "postSchema", input: {}, requiresApproval: true },
          { id: "w2", name: "deleteTable", input: {}, requiresApproval: true },
          { id: "r1", name: "getTable", input: {}, requiresApproval: false },
        ],
        decisions: [
          { toolUseId: "w1", approved: true },
          { toolUseId: "w2", approved: false },
        ],
      },
      execute: async (req) => {
        executed.push(req.name);
        return { toolUseId: req.id, content: "{}", isError: false };
      },
    }),
  );
  assert.deepEqual(executed.sort(), ["getTable", "postSchema"]);
  const denied = events.find(
    (e) => e.type === "tool_result" && e.toolUseId === "w2",
  );
  assert.ok(denied && denied.type === "tool_result");
  assert.match(denied.content, /declined/);
  assert.equal(events.at(-1)?.type, "done");
});

test("resume re-classifies server-side: a deny tool never executes", async () => {
  const executed: string[] = [];
  const events = await collect(
    runAgentStream({
      ...base,
      adapter: scripted([turn([])]),
      resume: {
        snapshot: {},
        // client claims it needs no approval — server must not trust it
        pending: [{ id: "x1", name: "deleteUsers", input: {}, requiresApproval: false }],
        decisions: [],
      },
      execute: async (req) => {
        executed.push(req.name);
        return { toolUseId: req.id, content: "{}", isError: false };
      },
    }),
  );
  assert.deepEqual(executed, []);
  const result = events.find((e) => e.type === "tool_result");
  assert.ok(result && result.type === "tool_result" && result.isError);
});

test("stops at maxIterations with truncated done", async () => {
  const loop = turn([{ id: "r1", name: "getSchema", input: {} }]);
  const events = await collect(
    runAgentStream({
      ...base,
      adapter: scripted([loop, { ...loop }, { ...loop }]),
      maxIterations: 3,
      execute: async (req) => ({ toolUseId: req.id, content: "{}", isError: false }),
    }),
  );
  const done = events.at(-1);
  assert.ok(done?.type === "done" && done.truncated === true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/Source/centia-agent/packages/server && pnpm test
```

Expected: FAIL — cannot find module `../src/chat.js`.

- [ ] **Step 3: Implement `src/chat.ts`**

```typescript
import type Anthropic from "@anthropic-ai/sdk";
import type {
  AgentEvent,
  PendingToolRequest,
  ResumePayload,
} from "@centia-io/agent-protocol";
import { classifyTool, isReadOnlySql } from "./guardrails.js";
import type {
  IncomingMessage,
  LlmAdapter,
  ToolExecutionResult,
  ToolRequest,
} from "./llm.js";
import type { McpSession } from "./mcpPool.js";

export const MAX_ITERATIONS = 20;

export type ExecuteFn = (req: ToolRequest) => Promise<ToolExecutionResult>;

/** Tool executor bound to one user's MCP session, enforcing guardrails. */
export const mcpExecutor =
  (session: McpSession): ExecuteFn =>
  async (req) => {
    if (classifyTool(req.name) === "deny") {
      return {
        toolUseId: req.id,
        content: JSON.stringify({ error: `Tool not available: ${req.name}` }),
        isError: true,
      };
    }
    if (req.name === "postSql") {
      const q = (req.input as { q?: unknown } | undefined)?.q;
      if (!isReadOnlySql(q)) {
        return {
          toolUseId: req.id,
          content: JSON.stringify({
            error:
              "postSql accepts only SELECT, WITH, EXPLAIN, or SHOW. Use the typed provisioning tools for writes.",
          }),
          isError: true,
        };
      }
    }
    try {
      const { content, isError } = await session.callTool(req.name, req.input);
      return { toolUseId: req.id, content, isError };
    } catch (err) {
      return {
        toolUseId: req.id,
        content: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
        isError: true,
      };
    }
  };

const DENIED_RESULT = JSON.stringify({
  denied: true,
  message:
    "The user declined this operation. Do not retry it. Summarize the situation and ask the user how to proceed if needed.",
});

const toPending = (requests: ToolRequest[]): PendingToolRequest[] =>
  requests.map((r) => ({ ...r, requiresApproval: classifyTool(r.name) === "write" }));

/**
 * The agentic loop. Reads auto-execute; a turn containing any write tool
 * executes NOTHING — it emits confirm_request (all pending requests + the
 * adapter's opaque snapshot) and ends with stopReason "awaiting_confirmation".
 * The client re-POSTs with `resume` and the loop picks up from the snapshot.
 * All guardrail decisions are re-derived server-side on resume — the client's
 * requiresApproval flags are advisory only.
 */
export async function* runAgentStream(deps: {
  adapter: LlmAdapter;
  systemBlocks: string[];
  tools: Anthropic.Tool[];
  messages: IncomingMessage[];
  resume?: ResumePayload;
  execute: ExecuteFn;
  maxIterations?: number;
}): AsyncGenerator<AgentEvent> {
  const maxIterations = deps.maxIterations ?? MAX_ITERATIONS;
  let iteration = 0;
  let lastStopReason: string | null = null;
  let previousResponse: unknown = null;
  let pendingToolResults: ToolExecutionResult[] = [];

  const runRequests = async function* (
    requests: PendingToolRequest[],
    approvals: Map<string, boolean>,
  ): AsyncGenerator<AgentEvent> {
    pendingToolResults = [];
    for (const req of requests) {
      const cls = classifyTool(req.name);
      let result: ToolExecutionResult;
      if (cls === "deny") {
        result = {
          toolUseId: req.id,
          content: JSON.stringify({ error: `Tool not available: ${req.name}` }),
          isError: true,
        };
      } else if (cls === "write" && approvals.get(req.id) !== true) {
        result = { toolUseId: req.id, content: DENIED_RESULT, isError: false };
      } else {
        result = await deps.execute(req);
      }
      yield { type: "tool_result", toolUseId: result.toolUseId, content: result.content, isError: result.isError };
      pendingToolResults.push(result);
    }
  };

  if (deps.resume) {
    const approvals = new Map(
      deps.resume.decisions.map((d) => [d.toolUseId, d.approved] as const),
    );
    yield* runRequests(toPending(deps.resume.pending.map(({ id, name, input }) => ({ id, name, input }))), approvals);
    previousResponse = deps.resume.snapshot;
  }

  while (iteration < maxIterations) {
    iteration++;
    const turn =
      previousResponse === null
        ? await deps.adapter.createInitialTurn({
            systemBlocks: deps.systemBlocks,
            tools: deps.tools,
            messages: deps.messages,
          })
        : await deps.adapter.createToolResultTurn({
            previousResponse,
            systemBlocks: deps.systemBlocks,
            tools: deps.tools,
            toolResults: pendingToolResults,
          });

    previousResponse = turn.rawResponse;
    lastStopReason = turn.stopReason;

    for (const ev of turn.textEvents) yield ev as AgentEvent;

    if (turn.toolRequests.length === 0) break;

    const pending = toPending(turn.toolRequests);
    if (pending.some((p) => p.requiresApproval)) {
      yield { type: "confirm_request", pending, snapshot: turn.rawResponse };
      lastStopReason = "awaiting_confirmation";
      break;
    }

    yield* runRequests(pending, new Map());
  }

  yield {
    type: "done",
    stopReason: lastStopReason,
    iterations: iteration,
    truncated: iteration >= maxIterations && lastStopReason === "tool_use",
  };
}
```

Note: on resume, `iteration` starts at 0 for the continuation request; the executed resume-tools happen before the first model turn of this request.

- [ ] **Step 4: Run tests**

```bash
cd ~/Source/centia-agent/packages/server && pnpm test && pnpm typecheck
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/Source/centia-agent && git add -A && git commit -m "feat(server): agent loop with two-phase write confirmation"
```

---

### Task 6: System prompt, auth preflight, HTTP entry (server)

**Files:**
- Create: `packages/server/src/prompt.ts`
- Create: `packages/server/src/auth.ts`
- Create: `packages/server/src/index.ts`
- Create: `packages/server/.env.example`
- Test: `packages/server/test/prompt.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–5; `ChatRequest`, `AppContext` from protocol.
- Produces: `renderContextBlock(ctx: AppContext): string`, `SYSTEM_PROMPT: string` (prompt.ts); `verifyToken(token: string): Promise<boolean>` (auth.ts); running Hono server with `GET /api/health` and `POST /api/chat` on `PORT` (default 8790).

- [ ] **Step 1: Write the failing test**

`packages/server/test/prompt.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderContextBlock, SYSTEM_PROMPT } from "../src/prompt.js";

test("context block renders app, description and data", () => {
  const block = renderContextBlock({
    app: "centia-app",
    description: "User is on the Map page",
    data: { schema: "jordforurening", activeLayers: ["a.b"] },
  });
  assert.match(block, /centia-app/);
  assert.match(block, /Map page/);
  assert.match(block, /jordforurening/);
});

test("system prompt covers provisioning + confirmation flow", () => {
  assert.match(SYSTEM_PROMPT, /confirmation/i);
  assert.match(SYSTEM_PROMPT, /postSql/);
  assert.match(SYSTEM_PROMPT, /never assume.*the_geom/is);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Source/centia-agent/packages/server && pnpm test
```

Expected: FAIL — cannot find module `../src/prompt.js`.

- [ ] **Step 3: Implement `src/prompt.ts`**

```typescript
import type { AppContext } from "@centia-io/agent-protocol";

export const SYSTEM_PROMPT = `You are an AI assistant embedded in a Centia (mapcentia.com) admin application. You help the user inspect, provision, and style a PostgreSQL/PostGIS-based Backend-as-a-Service database through Centia MCP tools.

Tool access and safety model:
- Read tools (get*, postSql) run automatically. postSql accepts only SELECT/WITH/EXPLAIN/SHOW — all writes must use the typed tools.
- Write tools (post*/patch*/delete*: schemas, tables, columns, layers, styles, labels, classes, features, key/value, rules, privileges, …) are ALWAYS routed through an explicit user confirmation in the UI before they execute. Propose the call; the user approves or declines each one. If a call is declined, do not retry it — adjust or ask.
- User and OAuth-client management tools are not available in this chat; direct the user to the regular admin pages for those.
- Batch related writes thoughtfully: prefer one well-formed call over many partial ones, and read current state (e.g. getLayer) before patching so you do not clobber fields.

Workflow rules:
- Prefer the smallest, most specific tool. Call getSchema with namesOnly: true before fetching full schemas, getTable with namesOnly: true before describing each table.
- Always fully qualify table names as schema.table in SQL.
- Use parameterized queries with NAMED placeholders (\`:name\`, PDO-style) and a single-object params array, e.g. { q: "SELECT * FROM t WHERE id = :id", params: [{ id: 42 }] }. Positional $1 placeholders are not supported. Cast ambiguous types: :id::int.
- Add an explicit LIMIT to any SELECT against an unknown-size table.
- Geometry column names vary per relation. NEVER assume the column is named "the_geom" or "geom" — look it up via getMetaData (each relation has a _geometry_column field) or getTable's columns list.
- Layer styling (classes/styles/labels): values are strings where '' means unset; colors are hex; preserve server-assigned ids and unknown keys when patching; sortid uses integer steps of 10.
- When a tool returns an error, read it carefully and either correct the call or ask the user — don't retry the same call.
- Be concise: summarize what you found or changed; show small results inline, larger ones as a count plus a sample.
- Match the user's language. If they write Danish, respond in Danish.`;

/** Render the host app's context object as a system block. */
export const renderContextBlock = (ctx: AppContext): string => {
  const lines = [
    "# Current application context",
    `The user is working in "${ctx.app}".`,
  ];
  if (ctx.description) lines.push(ctx.description);
  if (ctx.data && Object.keys(ctx.data).length > 0) {
    lines.push("```json", JSON.stringify(ctx.data, null, 2), "```");
  }
  lines.push(
    "Use this context to resolve references like \"this layer\" or \"this schema\" without asking.",
  );
  return lines.join("\n");
};
```

- [ ] **Step 4: Implement `src/auth.ts`**

```typescript
/**
 * Preflight: prove the caller's token is valid against GC2 before spending
 * LLM tokens. GC2 itself enforces per-tool rights afterwards.
 */
export const verifyToken = async (token: string): Promise<boolean> => {
  const base = process.env["API_BASE_URL"] ?? "https://api.centia.io";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${base}/api/v4/schemas?namesOnly=true`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};
```

- [ ] **Step 5: Implement `src/index.ts`**

```typescript
import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { stream } from "hono/streaming";
import type { ChatRequest } from "@centia-io/agent-protocol";
import { verifyToken } from "./auth.js";
import { mcpExecutor, runAgentStream } from "./chat.js";
import { McpPool } from "./mcpPool.js";
import { createAdapterFromEnv } from "./provider.js";
import { SYSTEM_PROMPT, renderContextBlock } from "./prompt.js";

const PORT = Number(process.env["PORT"] ?? 8790);
const adapter = createAdapterFromEnv(process.env);
const pool = new McpPool();
setInterval(() => void pool.reap(), 60_000).unref();

const app = new Hono();
app.use("/api/*", cors());

app.get("/api/health", (c) =>
  c.json({ ok: true, provider: adapter.provider, model: adapter.model, sessions: pool.size() }),
);

const bearer = (auth: string | undefined): string | null => {
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
};

app.post("/api/chat", async (c) => {
  const token = bearer(c.req.header("authorization"));
  if (!token) return c.json({ error: "Missing Authorization: Bearer token" }, 401);

  let body: ChatRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return c.json({ error: "Missing 'messages' array" }, 400);
  }

  if (!(await verifyToken(token))) {
    return c.json({ error: "Invalid or expired Centia token" }, 401);
  }

  let session;
  try {
    session = await pool.acquire(token);
  } catch (err) {
    return c.json(
      { error: `MCP unavailable: ${err instanceof Error ? err.message : String(err)}` },
      503,
    );
  }

  const systemBlocks = [SYSTEM_PROMPT];
  if (body.context) systemBlocks.push(renderContextBlock(body.context));

  c.header("Content-Type", "application/x-ndjson; charset=utf-8");
  c.header("Cache-Control", "no-cache, no-transform");
  c.header("X-Accel-Buffering", "no");

  return stream(c, async (s) => {
    const events = runAgentStream({
      adapter,
      systemBlocks,
      tools: session.tools,
      messages: body.messages,
      resume: body.resume,
      execute: mcpExecutor(session),
    });
    try {
      for await (const ev of events) {
        await s.write(`${JSON.stringify(ev)}\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await s.write(`${JSON.stringify({ type: "error", error: message })}\n`);
    }
  });
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`centia-agent server on http://localhost:${info.port}`);
  console.log(`provider=${adapter.provider} model=${adapter.model}`);
  console.log(`mcp: ${process.env["MCP_COMMAND"] ?? "node"} ${process.env["MCP_ARGS"] ?? "(MCP_ARGS not set!)"}`);
});
```

Also add the missing dependency:

```bash
cd ~/Source/centia-agent && pnpm --filter @centia-io/agent-server add dotenv
```

- [ ] **Step 6: Create `.env.example`**

```
# LLM provider: bedrock (default) | anthropic | openai
LLM_PROVIDER=bedrock

# bedrock — credentials via the standard AWS chain (env/profile/IAM role)
AWS_REGION=eu-central-1
# BEDROCK_MODEL=anthropic.claude-opus-5

# anthropic (development)
# ANTHROPIC_API_KEY=sk-ant-...
# ANTHROPIC_MODEL=claude-opus-5

# openai-compatible local model (Ollama / LM Studio / vLLM)
# OPENAI_BASE_URL=http://localhost:11434/v1
# OPENAI_MODEL=qwen3:32b

# Centia MCP server (stdio); the user's token is injected per session — never here
MCP_COMMAND=node
MCP_ARGS=/home/mh/Source/mcp-server/dist/index.js
API_BASE_URL=http://localhost:8080

PORT=8790
```

- [ ] **Step 7: Run tests + typecheck, then boot smoke test**

```bash
cd ~/Source/centia-agent/packages/server && pnpm test && pnpm typecheck
```

Expected: all PASS. Then copy `.env.example` to `.env`, set `LLM_PROVIDER=anthropic` if no AWS credentials are configured locally, and:

```bash
cd ~/Source/centia-agent/packages/server && pnpm dev &
sleep 2 && curl -s http://localhost:8790/api/health
```

Expected: `{"ok":true,"provider":...,"model":...,"sessions":0}`. Also verify auth rejection:

```bash
curl -s -X POST http://localhost:8790/api/chat -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"hi"}]}'
```

Expected: 401 `{"error":"Missing Authorization: Bearer token"}`. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
cd ~/Source/centia-agent && git add -A && git commit -m "feat(server): HTTP entry with auth preflight, context blocks, NDJSON streaming"
```

---

### Task 7: UI package — stream client (TDD)

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/stream.ts`
- Create: `packages/ui/src/index.ts`
- Test: `packages/ui/test/stream.test.ts`

**Interfaces:**
- Consumes: `AgentEvent`, `ChatRequest` from protocol.
- Produces:
  - `createNdjsonSplitter(onLine: (line: string) => void): { push(chunk: string): void; flush(): void }`
  - `streamChat(opts: { endpoint: string; token: string; body: ChatRequest; onEvent: (ev: AgentEvent) => void; signal?: AbortSignal }): Promise<void>` — throws `Error` with the server's message on non-OK preflight responses.
  - `packages/ui/src/index.ts` re-exports `AgentChat` (Task 8), `streamChat`, and all protocol types.

- [ ] **Step 1: Create the package**

`packages/ui/package.json`:

```json
{
  "name": "@centia-io/agent-ui",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./styles.css": "./dist/styles.css"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -b && cp src/styles.css dist/styles.css",
    "typecheck": "tsc -b --noEmit",
    "test": "tsx --test test/*.test.ts"
  },
  "dependencies": {
    "@centia-io/agent-protocol": "workspace:*",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1"
  },
  "peerDependencies": {
    "react": ">=18",
    "react-dom": ">=18"
  },
  "devDependencies": {}
}
```

`packages/ui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

```bash
cd ~/Source/centia-agent && pnpm --filter @centia-io/agent-ui add -D react react-dom @types/react @types/react-dom tsx typescript && pnpm install
```

- [ ] **Step 2: Write the failing tests**

`packages/ui/test/stream.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { createNdjsonSplitter } from "../src/stream.js";

test("splits complete lines across chunk boundaries", () => {
  const lines: string[] = [];
  const s = createNdjsonSplitter((l) => lines.push(l));
  s.push('{"a":1}\n{"b"');
  s.push(':2}\n');
  s.push('{"c":3}');
  s.flush();
  assert.deepEqual(lines, ['{"a":1}', '{"b":2}', '{"c":3}']);
});

test("ignores empty lines", () => {
  const lines: string[] = [];
  const s = createNdjsonSplitter((l) => lines.push(l));
  s.push("\n\n{\"a\":1}\n\n");
  s.flush();
  assert.deepEqual(lines, ['{"a":1}']);
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd ~/Source/centia-agent/packages/ui && pnpm test
```

Expected: FAIL — cannot find module `../src/stream.js`.

- [ ] **Step 4: Implement `src/stream.ts`**

```typescript
import type { AgentEvent, ChatRequest } from "@centia-io/agent-protocol";

export const createNdjsonSplitter = (
  onLine: (line: string) => void,
): { push(chunk: string): void; flush(): void } => {
  let buffer = "";
  const emit = (line: string): void => {
    const trimmed = line.trim();
    if (trimmed) onLine(trimmed);
  };
  return {
    push(chunk) {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        emit(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    },
    flush() {
      emit(buffer);
      buffer = "";
    },
  };
};

/**
 * POST the chat request and feed each NDJSON event to onEvent.
 * Pre-flight failures (4xx/5xx before the stream opens) throw an Error with
 * the server's message; once streaming, errors arrive as `error` events.
 */
export const streamChat = async (opts: {
  endpoint: string;
  token: string;
  body: ChatRequest;
  onEvent: (ev: AgentEvent) => void;
  signal?: AbortSignal;
}): Promise<void> => {
  const res = await fetch(opts.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    body: JSON.stringify(opts.body),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* non-JSON body */
    }
    throw new Error(message);
  }
  const splitter = createNdjsonSplitter((line) => {
    try {
      opts.onEvent(JSON.parse(line) as AgentEvent);
    } catch {
      /* ignore malformed line */
    }
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    splitter.push(decoder.decode(value, { stream: true }));
  }
  splitter.flush();
};
```

`src/index.ts` (AgentChat added in Task 8 — for now):

```typescript
export * from "@centia-io/agent-protocol";
export { streamChat, createNdjsonSplitter } from "./stream.js";
```

- [ ] **Step 5: Run tests**

```bash
cd ~/Source/centia-agent/packages/ui && pnpm test && pnpm build
```

Expected: PASS; build fails on the missing `styles.css` copy — create an empty `packages/ui/src/styles.css` placeholder (filled in Task 8) and re-run. Expected: build OK.

- [ ] **Step 6: Commit**

```bash
cd ~/Source/centia-agent && git add -A && git commit -m "feat(ui): NDJSON stream client"
```

---

### Task 8: UI package — AgentChat component

**Files:**
- Create: `packages/ui/src/types.ts`
- Create: `packages/ui/src/AgentChat.tsx`
- Create: `packages/ui/src/MessageView.tsx`
- Create: `packages/ui/src/ToolCallView.tsx`
- Create: `packages/ui/src/ConfirmCard.tsx`
- Modify: `packages/ui/src/styles.css` (replace placeholder)
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `streamChat` from Task 7; protocol types.
- Produces:

```typescript
export type UiToolCall = { id: string; name: string; input: unknown; result?: string; isError?: boolean };
export type UiConfirm = { pending: PendingToolRequest[]; snapshot: unknown; decisions: Record<string, boolean>; resolved: boolean };
export type UiMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; toolCalls: UiToolCall[]; confirm?: UiConfirm };
export function AgentChat(props: {
  endpoint: string;
  getToken: () => string | Promise<string>;
  getContext?: () => AppContext | undefined;
  onToolExecuted?: (toolName: string) => void;
  locale?: "da" | "en";
  initialMessages?: UiMessage[];
  onMessagesChange?: (messages: UiMessage[]) => void;
}): JSX.Element;
```

- [ ] **Step 1: Write `src/types.ts`**

```typescript
import type { PendingToolRequest } from "@centia-io/agent-protocol";

export type UiToolCall = {
  id: string;
  name: string;
  input: unknown;
  result?: string;
  isError?: boolean;
};

export type UiConfirm = {
  pending: PendingToolRequest[];
  snapshot: unknown;
  /** toolUseId -> approved; only requiresApproval entries appear here. */
  decisions: Record<string, boolean>;
  /** true once the resume request has been sent. */
  resolved: boolean;
};

export type UiUserMessage = { id: string; role: "user"; text: string };
export type UiAssistantMessage = {
  id: string;
  role: "assistant";
  text: string;
  toolCalls: UiToolCall[];
  confirm?: UiConfirm;
};
export type UiMessage = UiUserMessage | UiAssistantMessage;

export type Labels = {
  placeholder: string;
  send: string;
  thinking: string;
  approve: string;
  deny: string;
  confirmTitle: string;
  autoNote: string;
  truncated: string;
  emptyTitle: string;
  emptyBody: string;
};

export const LABELS: Record<"da" | "en", Labels> = {
  da: {
    placeholder: "Skriv en besked… (Enter sender, Shift+Enter ny linje)",
    send: "Send",
    thinking: "Tænker…",
    approve: "Godkend",
    deny: "Afvis",
    confirmTitle: "Agenten vil udføre følgende ændringer",
    autoNote: "Læse-kald udføres automatisk ved godkendelse.",
    truncated: "(Stoppede efter maks. iterationer — spørg igen for at fortsætte.)",
    emptyTitle: "Hvad kan jeg hjælpe med?",
    emptyBody:
      "Spørg om data, eller bed mig sætte skemaer, tabeller og kort-styling op. Ændringer udføres først, når du har godkendt dem.",
  },
  en: {
    placeholder: "Type a message… (Enter to send, Shift+Enter for newline)",
    send: "Send",
    thinking: "Thinking…",
    approve: "Approve",
    deny: "Deny",
    confirmTitle: "The agent wants to perform these changes",
    autoNote: "Read calls run automatically on approval.",
    truncated: "(Stopped after max iterations — ask again to continue.)",
    emptyTitle: "What can I help with?",
    emptyBody:
      "Ask about your data, or have me set up schemas, tables, and map styling. Changes only run after you approve them.",
  },
};
```

- [ ] **Step 2: Write `src/ToolCallView.tsx`**

```tsx
import { useState } from "react";
import type { UiToolCall } from "./types.js";

const preview = (value: unknown, max = 400): string => {
  const s = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

export function ToolCallView({ call }: { call: UiToolCall }) {
  const [open, setOpen] = useState(false);
  const status = call.result === undefined ? "…" : call.isError ? "✗" : "✓";
  return (
    <div className={`ca-tool ${call.isError ? "ca-tool-error" : ""}`}>
      <button type="button" className="ca-tool-head" onClick={() => setOpen(!open)}>
        <span className="ca-tool-status">{status}</span>
        <code>{call.name}</code>
      </button>
      {open && (
        <div className="ca-tool-body">
          <pre>{preview(call.input)}</pre>
          {call.result !== undefined && <pre>{preview(call.result, 2000)}</pre>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write `src/ConfirmCard.tsx`**

Per-write Approve/Deny buttons; the card's parent sends the resume request once every `requiresApproval` entry has a decision.

```tsx
import type { UiConfirm } from "./types.js";
import type { Labels } from "./types.js";

export function ConfirmCard({
  confirm,
  labels,
  onDecide,
}: {
  confirm: UiConfirm;
  labels: Labels;
  onDecide: (toolUseId: string, approved: boolean) => void;
}) {
  const writes = confirm.pending.filter((p) => p.requiresApproval);
  const reads = confirm.pending.filter((p) => !p.requiresApproval);
  return (
    <div className="ca-confirm">
      <div className="ca-confirm-title">{labels.confirmTitle}</div>
      {writes.map((p) => {
        const decision = confirm.decisions[p.id];
        return (
          <div key={p.id} className="ca-confirm-item">
            <code className="ca-confirm-name">{p.name}</code>
            <pre className="ca-confirm-input">{JSON.stringify(p.input, null, 2)}</pre>
            {confirm.resolved || decision !== undefined ? (
              <span className={`ca-confirm-decided ${decision ? "ca-ok" : "ca-no"}`}>
                {decision ? labels.approve : labels.deny}
              </span>
            ) : (
              <div className="ca-confirm-actions">
                <button type="button" className="ca-btn ca-btn-approve" onClick={() => onDecide(p.id, true)}>
                  {labels.approve}
                </button>
                <button type="button" className="ca-btn ca-btn-deny" onClick={() => onDecide(p.id, false)}>
                  {labels.deny}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {reads.length > 0 && (
        <div className="ca-confirm-reads">
          {labels.autoNote} ({reads.map((r) => r.name).join(", ")})
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write `src/MessageView.tsx`**

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ToolCallView } from "./ToolCallView.js";
import { ConfirmCard } from "./ConfirmCard.js";
import type { Labels, UiMessage } from "./types.js";

export function MessageView({
  message,
  labels,
  onDecide,
}: {
  message: UiMessage;
  labels: Labels;
  onDecide: (toolUseId: string, approved: boolean) => void;
}) {
  if (message.role === "user") {
    return <div className="ca-msg ca-msg-user">{message.text}</div>;
  }
  return (
    <div className="ca-msg ca-msg-assistant">
      {message.toolCalls.map((c) => (
        <ToolCallView key={c.id} call={c} />
      ))}
      {message.text && (
        <div className="ca-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
        </div>
      )}
      {message.confirm && (
        <ConfirmCard confirm={message.confirm} labels={labels} onDecide={onDecide} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write `src/AgentChat.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import type { AgentEvent, AppContext, TextMessage } from "@centia-io/agent-protocol";
import { streamChat } from "./stream.js";
import { MessageView } from "./MessageView.js";
import { LABELS, type UiAssistantMessage, type UiMessage } from "./types.js";

const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export type AgentChatProps = {
  endpoint: string;
  getToken: () => string | Promise<string>;
  getContext?: () => AppContext | undefined;
  onToolExecuted?: (toolName: string) => void;
  locale?: "da" | "en";
  initialMessages?: UiMessage[];
  onMessagesChange?: (messages: UiMessage[]) => void;
};

/** History for the wire: user text + assistant text (tool details stay in UI state). */
const toWire = (messages: UiMessage[]): TextMessage[] =>
  messages
    .map((m): TextMessage => ({ role: m.role, content: m.text }))
    .filter((m) => m.content.trim().length > 0);

export function AgentChat(props: AgentChatProps) {
  const labels = LABELS[props.locale ?? "da"];
  const [messages, setMessages] = useState<UiMessage[]>(props.initialMessages ?? []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    props.onMessagesChange?.(messages);
  }, [messages]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [messages, busy]);

  /** Run one server request (fresh turn or resume) and stream into a draft. */
  const run = async (
    history: TextMessage[],
    resumePayload: import("@centia-io/agent-protocol").ResumePayload | undefined,
    assistantId: string,
  ) => {
    setBusy(true);
    setError(null);
    const toolNamesById = new Map<string, string>();
    try {
      const token = await props.getToken();
      await streamChat({
        endpoint: props.endpoint,
        token,
        body: { messages: history, context: props.getContext?.(), resume: resumePayload },
        onEvent: (ev: AgentEvent) => {
          setMessages((cur) =>
            cur.map((m) => {
              if (m.id !== assistantId || m.role !== "assistant") return m;
              const next: UiAssistantMessage = {
                ...m,
                toolCalls: m.toolCalls.map((c) => ({ ...c })),
              };
              if (ev.type === "text") {
                next.text = next.text ? `${next.text}\n\n${ev.text}` : ev.text;
              } else if (ev.type === "tool_use") {
                toolNamesById.set(ev.id, ev.name);
                if (!next.toolCalls.some((c) => c.id === ev.id)) {
                  next.toolCalls.push({ id: ev.id, name: ev.name, input: ev.input });
                }
              } else if (ev.type === "tool_result") {
                const call = next.toolCalls.find((c) => c.id === ev.toolUseId);
                if (call) {
                  call.result = ev.content;
                  call.isError = ev.isError;
                }
                const name = toolNamesById.get(ev.toolUseId) ?? call?.name;
                if (name && !ev.isError) props.onToolExecuted?.(name);
              } else if (ev.type === "confirm_request") {
                next.confirm = {
                  pending: ev.pending,
                  snapshot: ev.snapshot,
                  decisions: {},
                  resolved: false,
                };
                for (const p of ev.pending) toolNamesById.set(p.id, p.name);
                for (const p of ev.pending) {
                  if (!next.toolCalls.some((c) => c.id === p.id)) {
                    next.toolCalls.push({ id: p.id, name: p.name, input: p.input });
                  }
                }
              } else if (ev.type === "done") {
                if (ev.truncated) {
                  next.text = next.text ? `${next.text}\n\n_${labels.truncated}_` : `_${labels.truncated}_`;
                }
              } else if (ev.type === "error") {
                setError(ev.error);
              }
              return next;
            }),
          );
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const userMsg: UiMessage = { id: newId(), role: "user", text };
    const assistantId = newId();
    const history = [...messagesRef.current, userMsg];
    setMessages([
      ...history,
      { id: assistantId, role: "assistant", text: "", toolCalls: [] },
    ]);
    setInput("");
    await run(toWire(history), undefined, assistantId);
  };

  /** Record a decision; when all writes are decided, send the resume request. */
  const decide = (messageId: string, toolUseId: string, approved: boolean) => {
    const msg = messagesRef.current.find(
      (m): m is UiAssistantMessage => m.id === messageId && m.role === "assistant",
    );
    const confirm = msg?.confirm;
    if (!msg || !confirm || confirm.resolved) return;
    const decisions = { ...confirm.decisions, [toolUseId]: approved };
    const writes = confirm.pending.filter((p) => p.requiresApproval);
    const complete = writes.every((p) => decisions[p.id] !== undefined);
    setMessages((cur) =>
      cur.map((m) =>
        m.id === messageId && m.role === "assistant"
          ? { ...m, confirm: { ...confirm, decisions, resolved: complete } }
          : m,
      ),
    );
    if (!complete) return;
    void run(
      toWire(messagesRef.current.filter((m) => m.id !== messageId || m.role !== "assistant")),
      {
        snapshot: confirm.snapshot,
        pending: confirm.pending,
        decisions: writes.map((p) => ({ toolUseId: p.id, approved: decisions[p.id] === true })),
      },
      messageId,
    );
  };

  return (
    <div className="ca-root">
      <div className="ca-scroll" ref={scrollerRef}>
        {messages.length === 0 && (
          <div className="ca-empty">
            <div className="ca-empty-title">{labels.emptyTitle}</div>
            <div className="ca-empty-body">{labels.emptyBody}</div>
          </div>
        )}
        {messages.map((m) => (
          <MessageView
            key={m.id}
            message={m}
            labels={labels}
            onDecide={(toolUseId, approved) => decide(m.id, toolUseId, approved)}
          />
        ))}
        {busy && <div className="ca-thinking">{labels.thinking}</div>}
        {error && <div className="ca-error">{error}</div>}
      </div>
      <form
        className="ca-inputrow"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          className="ca-input"
          rows={2}
          value={input}
          disabled={busy}
          placeholder={labels.placeholder}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <button className="ca-btn ca-btn-send" type="submit" disabled={busy || !input.trim()}>
          {labels.send}
        </button>
      </form>
    </div>
  );
}
```

Note for the implementer: the wire history for a resume EXCLUDES the assistant draft being resumed — its content lives in the snapshot (see the filter in `decide`).

- [ ] **Step 6: Write `src/styles.css`** (replace the empty placeholder)

```css
/* @centia-io/agent-ui — scoped, theme via CSS variables. Hosts may override
   the --ca-* variables; sensible light defaults below, dark via
   [data-ca-theme="dark"] on any ancestor. */
.ca-root {
  --ca-bg: #ffffff;
  --ca-fg: #1f2328;
  --ca-muted: #6b7280;
  --ca-border: #e5e7eb;
  --ca-user-bg: #eef2ff;
  --ca-tool-bg: #f8fafc;
  --ca-accent: #2563eb;
  --ca-ok: #16a34a;
  --ca-no: #dc2626;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--ca-fg);
  background: var(--ca-bg);
  font-size: 14px;
}
[data-ca-theme="dark"] .ca-root {
  --ca-bg: #141414;
  --ca-fg: #e6e6e6;
  --ca-muted: #9ca3af;
  --ca-border: #303030;
  --ca-user-bg: #1e293b;
  --ca-tool-bg: #1c1c1c;
}
.ca-scroll { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.ca-msg { max-width: 100%; border-radius: 8px; line-height: 1.5; }
.ca-msg-user { align-self: flex-end; background: var(--ca-user-bg); padding: 8px 12px; white-space: pre-wrap; }
.ca-msg-assistant { align-self: stretch; display: flex; flex-direction: column; gap: 6px; }
.ca-markdown :is(p, ul, ol) { margin: 0.4em 0; }
.ca-markdown pre { background: var(--ca-tool-bg); border: 1px solid var(--ca-border); border-radius: 6px; padding: 8px; overflow-x: auto; }
.ca-markdown table { border-collapse: collapse; }
.ca-markdown th, .ca-markdown td { border: 1px solid var(--ca-border); padding: 4px 8px; }
.ca-tool { border: 1px solid var(--ca-border); border-radius: 6px; background: var(--ca-tool-bg); }
.ca-tool-error { border-color: var(--ca-no); }
.ca-tool-head { display: flex; gap: 8px; align-items: center; width: 100%; background: none; border: none; color: var(--ca-muted); font: inherit; padding: 6px 10px; cursor: pointer; text-align: left; }
.ca-tool-status { width: 1em; }
.ca-tool-body { padding: 0 10px 8px; }
.ca-tool-body pre { margin: 4px 0; overflow-x: auto; font-size: 12px; }
.ca-confirm { border: 1px solid var(--ca-accent); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.ca-confirm-title { font-weight: 600; }
.ca-confirm-item { border-top: 1px solid var(--ca-border); padding-top: 8px; }
.ca-confirm-input { background: var(--ca-tool-bg); border-radius: 6px; padding: 6px; overflow-x: auto; font-size: 12px; max-height: 200px; }
.ca-confirm-actions { display: flex; gap: 8px; }
.ca-confirm-decided.ca-ok { color: var(--ca-ok); font-weight: 600; }
.ca-confirm-decided.ca-no { color: var(--ca-no); font-weight: 600; }
.ca-confirm-reads { color: var(--ca-muted); font-size: 12px; }
.ca-btn { border: 1px solid var(--ca-border); border-radius: 6px; background: var(--ca-bg); color: var(--ca-fg); padding: 4px 12px; font: inherit; cursor: pointer; }
.ca-btn:disabled { opacity: 0.5; cursor: default; }
.ca-btn-approve { border-color: var(--ca-ok); color: var(--ca-ok); }
.ca-btn-deny { border-color: var(--ca-no); color: var(--ca-no); }
.ca-btn-send { background: var(--ca-accent); border-color: var(--ca-accent); color: #fff; }
.ca-inputrow { display: flex; gap: 8px; padding: 10px; border-top: 1px solid var(--ca-border); }
.ca-input { flex: 1; resize: none; border: 1px solid var(--ca-border); border-radius: 6px; background: var(--ca-bg); color: var(--ca-fg); padding: 6px 10px; font: inherit; }
.ca-thinking { color: var(--ca-muted); }
.ca-error { color: var(--ca-no); border: 1px solid var(--ca-no); border-radius: 6px; padding: 6px 10px; }
.ca-empty-title { font-weight: 600; margin-bottom: 4px; }
.ca-empty-body { color: var(--ca-muted); }
```

- [ ] **Step 7: Update `src/index.ts`**

```typescript
export * from "@centia-io/agent-protocol";
export { streamChat, createNdjsonSplitter } from "./stream.js";
export { AgentChat, type AgentChatProps } from "./AgentChat.js";
export type { UiMessage, UiToolCall, UiConfirm } from "./types.js";
```

- [ ] **Step 8: Build + typecheck + test**

```bash
cd ~/Source/centia-agent && pnpm -r build && pnpm -r test
```

Expected: all packages build, tests PASS.

- [ ] **Step 9: Commit**

```bash
cd ~/Source/centia-agent && git add -A && git commit -m "feat(ui): AgentChat component with confirmation cards"
```

---

### Task 9: Server packaging (Dockerfile + README)

**Files:**
- Create: `packages/server/Dockerfile`
- Create: `~/Source/centia-agent/README.md`

**Interfaces:** none consumed by later tasks (deploy artifact).

- [ ] **Step 1: Write `packages/server/Dockerfile`**

```dockerfile
FROM node:22-slim
RUN corepack enable && npm i -g @centia-io/mcp-server
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/protocol ./packages/protocol
COPY packages/server ./packages/server
RUN pnpm install --frozen-lockfile && pnpm --filter @centia-io/agent-protocol build
ENV MCP_COMMAND=centia-mcp-server \
    MCP_ARGS=--stdio \
    PORT=8790
EXPOSE 8790
WORKDIR /app/packages/server
CMD ["pnpm", "start"]
```

Note: verify the published mcp-server binary name and stdio invocation (`npm view @centia-io/mcp-server bin`) and correct `MCP_COMMAND`/`MCP_ARGS` accordingly — if it is invoked as `node /usr/local/lib/node_modules/@centia-io/mcp-server/dist/index.js`, set that instead. The build context is the workspace root: `docker build -f packages/server/Dockerfile .`.

- [ ] **Step 2: Write `README.md`** — short: what the three packages are, dev quickstart (`pnpm install`, `.env` from `.env.example`, `pnpm --filter @centia-io/agent-server dev`), the provider matrix (bedrock/anthropic/openai env vars), the confirmation protocol in five lines, and the security model (per-request user token, per-token MCP process, guardrail classes).

- [ ] **Step 3: Verify docker build**

```bash
cd ~/Source/centia-agent && docker build -f packages/server/Dockerfile . -t centia-agent-server
```

Expected: image builds. (Runtime needs AWS/Anthropic env — not tested here.)

- [ ] **Step 4: Commit**

```bash
cd ~/Source/centia-agent && git add -A && git commit -m "chore: Dockerfile + README"
```

---

### Task 10: centia-app integration — wiring, AI button, Drawer

**Files (all in `~/Source/centia-app`):**
- Modify: `vite.config.ts`
- Modify: `package.json` (via pnpm link)
- Create: `src/agent/agentStore.ts`
- Create: `src/agent/agentContext.ts`
- Create: `src/agent/AgentDrawer.tsx`
- Modify: `src/layout/HeaderBar.tsx`
- Modify: `src/layout/AppLayout.tsx`

**Interfaces:**
- Consumes: `AgentChat`, `UiMessage` from `@centia-io/agent-ui`; `AppContext` from the re-export.
- Produces: `agentStore` (`{ open: boolean; messages: UiMessage[] }` via `createStore`), `setAgentPageContext(key: string, data: Record<string, unknown>)`, `clearAgentPageContext(key: string)`, `getAgentContext(): AppContext` — used by Task 11.

- [ ] **Step 1: Branch and link packages**

```bash
cd ~/Source/centia-app && git checkout -b feature/ai-agent
```

Then, as standalone commands FROM `~/Source/centia-app` (never from inside centia-agent — see Global Constraints):

```bash
pnpm link ~/Source/centia-agent/packages/ui
pnpm link ~/Source/centia-agent/packages/protocol
```

Verify: `readlink node_modules/@centia-io/agent-ui` points into `~/Source/centia-agent`, and `git -C ~/Source/centia-agent status` shows a clean tree (no accidental self-link).

- [ ] **Step 2: Vite proxy + dedupe**

In `vite.config.ts`, extend the config:

```typescript
  server: {
    port: 4000,
    proxy: {
      '/agent': {
        target: 'http://localhost:8790',
        rewrite: (p) => p.replace(/^\/agent/, ''),
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@centia-io/sdk': path.resolve(__dirname, 'node_modules/@centia-io/sdk/dist/centia-io-sdk.js'),
    },
  },
```

- [ ] **Step 3: Create `src/agent/agentStore.ts`**

```typescript
import type { UiMessage } from '@centia-io/agent-ui';
import { createStore } from '../utils/createStore';

interface AgentState {
  open: boolean;
  messages: UiMessage[];
}

export const agentStore = createStore<AgentState>({ open: false, messages: [] });

export const openAgent = () => agentStore.set({ open: true });
export const closeAgent = () => agentStore.set({ open: false });
```

- [ ] **Step 4: Create `src/agent/agentContext.ts`**

```typescript
import type { AppContext } from '@centia-io/agent-ui';

/** Pages contribute context under a key; the drawer merges all contributions. */
const contributions = new Map<string, Record<string, unknown>>();

export const setAgentPageContext = (key: string, data: Record<string, unknown>): void => {
  contributions.set(key, data);
};

export const clearAgentPageContext = (key: string): void => {
  contributions.delete(key);
};

export const getAgentContext = (): AppContext => {
  const data: Record<string, unknown> = { page: window.location.pathname };
  for (const [key, value] of contributions) data[key] = value;
  return { app: 'centia-app', data };
};
```

- [ ] **Step 5: Create `src/agent/AgentDrawer.tsx`**

```tsx
import { Drawer } from 'antd';
import { AgentChat } from '@centia-io/agent-ui';
import '@centia-io/agent-ui/styles.css';
import { getStatus } from '../baas/client';
import { queryClient } from '../data/queryClient';
import { bumpWmsRefresh } from '../features/map/mapStore';
import { agentStore, closeAgent } from './agentStore';
import { getAgentContext } from './agentContext';

const LAYER_TOOL = /Layer|Style|Label|Class/;
const WRITE_TOOL = /^(post|patch|delete)[A-Z]/;

export default function AgentDrawer() {
  const { open, messages } = agentStore.useStore();

  return (
    <Drawer
      title="Centia AI"
      placement="right"
      width={480}
      open={open}
      onClose={closeAgent}
      mask={false}
      styles={{ body: { padding: 0 } }}
      destroyOnClose={false}
    >
      <AgentChat
        endpoint="/agent/api/chat"
        getToken={() => getStatus().getTokens().accessToken}
        getContext={getAgentContext}
        initialMessages={messages}
        onMessagesChange={(m) => agentStore.set({ messages: m })}
        onToolExecuted={(name) => {
          if (!WRITE_TOOL.test(name)) return;
          queryClient.invalidateQueries();
          if (LAYER_TOOL.test(name)) bumpWmsRefresh();
        }}
        locale="da"
      />
    </Drawer>
  );
}
```

Implementer notes: check `src/features/map/mapStore.ts` for the exact export name of the WMS refresh bump (`bumpWmsRefresh`) and adjust the import if it differs. If antd's Drawer version in this repo warns that `width` is deprecated in favor of `size`, keep `width` consistent with the existing `LayerStyleDrawer.tsx` usage. The drawer must render `AgentChat` inside a fixed-height container: antd Drawer body is a flex column with height 100%, and `.ca-root` fills it. Wrap in a theme bridge: set `data-ca-theme={resolvedTheme}` on a wrapper div using `useTheme()` from `../theme/ThemeProvider` (map the app's dark mode to `"dark"`).

- [ ] **Step 6: AI button in `src/layout/HeaderBar.tsx`**

Add before the theme Segmented:

```tsx
import { RobotOutlined } from '@ant-design/icons';
import { openAgent } from '../agent/agentStore';
// inside the <Space>:
<Button size="small" type="primary" ghost icon={<RobotOutlined />} onClick={openAgent}>
  AI
</Button>
```

- [ ] **Step 7: Mount the drawer in `src/layout/AppLayout.tsx`**

Import `AgentDrawer` and render it once, as a sibling of the routed content (inside the authenticated layout, outside the page outlet), e.g. just before the layout's closing tag: `<AgentDrawer />`.

- [ ] **Step 8: Typecheck + build + visual check**

```bash
cd ~/Source/centia-app && npx tsc --noEmit && pnpm build
```

Expected: clean. Then with the dev servers running (`pnpm dev` in centia-app; agent-server on :8790), open http://localhost:4000, click the AI button, and verify the drawer opens with the empty-state copy, and that an unauthenticated agent-server (stopped) shows the error banner rather than crashing.

- [ ] **Step 9: Commit**

```bash
cd ~/Source/centia-app && git add -A && git commit -m "feat(agent): AI button + drawer hosting @centia-io/agent-ui"
```

Do NOT commit `package.json`/`pnpm-lock.yaml` link artifacts if pnpm rewrote them with `link:` deps — before the final merge the packages get published to the registry and the deps switched to versions, exactly like the SDK flow.

---

### Task 11: Map page context + end-to-end verification

**Files (in `~/Source/centia-app`):**
- Modify: `src/features/map/MapPage.tsx`

**Interfaces:**
- Consumes: `setAgentPageContext`, `clearAgentPageContext` from Task 10.

- [ ] **Step 1: Contribute map context**

In `MapPage.tsx`, add an effect that mirrors the current schema + active layers into the agent context (find the existing state names — the store exposes `activeLayers: ActiveLayer[]` and the page tracks the selected schema):

```tsx
import { clearAgentPageContext, setAgentPageContext } from '../../agent/agentContext';

useEffect(() => {
  setAgentPageContext('map', {
    description: 'Map page: schema and active layers with render modes',
    schema: selectedSchema,
    activeLayers: activeLayers.map((l) => ({
      layer: `${l.schema}.${l.table}`,
      geomColumn: l.geomColumn,
      renderMode: l.renderMode,
    })),
  });
  return () => clearAgentPageContext('map');
}, [selectedSchema, activeLayers]);
```

Adjust variable names to the actual ones in MapPage (`selectedSchema` may be named differently — read the file first).

- [ ] **Step 2: Typecheck**

```bash
cd ~/Source/centia-app && npx tsc --noEmit
```

- [ ] **Step 3: End-to-end verification (browser, real backend)**

Prerequisites: GC2 backend on :8080, mcp-server built (`~/Source/mcp-server/dist/index.js`), agent-server `.env` pointing at it, a working LLM provider (ask the user whether AWS Bedrock credentials are available locally; otherwise run with `LLM_PROVIDER=anthropic` for the E2E), user logged in at http://localhost:4000.

Verify in the browser (chrome-devtools MCP):
1. AI button opens the drawer on any page; close/reopen preserves the conversation.
2. Read flow: "Hvilke tabeller er der i schemaet X?" → tool calls stream in, answer in Danish, no confirmation card.
3. Write flow: "Opret en tabel test_agent i schema X med en id-kolonne" → confirmation card appears with `postTable` payload, nothing executed yet (verify via network/backend); Approve → tool executes, model summarizes; the new table appears in the Schemas page after the automatic cache invalidation.
4. Deny flow: ask for another change, click Afvis → agent acknowledges without executing.
5. Map styling flow: on the Map page with a WMS layer active, "Giv laget en blå outline" → agent patches the layer (after approval) and the map refreshes (wmsRefresh bump).
6. Cleanup: ask the agent to delete `test_agent` (confirm), verify deletion.

- [ ] **Step 4: Commit**

```bash
cd ~/Source/centia-app && git add -A && git commit -m "feat(agent): map page context contribution"
```

---

### Task 12: Final review pass

- [ ] Run everything: `cd ~/Source/centia-agent && pnpm -r build && pnpm -r test`; `cd ~/Source/centia-app && npx tsc --noEmit && pnpm build`.
- [ ] Re-read the spec (`docs/superpowers/specs/2026-08-27-centia-agent-design.md`) and confirm every requirement maps to shipped code; note deviations.
- [ ] Request code review per superpowers:requesting-code-review before merging `feature/ai-agent`.
