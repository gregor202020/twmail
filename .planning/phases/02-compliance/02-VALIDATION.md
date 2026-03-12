---
phase: 2
slug: compliance
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 2 — Validation Strategy

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
| 2-01-01 | 01 | 1 | COMP-01 | grep | `grep -q "ON CONFLICT DO NOTHING\|onConflict" packages/api/src/routes/webhooks-inbound.ts` | N/A | ⬜ pending |
| 2-01-02 | 01 | 1 | COMP-02/03 | grep | `grep -q "BOUNCED\|COMPLAINED\|suppressed" packages/api/src/routes/webhooks-inbound.ts` | N/A | ⬜ pending |
| 2-02-01 | 02 | 1 | COMP-06 | grep | `grep -q "physical_address" packages/api/src/services/campaigns.service.ts` | N/A | ⬜ pending |
| 2-02-02 | 02 | 1 | COMP-07 | grep | `grep -q "BOUNCED\|UNSUBSCRIBED\|suppressed" packages/workers/src/workers/import.worker.ts` | N/A | ⬜ pending |
| 2-03-01 | 03 | 1 | COMP-04 | verify | `grep -q "List-Unsubscribe-Post" packages/workers/src/tracking.ts` | N/A | ⬜ pending |
| 2-03-02 | 03 | 1 | COMP-05 | verify | Code trace to confirm unauthenticated route | N/A | ⬜ pending |
| 2-03-03 | 03 | 1 | COMP-08 | verify | `grep -q "ACTIVE\|status.*=.*1" packages/workers/src/workers/bulk-send.worker.ts` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — grep-based verification sufficient for compliance fixes.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SNS duplicate delivery handling | COMP-01 | Requires SNS simulator or real AWS | Send same SNS notification twice, verify single event |
| Physical address in sent email | COMP-06 | Requires email render inspection | Send campaign, inspect raw HTML for address block |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
