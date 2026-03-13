# Phase 6: Infrastructure & Security - Research

**Researched:** 2026-03-13
**Domain:** Redis configuration, CORS hardening, PgBouncer tuning, BullMQ IORedis connection, Fastify graceful shutdown, health endpoints, @fastify/helmet
**Confidence:** HIGH

## Summary

Phase 6 is a configuration and wiring phase, not a feature-building phase. Every requirement has a precise, known fix — no exploratory work is needed. The codebase is already partially correct in several places; the work is to close specific gaps:

1. Redis runs with `allkeys-lru` eviction and no AOF persistence — both must change to protect BullMQ job data from eviction and survive restarts.
2. CORS is configured with `origin: true` (wildcard with credentials), which passes any origin — must be changed to an explicit allowlist driven by an env var.
3. PgBouncer's `default_pool_size = 40` matches the PostgreSQL `max_connections = 50` but the application `pg.Pool` uses `max: 20` per process — there are two processes (api + workers) each creating a pool. Total demand can reach 40, which is fine against PgBouncer's 40, but the mismatch concern from STATE.md is that pgbouncer has pool_size 40 and postgres has max_connections 50, leaving only 10 connections for overhead. This needs to be documented and the pool size verified per process.
4. BullMQ workers pass the shared IORedis instance via `connection: redis as any`. The shared client already has `maxRetriesPerRequest: null` — but the type cast (`as any`) is hiding that BullMQ accepts either a `ConnectionOptions` object or an existing `IORedis` instance. Passing an existing instance is valid per BullMQ docs; the fix is to verify the pattern and remove the type cast by using explicit `ConnectionOptions`.
5. The API has graceful shutdown for SIGTERM/SIGINT (Fastify + destroyDb). Workers also have it. The worker shutdown calls `w.close()` on all workers — BullMQ's `worker.close()` waits for in-flight jobs to complete. This is mostly correct but needs verification that the `schedulerCleanup` sequence order is safe.
6. `/health` returns 200 without auth, but does NOT check DB or Redis connectivity — it just returns `{ status: 'ok' }`. The richer `/ready` endpoint does check both but requires the same route registration audit to confirm it bypasses authentication. The requirement says GET /health must return DB+Redis confirmation — so health.ts needs to be updated.
7. `@fastify/helmet` is not installed. It must be added as a dependency and registered in `app.ts`.
8. Redis counter TTL is not set on `twmail:remaining:{campaignId}` keys, and INFRA-09 requires it plus confirmation the Lua script already provides atomic decrement-and-check (it does — already implemented from Phase 1/4).
9. SES configuration set `'marketing'` is hardcoded in `bulk-send.worker.ts`. INFRA-10 requires it to be configurable via env var.

