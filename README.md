# Constitution Engine

Constitution Engine is a backend MVP for recording events, evaluating actions against versioned policy rules, and linking decisions to later outcomes. Its governance model is deliberately deterministic: policy constraints are evaluated in code, the selected policy version is stored with each decision, and decisions are linked with a hash chain for tamper-evident history.

Local stack: Bun, Express, TypeScript, and PostgreSQL.

## What is implemented

- Versioned policies are loaded from PostgreSQL by `name` or `name@version` and cached for 60 seconds.
- Autonomy bands are sorted by level and evaluated against `min_` and `max_` numeric constraints.
- Matching inputs produce an approved decision and autonomy level. Inputs outside every band produce an AL0 escalation result.
- Decisions store the exact policy version, inputs, output, autonomy level, latency, correlation ID, current hash, and previous hash.
- Events are stored with type, actor, payload, timestamp, and correlation ID.
- Outcomes use upsert semantics and compute a binary reward from `success` or the backward-compatible `won` metric, subject to the matched band's constraints.
- Request errors are passed through structured middleware, while startup migration failures stop the process and SIGTERM/SIGINT trigger graceful shutdown.
- Memory assembly can read knowledge snapshots. Similar-decision search and entity features are currently stubs.

## Architecture

```text
HTTP request
  -> request ID and logging middleware
  -> Zod request validation
  -> route handler
  -> policy loader / deterministic evaluator
  -> PostgreSQL via Drizzle ORM
  -> structured response and error middleware
```

The main persistence tables are `events`, `decisions`, `outcomes`, `policy_versions`, `entity_features`, `knowledge_snapshots`, and `policy_variants_stats`. PostgreSQL is initialized with the `vector` and `uuid-ossp` extensions, although vector similarity queries are not implemented yet.

## Local setup

Requirements:

- Bun
- Docker with Docker Compose
- PostgreSQL supplied by the repository's Compose service

Configure these environment names in the local shell or `.env` file. Do not commit credentials:

```text
PORT
DATABASE_URL
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
POSTGRES_PORT
```

Start the local database and development server:

```bash
bun install
bun run dev
```

`bun run dev` starts PostgreSQL through Docker Compose and starts the server with hot reload. The server applies the checked-in Drizzle migrations during startup. In a separate shell, seed the example `finance-constitution@1.0.0` policy:

```bash
bun run seed
```

Useful lifecycle commands:

```bash
bun run up
bun run down
bun run logs
bun run build
```

## HTTP API

All mutating routes accept JSON. When a request omits `correlationId`, the generated request ID is used.

### `GET /health`

Returns the request correlation ID and `{ "ok": true }`. This is a process-level health response; it does not query PostgreSQL.

### `GET /metrics`

Returns the current placeholder response with `p50Latency`, `p95Latency`, and `errorCount`. These values are not yet calculated from request traffic.

### `POST /events`

Creates an event. Required fields are `type`, `actor`, and an object `payload`; `correlationId` is optional and must be a UUID.

```json
{
  "type": "DiscountRequested",
  "actor": "sales-node",
  "payload": { "deal_id": "D1" }
}
```

### `POST /decisions/:node`

Evaluates an action against the selected node's authority. Required fields are `action` and an object `data`; `policyVersion` is optional and defaults to `<node>-constitution`.

```json
{
  "action": "approve_discount",
  "data": { "discount_pct": 0.04, "margin_pct": 0.30 }
}
```

The response includes the decision ID, approval result, autonomy level, reason, policy version, latency, correlation ID, and hash-chain fields. A policy must already exist in `policy_versions`.

### `POST /outcomes/:decisionId`

Creates or updates an outcome for an existing decision. The body requires an object `metrics`; `correlationId` is optional. The response includes the stored outcome and the computed reward. AL0 decisions return no reward.

### `GET /outcomes/:decisionId`

Returns the stored outcome for a decision, or a not-found error when no outcome exists.

## Policy model

Policies are stored as JSON documents in `policy_versions`. A node contains authorities, each authority has an action and ordered autonomy bands, and an authority can name an escalation target with `ifOutside`.

Constraint keys use this convention:

- `min_field`: the request value must be at least the threshold.
- `max_field`: the request value must be at most the threshold.

The seed policy defines `finance` and `approve_discount` with AL1, AL2, and AL3 bands. Inputs that match no band are denied and escalated to `CFO`.

## Testing

The default test command runs the unit suites for reward computation and policy evaluation, and needs no database:

```bash
bun run test
```

Additional scripts are available:

```bash
bun run test:unit
bun run test:integration
bun run test:all
bun run test:coverage
```

The integration suites (policy loading, memory assembly, and route tests) require a reachable PostgreSQL database configured through `DATABASE_URL`.

