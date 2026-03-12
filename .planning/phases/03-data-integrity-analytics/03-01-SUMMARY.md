---
phase: 03-data-integrity-analytics
plan: 01
subsystem: tracking
tags: [mpp, machine-open, tdd, data-integrity]
dependency_graph:
  requires: []
  provides: [detectMachineOpen-ua, machine-open-classification]
  affects: [resend-to-non-openers, open-rate-metrics]
tech_stack:
  added: []
  patterns: [TDD red-green, pure-function export for testability]
key_files:
  created:
    - packages/api/tests/tracking.test.ts
  modified:
    - packages/api/src/routes/tracking.ts
key_decisions:
  - detectMachineOpen exported for direct unit testing without DB mocks
  - MACHINE_UA_PATTERNS uses case-insensitive regex to catch variant capitalizations
  - recordOpen unchanged — machine open path already correctly omits first_open_at
metrics:
  duration_minutes: 7
  completed_date: "2026-03-13"
  tasks_completed: 2
  files_changed: 2
requirements:
  - DATA-01
  - DATA-02
  - DATA-05
---

# Phase 03 Plan 01: MPP Machine-Open Detection Summary

**One-liner:** Apple Mail Privacy Protection detection extended to cover UA-based proxies (Yahoo, Google image proxy) using regex patterns alongside existing IP prefix check.

## What Was Built

Extended `detectMachineOpen` in `packages/api/src/routes/tracking.ts` to detect machine opens via both Apple proxy IPs (17.x.x.x) and known mail proxy user-agents. Added 7 unit tests covering all detection paths.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Add unit tests for detectMachineOpen | fd38f38 | packages/api/tests/tracking.test.ts, packages/api/src/routes/tracking.ts |
| 2 (GREEN) | Enhance detectMachineOpen with UA patterns | 8e7b189 | packages/api/src/routes/tracking.ts |

## Implementation Details

### MACHINE_UA_PATTERNS added to tracking.ts

```typescript
const MACHINE_UA_PATTERNS: RegExp[] = [
  /YahooMailProxy/i,
  /Googleimageproxy/i,
];
```

### detectMachineOpen updated

The function now checks IP prefix first (Apple MPP), then UA patterns (Yahoo/Google proxies):

```typescript
export function detectMachineOpen(ip: string, userAgent: string): boolean {
  for (const prefix of APPLE_PROXY_PREFIXES) {
    if (ip.startsWith(prefix)) return true;
  }
  for (const pattern of MACHINE_UA_PATTERNS) {
    if (pattern.test(userAgent)) return true;
  }
  return false;
}
```

### recordOpen unchanged

Machine open path already correctly:
- Sets `is_machine_open=true` on the message
- Does NOT set `first_open_at` (DATA-05 preserved)
- Increments `total_opens` but NOT `total_human_opens`

## Test Results

All 7 tests pass:
- Apple IP 17.58.0.1 -> true
- Apple block start 17.0.0.0 -> true
- Non-Apple IP 1.2.3.4 -> false
- False-prefix 170.0.0.1 -> false
- YahooMailProxy/1.0 UA -> true
- Googleimageproxy UA -> true
- Normal browser UA -> false

## Requirements Satisfied

- **DATA-01**: Apple Mail proxy IPs (17.x.x.x) detected as machine opens
- **DATA-02**: Machine opens preserved as MACHINE_OPEN events, not deleted
- **DATA-05**: Resend-to-non-openers candidate set uses `first_open_at IS NULL` — machine opens never set this, so machine-only openers are correctly included in resend candidates

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- packages/api/tests/tracking.test.ts: FOUND
- packages/api/src/routes/tracking.ts: FOUND (modified)
- Commit fd38f38: FOUND
- Commit 8e7b189: FOUND