**Primary recommendation:** Work through requirements in two logical groups — Redis hardening (INFRA-01, INFRA-04, INFRA-07, INFRA-09) via docker-compose.yml + redis client changes, and API/process hardening (INFRA-02, INFRA-03, INFRA-05, INFRA-06, INFRA-08, INFRA-10) via code changes. All changes are isolated and low risk.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | Redis maxmemory-policy set to noeviction (not allkeys-lru) | docker-compose.yml redis command uses `--maxmemory-policy allkeys-lru` — must change to `noeviction` |
| INFRA-02 | CORS origin changed from wildcard (origin: true) to explicit allowlist | app.ts line 35: `cors({ origin: true, credentials: true })` — must read ALLOWED_ORIGINS env var |
| INFRA-03 | PgBouncer pool sizing matches application pool demands (fix 60 vs 40 mismatch) | Two processes each with pg.Pool max:20 = 40 total demand; PgBouncer default_pool_size:40 against Postgres max_connections:50 — needs analysis |
| INFRA-04 | BullMQ worker IORedis clients have maxRetriesPerRequest: null | shared redis.ts already has it; workers use `connection: redis as any` — need to verify type-safe passing |
| INFRA-05 | Graceful shutdown (SIGTERM/SIGINT) for Fastify and all worker processes | Both api/index.ts and workers/index.ts have shutdown handlers; verify BullMQ worker.close() waits for in-flight jobs |
| INFRA-06 | Health endpoint unauthenticated and returns 200 with DB+Redis check | /health returns ok without DB/Redis check; /ready checks both — must merge behavior into /health |
| INFRA-07 | Redis AOF persistence with appendfsync everysec | docker-compose.yml redis command has `--appendonly yes` but no `--appendfsync everysec` — must add |
| INFRA-08 | @fastify/helmet added for security headers | Not installed; must add dependency and register in app.ts |
| INFRA-09 | Redis counter TTL set and atomic decrement-and-check for campaign completion | Lua DECR_AND_CHECK already implemented in bulk-send.worker.ts; TTL on twmail:remaining:{campaignId} keys not set |
| INFRA-10 | SES configuration set 'marketing' verified or made configurable via env var | Hardcoded as 'marketing' in bulk-send.worker.ts lines 147 and 163 — must read from env var |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @fastify/cors | ^10.0.0 (installed) | CORS enforcement | Official Fastify plugin; already in use |
| @fastify/helmet | ^12.0.0 | Security headers (CSP, HSTS, etc.) | Official Fastify plugin; compatible with Fastify 5.x |
| bullmq | ^5.71.0 (installed) | Job queue with graceful shutdown | Already in use; worker.close() handles in-flight jobs |
| ioredis | ^5.10.0 (installed) | Redis client with maxRetriesPerRequest | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| redis-server (docker) | redis:7-alpine (in use) | Redis with AOF + noeviction | Config-only change to docker-compose command |
| edoburu/pgbouncer | latest (in use) | Connection pooling | Config-only change to pool sizes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @fastify/helmet | helmet (express) | Not compatible with Fastify 5 — use the official Fastify plugin |
| Merging /health and /ready | Keeping separate | INFRA-06 specifically requires /health to include DB+Redis check — merge the behavior into /health, keep /ready as alias or remove |

**Installation:**
```bash
npm install @fastify/helmet --workspace=packages/api
```

## Architecture Patterns

### Recommended Project Structure
No structural changes needed — all changes are to existing files:
```
docker-compose.yml          # Redis: noeviction + appendfsync everysec
packages/api/src/app.ts     # CORS allowlist + helmet
packages/api/src/routes/health.ts  # DB+Redis check in /health
packages/api/src/config.ts  # Add ALLOWED_ORIGINS, SES_CONFIGURATION_SET env vars
packages/workers/src/workers/bulk-send.worker.ts  # SES config set from env
packages/shared/src/redis.ts  # Verify/document maxRetriesPerRequest pattern
```

### Pattern 1: CORS Explicit Allowlist with Fastify 5
**What:** Replace `origin: true` with a function that checks against a set of allowed origins
**When to use:** Any production API serving credentialed requests from a browser

```typescript
// packages/api/src/app.ts
const allowedOrigins = new Set(
  (config.ALLOWED_ORIGINS ?? '').split(',').map(o => o.trim()).filter(Boolean)
);

await app.register(cors, {
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, server-to-server, SNS webhooks)
    if (!origin) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
});
```

The ALLOWED_ORIGINS env var should be a comma-separated list: `https://app.example.com,https://staging.example.com`

### Pattern 2: @fastify/helmet Registration (Fastify 5)
**What:** Register helmet after CORS to set security headers
**When to use:** All production Fastify apps

```typescript
// Source: @fastify/helmet official docs
import helmet from '@fastify/helmet';

await app.register(helmet, {
  // contentSecurityPolicy must be configured carefully if serving HTML
  // For a JSON API, defaults are fine
  contentSecurityPolicy: false, // Disable for pure API — frontend handles its own CSP
});
```

Note: If the API serves the tracking pixel endpoint (returns 1x1 gif), CSP defaults may interfere. Setting `contentSecurityPolicy: false` is safe for a pure API that does not serve HTML pages.

### Pattern 3: BullMQ IORedis Connection — Existing Instance vs Options Object
**What:** BullMQ accepts either `ConnectionOptions` (IORedis init options) or an existing `IORedis` instance
**When to use:** Passing an existing IORedis instance is valid but requires no type cast workaround

BullMQ 5.x accepts `IORedis` instance directly via `connection` when you pass it correctly:

