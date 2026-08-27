# Centia Agent — embedded AI assistant for centia-app (and later vidi)

**Date:** 2026-08-27
**Status:** Approved design
**Repos involved:** new repo `~/Source/centia-agent` (service + packages), `centia-app` (integration). `mcp-server` guardrail hardening is a separate task owned by that session.

## Goal

Users of centia-app can open an always-available AI panel and ask the agent to
perform setup, provisioning, and map styling in natural language. Unlike
gc2-chat (read-only), the agent can execute write operations — every write is
gated by an explicit in-chat confirmation. The LLM runs on AWS Bedrock by
default and can be switched to a local model via configuration. The chat
component is reusable in vidi later.

## Decisions (settled with the user)

1. **New repo `centia-agent`** — standalone service + React component,
   published as `@centia-io/*` packages. Not embedded in centia-app, not an
   extension of gc2-chat (which stays GeoFA-deployment-specific).
2. **Token flow:** the user's login token (SDK OAuth) is sent as `Authorization:
   Bearer` on every chat request. The service spawns one MCP child process per
   token with `API_TOKEN=<user token>` in its env — works with today's
   mcp-server. The spawn logic sits behind a small transport interface so a
   later per-call-token/HTTP transport only touches one module.
3. **Guardrails:** ALL write tools (`post*`/`patch*`/`delete*`) require
   explicit user confirmation in the chat UI before execution. `postSql`
   remains read-only (SELECT/WITH/EXPLAIN/SHOW regex). Writes must go through
   typed MCP tools so they can be classified and audited.
4. **App context injection:** the host app supplies a context object (page,
   schema, active layers, …) that is sent with each request and rendered into
   a system block, so "give this layer a blue outline" works.
5. **Local model = OpenAI-compatible endpoint** (Ollama, LM Studio, vLLM).
   Provider selection via env: `bedrock` (default) | `anthropic` | `openai`.
6. **v1 without widgets** — markdown answers, visible tool calls, confirmation
   cards. gc2-chat's map/chart/table/gallery widgets can be ported later; the
   component API leaves room for it.

## Architecture

### Repo layout (`~/Source/centia-agent`, pnpm workspace)

| Package | Contents | Consumers |
|---|---|---|
| `@centia-io/agent-server` | Hono service: agentic loop, LLM adapters, MCP session pool, guardrails. Runs standalone (Docker). | Deployed next to centia-app; later vidi |
| `@centia-io/agent-ui` | React chat component `<AgentChat>`: message list, markdown, tool-call display, confirmation cards, NDJSON stream client. Own scoped CSS, **no antd dependency**. | centia-app (inside antd Drawer), vidi |
| `@centia-io/agent-protocol` | Shared types: NDJSON event types, message/tool shapes, context block. | both |

### Protocol (stateless, mirrors gc2-chat)

Client POSTs the full message history to `/api/chat` with the user's Bearer
token. Server streams NDJSON events: `text`, `tool_use`, `tool_result`,
`confirm_request`, `done`, `error`. No server-side conversation state.

**Two-phase confirmation (stateless):** when the model requests a WRITE tool,
the server does NOT execute it; it streams `confirm_request` (tool name +
input) and ends the turn. The client renders a confirmation card. On approval
the client re-POSTs the history plus the approved tool-use ids; the server
executes only explicitly approved calls and continues the loop. On denial the
client sends a `tool_result` with "user denied" so the model can react. The
server never holds an open turn waiting for a human.

### Server internals

**LLM adapters.** Reuse gc2-chat's `LlmAdapter` interface (Anthropic `Tool`
shape is canonical; one method per model turn). `AnthropicBedrockMantle` from
`@anthropic-ai/bedrock-sdk` exposes the same `messages` surface as the
Anthropic SDK, so the Anthropic adapter is parameterized with the client
instance:

- `LLM_PROVIDER=bedrock` (default): `AnthropicBedrockMantle({ awsRegion })`,
  credentials via the standard AWS chain (env/profile/IAM role), model default
  `anthropic.claude-opus-5`.
- `LLM_PROVIDER=anthropic`: direct API (development).
- `LLM_PROVIDER=openai`: OpenAI adapter with configurable `baseURL` →
  Ollama/LM Studio/vLLM.

**MCP session pool.** `McpSession` module behind a transport interface. Pool
keyed by the user's token: first call spawns the mcp-server as a stdio child
with `API_TOKEN=<token>` and `API_BASE_URL` from env; subsequent calls reuse
it. Idle TTL (10 min) reaps processes; a cap bounds concurrent children. A
browser token refresh yields a new key → new process; the old one ages out.

**Auth preflight.** The service must not be an open Bedrock proxy: before
starting the loop, validate the token with one cheap GC2 call (e.g.
`getSchema` namesOnly). 401 → reject immediately. After that GC2 itself
enforces rights on every tool call.

**Tool classification.** One module, three explicit name lists:

- **READ** (auto-execute): all `get*` tools + `postSql` (read-only regex).
- **WRITE** (confirmation required): `post*`/`patch*`/`delete*` — schema,
  table, layer/style/label, feature, keyvalue, rules, privileges, …
  The payload is shown in the confirmation card.
- **DENY** (never exposed to the model): auth-sensitive tools — `postOauth`,
  `postDevice`, `postClient`, `patchClient`, `deleteClient`, `postUser`,
  `patchUser`, `deleteUsers`. Account management stays in the regular UI.

**Loop.** Port gc2-chat's `runChatStream` (dependency-injected, unit-testable
without LLM/MCP) with one extension: `executeToolRequest` consults the
classification; a WRITE call without a matching approval id executes nothing,
emits `confirm_request`, and ends the turn. Max 20 iterations; tool results
truncated at 200k chars.

**System prompt.** Generic Centia admin prompt (provisioning-aware, explains
the confirmation flow to the model, Danish-or-user's-language answers) + the
app-context block from the client. No `agent_config` DB dependency in v1.

### UI component (`@centia-io/agent-ui`)

```tsx
<AgentChat
  endpoint="/agent/api/chat"
  getToken={() => accessToken}          // fresh Bearer token per request
  getContext={() => appContext}         // free-form JSON: { app, page, schema, activeLayers, ... }
  onToolExecuted={(toolName) => ...}    // host reacts to executed writes
  locale="da"
