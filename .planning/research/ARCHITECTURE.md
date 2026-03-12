# Architecture Research

**Domain:** Email marketing platform (bulk send, tracking, segmentation, A/B testing)
**Researched:** 2026-03-13
**Confidence:** HIGH (based on direct codebase inspection)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Public Internet                          │
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                   │
│  ┌───────────▼──────────┐        ┌──────────────────────────┐   │
│  │      Nginx (TLS)     │        │  AWS SES (outbound mail) │   │
│  │   Port 80/443        │        │  AWS SNS (bounce/complain│   │
│  └───────────┬──────────┘        └────────────┬─────────────┘   │
│              │                                │                  │
│  ┌───────────▼──────────┐                     │                  │
│  │   Next.js Frontend   │                     │                  │
│  │  (App Router, SSR)   │                     │                  │
│  │  /api/proxy/* route  │                     │                  │
│  └───────────┬──────────┘                     │                  │
│              │ (HTTP, SSR server-side)         │                  │
│  ┌───────────▼──────────────────────────────▼─┤                  │
│  │          Fastify API (Port 3000)            │                  │
│  │  routes/ → services/ → Kysely → PgBouncer  │                  │
│  │  /t/o/* /t/c/* (tracking, no auth)         │                  │
│  └───────────┬──────────────────────────────┬─┘                  │
│              │                              │                    │
│  ┌───────────▼──────────┐   ┌──────────────▼─────────────────┐  │
│  │   Redis 7 (BullMQ)   │   │       PgBouncer (port 6432)    │  │
│  │   Job queues +       │   │       Transaction pool, 40 conn │  │
│  │   A/B holdback cache │   └──────────────┬─────────────────┘  │
│  └───────────┬──────────┘                  │                    │
│              │                   ┌──────────▼─────────────────┐  │
│  ┌───────────┴──────────────┐    │   PostgreSQL 16            │  │
│  │  Worker: bulk (WORKER_TYPE=bulk)│  events table (partitioned) │
│  │  - bulk-send.worker      │    │  GIN indexes on JSONB      │  │
│  │  - campaign-send.worker  │    │  daily stats aggregation   │  │
│  │  - ab-eval.worker        │    └────────────────────────────┘  │
│  │  - resend.worker         │                                    │
│  └──────────────────────────┘                                    │
│  ┌──────────────────────────┐                                    │
│  │  Worker: system (WORKER_TYPE=system)                          │
│  │  - import.worker         │                                    │
│  │  - webhook.worker        │                                    │
│  └──────────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| Nginx | TLS termination, reverse proxy, SSL offload | Frontend (port 3001), API (port 3000) |
| Next.js Frontend | UI rendering, `/api/proxy/*` relay to Fastify API | Fastify API via HTTP (SSR) or proxy route (browser) |
| Fastify API | Auth, CRUD, campaign dispatch, tracking pixel/click, SNS inbound | PgBouncer, Redis, (no direct SES — SES is workers-only) |
| BullMQ Queues (Redis) | Job persistence, concurrency control, retry semantics | API (enqueues), Workers (dequeues) |
| Worker: bulk | Individual email send, merge tags, tracking injection, SES call | SES, PgBouncer, Redis |
| Worker: system | CSV import processing, outbound webhook delivery | PgBouncer, Redis |
| PgBouncer | Transaction-mode connection pooling (40 server conns, 400 client) | PostgreSQL |
| PostgreSQL | Persistent storage — all entities, events, stats | PgBouncer |
| AWS SES | SMTP relay for transactional/bulk email | Workers only |
| AWS SNS | Push bounce/complaint notifications back to API | Fastify `/api/webhooks/sns` |
| `@twmail/shared` | Singleton DB/Redis connections, Kysely schema, enums, types | All packages import from here |

### Data Flow

#### Campaign Send Flow

```
User clicks "Send" in frontend
    ↓
POST /api/campaigns/:id/send (Fastify API)
    ↓
campaigns.service.ts: sendCampaign()
    - Resolves audience (segment or list → contact IDs)
    - Sets campaign.status = SENDING
    - Enqueues one CampaignSendJob into 'campaign-send' queue
    ↓
BullMQ 'campaign-send' queue (Redis)
    ↓
createCampaignSendWorker() picks up job
    - Iterates contacts, enqueues one BulkSendJob per contact
    - into 'bulk-send' queue
    ↓
BullMQ 'bulk-send' queue (Redis) — high concurrency
    ↓
createBulkSendWorker() picks up each per-contact job
    - Fetch contact + campaign from DB (via PgBouncer)
    - Process merge tags
    - Inject tracking pixel + rewrite links with /t/c/:messageId/:linkHash
    - Call AWS SES SendEmail
    - Insert message record + SENT event into DB
    ↓
campaign.status = SENT when all jobs complete
```

#### Tracking Flow (Open)

```
Recipient email client loads <img src="/t/o/:messageId.png">
    ↓
Fastify GET /t/o/:messageId.png (no auth, no rate limit)
    - Immediately returns 1x1 PNG (fast)
    - Fire-and-forget: recordOpen() async
        - Check IP prefix for Apple MPP → EventType.MACHINE_OPEN vs EventType.OPEN
        - Insert into events table
        - Increment campaign_stats_daily via upsert
```

#### Tracking Flow (Click)

```
Recipient clicks link (was rewritten to /t/c/:messageId/:linkHash)
    ↓
Fastify GET /t/c/:messageId/:linkHash (no auth, no rate limit)
    - Look up original URL from events table (metadata->'link_hash')
    - Record CLICK event in events table
    - 302 redirect to original URL
```

#### Bounce/Complaint Flow (SNS → API)

```
SES sends email → hard bounce or complaint
    ↓
AWS SNS HTTP notification → POST /api/webhooks/ses
    ↓
webhooks-inbound.ts:
    - Verify SNS signature (downloads + caches cert from amazonaws.com)
    - Parse notification type: Bounce | Complaint
    - Hard bounce → contact.status = BOUNCED, insert HARD_BOUNCE event
    - Complaint → contact.status = COMPLAINED, insert COMPLAINT event
    - Update message.status accordingly
```

#### A/B Test Flow

```
Campaign configured with 2-4 variants + holdback percentage
    ↓
Campaign send: bulk-send.worker routes each contact to a variant
    - Variant assignment by contact ID modulo
    - Holdback contacts stored in Redis key 'twmail:ab-holdback:{campaignId}'
    ↓
ab-eval.worker fires when test window closes
    - Fetches variant stats from DB
    - Calculates Bayesian win probabilities
    - Sets is_winner = true on winning variant
    - Sends remaining holdback contacts using winner variant
```

## Recommended Project Structure (Actual)

```
twmail/                         # Monorepo root
├── packages/
│   ├── api/                    # Fastify REST API
│   │   └── src/
│   │       ├── app.ts          # App factory — registers plugins + routes
│   │       ├── config.ts       # Env validation (getConfig())
│   │       ├── index.ts        # Process entrypoint
│   │       ├── plugins/        # Cross-cutting: auth, error-handler, rate-limit
│   │       ├── middleware/     # Per-request: requireAuth, API key check
│   │       ├── routes/         # Thin handlers — validate → call service
│   │       └── services/       # Business logic, DB queries (Kysely)
│   ├── workers/                # BullMQ worker processes
│   │   └── src/
│   │       ├── index.ts        # WORKER_TYPE dispatch (bulk | system)
│   │       ├── ses-client.ts   # AWS SES SDK wrapper
│   │       ├── merge-tags.ts   # Template variable substitution
│   │       ├── tracking.ts     # Pixel injection + link rewriting
│   │       └── workers/        # Individual worker factories
│   ├── frontend/               # Next.js 16 App Router
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (auth)/     # Login page (unauthenticated)
│   │       │   ├── (dashboard)/# Protected pages (campaigns, contacts, etc.)
│   │       │   └── api/proxy/  # Next.js route → relay to Fastify API
│   │       ├── components/     # Shared UI components (shadcn/ui base)
│   │       ├── hooks/          # React Query hooks per domain
│   │       └── lib/
│   │           ├── api-client.ts # Fetch wrapper (browser: /api/proxy, SSR: direct)
│   │           └── query-keys.ts # TanStack Query key factory
│   └── shared/                 # Zero-dependency shared package
│       └── src/
│           ├── db.ts           # Kysely singleton (getDb / destroyDb)
│           ├── redis.ts        # ioredis singleton (getRedis / destroyRedis)
│           ├── schema.ts       # Kysely Database interface (all tables)
│           └── types.ts        # Enums, domain types, pagination types
├── db/
│   └── migrations/             # Sequential SQL migration files (001_, 002_...)
├── docker-compose.yml          # All services: postgres, pgbouncer, redis, api, workers, frontend, nginx
└── nginx/                      # Nginx config + SSL cert paths
```

### Structure Rationale

- **routes/ vs services/:** Routes are thin — they parse input, call services, return output. All DB access and business logic lives in services. This keeps routes testable via service mocking.
- **@twmail/shared:** Singleton pattern (module-level `let db`) means connection pool is shared within a process. Each Docker container (api, worker-bulk, worker-system) gets its own pool — intentional.
- **WORKER_TYPE env var:** One Dockerfile, two containers with different startup branches. Avoids code duplication while allowing independent scaling of bulk-send vs system workers.
- **`/api/proxy` in Next.js:** Browser requests go to Next.js `/api/proxy` which relays to Fastify. SSR requests call Fastify directly via `API_URL`. This avoids CORS issues and keeps auth cookies scoped to the frontend domain.

## Architectural Patterns

### Pattern 1: Job Fan-Out (Campaign → Per-Contact Jobs)

**What:** A single "campaign send" job is enqueued, which the campaign-send worker expands into N per-contact "bulk-send" jobs — one per recipient.

**When to use:** When the recipient list is unknown at dispatch time (segments are dynamic), when you need per-contact retry granularity, and when you want backpressure via queue depth.

**Trade-offs:** High job volume for large lists (10K contacts = 10K Redis jobs). Adds Redis memory pressure. Gains: individual contact failures don't affect others, natural rate limiting via worker concurrency settings, observable progress via queue depth.

**Example:**
```typescript
// campaign-send.worker: fan-out
const contactIds = await resolveAudience(campaignId, db);
const bulkQueue = new Queue('bulk-send', { connection: redis });
const jobs = contactIds.map(id => ({
  name: 'send',
  data: { contactId: id, campaignId }
}));
await bulkQueue.addBulk(jobs);
```

### Pattern 2: Fire-and-Forget Tracking (Open Pixel)

**What:** The tracking pixel endpoint returns the image immediately, then records the open event asynchronously (`recordOpen().catch(() => {})`).

**When to use:** When the user-visible action (image delivery) must not be delayed by DB writes. Acceptable data loss risk (if the process crashes between pixel response and DB write) is tolerable for analytics.

**Trade-offs:** Pixel always fast. Risk of uncounted opens under crash conditions. No retry mechanism for failed writes. Correct for open tracking — incorrect for transactional data.

### Pattern 3: Shared Singleton Connections via Module Scope

**What:** `getDb()` and `getRedis()` in `@twmail/shared` use module-level `let` variables. First call initialises; subsequent calls return the same instance.

**When to use:** Any Node.js process where you want a single connection pool. Works because Node.js modules are cached after first `require`/`import`.

**Trade-offs:** Simple. No DI container needed. Risk: cannot create multiple pools with different configs in the same process. Test isolation requires manual `destroyDb()` calls between tests.

### Pattern 4: Numeric Enums in DB, Const Objects in TypeScript

**What:** DB stores `status` as `smallint` (e.g., `1=ACTIVE, 2=UNSUBSCRIBED`). TypeScript uses `const` objects (`ContactStatus.ACTIVE = 1`) rather than TypeScript `enum` keyword.

**When to use:** When DB storage efficiency matters and you want type safety without TypeScript enum pitfalls (const objects are narrowable, enumerable, and don't emit runtime code).

**Trade-offs:** DB values are opaque integers without the TypeScript context. Migrations adding new statuses require updating the const object in `@twmail/shared` too.

## Data Flow Summary

| Flow | Direction | Key Risk |
|------|-----------|----------|
| Campaign send dispatch | API → Redis → Worker-bulk → SES | Job loss if Redis crashes before persistence |
| Open tracking | SES email → recipient browser → API → PostgreSQL | Async write can be lost on process crash |
| Click tracking | SES email → recipient browser → API → PostgreSQL → 302 | Must look up original URL before redirect |
| Bounce/complaint | SES → SNS → API → PostgreSQL | SNS signature verification critical; cert cache in memory (lost on restart) |
| A/B holdback | Worker-bulk → Redis (set) → ab-eval worker → bulk-send | Redis key must survive between bulk-send and ab-eval job |
| Stats aggregation | events table → campaign_stats_daily (upsert) | Time-partitioned events table requires partition pruning in queries |
| Contact import | Frontend → API → Redis → import.worker → PostgreSQL | Large CSVs processed out-of-band; progress tracked in imports table |
| Outbound webhooks | API events → Redis → webhook.worker → external URL | Retry logic: 5 attempts, auto-disable after 50 consecutive failures |

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single org, <50K contacts | Current monolith is appropriate; no changes needed |
| Multiple orgs or >500K contacts | Add tenant_id column throughout; partition events by org+month; consider dedicated SES sending identity per org |
| >1M emails/month | Scale worker-bulk horizontally (multiple containers); tune BullMQ concurrency; SES rate limits become binding constraint (40/sec default, request increase) |

### Scaling Priorities

1. **First bottleneck: SES rate limit.** Default 40 emails/sec. At 10K contacts that's ~4 minutes minimum. Worker concurrency must be tuned below SES limit or sends fail. Current code does not expose concurrency as a config value — it should.
2. **Second bottleneck: PostgreSQL connection pressure.** PgBouncer pools 40 server connections shared across API + both workers. Under high load with many concurrent workers, connection wait queue grows. Tune `DEFAULT_POOL_SIZE` and `MAX_CLIENT_CONN` together.
3. **Third bottleneck: events table write volume.** Every open and click is a DB write. Time partitioning helps reads. Write bottleneck hits if open rate is high during large sends. Mitigation: batch event inserts or move to time-series DB (ClickHouse) for events only.

## Anti-Patterns

### Anti-Pattern 1: Checking Campaign Status in Every Per-Contact Job

**What people do:** Each bulk-send job re-fetches the campaign row to check if it's PAUSED or CANCELLED.

**Why it's wrong:** For a 10K contact send, this is 10K extra DB round-trips per campaign send. The campaign status rarely changes mid-send.

**Do this instead:** Cache the campaign status check at the campaign-send worker level. Only re-check periodically (e.g., every 100 jobs) or use a Redis flag that workers poll. Current code fetches campaign per job — this is a performance pitfall to flag in code review.

### Anti-Pattern 2: In-Memory Cert Cache for SNS Verification

**What people do:** Cache downloaded SNS signing certificates in a `Map` in process memory.

**Why it's wrong:** Cache is lost on every process restart. First request after restart always fetches from AWS. Under high bounce volume, cert fetches add latency. Cache is also not shared between multiple API instances.

**Do this instead:** The current implementation is acceptable for single-instance deployment. For multi-instance, move cert cache to Redis. Current TTL of 1 hour and max 20 entries is reasonable.

### Anti-Pattern 3: No Queue for Tracking Events

**What people do:** Write open/click events directly to DB synchronously (or fire-and-forget).

**Why it's wrong:** Under high open rates (e.g., large campaign triggers MPP from Apple), concurrent write spikes to `events` table. Fire-and-forget loses data on crash.

**Do this instead:** Enqueue tracking events to a lightweight Redis list or BullMQ queue, then batch-write to DB. Current implementation uses fire-and-forget, which is acceptable for single-org use but is a risk to document.

### Anti-Pattern 4: Mixing Auth Middleware Styles

**What people do:** Some routes use `app.addHook('preHandler', requireAuth)` at the plugin level; others may call it individually.

**Why it's wrong:** Inconsistency makes it easy to accidentally leave a route unauthenticated. The tracking routes (`/t/o/*`, `/t/c/*`) are intentionally unauthenticated — this must be explicit and clearly documented, not accidental.

**Do this instead:** In code review, verify every route plugin either (a) adds `requireAuth` as a preHandler at registration, or (b) is explicitly listed as a public route. No route should be unauthenticated by accident.

### Anti-Pattern 5: A/B Holdback Stored Only in Redis

**What people do:** Store the holdback contact list as a Redis key (`twmail:ab-holdback:{campaignId}`).

**Why it's wrong:** If Redis is flushed, restarted, or the key expires, the holdback list is gone. The ab-eval worker will find no holdback contacts and silently skip the holdback send.

**Do this instead:** Persist holdback contact IDs to the `messages` table (with a `holdback` status) at job time, or store them in `campaign_variants` metadata in PostgreSQL. Redis should be the cache, not the system of record for campaign data.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| AWS SES | SDK (`@aws-sdk/client-ses`) — called from workers only | Rate limit: 40/sec configurable; must handle `MessageRejected`, `Throttling` errors |
| AWS SNS | Push webhook — SES notifies `POST /api/webhooks/ses` | Must verify signature using downloaded cert; cert URL must match `sns.*.amazonaws.com` |
| Google Analytics | Client-side via UTM parameters injected into links | No server-side integration; UTM params appended during bulk-send link rewrite |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Frontend ↔ API (browser) | HTTP via `/api/proxy/*` Next.js route | Cookies passed through; auth scoped to frontend domain |
| Frontend ↔ API (SSR) | Direct HTTP to `http://api:3000` via `API_URL` env | Same Fastify API; different network path |
| API → Workers | BullMQ queue via Redis | Queues: `campaign-send`, `bulk-send`, `ab-eval`, `resend`, `import`, `webhook-delivery` |
| Workers → DB | Kysely via PgBouncer | Same `@twmail/shared` singleton; each worker container has its own pool (up to 20 conns) |
| Workers → SES | AWS SDK direct call | No queue — SES is called synchronously within the job |
| shared ↔ all packages | npm workspace package import | `@twmail/shared` — singleton DB/Redis, enums, schema types |

## Code Review Checklist for This Architecture

When reviewing this codebase for production readiness, focus on:

1. **Authentication surface area.** Every route plugin must explicitly opt-in to auth OR be listed as a known-public route. Verify tracking routes, health endpoint, and SNS webhook are the only unauthenticated surfaces.

2. **BullMQ job durability.** Are jobs added with `removeOnComplete` and `removeOnFail` configured? Jobs that accumulate in Redis cause memory bloat. Are failed jobs retried with backoff?

3. **SES error handling in bulk-send.worker.** What happens when SES returns `Throttling`? Does the job retry with delay? What happens to the campaign if SES rejects the sender identity?

4. **Segment resolution at send time vs job creation time.** Dynamic segments are resolved when the campaign-send job runs. If the segment changes between scheduling and actual send, recipients may differ from preview. This is expected behaviour but should be documented.

5. **A/B holdback durability.** Holdback contact list stored in Redis only — document the risk and consider PostgreSQL fallback.

6. **Connection pool sizing.** API has `max: 20` in the pg Pool (shared.db.ts), Worker-bulk has the same, Worker-system has the same. PgBouncer has `DEFAULT_POOL_SIZE=40`. With three containers each requesting up to 20 connections, theoretical max is 60 — 20 more than PgBouncer's configured server pool. Under load this causes connection wait queues. Recommend reducing API pool to 10 or increasing PgBouncer pool size.

7. **Per-contact campaign fetch in bulk-send.worker.** Each job fetches the campaign row. At large scale this is unnecessary DB load — the campaign rarely changes mid-send.

8. **SNS cert cache in memory.** Acceptable for single-instance. Document that scaling to multiple API containers creates per-instance caches.

9. **Error response shape consistency.** All errors should return `{ error: { code, message, details? } }`. Verify no route returns bare strings or non-standard shapes.

10. **TypeScript strictness.** Check `tsconfig.base.json` for `strict: true`. Verify no `any` escapes in service layer — particularly in JSONB handling (`content_json`, `ab_test_config`, `resend_config`).

## Sources

- Direct codebase inspection: `packages/api/src/`, `packages/workers/src/`, `packages/shared/src/`, `docker-compose.yml`
- BullMQ architecture: job fan-out and queue concurrency patterns are standard BullMQ usage (HIGH confidence — no external source needed, pattern is explicit in codebase)
- PostgreSQL connection pool sizing: standard PgBouncer transaction-mode arithmetic (HIGH confidence)
- AWS SES rate limits: 40 emails/sec default is documented SES sandbox/production default (MEDIUM confidence — verify against current AWS docs for this account's sending limit)

---
*Architecture research for: Third Wave Mail — email marketing platform*
*Researched: 2026-03-13*