```typescript
// CURRENT (type-unsafe, uses `as any`):
const worker = new Worker('queue-name', handler, {
  connection: redis as any,
});

// CORRECT per BullMQ 5.x docs — pass IORedis instance directly:
// The type is: connection: ConnectionOptions | IORedis
// Since getRedis() returns IORedis, no cast needed if types align
const worker = new Worker('queue-name', handler, {
  connection: redis,
});
```

The `maxRetriesPerRequest: null` requirement is already satisfied in `shared/src/redis.ts`. INFRA-04 confirmation: verify the type signature accepts `IORedis` and remove the `as any` cast.

### Pattern 4: Redis Counter TTL (INFRA-09)
**What:** Set an expiry on `twmail:remaining:{campaignId}` keys to prevent stale counters from accumulating
**When to use:** Any Redis key used as a campaign-scoped counter

```typescript
// After setting the initial counter value:
await redis.set(`twmail:remaining:${campaignId}`, contactIds.length, 'EX', 7 * 24 * 3600); // 7 days TTL
```

The Lua atomic decrement-and-check script is already implemented in `bulk-send.worker.ts`. INFRA-09 only requires adding the TTL on the initial SET.

### Pattern 5: Health Endpoint with Connectivity Checks
**What:** /health returns DB + Redis status in a single lightweight check
**When to use:** Production health checks called by load balancers, uptime monitors

```typescript
// packages/api/src/routes/health.ts
app.get('/health', { config: { rateLimit: false } }, async (_request, reply) => {
  const checks: Record<string, string> = {};
  let allOk = true;

  try {
    const db = getDb();
    await db.selectFrom('users').select('id').limit(1).execute();
    checks['database'] = 'ok';
  } catch {
    checks['database'] = 'error';
    allOk = false;
  }

  try {
    const redis = getRedis();
    await redis.ping();
    checks['redis'] = 'ok';
  } catch {
    checks['redis'] = 'error';
    allOk = false;
  }

  return reply.status(allOk ? 200 : 503).send({
    status: allOk ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});
```

The route must be registered BEFORE the auth plugin runs authentication on it, or explicitly bypass auth. In the current `app.ts`, `healthRoutes` is registered after `authPlugin`. Check whether `healthRoutes` routes are currently protected — they are not, because they don't call `app.authenticate`. This is fine; auth in Fastify is per-route via preHandler hooks, not global. The health routes do not have an auth preHandler, so they are already unauthenticated. Confirm this pattern holds after changes.

### Pattern 6: Graceful Shutdown with BullMQ
**What:** `worker.close()` in BullMQ waits for any currently executing job to complete before closing
**When to use:** SIGTERM handlers for all BullMQ worker processes

```typescript
// BullMQ worker.close() behavior (confirmed HIGH confidence):
// - Stops accepting new jobs immediately
// - Waits for current in-flight job handler to resolve/reject
// - Default timeout: waits indefinitely (add forceKillTimeoutMs for production)

const shutdown = async (signal: string) => {
  // Close workers first (wait for in-flight jobs)
  await Promise.all(workers.map((w) => w.close()));
  // Then close DB and Redis connections
  await destroyDb();
  await destroyRedis();
  process.exit(0);
};
```

Current `workers/index.ts` already implements this pattern correctly. INFRA-05 verification: confirm the scheduler cleanup (clearInterval + queue.close()) happens before `process.exit(0)` — it does in the current code.

