---
phase: 06-infrastructure-security
plan: 02
subsystem: infra
tags: [cors, helmet, security-headers, health-check, graceful-shutdown, fastify]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: API app.ts, config.ts, shared getDb/getRedis/destroyDb/destroyRedis
provides:
  - CORS allowlist enforcement via ALLOWED_ORIGINS env var (no wildcard)
  - @fastify/helmet security headers on all API responses
  - /health endpoint with real DB and Redis connectivity checks
  - Graceful shutdown destroys both DB pool and Redis connections
affects: [all-phases, deployment, monitoring]

# Tech tracking
tech-stack:
  added: ["@fastify/helmet ^13.0.2"]
  patterns:
    - "CORS origin callback: no-origin allowed first (server-to-server), then allowlist check"
    - "Health endpoint returns degraded/ok status with per-service checks object"
    - "Shutdown order: app.close() -> destroyDb() -> destroyRedis() -> process.exit(0)"

key-files:
  created: []
  modified:
    - packages/api/src/app.ts
    - packages/api/src/config.ts
    - packages/api/src/routes/health.ts
    - packages/api/src/index.ts
    - packages/api/package.json
    - docker-compose.yml

key-decisions:
  - "CORS origin callback checks !origin first — SNS webhook POSTs have no Origin header and must pass before allowlist check"
  - "helmet registered with contentSecurityPolicy disabled — pure API serving no HTML; CSP would interfere with tracking pixel"
  - "/health now checks DB and Redis connectivity (503 on failure); /ready retained for backwards compatibility"
  - "ALLOWED_ORIGINS defaults to empty string — empty means all origins blocked (safe default); must be set explicitly in production"

patterns-established:
  - "Security middleware order: cors -> helmet -> multipart -> errorHandler -> auth -> rateLimit"
  - "Health check pattern: try/catch per service, allOk flag, 200 or 503 with checks object"

requirements-completed: [INFRA-02, INFRA-05, INFRA-06, INFRA-08]

# Metrics
duration: 12min
completed: 2026-03-13
---

# Phase 6 Plan 02: API Security Hardening Summary

**CORS allowlist via ALLOWED_ORIGINS env var, @fastify/helmet security headers, /health with DB+Redis connectivity checks, and graceful shutdown Redis cleanup**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-13T12:00:00Z
- **Completed:** 2026-03-13T12:12:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Replaced wildcard `origin: true` CORS with explicit allowlist from ALLOWED_ORIGINS; server-to-server requests (no Origin header) always pass
- Registered @fastify/helmet with CSP disabled — adds X-Content-Type-Options, X-Frame-Options, and other standard security headers to all responses
- /health endpoint now performs live DB and Redis connectivity checks and returns 503 with degraded status if either fails
- API shutdown now calls destroyRedis() after destroyDb() — no Redis connections leak on SIGTERM/SIGINT

## Task Commits

Each task was committed atomically:

1. **Task 1: CORS allowlist + helmet + ALLOWED_ORIGINS config** - `3b306b6` (feat)
2. **Task 2: Health endpoint DB+Redis checks + graceful shutdown Redis cleanup** - `e8e65e8` (feat)

## Files Created/Modified
- `packages/api/src/app.ts` - CORS allowlist callback + @fastify/helmet registration
- `packages/api/src/config.ts` - ALLOWED_ORIGINS field added to envSchema (default empty string)
- `packages/api/src/routes/health.ts` - /health now checks DB + Redis, returns 503 on degraded
- `packages/api/src/index.ts` - destroyRedis() added to shutdown sequence
- `packages/api/package.json` - @fastify/helmet ^13.0.2 dependency added
- `docker-compose.yml` - ALLOWED_ORIGINS env var added to api service

## Decisions Made
- No-origin check comes first in CORS callback — this is critical: SNS webhook POST requests have no Origin header and must not be blocked by the allowlist check
- contentSecurityPolicy disabled in helmet — this is a pure API (no HTML rendered), and CSP would break tracking pixel responses
- ALLOWED_ORIGINS defaults to empty string — an unconfigured empty string means all credentialed browser requests are blocked, which is the safe default; production deployments must explicitly set this

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript error in `packages/api/src/services/campaigns.service.ts` (ioredis/bullmq version conflict at line 189). Not caused by this plan's changes. Logged as out-of-scope; no changes made to that file.

## User Setup Required
- Add `ALLOWED_ORIGINS=https://app.yourdomain.com` (comma-separated for multiple origins) to production `.env` and any deployment environment. Without this, all browser-originated credentialed requests will be rejected.

## Next Phase Readiness
- Security hardening complete for the API layer
- All 4 INFRA requirements (INFRA-02, INFRA-05, INFRA-06, INFRA-08) satisfied
- Phase 6 Plan 01 (PgBouncer, Bull Board, Redis persistence) is independent and can execute in any order

## Self-Check: PASSED

- `packages/api/src/app.ts` contains `allowedOrigins` and `helmet` — FOUND
- `packages/api/src/config.ts` contains `ALLOWED_ORIGINS` — FOUND
- `packages/api/src/routes/health.ts` contains `redis.ping` — FOUND
- `packages/api/src/index.ts` contains `destroyRedis` — FOUND
- Commit `3b306b6` — FOUND
- Commit `e8e65e8` — FOUND

---
*Phase: 06-infrastructure-security*
*Completed: 2026-03-13*
