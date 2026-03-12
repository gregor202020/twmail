# Project Research Summary

**Project:** Third Wave Mail
**Domain:** Email marketing platform (self-hosted, single-org, AWS SES)
**Researched:** 2026-03-13
**Confidence:** HIGH

## Executive Summary

Third Wave Mail is a feature-complete email marketing platform built on a sound production stack (Fastify + Next.js 16 + BullMQ + Kysely + PostgreSQL 16 + Redis 7 + AWS SES). This is not a greenfield build — it is a pre-ship production hardening milestone. The research objective was to identify: (1) what tooling gaps need to close before launch, (2) which features carry legal or deliverability risk if broken, and (3) where the codebase contains functional bugs or dangerous technical shortcuts that will cause real-world failures.

The recommended approach is a structured code quality and production readiness audit, not further feature development. The platform achieves Mailchimp-equivalent feature parity for a v1 self-hosted product. What separates it from launch-ready is a set of critical correctness and durability gaps identified via direct codebase inspection: a functional bug where campaign sends are dispatched via raw Redis LPUSH rather than a BullMQ queue (campaigns silently never send), no idempotency guard against duplicate email sends on worker retry, A/B holdback contacts stored only in Redis with no database fallback (silently lost on eviction), and a CORS wildcard that allows any origin to make credentialed API requests in production.

The key risk category is legal and deliverability exposure from compliance gaps rather than feature gaps: RFC 8058 header presence on every outbound email, SNS bounce/complaint handler idempotency, import flows that must not re-subscribe suppressed contacts, and SES rate limit compliance in the worker concurrency model. Apple MPP machine open detection correctness is the single highest-leverage correctness check because it gates A/B test winner logic, resend-to-non-openers, and open rate reporting simultaneously. The roadmap should treat these compliance and correctness issues as Phase 1 blockers, then progress to production infrastructure hardening, followed by observability and operational readiness.

## Key Findings

### Recommended Stack

The core stack is confirmed sound and requires no technology changes. The audit milestone needs a production readiness layer added on top of the existing stack. See `.planning/research/STACK.md` for full details.

**Tooling additions required:**
- ESLint v9 + typescript-eslint v8: type-aware lint rules that catch `no-floating-promises` and `no-unsafe-assignment` — critical for async bugs in Fastify handlers and BullMQ workers
- Vitest v2 + @vitest/coverage-v8: native ESM + TypeScript with zero config; 4x faster than Jest for this monorepo setup
- lint-staged + husky: pre-commit enforcement to prevent bad code entering the repo
- @fastify/helmet: security headers in one plugin call (currently missing or needs verification)
- Sentry (@sentry/node + @sentry/nextjs v8): error tracking across API, workers, and frontend
- OpenTelemetry: distributed tracing to correlate a single email send across API → BullMQ → SES

**Critical configuration changes (not optional):**
- Redis `maxmemory-policy` must be `noeviction` — current config uses `allkeys-lru` which will silently evict BullMQ job keys and A/B holdback data
- Redis AOF persistence with `appendfsync everysec` for job durability
- Fastify CORS `origin` must be an explicit allowlist (currently `origin: true` in production — a security hole)
- BullMQ worker IORedis client must have `maxRetriesPerRequest: null` so workers wait through Redis disconnections rather than throwing
- PgBouncer connection pool arithmetic is currently misconfigured: 3 containers each requesting up to 20 connections = 60 theoretical max against a 40-connection server pool; reduce API pool to 10 or increase PgBouncer pool size

### Expected Features

The feature set is complete. The audit frame is: which existing features must be verified as correct before launch, and which are at risk of legal or deliverability failure. See `.planning/research/FEATURES.md` for full details.

**Must pass for launch (P1 — legal, deliverability, or data integrity risk):**
- SNS bounce/complaint handler — idempotency, hard vs soft bounce distinction, suppression write atomicity
- Unsubscribe flow end-to-end — link click to status update to RFC 8058 server POST to no re-subscription via import
- RFC 8058 `List-Unsubscribe` and `List-Unsubscribe-Post` headers on every outbound email
- Physical mailing address enforced at send layer (not template layer only)
- MPP machine open detection — correct user-agent matching, propagated to A/B winner logic
- Campaign state machine under failure — worker crash must not leave campaigns stuck in SENDING forever
- SES rate limit compliance — worker concurrency must stay under 40 emails/sec default limit
- Import flow must not overwrite bounced/unsubscribed/complained contact status

