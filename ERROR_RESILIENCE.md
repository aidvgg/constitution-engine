# Error Resilience Architecture

## Overview

This service is designed so that application-level errors do not crash it. It logs those errors and keeps serving requests. By design, the process still exits with code 1 on an uncaught exception, so a supervisor (Docker, Railway, PM2) can restart it into a clean state.

## Error Handling Layers

### 1. **Route-Level: asyncHandler Wrapper**

**Location:** `src/middleware/async-handler.ts`

**What it catches:**

- Async/await errors in route handlers
- Promise rejections in route logic
- Database query failures
- Service call failures

**Example:**

```typescript
router.post(
  "/decisions/:node",
  asyncHandler(async (req, res) => {
    // If this throws or rejects, asyncHandler catches it
    const decision = await makeDecision(params);
    res.json(decision);
  })
);
```

**Result:** Error forwarded to global error handler, request gets error response, service continues.

---

### 2. **Application-Level: Global Error Handler**

**Location:** `src/middleware/error-handler.ts`

**What it catches:**

- All errors forwarded by asyncHandler
- Validation errors (zod)
- Custom errors (NotFoundError, BadRequestError, etc.)
- Unexpected errors in middleware

**Behavior:**

- **CustomError instances:** Returns structured error with appropriate status code (400, 404, etc.)
- **Unknown errors:** Logs full stack trace, returns generic 500 response (doesn't leak internals)

**Security:** Never exposes internal error details to clients.

---

### 3. **Process-Level: Uncaught Exception Handlers**

**Location:** `src/server.ts`

#### **uncaughtException** (Fatal)

```typescript
process.on("uncaughtException", (error) => {
  // Log fatal error
  // Exit after 1 second (allows log flush)
});
```

**When it triggers:**

- Synchronous errors outside request context
- Programming errors (referencing undefined, etc.)

**Why it exits:** Uncaught exceptions leave the process in undefined state. Best practice is to crash and let orchestrator (Docker, Railway, PM2) restart.

#### **unhandledRejection** (Non-Fatal)

```typescript
process.on("unhandledRejection", (reason) => {
  // Log error
  // Continue running (don't exit)
});
```

**When it triggers:**

- Promise rejections outside request context
- Background job failures
- Timer callback failures

**Why it continues:** Unhandled rejections don't corrupt process state. We log and continue for maximum uptime.

#### **SIGTERM/SIGINT** (Graceful Shutdown)

```typescript
process.on("SIGTERM", () => {
  // Stop accepting new connections
  // Wait for existing requests to complete
  // Exit cleanly
});
```

**When it triggers:**

- Deployment/restart (Railway, Kubernetes)
- Manual Ctrl+C

**Result:** No dropped requests during deployment.

---

### 4. **Startup: Migration Error Handling**

```typescript
try {
  await migrate(db, { migrationsFolder: "./drizzle" });
} catch (error) {
  baseLogger.fatal("Database migration failed");
  process.exit(1); // Don't start with broken DB
}
```

**Why it exits:** If migrations fail, DB schema is wrong. Better to crash and alert than serve broken responses.

---

## Error Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Request Arrives                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Route Handler (wrapped in asyncHandler)                    │
│  ┌─────────────────────────────────────────────┐            │
│  │  await makeDecision(params)  ← Error thrown │            │
│  └─────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼ Error caught by asyncHandler
┌─────────────────────────────────────────────────────────────┐
│  Global Error Handler (errorHandler middleware)             │
│  ┌─────────────────────────────────────────────┐            │
│  │  if (CustomError)                           │            │
│  │    → 400/404 with structured error          │            │
│  │  else                                       │            │
│  │    → 500 generic error                      │            │
│  └─────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Response sent, service continues, next request processed   │
└─────────────────────────────────────────────────────────────┘
```

---

## Testing Error Resilience

### Test 1: Invalid Decision (CustomError)

```bash
curl -X POST http://localhost:3000/decisions/finance \
  -H "Content-Type: application/json" \
  -d '{"action":"invalid_action","data":{}}'
```

**Expected:** 400 Bad Request, service continues

### Test 2: Missing Required Field (Validation Error)

```bash
curl -X POST http://localhost:3000/decisions/finance \
  -H "Content-Type: application/json" \
  -d '{"data":{}}'
```

**Expected:** 400 Validation Error, service continues

### Test 3: Non-existent Decision Outcome

```bash
curl -X POST http://localhost:3000/outcomes/00000000-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"metrics":{"won":true}}'
```

**Expected:** 404 Not Found, service continues

### Test 4: Malformed JSON

```bash
curl -X POST http://localhost:3000/decisions/finance \
  -H "Content-Type: application/json" \
  -d '{broken json'
```

**Expected:** 400 Bad Request (Express JSON parser), service continues

### Test 5: Database Connection Lost

```bash
# Stop docker: docker-compose down
# Try request
curl http://localhost:3000/decisions/finance -X POST -H "Content-Type: application/json" -d '{"action":"approve_discount","data":{"discount_pct":0.1,"margin_pct":0.25}}'
```

**Expected:** 500 Internal Server Error (logged), service continues attempting reconnect

---

## Monitoring Error Rates

Check logs for error patterns:

```bash
# Count errors by type
grep "error" logs.json | jq .err.type | sort | uniq -c

# Find unhandled errors
grep "Unhandled error in request" logs.json

# Check for crashes (shouldn't find any)
grep "uncaughtException" logs.json
```

---

## Production Recommendations

### 1. **Add Health Checks**

```typescript
router.get("/health", async (req, res) => {
  try {
    await db.execute(sql`SELECT 1`); // Check DB
    res.json({ ok: true, db: "connected" });
  } catch (error) {
    res.status(503).json({ ok: false, db: "disconnected" });
  }
});
```

### 2. **Add Circuit Breakers** (Day 12+)

For external services (LLM calls, Slack, etc.):

- Fail fast after N consecutive errors
- Prevent cascading failures
- Return cached/fallback responses

### 3. **Add Retry Logic** (Day 12+)

For transient errors:

- Retry DB queries (connection timeouts)
- Exponential backoff for LLM calls
- Idempotency keys prevent duplicate work

### 4. **Alert on Error Rates**

- `rate(errors_total[5m]) > 10` → Alert
- `unhandled_rejections > 0` → Alert
- `uncaught_exceptions > 0` → Page on-call

---

## What Can Still Crash the Service?

✅ **Won't crash:**

- Route handler errors
- Validation errors
- Database query failures
- Unhandled promise rejections

❌ **Will crash (by design):**

- Database migration failure at startup
- Out of memory (OOM)
- Segmentation fault (native code bugs)
- `uncaughtException` (process state corrupted)

For production, run multiple instances behind a load balancer. If one crashes, others continue serving.

---

## Summary

| Error Type          | Handler                     | Result           | Service State         |
| ------------------- | --------------------------- | ---------------- | --------------------- |
| Route error         | asyncHandler → errorHandler | 4xx/5xx response | ✅ Running            |
| Validation error    | errorHandler                | 400 response     | ✅ Running            |
| DB query error      | asyncHandler → errorHandler | 500 response     | ✅ Running            |
| Unhandled rejection | process.on                  | Logged           | ✅ Running            |
| Uncaught exception  | process.on                  | Logged, exit     | ❌ Crashes (restarts) |
| Migration error     | try/catch                   | Exit             | ❌ Doesn't start      |

**Bottom line:** Normal application errors won't crash the service. Only catastrophic failures cause restarts, which orchestrators handle automatically.
