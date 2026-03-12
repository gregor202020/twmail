# Stack Research

**Domain:** Email marketing platform — production readiness audit
**Researched:** 2026-03-13
**Confidence:** HIGH (core stack already fixed; recommendations verified against official docs)

---

## Context

Third Wave Mail is a complete email marketing platform built on Fastify + Next.js 16 + BullMQ + Kysely + PostgreSQL 16 + Redis 7 + AWS SES. This research does NOT re-evaluate those choices — they are sound. The focus is what tooling, configuration, and patterns are needed to take this codebase to a production-ready state through a code quality audit and production hardening milestone.

---

## Existing Stack (Confirmed Sound)

| Technology | Version | Production Status |
|------------|---------|-------------------|
| Fastify | Latest v5.x | Solid — fast, schema-validated, TypeScript-native |
| Next.js App Router | 16.x | Solid — server components, built-in optimization |
| BullMQ | Latest v5.x | Solid — Redis-backed, supports concurrency and retries |
| Kysely | Latest | Solid — type-safe SQL, no codegen footgun |
| PostgreSQL | 16 | Solid — partitioned events table, GIN indexes appropriate |
| PgBouncer | Latest | Solid — transaction pooling needed for worker + API load |
| Redis | 7 | Solid — BullMQ dependency, must be configured correctly |
| AWS SES + SNS | — | Solid — industry standard for transactional/marketing email |
| Tailwind CSS | v4 | Solid — utility-first, co-located with shadcn/ui |
| shadcn/ui | Latest | Solid — headless-compatible, copy-paste ownership model |

---

## Recommended Stack: Code Quality & Production Readiness Layer

These are the tools and configurations needed for the audit milestone. They either don't exist yet in the project or need specific configuration hardening.

### Code Quality Tools

| Tool | Version | Purpose | Why Recommended |
|------|---------|---------|-----------------|
| ESLint v9 | ^9.x | Lint TypeScript across monorepo | Flat config format is now stable; typescript-eslint v8 is the standard integration. Catches type-unsafe patterns Jest/Vitest won't. |
| typescript-eslint | ^8.x | Type-aware lint rules | Enables rules like `no-floating-promises`, `no-unsafe-assignment` — critical for catching async bugs in Fastify handlers and BullMQ workers. |
| Prettier | ^3.x | Consistent formatting | Single source of truth across API, frontend, workers. Integrate with ESLint via `eslint-config-prettier` to avoid rule conflicts. |
| Vitest | ^2.x | Unit + integration tests | Native ESM + TypeScript with zero config. 4x faster cold runs than Jest. Use for Fastify route handlers, BullMQ worker logic, and Kysely query helpers. |
| @vitest/coverage-v8 | ^2.x | Coverage reporting | V8 native coverage — no Istanbul transform overhead. Integrates with Vitest config directly. |
| lint-staged + husky | Latest | Pre-commit enforcement | Run ESLint + Prettier on staged files only. Prevents bad code from entering the repo. |

### Production Configuration: Fastify

| Setting | Recommendation | Why |
|---------|---------------|-----|
| `logger: pino` | Enable with `level: 'info'` in prod, `'debug'` in dev | Pino is built in; it's the fastest Node.js logger and outputs structured JSON for log aggregators. |
| `host: '0.0.0.0'` | Bind to all interfaces, not `127.0.0.1` | Docker containers and Kubernetes readiness probes require this. Binding to localhost causes silent 502s. |
| JSON Schema validation | Define for every route input | Pre-compiled schemas reduce validation overhead and provide the only runtime type guarantee (TypeScript erases at compile time). |
| `@fastify/helmet` | Add security headers plugin | Sets X-Frame-Options, X-Content-Type-Options, and CSP headers. One plugin call covers all standard headers. |
| `@fastify/rate-limit` | Already present — audit config | Ensure per-route limits are appropriate; sending endpoints need tighter limits than read endpoints. |
| Graceful shutdown | Hook `SIGTERM`/`SIGINT` | Drain in-flight requests before exit. Without this, load balancer restarts drop active requests. |
| Health check route | `GET /health` returning 200 | Required for Docker `HEALTHCHECK`, Nginx upstream checks, and monitoring uptime. Must be unauthenticated. |

### Production Configuration: BullMQ + Redis