**Should be verified before launch (P2):**
- Click tracking redirect URL preservation through encoding and UTM params
- MJML output validity across all editor block combinations
- Segment query AND/OR precedence correctness
- Scheduled timezone conversion at schedule-time not evaluation-time
- A/B test statistical significance formula and minimum sample size guard

**Deferred (v1.x post-launch):**
- CloudWatch alarm integration for bounce rate thresholds
- Engagement-based sunset policies
- Suppression list export for compliance evidence

**Future (v2+):**
- Automation workflows (database tables exist; feature needs design and build)
- Multi-tenant / SaaS mode
- Predictive send-time optimization

### Architecture Approach

The architecture is a well-structured monorepo (packages/api, packages/workers, packages/frontend, packages/shared) with clear component boundaries. The job fan-out pattern (one campaign-send job expands into N per-contact bulk-send jobs) is the correct approach for this domain. The `@twmail/shared` singleton pattern for DB and Redis connections is correct and intentional — each Docker container gets its own pool. See `.planning/research/ARCHITECTURE.md` for full details.

**Major components:**
1. Nginx — TLS termination and reverse proxy; must add security headers and rate limiting as defense-in-depth
2. Next.js Frontend (App Router) — UI rendering with `/api/proxy/*` relay to Fastify; eliminates CORS issues
3. Fastify API — auth, CRUD, campaign dispatch, tracking pixel/click endpoints, SNS inbound webhook
4. BullMQ + Redis — job persistence with concurrency control and retry semantics across 6 named queues
5. Worker: bulk — per-contact email send, merge tag processing, tracking injection, SES call
6. Worker: system — CSV import processing and outbound webhook delivery
7. PgBouncer — transaction-mode connection pooling (currently misconfigured pool sizes)
8. PostgreSQL 16 — persistent storage with partitioned events table and GIN indexes

**Key architectural risks identified by direct codebase inspection:**
- Campaign send dispatched via `redis.lpush` not BullMQ `Queue.add()` — BullMQ worker never receives the job
- A/B holdback contacts stored only in Redis key `twmail:ab-holdback:{campaignId}` — no DB persistence fallback
- No `UNIQUE` constraint on `messages(campaign_id, contact_id)` — worker retry causes duplicate send
- Per-contact campaign row fetch in bulk-send.worker — 10K contacts = 10K unnecessary DB round-trips
- SNS cert cache in process memory — lost on restart, creates latency spike under high bounce volume

### Critical Pitfalls

The following are the highest-severity issues identified by direct codebase review. See `.planning/research/PITFALLS.md` for full details including warning signs and recovery strategies.

1. **Campaign send dispatched via `redis.lpush` not BullMQ queue** — Replace `redis.lpush('twmail:campaign-send', ...)` in `campaigns.service.ts` with `Queue.add()`. This is a functional bug: campaigns will silently never send. Verify end-to-end with a test campaign.

2. **Duplicate email sends on worker retry** — Add `UNIQUE` constraint on `messages(campaign_id, contact_id)` and check `ses_message_id` before calling SES. BullMQ guarantees at-least-once delivery; without this guard, contacts receive duplicate emails on any worker failure.

3. **A/B holdback contacts silently lost on Redis eviction** — Current `allkeys-lru` Redis policy can evict the holdback key. Store holdback contact IDs in PostgreSQL (`campaign_holdback_contacts` table), not Redis-only. The ab-eval worker silently does nothing if the key is missing.

4. **Redis campaign completion counter race condition** — The `twmail:remaining:{campaignId}` counter has no TTL and is not atomically checked. If evicted (due to `allkeys-lru`), `decr` on a missing key returns `-1`, which satisfies `<= 0` and triggers premature `SENT` status. Use `noeviction` policy and a Lua script for atomic decrement-and-check.

