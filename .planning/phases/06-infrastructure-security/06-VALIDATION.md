---
phase: 6
slug: infrastructure-security
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | grep-based verification + TypeScript compilation |
| **Config file** | N/A |
| **Quick run command** | `cd packages/api && npx tsc --noEmit` |
| **Full suite command** | `cd packages/api && npx tsc --noEmit && cd ../../packages/workers && npx tsc --noEmit` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick compile check
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 1 | INFRA-01, INFRA-07 | grep | `grep -q "noeviction" docker-compose.yml` | N/A | ⬜ pending |
| 6-01-02 | 01 | 1 | INFRA-04 | grep | `grep -q "maxRetriesPerRequest" packages/shared/src/redis.ts` | N/A | ⬜ pending |
| 6-01-03 | 01 | 1 | INFRA-09 | grep | `grep -q "SES_CONFIGURATION_SET" packages/workers/src/workers/bulk-send.worker.ts` | N/A | ⬜ pending |
| 6-02-01 | 02 | 1 | INFRA-02 | grep | `! grep -q "origin: true" packages/api/src/app.ts` | N/A | ⬜ pending |
| 6-02-02 | 02 | 1 | INFRA-03, INFRA-05 | tsc | `cd packages/api && npx tsc --noEmit` | N/A | ⬜ pending |
| 6-02-03 | 02 | 1 | INFRA-06 | grep | `grep -q "getRedis" packages/api/src/routes/health.ts` | N/A | ⬜ pending |
| 6-02-04 | 02 | 1 | INFRA-08 | grep | `grep -q "helmet" packages/api/src/app.ts` | N/A | ⬜ pending |
| 6-02-05 | 02 | 1 | INFRA-10 | grep | `grep -q "RATE_LIMIT" packages/api/src/app.ts` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — grep and tsc verification sufficient.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Redis noeviction under memory pressure | INFRA-01 | Requires Redis container with memory limit | `redis-cli CONFIG GET maxmemory-policy` |
| AOF persistence survives restart | INFRA-07 | Requires Redis restart | Stop/start Redis, verify jobs still queued |
| SIGTERM graceful shutdown | INFRA-03 | Requires process signal simulation | `kill -TERM <pid>`, verify no dropped jobs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