| Setting | Recommendation | Why |
|---------|---------------|-----|
| `maxmemory-policy: noeviction` | Set in Redis config | **Critical.** Any eviction policy other than `noeviction` lets Redis silently delete queued jobs. BullMQ cannot recover from this. |
| Redis AOF persistence | Enable with `appendfsync everysec` | Survives Redis restarts without losing queued jobs. One-second sync is the right balance of durability vs. performance. |
| `maxRetriesPerRequest: null` on Workers | Set in IORedis client for workers | Default behavior raises exceptions on Redis disconnection, breaking the worker loop. `null` means workers wait indefinitely for reconnection. |
| `enableOfflineQueue: false` on Queue | Set in IORedis client for Queue producers | Queue-side calls should fail fast during Redis outage so callers get a clear error. Workers should wait; producers should fail. |
| Job auto-removal | `removeOnComplete: { count: 1000 }`, `removeOnFail: { count: 5000 }` | Prevents Redis memory bloat from accumulating completed/failed job records. Keep enough history for debugging. |
| Graceful worker shutdown | `worker.close()` on SIGTERM/SIGINT | Marks in-progress jobs correctly. Without this, jobs stall for ~30 seconds before auto-recovery. |
| `uncaughtException`/`unhandledRejection` handlers | Add to all worker entry points | Worker processes that crash silently leave stalled jobs and no log trail. |

### Production Configuration: PostgreSQL + PgBouncer

| Setting | Recommendation | Why |
|---------|---------------|-----|
| PgBouncer mode | Transaction pooling (`pool_mode = transaction`) | Most efficient for API + worker patterns where connections are grabbed per-query, not per-session. Note: prepared statements don't work in transaction pooling — Kysely's parameterized queries are compatible. |
| `max_client_conn` | Set to expected peak concurrent connections across all services | Prevents connection exhaustion under load. Formula: (API workers × max requests in flight) + (BullMQ workers × concurrency). |
| `server_pool_size` | Keep PostgreSQL connections low (10–20 per database) | PostgreSQL forks a process per connection; too many connections degrade performance faster than too few. |
| Index maintenance | Verify `ANALYZE` runs on partitioned events table | Query planner uses stale statistics on partitioned tables if autovacuum is misconfigured. |
| Statement timeouts | `statement_timeout = 30s` at application role level | Long-running queries from bad segments or analytics should not block OLTP operations. |

### Production Configuration: AWS SES + SNS

| Setting | Recommendation | Why |
|---------|---------------|-----|
| Bounce rate threshold | Alert at 3%, hard-stop at 5% | AWS reviews accounts above 5% bounce rate and suspends above 10%. CloudWatch alarm on `ses:Reputation.BounceRate` metric. |
| Complaint rate threshold | Alert at 0.08%, review at 0.1% | AWS requires complaint rate below 0.1%. Gmail/Yahoo enforce stricter thresholds for inbox placement. |
| SNS webhook verification | Verify `x-amz-sns-message-type` headers and certificate signature | SNS delivers bounce/complaint notifications via HTTP POST; without verification, any caller can spoof suppression events. |
| Hard bounce suppression | Immediately add to suppression list on permanent bounce | Resending to hard-bounced addresses after the first failure harms sender reputation with no upside. |
| Complaint suppression | Immediately unsubscribe contacts who mark as spam | Non-negotiable. Both AWS policy and good sender hygiene. |
| SPF + DKIM + DMARC | Verify DNS records are published | SPF and DKIM are required for SES sending. DMARC (`p=quarantine` minimum) improves inbox placement with major providers. |
| Dedicated IP | Evaluate for higher volume sending | Shared SES IPs carry reputation from all SES users. Dedicated IPs isolate your sending reputation. |

### Observability Stack

| Tool | Purpose | Why |
|------|---------|-----|
| Pino (built-in to Fastify) | Structured JSON logs | Already integrated. Ensure `serializers` are configured to redact PII (email addresses, JWT tokens) from logs. |
| `pino-pretty` | Dev log formatting | Dev-only transport for readable logs. Never use in production — it serializes synchronously and kills throughput. |
| OpenTelemetry (`@opentelemetry/sdk-node`) | Distributed tracing | Correlates a single email send across API → BullMQ job → SES call with a single trace ID. Use with any backend (Jaeger, Datadog, Grafana Tempo). |
| Sentry (`@sentry/node` + `@sentry/nextjs`) | Error tracking | Captures uncaught exceptions, unhandled promise rejections, and slow transactions with full stack traces. Free tier sufficient for single-org usage. |
| Better Stack / Uptime Robot | Uptime monitoring | External health check hitting `/health` endpoint. Alerts before users notice downtime. |

### Security Audit Libraries