5. **CORS wildcard with credentials enabled** — `origin: true` with `credentials: true` reflects any origin in `Access-Control-Allow-Origin`, allowing cross-site credentialed requests to the API. Replace with explicit `CORS_ORIGIN` env var allowlist.

6. **Silent `.catch(() => {})` swallowing errors** — Fire-and-forget DB update failures are silently ignored throughout the codebase, causing campaign counter drift and making debugging impossible. Replace with `.catch(err => logger.error(err))` at minimum.

7. **SES configuration set name `'marketing'` hardcoded** — If this configuration set does not exist in the target AWS account, sends fail silently. Must be verified before first production deploy.

## Implications for Roadmap

Based on combined research, the recommended phase structure is:

### Phase 1: Critical Bug Fixes and Compliance Hardening

**Rationale:** Three issues in this phase will cause complete send failures or legal liability if not fixed before any production traffic. The LPUSH/BullMQ mismatch means campaigns literally never send. The duplicate send bug means contacts get double-emailed on any worker failure. The compliance gaps (RFC 8058, SNS idempotency, import suppression) create direct legal and AWS account risk. These must come first because everything else builds on a working send pipeline.

**Delivers:** A functionally correct, legally compliant send pipeline

**Addresses:** P1 features from FEATURES.md (bounce suppression, unsubscribe compliance, RFC 8058 headers)

**Fixes required:**
- Replace `redis.lpush` with `Queue.add()` in `campaigns.service.ts`
- Add `UNIQUE` constraint on `messages(campaign_id, contact_id)` + SES idempotency check
- Fix SNS handler idempotency (check `ses_message_id` before inserting duplicate events)
- Verify RFC 8058 `List-Unsubscribe-Post` header on every outbound email
- Enforce physical mailing address at send layer
- Verify import flow rejects overwriting suppressed contact status
- Verify scheduled campaign trigger exists (research indicates this scheduler path may be absent)

**Avoids:** Pitfall 6 (LPUSH bug), Pitfall 1 (duplicate sends), Pitfall 3 (SES account suspension)

### Phase 2: Data Integrity and Correctness Audit

**Rationale:** After the send pipeline is correct, the next highest risk is data integrity failures that produce wrong business decisions: A/B winners declared from inflated MPP data, A/B holdback contacts lost to Redis eviction, counters drifting silently from catch-swallowing, and click tracking doing full table scans. These don't prevent sending but make the analytics untrustworthy.

**Delivers:** Accurate analytics, reliable A/B testing, and durable A/B holdback data

**Addresses:** P1/P2 features from FEATURES.md (MPP detection, A/B test logic, click tracking)

**Fixes required:**
- Verify MPP machine open detection user-agent logic is correct and propagated to A/B winner logic
- Move A/B holdback contacts to PostgreSQL (away from Redis-only storage)
- Replace all `.catch(() => {})` with `.catch(err => logger.error(err))` across service and worker layer
- Fix click tracking redirect to query `SENT` event `link_map` first (not events table first)
- Audit A/B test statistical significance formula and minimum sample size guard
- Verify segment query AND/OR precedence produces correct contact lists
- Verify segment query counts match actual send counts

**Avoids:** Pitfall 4 (counter drift), Pitfall 5 (holdback loss), Pitfall 8 (click tracking query)

### Phase 3: Production Infrastructure and Security

**Rationale:** Once the application logic is correct, the infrastructure layer needs hardening before exposing to production traffic. This phase addresses the CORS security hole, Redis memory policy, PgBouncer pool misconfiguration, and missing observability tooling. These are not correctness bugs in the application logic but they will cause failures under load or expose attack surface.

**Delivers:** Secure, production-stable infrastructure configuration

**Addresses:** Security and operational requirements from STACK.md

