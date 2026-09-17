# BUILD_PLAN.md — GPT‑GOV (AI‑Native Business OS) — 14‑Day Crash Build

> Goal: Stand up a production‑minded MVP of a memory‑anchored, policy‑driven AI governance backend in **14 days**, then harden it with guardrails, observability, and learning loops. No code is written here — you’ll fill the functions and schemas yourself. _Hidden clues_ are embedded as HTML comments (`<!-- clue: ... -->`).

**Core sources**: Architecture, memory layers, APIs, and jobs are defined in the repo README; treat this plan as the executable checklists to ship the spec.

---

## Guiding Principles

- **Deterministic first**, LLM‑assist second.
- **Everything is an event** → decisions → outcomes → learning loop.
- **Versioned policies** with **Autonomy Levels (AL0–AL3)** and **hash‑chained decisions**.
- **Daily snapshots** and **bandit‑driven variants** (promotion via Slack proposal).
- **Small, testable surfaces** — every day ends with smoke checks.

<!-- clue: Keep “LLM call timeout ≤ 1500ms” budget; cache policies/snapshots for speed. -->

---

## Tools You’ll Use (no code here, only actions)

- Runtime: **Bun 1.x**, **Express + TypeScript**, **Drizzle ORM**, **PostgreSQL 15+** with **pgvector**.
- AI: **Vercel AI SDK** with OpenAI provider.
- Jobs: **n8n** (HTTP triggers + scheduled).
- Deploy: **Railway**.
- Validation & Logs: **zod**, **pino**.

---

## Skill Gaps — What to Learn Fast

1. **Drizzle ORM + migrations**: schema → migration → rollback; seeding patterns.
2. **pgvector basics**: embedding dims, `vector(1536)`, cosine distance; simple ANN index.
3. **Policy design**: autonomy bands; escalation; versioning semantics.
4. **Hash chains**: `prev_hash → hash` to make decisions tamper‑evident.
5. **Bandits** (Thompson Sampling): mapping successes from `outcomes` to `(alpha, beta)`.
6. **n8n** flows\*\*: webhook triggers, scheduled runs, secrets handling.
7. **Observability**: p50/p95 lat, token usage, AL distribution; JSON logging; correlation IDs.
8. **Security**: job token headers, least‑privilege service tokens, PII redaction in logs.

<!-- clue: You can prototype bandits with a tiny Beta sampler; store only (alpha,beta) per variant. -->

---

## Deliverables Overview

- **Day 3**: Local server responding to `/health`; Postgres + pgvector running; migrations applied.
- **Day 6**: `/events`, `/decisions/finance`, `/outcomes/:decisionId` round‑trip works locally.
- **Day 9**: n8n ingest + daily jobs calling internal job endpoints.
- **Day 12**: Policy variants routed; outcomes update variant stats; Slack proposal message.
- **Day 14**: Deployed on Railway; dashboards show metrics; kill‑switch + idempotency in place.

---

## Daily Plan (14 Days)

### Day 1 — Repo Skeleton & Env

- [x] Initialize Bun + TS project structure exactly like `src/` layout (config, routes, core, jobs).
- [x] Create `.env` from example with placeholders only (no secrets in repo).
- [x] Write **README excerpts** to a DEVLOG entry summarizing subsystem responsibilities.
- [x] Add **pino** logger with correlation ID middleware (generate UUID per request).
- [x] Add `/health` and `/metrics` route shells (return hardcoded JSON for now).
- [x] Set up **drizzle.config.ts**; connect to local Postgres URL.
- **Exit check**: `bun run --hot src/server.ts` → `GET /health` returns `{ ok: true }`.
<!-- clue: Use a request header like x-cid to override correlation ID for replays. -->

### Day 2 — Database Foundations