### Anti-Patterns to Avoid
- **Wildcard CORS with credentials:** `origin: true` with `credentials: true` allows any origin to make credentialed requests. Browsers actually reject this (CORS spec), but it's a security misconfiguration that must be fixed with an explicit allowlist.
- **Sharing a single IORedis connection between app code and BullMQ workers:** BullMQ creates its own internal IORedis connections for pub/sub and blocking operations. Passing the app's shared IORedis instance for the `connection` option is acceptable, but BullMQ will use it only for the queue/worker control plane, not as the only connection.
- **Setting a TTL on Redis keys without considering atomic operations:** If a TTL expires mid-campaign, the Lua DECR script will get 0 from a non-existent key, triggering false completion. The 7-day TTL is safe given campaigns complete in minutes to hours.
- **Using `allkeys-lru` with BullMQ:** Redis with `allkeys-lru` will evict ANY key including BullMQ's internal job tracking keys when memory pressure hits. This causes BullMQ jobs to silently disappear. `noeviction` causes Redis to return an error when memory is full, which is recoverable; eviction is not.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Security headers | Custom middleware setting headers | @fastify/helmet | Handles 10+ headers (HSTS, X-Frame-Options, referrer-policy, CSP, etc.) with correct defaults; edge cases in CSP alone take months to get right |
| CORS origin validation | String matching in custom plugin | @fastify/cors origin function | Handles preflight OPTIONS correctly, varies response by origin |
| BullMQ graceful shutdown | Custom job tracking + timeout | worker.close() | BullMQ tracks in-flight jobs internally; custom solution races with BullMQ internals |

**Key insight:** All INFRA requirements are configuration or thin wiring changes. None require novel algorithms or custom infrastructure.

## Common Pitfalls

### Pitfall 1: Redis noeviction Breaks Other Use Cases
**What goes wrong:** Setting `noeviction` causes Redis to return OOM errors for ALL write operations when memory is full, including session data, caches, and rate limit counters.
**Why it happens:** `noeviction` is the right policy for durable job queues but wrong for ephemeral cache data.
**How to avoid:** In this stack, Redis is used exclusively for BullMQ job queues and campaign counters — not as a general cache. `noeviction` is correct. The `maxmemory 512mb` limit in docker-compose.yml should be sized appropriately for the expected job volume. Consider raising it if large campaigns (100k+ contacts) are expected.
**Warning signs:** Redis returns `OOM command not allowed when used memory > 'maxmemory'` errors in logs.

### Pitfall 2: CORS allowlist blocks SNS webhook delivery
**What goes wrong:** SNS sends POST requests to `/api/webhooks/sns` without an Origin header. If the CORS implementation rejects no-origin requests, SNS webhooks stop working.
**Why it happens:** The CORS origin function must explicitly allow requests with no Origin header (server-to-server).
**How to avoid:** The Pattern 1 code above already handles this: `if (!origin) return cb(null, true)`. This is correct — browsers always send Origin on credentialed cross-origin requests; server-to-server callers (SNS, cron jobs) don't.
**Warning signs:** SNS bounce/complaint notifications stop being received after deploying CORS changes.

### Pitfall 3: Helmet blocks tracking pixel
**What goes wrong:** @fastify/helmet's default `X-Content-Type-Options: nosniff` and `Content-Security-Policy` may interfere with the 1x1 tracking pixel endpoint if it returns a binary response from a different origin than the email client expects.
**Why it happens:** Email clients don't follow browser security policies, but if the pixel is fetched by a browser (e.g., web-based email), CSP could block it.
**How to avoid:** The pixel endpoint returns `Content-Type: image/gif`. Helmet's `nosniff` header reinforces this — it's fine. CSP is not relevant to image fetches in email clients. Disable `contentSecurityPolicy` in helmet config since this is a pure API, not an HTML-serving app.
**Warning signs:** Tracking pixel images broken in web-based email clients after deploying helmet.

### Pitfall 4: PgBouncer pool exhaustion under concurrent worker load
**What goes wrong:** With two worker containers (bulk + system) each creating a `pg.Pool` with `max: 20`, plus the API container with `max: 20`, total demand = 60 connections. PgBouncer `default_pool_size = 40` means at most 40 server-side connections to Postgres. Postgres `max_connections = 50` means 50 total.
**Why it happens:** In transaction mode, PgBouncer multiplexes: 60 client connections can share 40 server connections because most transactions are short. The actual bottleneck is Postgres's `max_connections = 50` — PgBouncer's pool size of 40 + the 5 reserve pool leaves 5 connections for the postgres superuser, pg_stat_statements, etc.
**How to avoid:** For INFRA-03, the fix is to document the math and ensure: `PgBouncer default_pool_size (40) + reserve_pool_size (5) = 45 <= Postgres max_connections (50)`. This is correct. The per-process pg.Pool `max: 20` is the client-side concurrency limit, not a guarantee that 20 server connections are held open — in transaction mode they're returned to pool between transactions. No code change is required; add a comment in pgbouncer.ini documenting the math.
**Warning signs:** `too many connections` errors from Postgres, or `connection pool exhausted` from PgBouncer.