**Changes required:**
- Fix Redis `maxmemory-policy` from `allkeys-lru` to `noeviction` (or prefix-targeted `volatile-lru`)
- Fix CORS `origin: true` to explicit allowlist via `CORS_ORIGIN` env var
- Fix PgBouncer + application pool sizing (reduce API pool from 20 to 10 connections)
- Add `maxRetriesPerRequest: null` on worker IORedis clients
- Add `SIGTERM`/`SIGINT` graceful shutdown to Fastify and all worker processes
- Verify `GET /health` endpoint is present, unauthenticated, and returns 200
- Verify Bull Board is functional (currently a placeholder container)
- Configure Redis AOF persistence (`appendfsync everysec`)
- Add Fastify `@fastify/helmet` for security headers if not present
- Fix Redis counter TTL and atomic decrement-and-check for campaign completion

**Avoids:** Pitfall 7 (CORS wildcard), Pitfall 2 (counter race condition)

### Phase 4: Code Quality and Testing Infrastructure

**Rationale:** Once the runtime is correct and infrastructure is solid, add automated enforcement to prevent regressions. This phase installs and configures the testing and lint tooling. It also adds the TypeScript strictness audit and removes `any` escapes in the service and worker layers. Without this phase, the same bugs can re-enter on the next code change.

**Delivers:** Automated quality gates: lint, type safety, test coverage, pre-commit hooks

**Addresses:** Stack recommendations from STACK.md (ESLint v9, typescript-eslint v8, Vitest, lint-staged)

**Changes required:**
- Install and configure ESLint v9 flat config with typescript-eslint v8
- Configure Prettier with `eslint-config-prettier` integration
- Install Vitest + @vitest/coverage-v8; write tests for critical paths (SNS handler idempotency, bulk-send deduplication, segment query logic)
- Configure lint-staged + husky pre-commit hooks
- Audit `tsconfig.base.json` for `strict: true`; remove `any` escapes in service/worker layer (especially JSONB handling)
- Verify error response shape consistency across all routes (`{ error: { code, message, details? } }`)

### Phase 5: Observability and Operational Readiness

**Rationale:** The final pre-launch phase ensures the team can see what the system is doing in production and respond to incidents. This includes Sentry integration, structured logging with PII redaction, OpenTelemetry tracing, and the CloudWatch alarms that alert before AWS reviews the account for bounce/complaint rates.

**Delivers:** Full production observability — errors, traces, logs, uptime monitoring, and SES health alerting

**Addresses:** Observability stack from STACK.md; post-launch monitoring requirements from FEATURES.md

**Changes required:**
- Install Sentry (`@sentry/node` + `@sentry/nextjs` v8) with Fastify plugin and Next.js wizard
- Configure Pino serializers to redact PII (email addresses, JWT tokens) from logs; remove `pino-pretty` from production
- Install OpenTelemetry SDK + auto-instrumentations with `pino-opentelemetry-transport` for trace correlation
- Configure CloudWatch alarm at 4% bounce rate and 0.08% complaint rate
- Set up external uptime monitoring (Better Stack or Uptime Robot) hitting `/health`
- Verify SES DNS records: SPF, DKIM, DMARC (`p=quarantine` minimum)
- Confirm SES configuration set `'marketing'` exists in target AWS account and region

### Phase Ordering Rationale

- Phase 1 before everything: the LPUSH/BullMQ bug is a complete functional failure; compliance gaps create immediate legal and AWS account risk
- Phase 2 before infrastructure: data integrity bugs require application code changes; fixing infrastructure first would require retesting everything anyway
- Phase 3 after logic is correct: infrastructure changes (Redis policy, pool sizes) are lower risk to apply once the application logic is verified correct
- Phase 4 after runtime is stable: installing test infrastructure after fixing bugs means tests can assert on known-correct behavior rather than encoding existing bugs
- Phase 5 last: observability enables monitoring of a correctly functioning system; adding it before Phases 1-4 would only surface the bugs we already know about

### Research Flags

Phases with specific areas needing deeper investigation during planning:
- **Phase 1 — Scheduled campaign trigger:** Research indicates no visible worker path that triggers scheduled campaigns (`status = SCHEDULED` and `scheduled_at <= NOW()`). This needs codebase verification before planning the fix.
- **Phase 1 — Resend-to-non-openers wire-up:** The `resend_enabled` and `resend_config` fields exist on campaigns but no visible worker path implements the resend trigger. Needs verification.
- **Phase 2 — MPP user-agent detection:** The detection logic needs verification against current Apple Mail Proxy IP ranges, which can change. May need an external source list or an updateable config.
- **Phase 3 — PgBouncer prepared statements:** PgBouncer < 1.21 corrupts prepared statement state in transaction mode. Verify Kysely's `pg` driver does not use prepared statements by default and that the PgBouncer version is 1.21+.