/>
```

Markdown rendering (react-markdown + GFM), collapsible tool calls,
confirmation card with tool name + formatted payload + Approve/Deny buttons.
Scoped CSS (prefixed classes, CSS variables for theming so light/dark follows
the host app). Conversation state lives in the component but can be lifted
(`initialMessages`/`onMessagesChange`) so the host preserves the conversation
when the panel closes.

### centia-app integration

- "AI" button in the top header (next to the theme switcher — always visible,
  independent of the side menu) opens an antd Drawer (right, ~480 px) with
  `<AgentChat>`.
- Conversation in a small zustand store so it survives close/open.
- `getToken` from the SDK's `getStatus().getTokens()`.
- `getContext` assembled from a small registry where pages contribute (the Map
  page provides schema + active layers from mapStore).
- `onToolExecuted` invalidates relevant react-query caches (e.g. `['layer', …]`
  after `postLayer`) and bumps `wmsRefresh` for styling calls, so the UI
  reflects agent changes immediately.

### Dev & deployment

- Agent server on :8790 locally; centia-app's Vite proxy forwards `/agent/*`
  (same pattern in production behind a reverse proxy — no CORS).
- Dockerfile for the agent server with the mcp-server npm-installed in the
  image (as gc2-chat does).
- Env: `LLM_PROVIDER`, `AWS_REGION` (+ standard AWS credential chain),
  `BEDROCK_MODEL` (default `anthropic.claude-opus-5`), `ANTHROPIC_API_KEY` /
  `ANTHROPIC_MODEL` (anthropic provider), `OPENAI_BASE_URL` / `OPENAI_MODEL`
  (local model), `MCP_COMMAND`, `MCP_ARGS`, `API_BASE_URL`, `PORT`.
- **No user tokens in env** — the user's token arrives per request.

### Testing

gc2-chat's pattern carried forward: `node:test` with fake adapter/executor.
Covered without live LLM/MCP: the loop; the guardrail gate (WRITE without
approval → `confirm_request`; with approval → executed; DENY → never in the
tool list); pool reaping. `tsc` everywhere; manual browser E2E against the
local backend for verification.

## Out of scope (v1)

- Widgets (map/chart/table/gallery) — later port from gc2-chat.
- mcp-server-side guardrails and per-call token transport — separate task.
- Conversation persistence beyond the browser session.
- Per-deployment `agent_config` prompt table.
- vidi integration (the component API is designed for it; the wiring is a
  later task in the vidi repo).