### Pitfall 5: Worker shutdown order — scheduler before workers
**What goes wrong:** If workers are closed before the scheduler's queue is closed, in-flight scheduler jobs may fail to enqueue because the underlying Redis connection closes first.
**Why it happens:** The scheduler uses a separate BullMQ Queue instance that must be explicitly closed.
**How to avoid:** Current code in `workers/index.ts` calls `schedulerCleanup()` before `Promise.all(workers.map(w => w.close()))`. This is the correct order — stop enqueuing new work first, then drain workers.
**Warning signs:** "queue is closed" errors during shutdown.

## Code Examples

Verified patterns from official sources and codebase analysis:

### Redis docker-compose.yml — noeviction + AOF
```yaml
# docker-compose.yml redis service command
command: >
  redis-server
    --appendonly yes
    --appendfsync everysec
    --maxmemory 512mb
    --maxmemory-policy noeviction
```
Current: `--maxmemory-policy allkeys-lru` (missing `--appendfsync everysec`)

### CORS Configuration
```typescript
// packages/api/src/app.ts — replace line 35
const rawOrigins = config.ALLOWED_ORIGINS ?? '';
const allowedOrigins = new Set(
  rawOrigins.split(',').map(o => o.trim()).filter(Boolean)
);

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);          // server-to-server (SNS, etc.)
    if (allowedOrigins.has(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
});
```

### Config — Add ALLOWED_ORIGINS and SES_CONFIGURATION_SET
```typescript
// packages/api/src/config.ts — add to envSchema
ALLOWED_ORIGINS: z.string().default(''),
SES_CONFIGURATION_SET: z.string().default('marketing'),
```

Workers package needs its own config or reads directly from `process.env['SES_CONFIGURATION_SET']`.

### Redis Counter with TTL
```typescript
// In campaign-send worker, after setting counter:
await redis.set(
  `twmail:remaining:${campaignId}`,
  contactIds.length,
  'EX',
  7 * 24 * 3600  // 7 days — campaigns complete in hours
);
```