Phases with well-documented standard patterns (skip `gsd:research-phase`):
- **Phase 4 — ESLint/Vitest setup:** Fully documented; standard monorepo configuration with no novel decisions required
- **Phase 5 — Sentry + OTel integration:** Both have official Fastify and Next.js documentation; wizard-based setup for Next.js is straightforward
- **Phase 5 — DNS/SES verification:** Standard AWS SES setup; documented extensively in official AWS docs

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations verified against official docs; existing stack confirmed sound; version compatibility verified |
| Features | HIGH | Research based on direct feature inventory against the built codebase; compliance requirements from official FTC/AWS/GDPR sources |
| Architecture | HIGH | Based on direct codebase inspection of actual source files, not inference; component boundaries and data flows are concrete |
| Pitfalls | HIGH | Pitfalls identified via direct codebase review with specific file references; not hypothetical risks |

**Overall confidence:** HIGH

### Gaps to Address

- **Scheduled campaign trigger existence:** The research flags this path as potentially absent. Before planning Phase 1, search the workers codebase for any job or interval that transitions `SCHEDULED` campaigns to `SENDING`. If absent, this is a Phase 1 build task not just a fix.

- **Resend-to-non-openers trigger wire-up:** Same situation — verify whether the resend trigger is implemented or entirely missing. If missing, it needs scoping as a build task.

- **SES account sending limits:** The 40 emails/sec default is documented but the actual account limit for this AWS account may differ (either higher if limits have been increased, or still at sandbox defaults). Verify via SES console before tuning worker concurrency.

- **PgBouncer version:** The `max_prepared_statements` fix requires PgBouncer >= 1.21. Verify the version in use from `docker-compose.yml` image tag before planning Phase 3.

- **Bull Board status:** Currently documented as a placeholder container. Before Phase 3 planning, confirm whether Bull Board just needs configuration or needs a full implementation.

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection: `packages/api/src/`, `packages/workers/src/`, `packages/shared/src/`, `docker-compose.yml`, `bulk-send.worker.ts`, `campaigns.service.ts`, `tracking.ts`, `webhooks-inbound.ts`, `app.ts`
- BullMQ Going to Production — https://docs.bullmq.io/guide/going-to-production
- Fastify Deployment Recommendations — https://fastify.dev/docs/latest/Guides/Recommendations/
- Next.js Production Checklist — https://nextjs.org/docs/app/guides/production-checklist
- AWS SES Bounce/Complaint Documentation — https://docs.aws.amazon.com/ses/latest/dg/send-email-concepts-deliverability.html
- AWS SES Sending Review Process FAQs — https://docs.aws.amazon.com/ses/latest/dg/faqs-enforcement.html
- FTC CAN-SPAM Act Compliance Guide — https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- PgBouncer Configuration — https://www.pgbouncer.org/config.html
- BullMQ Job Deduplication — https://docs.bullmq.io/guide/jobs/deduplication

### Secondary (MEDIUM confidence)

- PgBouncer prepared statements in transaction mode (PgBouncer 1.21) — https://www.crunchydata.com/blog/prepared-statements-in-transaction-mode-for-pgbouncer
- AWS SES quota error handling — https://docs.aws.amazon.com/ses/latest/dg/manage-sending-quotas-errors.html
- Apple MPP open rate tracking analysis — https://www.emailtooltester.com/en/blog/apple-mpp-open-rate/
- Email deliverability in 2026 — https://www.egenconsulting.com/blog/email-deliverability-2026.html

### Tertiary (LOW confidence)

- AWS SES sending warm-up best practices — cross-referenced from multiple community sources; verify timeline against current AWS guidance

---
*Research completed: 2026-03-13*
*Ready for roadmap: yes*