- [x] Provision local **Postgres 15**; enable extension `CREATE EXTENSION vector;`.
- [x] Define Drizzle models for: `events`, `decisions`, `outcomes`, `policy_versions`, `entity_features`, `knowledge_snapshots`, `policy_variants_stats`.
- [x] Add **indexes** listed in the spec.
- [x] Generate + push migrations; verify tables exist.
- **Exit check**: Run a migration rollback → re‑apply. Confirm no drift.
<!-- clue: Keep `context_vec vector(1536)` for the same embedding dim you’ll use. -->

### Day 3 — Policy Loader & Evaluator Scaffolds

- [x] Create `core/policy/types.ts` to model autonomy bands and escalation.
- [x] Implement `policy/loader.ts` to fetch **latest by name** or by `name@version`.
- [x] Stub `policy/evaluator.ts` with deterministic guardrail checks only (no LLM).
- [x] Seed one policy in `policy_versions` (finance v1.0.0) via migration or seed script.
- **Exit check**: Unit tests for evaluator boundaries (approve/deny at edges).
<!-- clue: Represent bands as predicates over inputs; evaluator returns AL and reason. -->

### Day 4 — Events API & Context Assembler (Skeleton)

- [x] Implement `POST /events` to insert immutable events with optional `correlationId`.
- [x] Create `core/memory/assembler.ts` interface returning: latest snapshots + k‑NN similar cases.
- [x] Stub `memory/similar.ts` to return empty for now; wire vector column in `decisions`.
- **Exit check**: cURL insert for `DiscountRequested` returns row ID; list events by type.
<!-- clue: Always index events by `(type, ts)` for quick recent scans. -->

### Day 5 — Decisions API (Deterministic)

- [x] Create `POST /decisions/finance` handler: load policy → assemble context (stub) → evaluate deterministically → store decision row.
- [x] Implement **hash chain**: fetch previous decision hash, compute current.
- [x] Record **latency_ms** (monotonic timer) and **autonomy_level**.
- **Exit check**: Round‑trip decision stored with `policy_version` and `hash` fields.
<!-- clue: Hash input as stable JSON (sorted keys) + prev_hash + policy_version. -->

### Day 6 — Outcomes API + Rewards Mapping

- [x] Implement `POST /outcomes/:decisionId` to upsert outcome metrics.
- [x] Create `learning/reward.ts` mapping outcomes → success/failure for bandits.
- [x] Add smoke cURLs for events→decision→outcome trip.
- **Exit check**: Posting an outcome updates the decision's learning counters in memory.
<!-- clue: Consider success = won && margin ≥ band min_margin. -->

### Day 7 — Embeddings, Indexer & Similar Cases

- [ ] Implement `memory/embeddings.ts` wrapper (Vercel AI SDK) to create vectors for decisions + snapshots.
- [ ] Backfill `context_vec` for last N decisions (script).
- [ ] Implement `memory/similar.ts`: simple cosine similarity query (LIMIT 10).
- **Exit check**: Decisions API attaches top‑k similar case IDs in response (for debug only).
<!-- clue: Use a normalized vector; store as `vector(1536)`; add IVF or HNSW later. -->

### Day 8 — Knowledge Snapshots & Features

- [ ] Create `jobs/aggregator.ts` to compute daily `entity_features` (SQL first).
- [ ] Create `jobs/distill.ts` to produce `knowledge_snapshots` + embeddings.
- [ ] Add `/jobs/*/run` routes guarded by `x-internal-token`.
- **Exit check**: Manual POSTs run jobs and populate both tables.
<!-- clue: Keep snapshot length under model context; store `summary_vec` for recall. -->

### Day 9 — n8n Flows (Ingest + Daily Jobs)

- [ ] Build **Ingestor** flow: HTTP trigger → normalize → POST `/events`.
- [ ] Schedule **06:00** Aggregator, **06:10** Distill calls; use job token secret.
- [ ] Export flows into `flows/ingest.json`.
- **Exit check**: n8n executions show 2 successful daily runs.
<!-- clue: Use environment variables in n8n; never hardcode base URLs or tokens. -->

### Day 10 — Variant Router & Bandit Stats

