---
phase: 1
slug: critical-bug-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | BUG-01 | integration | `npx vitest run -t "campaign send dispatches BullMQ job"` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | BUG-02 | unit | `npx vitest run -t "duplicate send prevention"` | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 1 | BUG-03 | integration | `npx vitest run -t "holdback contacts persist"` | ❌ W0 | ⬜ pending |
| 1-04-01 | 04 | 1 | BUG-04 | unit | `npx vitest run -t "atomic counter"` | ❌ W0 | ⬜ pending |
| 1-05-01 | 05 | 2 | BUG-05 | integration | `npx vitest run -t "scheduled campaign trigger"` | ❌ W0 | ⬜ pending |
| 1-06-01 | 06 | 2 | BUG-06 | integration | `npx vitest run -t "resend non-openers"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Install vitest + @vitest/coverage-v8 in root
- [ ] Create vitest.config.ts in packages/api and packages/workers
- [ ] Create test stubs for BUG-01 through BUG-06
- [ ] Create shared test fixtures (db mock, redis mock, queue mock)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end campaign send via BullMQ | BUG-01 | Requires running Docker stack | Start stack, create campaign, click send, verify worker receives job |
| Scheduled campaign fires at correct time | BUG-05 | Time-dependent behavior | Schedule campaign 1 min in future, wait, verify it transitions to SENDING |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
