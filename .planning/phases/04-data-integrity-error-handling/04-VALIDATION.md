---
phase: 4
slug: data-integrity-error-handling
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | grep-based verification |
| **Config file** | N/A |
| **Quick run command** | `grep -rn "catch.*{}" packages/` |
| **Full suite command** | `grep -rn "catch.*{}" packages/ && echo "CHECK COMPLETE"` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run grep-based verification
- **After every plan wave:** Run full grep verification
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | DATA-06 | grep | `! grep -rn "catch.*=>.*{}" packages/api/src/ packages/workers/src/ \| grep -v "console\|log\|throw"` | N/A | ⬜ pending |
| 4-01-02 | 01 | 1 | DATA-07 | grep | `grep -q "finally" packages/workers/src/workers/bulk-send.worker.ts` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — grep-based verification sufficient.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Counter accuracy after SES failure | DATA-07 | Requires SES error simulation | Mock SES failure, verify campaign still completes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