- [ ] Implement `learning/bandit.ts` (variant selection strategy + update rules).
- [ ] Extend Decisions API to attach **variant** (e.g., `finance-constitution@1.1.B`).
- [ ] Create `policy_variants_stats` updater on each outcome.
- **Exit check**: Two variants receive traffic; stats `(alpha,beta)` mutate as outcomes arrive.
<!-- clue: Thompson Sampling = sample θ~Beta(α,β) per variant; pick argmax. -->

### Day 11 — Slack Adapter & Promotion Proposals

- [ ] Implement `adapters/slack.ts` with `notify(channel, text)` and health check.
- [ ] Add `jobs/scorecards.ts` to compute variant deltas and propose promotions.
- [ ] Post to Slack when candidate > baseline with minimum samples + margin.
- **Exit check**: A Slack message renders a human‑readable promotion summary.
<!-- clue: Include links to replay endpoints for human verification. -->

### Day 12 — Guardrails, Idempotency & Kill Switches

- [ ] Add `Idempotency-Key` support to mutating routes.
- [ ] Introduce `node_flags` (feature gate per node/action) and a global kill switch.
- [ ] Enforce **zod** validation on inputs/outputs for adapters and routes.
- **Exit check**: Simulate a double‑post and a kill‑switch flip; observe safe behavior.
<!-- clue: Keep a deny‑by‑default policy on actions unless explicitly enabled. -->

### Day 13 — Metrics, Dashboards & Tracing Hooks

- [ ] Flesh out `/metrics`: p50/p95 latency, error counts by route, token usage, AL distribution.
- [ ] Add basic OpenTelemetry hooks (optional) and structured error fields.
- [ ] Create a simple dashboard (even JSON file rendered) to visualize trends.
- **Exit check**: Metrics reflect traffic; latency budget respected; token spikes visible.
<!-- clue: Emit tokens used per request as a counter for budget alerts. -->

### Day 14 — Railway Deployment & Production Checklist

- [ ] Deploy API to Railway; attach Postgres plugin; set all ENV vars.
- [ ] Provision n8n (Railway or n8n Cloud) and point cron webhooks to Railway URLs.
- [ ] Run smoke tests against public URL; confirm Slack messages deliver.
- [ ] Enable backups + retention windows; verify least‑privilege tokens.
- **Exit check**: ✅ “MVP Ready” — demo events→decisions→outcomes; daily jobs running; Slack proposals live.

---

## Mastery Accelerators (Do Once)

- **Replay tool**: CLI to re‑evaluate last N decisions with latest policy (diff reasons/AL).
- **Shadow mode**: run a candidate policy in parallel (no‑action) and compare outcomes.
- **Drift alarms**: alert when decision distributions or AL levels shift unexpectedly.
- **Redaction layer**: centralize PII scrubbing before logs/snapshots.

<!-- clue: Replays should fix correlation ID to compare evaluator deterministically. -->

---

## Test Scripts (No Implementation Code)

Use cURL (fill placeholders yourself):

- Event → `POST /events`
- Decision → `POST /decisions/finance`
- Outcome → `POST /outcomes/:decisionId`

<!-- clue: Keep a Postman collection with three folders: Events, Decisions, Outcomes. -->

---

## Definition of Done (MVP)

- Decisions are **reproducible** (policy version + hash chain).
- Memory is **layered** (events, decisions, features, snapshots).
- Learn loop **updates** bandit stats; Slack proposal **notifies** humans.
- **SLOs** respected (p50 < 300ms, p95 < 800ms excluding adapters).
- **Security**: job token, kill switch, least privilege, backups configured.

---

## Stretch After Day 14

- **ANN indexes** for vectors; **cached** snapshot windows.
- **Adapter gallery** (Stripe invoices, Github issues triage).
- **HR node** (`POST /decisions/hr`) with distinct policies & outcomes.
- **Policy authoring UI** (admin‑only) with YAML→JSON validation.

<!-- clue: Keep policies as data; keep evaluators tiny and pure. -->