| Tool | Purpose | Why |
|------|---------|-----|
| `npm audit` | Dependency vulnerability scan | Run in CI. Fail build on `high` or `critical` severity findings. |
| `@fastify/helmet` | HTTP security headers | Covers OWASP top security headers in one plugin. |
| `zod` or Fastify JSON Schema | Input validation at API boundary | TypeScript types are erased at runtime. Every external input needs runtime validation. The project uses Fastify schemas — audit coverage completeness. |
| `semgrep` | SAST static analysis | Catches hardcoded secrets, SQL injection patterns, and common Node.js security anti-patterns. Can be run locally and in CI without cloud account. |

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@fastify/helmet` | ^12.x | Security headers | Add if not already present; one-line plugin registration |
| `@fastify/sensible` | ^6.x | Fastify HTTP error helpers | Provides `reply.notFound()`, `reply.badRequest()` etc. Avoids inconsistent error response shapes |
| `kysely-codegen` | Latest | Generate Kysely types from live DB | Use if DB schema has drifted from TypeScript types; run once and compare |
| `pino-opentelemetry-transport` | Latest | Inject OTel trace IDs into Pino logs | Correlates log lines with distributed traces |
| `bullmq-pro` | — | Advanced BullMQ features | Skip — not needed for this scale. Open-source BullMQ covers all requirements |
| `@sentry/node` | ^8.x | API error tracking | Fastify plugin available; captures request context automatically |
| `@sentry/nextjs` | ^8.x | Frontend + SSR error tracking | Wizard setup; instruments both server and client sides |

---

## Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `tsx` or `ts-node` | Run TypeScript scripts | Use `tsx` — it uses esbuild and is ~5x faster than ts-node for scripts and dev server startup |
| `@next/bundle-analyzer` | Analyze Next.js JS bundle | Run before production deploy; catches accidental client-side inclusion of server-only packages |
| `autocannon` or `k6` | Load test Fastify API | Validate rate limiting works under real concurrency before deploying to production |
| `redis-cli MONITOR` | Debug Redis/BullMQ job flow | Essential for diagnosing stalled jobs during dev; never leave enabled in production (performance impact) |
| `pg_stat_statements` | PostgreSQL query analysis | Extension ships with PG16; reveals slow queries in production without query logging overhead |
| `pgbadger` | Parse PostgreSQL logs | Generates HTML reports from PG slow query logs; useful for initial production tuning |

---

## Installation

```bash
# Code quality
npm install -D eslint@^9 @eslint/js typescript-eslint@^8 prettier eslint-config-prettier
npm install -D vitest @vitest/coverage-v8
npm install -D lint-staged husky

# Fastify production plugins
npm install @fastify/helmet @fastify/sensible

# Observability
npm install @sentry/node @sentry/nextjs
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node pino-opentelemetry-transport

# Dev tools
npm install -D @next/bundle-analyzer tsx
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Vitest | Jest | Only if the project already has heavy Jest investment (mocks, snapshot tests). For a greenfield test setup in a Vite/TS monorepo, Vitest wins on speed and config simplicity. |
| ESLint v9 flat config | ESLint v8 legacy config | Only if migrating a large existing `.eslintrc` is too disruptive. ESLint v8 receives only security fixes now. |
| Pino + OTel | Winston | Winston is more flexible but lacks pino's performance. In a Fastify app, pino is already integrated — don't introduce a second logger. |
| Sentry | Datadog APM | Datadog is better for large teams with existing Datadog infrastructure. Sentry is lower friction and free for this use case. |
| `@fastify/helmet` | Manual header setting | Manual is error-prone; helmet is maintained by the Fastify team and covers edge cases. |
| Transaction pooling (PgBouncer) | Session pooling | Session pooling is simpler but wastes connections. Transaction pooling is correct for API + worker patterns; Kysely's parameterized queries are compatible. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `pino-pretty` in production | Synchronous serialization kills throughput — documented in Pino's own README | Raw JSON logs piped to a log aggregator (Loki, Datadog Logs, CloudWatch) |
| `maxmemory-policy` other than `noeviction` on BullMQ Redis | Redis will silently evict job keys, causing phantom job loss with no error | Set `maxmemory-policy noeviction` in Redis config |
| Prepared statements with PgBouncer transaction pooling | PgBouncer doesn't route `PREPARE`/`EXECUTE` correctly in transaction mode; causes "prepared statement does not exist" errors | Kysely uses parameterized queries (not prepared statements) — compatible by default |
| `ts-node` for scripts | 5-10x slower than `tsx` for startup; struggles with ESM | `tsx` — drop-in replacement using esbuild |
| Global error pages without `global-error.tsx` in Next.js | Root layout errors have no fallback without this file; entire app goes blank | Add `app/global-error.tsx` as documented in Next.js 16 production checklist |
| Hard-coding SES credentials | Credential exposure risk | Use IAM roles (EC2 instance profile or ECS task role) or environment variables injected at deploy time |
| Storing sensitive data in BullMQ job payloads | Job data persists in Redis and is visible in Bull board UIs | Store a reference ID in the job; fetch sensitive data from the DB inside the worker |

