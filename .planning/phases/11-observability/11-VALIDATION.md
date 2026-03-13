---
phase: 11
slug: observability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + grep-based verification |
| **Config file** | packages/api/vitest.config.ts |
| **Quick run command** | `cd packages/api && npx vitest run tests/sentry-init.unit.test.ts tests/pino-redact.unit.test.ts` |
| **Full suite command** | `cd packages/api && npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick test command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | OBS-01 | unit | `cd packages/api && npx vitest run tests/sentry-init.unit.test.ts tests/pino-redact.unit.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | OBS-02, OBS-03 | grep | `grep -rn "console\.(log\|error\|warn)" packages/workers/src/ && echo "FAIL" \|\| echo "PASS"` | N/A | ⬜ pending |
| 11-02-01 | 02 | 1 | OBS-01 | grep | `grep -q "withSentryConfig" packages/frontend/next.config.ts && grep -q "captureException" packages/frontend/src/app/global-error.tsx` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — vitest already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sentry captures unhandled exceptions in production | OBS-01 | Requires live Sentry project and DSN | Deploy, throw test error, verify Sentry dashboard |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
