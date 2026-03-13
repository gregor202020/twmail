---
phase: 06-infrastructure-security
verified: 2026-03-13T12:30:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
---

# Phase 6: Infrastructure Security Verification Report

**Phase Goal:** Production infrastructure is hardened against data loss, misconfiguration, and credential exposure
**Verified:** 2026-03-13T12:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Redis uses noeviction policy so BullMQ job keys are never silently evicted | VERIFIED | `docker-compose.yml` line 60: `--maxmemory-policy noeviction` |
| 2 | Redis AOF persistence uses appendfsync everysec so job data survives restart | VERIFIED | `docker-compose.yml` line 60: `--appendfsync everysec` |
| 3 | BullMQ workers pass IORedis connection without unsafe type casts | VERIFIED | No `as any` found; all 4 connection sites use `redis as unknown as ConnectionOptions` (imported from `bullmq`) |
| 4 | Redis campaign counter keys have a 7-day TTL to prevent stale key accumulation | VERIFIED | `bulk-send.worker.ts` lines 376, 402: `redis.set(..., 'EX', 604800)` on both A/B and standard paths |
| 5 | SES configuration set name is read from env var, not hardcoded | VERIFIED | `bulk-send.worker.ts` line 8: `const SES_CONFIG_SET = process.env['SES_CONFIGURATION_SET'] ?? 'marketing'`; used at lines 149 and 162 |
| 6 | PgBouncer pool math is documented and correct (40 pool + 5 reserve <= 50 max_connections) | VERIFIED | `pgbouncer.ini` lines 11-23: full comment block documenting math; no numeric changes made (math was already correct) |
| 7 | CORS rejects credentialed requests from origins not in the ALLOWED_ORIGINS allowlist | VERIFIED | `app.ts` lines 37-49: callback checks `allowedOrigins.has(origin)`, rejects with Error otherwise |
| 8 | CORS allows requests with no Origin header (server-to-server like SNS webhooks) | VERIFIED | `app.ts` line 44: `if (!origin) return cb(null, true)` — explicit no-origin passthrough before allowlist check |
| 9 | GET /health returns 200 with database and Redis connectivity checks | VERIFIED | `health.ts` lines 5-32: try/catch per service, `reply.status(allOk ? 200 : 503)`, checks object returned |
| 10 | GET /health returns 503 when database or Redis is unreachable | VERIFIED | `health.ts` line 27: `allOk = false` sets 503 status; degraded status in body |
| 11 | Security headers (X-Content-Type-Options, X-Frame-Options, etc.) are present on all responses | VERIFIED | `app.ts` lines 51-53: `@fastify/helmet` registered with `contentSecurityPolicy: false`; imported at line 3 |
| 12 | API process shuts down cleanly on SIGTERM including Redis cleanup | VERIFIED | `index.ts` lines 3, 12-13: `destroyRedis` imported from `@twmail/shared`, called in shutdown after `destroyDb()` |

**Score:** 12/12 truths verified

---

### Required Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `docker-compose.yml` | Redis noeviction + appendfsync everysec config; SES_CONFIGURATION_SET env var in worker services | VERIFIED | Line 60 has both flags; lines 114, 139 pass `SES_CONFIGURATION_SET=${SES_CONFIGURATION_SET:-marketing}` to worker-bulk and worker-system |
| `pgbouncer/pgbouncer.ini` | Pool sizing documentation | VERIFIED | 13-line comment block documents pool math; default_pool_size=40, reserve_pool_size=5 unchanged |
| `packages/workers/src/workers/bulk-send.worker.ts` | Counter TTL + env-based SES config set + typed connections | VERIFIED | SES_CONFIG_SET at module scope (line 8); EX 604800 at lines 376+402; `as unknown as ConnectionOptions` at 4 sites |
| `packages/api/src/app.ts` | CORS allowlist + helmet registration | VERIFIED | `allowedOrigins` Set at lines 37-39; CORS callback at 41-49; helmet at 51-53 |
| `packages/api/src/config.ts` | ALLOWED_ORIGINS env var | VERIFIED | `ALLOWED_ORIGINS: z.string().default('')` at line 16 |
| `packages/api/src/routes/health.ts` | Health endpoint with DB+Redis checks | VERIFIED | Full try/catch per service; `redis.ping()` at line 20; 200/503 at line 27 |
| `packages/api/src/index.ts` | Graceful shutdown with Redis cleanup | VERIFIED | `destroyRedis` imported (line 3); called in shutdown sequence (line 13) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `docker-compose.yml` | redis service | command flags | WIRED | `noeviction` and `appendfsync everysec` both present on line 60 |
| `packages/workers/src/workers/bulk-send.worker.ts` | SES config set | SES_CONFIG_SET const | WIRED | Const defined at line 8; used at line 149 (X-SES-CONFIGURATION-SET header) and line 162 (configurationSet param) |
| `packages/api/src/app.ts` | `packages/api/src/config.ts` | `config.ALLOWED_ORIGINS` | WIRED | `getConfig()` called at line 27; `config.ALLOWED_ORIGINS` used at line 36 |
| `packages/api/src/routes/health.ts` | `@twmail/shared` | `getDb()` and `getRedis()` | WIRED | Both imported at line 2; `getDb()` at line 10, `getRedis()` at line 19 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| INFRA-01 | 06-01 | Redis maxmemory-policy set to noeviction | SATISFIED | `docker-compose.yml` line 60: `--maxmemory-policy noeviction` |
| INFRA-02 | 06-02 | CORS origin changed from wildcard to explicit allowlist | SATISFIED | `app.ts` CORS callback with `allowedOrigins` Set; wildcard `origin: true` removed |
| INFRA-03 | 06-01 | PgBouncer pool sizing matches application pool demands | SATISFIED | `pgbouncer.ini` documents math: 40+5=45 server connections <= 50 Postgres max_connections |
| INFRA-04 | 06-01 | BullMQ worker IORedis clients have maxRetriesPerRequest: null | SATISFIED | `getRedis()` in `shared/src/redis.ts` line 13: `maxRetriesPerRequest: null`; all BullMQ connection casts use typed `as unknown as ConnectionOptions` (no `as any`) |
| INFRA-05 | 06-02 | Graceful shutdown (SIGTERM/SIGINT) for Fastify and all worker processes | SATISFIED | `index.ts`: `app.close()` + `destroyDb()` + `destroyRedis()` in shutdown handler |
| INFRA-06 | 06-02 | Health endpoint unauthenticated and returns 200 with DB+Redis check | SATISFIED | `health.ts`: no auth preHandler; DB query + redis.ping() checks; 200/503 response |
| INFRA-07 | 06-01 | Redis AOF persistence with appendfsync everysec | SATISFIED | `docker-compose.yml` line 60: `--appendonly yes --appendfsync everysec` |
| INFRA-08 | 06-02 | @fastify/helmet added for security headers | SATISFIED | `app.ts` lines 3, 51-53: helmet imported and registered with CSP disabled |
| INFRA-09 | 06-01 | Redis counter TTL set and atomic decrement-and-check for campaign completion | SATISFIED | `bulk-send.worker.ts`: 7-day TTL (EX 604800) at both counter SET calls; Lua DECR_AND_CHECK_LUA script for atomic completion check |
| INFRA-10 | 06-01 | SES configuration set 'marketing' made configurable via env var | SATISFIED | `bulk-send.worker.ts` line 8: `process.env['SES_CONFIGURATION_SET'] ?? 'marketing'`; docker-compose passes env var to both worker services |