---

## Stack Patterns by Context

**For BullMQ worker processes (separate Node.js process):**
- Separate IORedis client with `maxRetriesPerRequest: null` and `enableOfflineQueue: true`
- Own Pino logger instance (not shared with Fastify)
- Own Sentry initialization with `dsn` and `environment` matching API service
- SIGTERM/SIGINT → `worker.close()` → process.exit

**For Fastify API process:**
- IORedis client with `maxRetriesPerRequest: 3` and `enableOfflineQueue: false` for queue producers
- Pino with `redact: ['req.headers.authorization', 'req.body.password']`
- `@fastify/helmet` registered before routes
- Health check route at `/health` registered before auth middleware

**For Next.js frontend:**
- `output: 'standalone'` in `next.config.js` for minimal Docker image
- `@sentry/nextjs` via wizard (instruments both RSC and client)
- `NEXT_PUBLIC_*` prefix only for variables safe to expose; all others server-only
- `app/global-error.tsx` as root error boundary

**For Docker Compose production:**
- Nginx with security headers (`X-Frame-Options DENY`, `X-Content-Type-Options nosniff`, `Strict-Transport-Security`)
- Nginx rate limiting (`limit_req_zone`) as defense-in-depth behind Fastify's own rate limiting
- Read-only container filesystems for worker containers (they don't write to disk)
- Resource limits (`mem_limit`, `cpus`) on all containers to prevent one service starving others

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Next.js 16 | React 19 | App Router required; Pages Router is legacy |
| typescript-eslint v8 | ESLint v9 | ESLint v8 uses legacy config format; must use ESLint v9 flat config with typescript-eslint v8 |
| BullMQ v5+ | Redis 7 | BullMQ v5 requires Redis 7.2+ for some features; Redis 7 in the stack is compatible |
| `@sentry/nextjs` v8 | Next.js 15+ | Sentry v7 does not support App Router fully; must use v8+ |
| PgBouncer transaction mode | Kysely | Kysely uses parameterized queries, not `PREPARE`, so it's safe in transaction pooling mode |
| Node.js >=22 | All packages above | Project already requires Node 22; no compatibility issues with any listed tooling |

---

## Sources

- [BullMQ — Going to Production](https://docs.bullmq.io/guide/going-to-production) — Redis `noeviction`, graceful shutdown, `maxRetriesPerRequest: null` — HIGH confidence
- [Fastify — Deployment Recommendations](https://fastify.dev/docs/latest/Guides/Recommendations/) — Host binding, vCPU sizing, reverse proxy — HIGH confidence (official docs)
- [Next.js — Production Checklist](https://nextjs.org/docs/app/guides/production-checklist) — global-error.tsx, CSP, bundle analysis, environment variables — HIGH confidence (official docs, updated 2026-02-27)
- [AWS SES Bounce/Complaint Documentation](https://docs.aws.amazon.com/ses/latest/dg/send-email-concepts-deliverability.html) — Threshold enforcement, SNS handling — HIGH confidence (official AWS docs)
- [Fastify — Logging Reference](https://fastify.dev/docs/latest/Reference/Logging/) — Pino integration, serializers, transports — HIGH confidence (official docs)
- [PgBouncer Configuration](https://www.pgbouncer.org/config.html) — Pool modes, transaction pooling compatibility — HIGH confidence (official docs)
- [Vitest](https://vitest.dev/) — ESM native, TypeScript support, coverage — HIGH confidence (official docs)
- [typescript-eslint v8](https://typescript-eslint.io/) — Flat config, type-aware rules — HIGH confidence (official docs)
- [pino-opentelemetry-transport](https://github.com/open-telemetry/opentelemetry-js-contrib) — OTel trace correlation — MEDIUM confidence (verified via multiple community sources)
- [AWS SES Best Practices — ElasticScale](https://elasticscale.com/blog/aws-ses-best-practices-increase-sending-limits-improve-deliverability/) — Deliverability thresholds — MEDIUM confidence (cross-referenced with AWS docs)

---

*Stack research for: Third Wave Mail — production readiness audit milestone*
*Researched: 2026-03-13*