### Health Route — Updated
```typescript
// /health must confirm DB + Redis:
app.get('/health', async (_request, reply) => {
  const checks: Record<string, string> = {};
  let allOk = true;

  try {
    await getDb().selectFrom('users').select('id').limit(1).execute();
    checks['database'] = 'ok';
  } catch { checks['database'] = 'error'; allOk = false; }

  try {
    await getRedis().ping();
    checks['redis'] = 'ok';
  } catch { checks['redis'] = 'error'; allOk = false; }

  return reply.status(allOk ? 200 : 503).send({
    status: allOk ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `allkeys-lru` for Redis | `noeviction` for job queue Redis | BullMQ docs always recommended this | Prevents silent job loss under memory pressure |
| Manual security headers | @fastify/helmet | Fastify ecosystem standard | 10+ security headers with correct defaults |
| `origin: true` for CORS during dev | Explicit allowlist for prod | Production hardening standard | Prevents credential theft via CSRF from rogue origins |

**Deprecated/outdated:**
- `origin: true` with `credentials: true` in Fastify CORS: works in dev, dangerous in production — browsers enforce CORS but the server should enforce it too.

## Open Questions

1. **Bull Board scoping (from STATE.md)**
   - What we know: The `bull-board` container is a placeholder (`echo "Bull Board placeholder"`)
   - What's unclear: Whether Phase 6 should configure it fully or leave it as placeholder
   - Recommendation: Out of scope for Phase 6 (INFRA requirements don't mention Bull Board). Leave as placeholder; address in a future ops phase if needed.

2. **SES configuration set 'marketing' — is it verified in the AWS account?**
   - What we know: Hardcoded to `'marketing'` in bulk-send.worker.ts
   - What's unclear: Whether the SES configuration set named 'marketing' actually exists in the target AWS account
   - Recommendation: INFRA-10 says "verified or made configurable via env var" — implement env var; verification is an ops step, not a code step.

3. **maxRetriesPerRequest type safety**
   - What we know: `getRedis()` returns `IORedis` with `maxRetriesPerRequest: null`. Workers use `connection: redis as any`. BullMQ 5.x `Worker` constructor accepts `ConnectionOptions | IORedis` for the `connection` field.
   - What's unclear: Whether the TypeScript types in BullMQ 5.71 correctly accept `IORedis` directly without a cast.
   - Recommendation: Check `node_modules/bullmq/dist/esm/interfaces/worker-options.d.ts` — if connection accepts `IORedis`, remove the `as any`. If not, use `{ ...redisOptions }` pattern to pass options instead of instance.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (installed in packages/api) |
| Config file | No vitest.config.ts yet — Wave 0 gap |
| Quick run command | `npm run test --workspace=packages/api` |
| Full suite command | `npm run test --workspace=packages/api` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | Redis command includes `noeviction` | manual/smoke | Verify docker-compose.yml diff | N/A — config |
| INFRA-02 | CORS rejects unauthorized origins | unit | `npm test --workspace=packages/api -- health-cors.test.ts` | ❌ Wave 0 |
| INFRA-03 | PgBouncer math documented | manual | Review pgbouncer.ini comment | N/A — config |
| INFRA-04 | BullMQ connection has maxRetriesPerRequest:null | unit | Check redis.ts + type verification | N/A — config |
| INFRA-05 | Graceful shutdown waits for in-flight jobs | manual/smoke | Code trace verification | N/A — shutdown |
| INFRA-06 | /health returns 200 + DB/Redis check | unit | `npm test --workspace=packages/api -- health.test.ts` | ❌ Wave 0 |
| INFRA-07 | Redis AOF appendfsync everysec | manual | Verify docker-compose.yml diff | N/A — config |
| INFRA-08 | Helmet headers present in responses | unit | `npm test --workspace=packages/api -- helmet.test.ts` | ❌ Wave 0 |
| INFRA-09 | Counter TTL set on campaign start | unit | `npm test --workspace=packages/api -- counter.test.ts` | ❌ Wave 0 |
| INFRA-10 | SES config set reads from env | unit | `npm test --workspace=packages/api -- ses-config.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test --workspace=packages/api`
- **Per wave merge:** `npm run test --workspace=packages/api && npm run test --workspace=packages/workers`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/routes/__tests__/health.test.ts` — covers INFRA-06 (DB+Redis check in /health)
- [ ] `packages/api/src/__tests__/cors.test.ts` — covers INFRA-02 (allowlist enforcement)
- [ ] `packages/api/src/__tests__/helmet.test.ts` — covers INFRA-08 (security headers present)
- [ ] Vitest config: `packages/api/vitest.config.ts` if not already present

Note: INFRA-01, INFRA-03, INFRA-04, INFRA-05, INFRA-07 are configuration/code-trace verifications, not behavior testable in unit tests without Docker. These are verified by code diff inspection and documented in the plan as "verify by inspection."

## Sources

### Primary (HIGH confidence)
- Codebase direct inspection — `docker-compose.yml`, `app.ts`, `health.ts`, `redis.ts`, `bulk-send.worker.ts`, `workers/index.ts`, `pgbouncer.ini`
- BullMQ documentation (training knowledge, v5.x): Worker graceful shutdown via `worker.close()`
- Redis documentation (training knowledge): `noeviction` policy semantics, AOF `appendfsync everysec`

### Secondary (MEDIUM confidence)
- @fastify/cors v10 docs: origin function signature `(origin, cb) => void`
- @fastify/helmet compatibility with Fastify 5.x (package not installed — must be added)
- PgBouncer transaction mode pool math: client connections vs server connections are independent

### Tertiary (LOW confidence)
- BullMQ 5.71 TypeScript type for `connection` field — needs verification against installed type definitions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use except @fastify/helmet; docker-compose config directly inspected
- Architecture: HIGH — all changes are to known files with known current state; patterns are well-established
- Pitfalls: HIGH — derived from direct code inspection and known Redis/CORS/BullMQ semantics

**Research date:** 2026-03-13
**Valid until:** 2026-06-13 (stable libraries; Redis/BullMQ configs don't change frequently)