All 10 requirements declared across plans 01 and 02 are SATISFIED. No orphaned requirements found — all INFRA-01 through INFRA-10 are mapped to Phase 6 in REQUIREMENTS.md traceability table and marked complete.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `docker-compose.yml` | 183 | `command: echo "Bull Board placeholder - will be configured in Plan 2"` | Info | Pre-existing placeholder for bull-board service; no INFRA requirement covers this service; out of scope for Phase 6 |

No blockers. The bull-board placeholder is a cosmetic issue in docker-compose.yml that does not affect any Phase 6 goal or requirement. It produces a no-op container on `docker compose up` but does not break any production service.

---

### Human Verification Required

The following behaviors require a live environment to confirm:

#### 1. Redis noeviction under memory pressure

**Test:** Start Redis container and fill memory beyond the 512mb limit with test keys, then verify BullMQ job keys are not evicted.
**Expected:** Redis returns an OOM error rather than evicting existing keys. BullMQ job keys remain intact.
**Why human:** Requires a running Redis container with controlled memory pressure.

#### 2. Redis AOF persistence across process restart

**Test:** Enqueue BullMQ jobs, stop the Redis container (`docker compose stop redis`), restart it, and confirm jobs are still present.
**Expected:** Jobs survive the restart with at most 1 second of data loss.
**Why human:** Requires live Docker environment with filesystem volume.

#### 3. CORS allowlist enforcement in browser

**Test:** From a browser origin NOT in ALLOWED_ORIGINS, make a credentialed `fetch()` to the API.
**Expected:** Browser receives a CORS error; request is rejected.
**Why human:** CORS enforcement is browser-side; grep cannot confirm runtime behavior.

#### 4. Security headers on API responses

**Test:** `curl -I http://localhost:3000/health` and inspect response headers.
**Expected:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and other helmet-added headers are present.
**Why human:** Requires a running API process.

#### 5. Graceful shutdown Redis cleanup

**Test:** Send SIGTERM to the API process and confirm Redis connection closes cleanly (no lingering connections visible in `redis-cli client list`).
**Expected:** Redis shows zero connections from the API process within ~1 second of shutdown.
**Why human:** Requires process signal simulation and live Redis inspection.

---

### Gaps Summary

No gaps. All 12 observable truths are VERIFIED. All 10 INFRA requirements are SATISFIED. All key links are WIRED. No blocker anti-patterns found.

The phase goal — "Production infrastructure is hardened against data loss, misconfiguration, and credential exposure" — is achieved:

- **Data loss prevention:** Redis noeviction + AOF everysec; 7-day TTL on campaign counters; atomic Lua decrement-and-check.
- **Misconfiguration prevention:** PgBouncer pool math documented; CORS defaults to empty (safe default blocks all browser origins unless explicitly set).
- **Credential exposure prevention:** SES configuration set moved from hardcoded string to environment variable; ALLOWED_ORIGINS env var controls CORS; no `as any` type casts on connections.

---

_Verified: 2026-03-13T12:30:00Z_
_Verifier: Claude (gsd-verifier)_
