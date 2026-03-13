---
phase: 09-operational-readiness
plan: 02
subsystem: workers
tags: [bullmq, scheduler, sending-recovery, timezone, zod, vitest]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: scheduler.ts created, BullMQ campaign-send queue established
  - phase: 04-data-integrity-error-handling
    provides: campaign-send worker with shouldSkipSend dedup (idempotent re-enqueue)
provides:
  - SENDING stall recovery — scheduler re-enqueues stuck campaigns without status change
  - STALE_SENDING_THRESHOLD_MS exported constant (600_000 ms)
  - Confirmed Zod schema enforces z.string().datetime() for scheduled_at
  - Verified new Date(ISO+offset) correctly converts to UTC
affects: [10-final-qa, 11-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Source-code scan testing via fs.readFileSync for pure logic verification without DB mocks
    - Stall recovery as re-enqueue without status mutation (idempotent worker handles resolution)

key-files:
  created:
    - packages/api/tests/scheduler-recovery.unit.test.ts
    - packages/api/tests/campaign-schedule-tz.unit.test.ts
  modified:
    - packages/workers/src/scheduler.ts

key-decisions:
  - "SENDING stall recovery re-enqueues without status change — campaign-send worker resolves via shouldSkipSend dedup"
  - "STALE_SENDING_THRESHOLD_MS exported for testability — constant at module scope for deterministic test assertions"
  - "Timezone conversion verified correct via ECMA-262 Date constructor — no Luxon dependency needed"
  - "Zod z.string().datetime() already in place — no code change needed for task 2, test-only"

patterns-established:
  - "Source-code scan: readFileSync test pattern for verifying structural logic without runtime deps"
  - "Re-enqueue without mutation: crash recovery enqueues job again, worker skips already-processed contacts"

requirements-completed: [OPS-01, OPS-03]

# Metrics
duration: 5min
completed: 2026-03-13
---

# Phase 9 Plan 02: Operational Readiness - SENDING Recovery Summary

**BullMQ scheduler stall recovery with 10-minute SENDING threshold and verified ISO timezone-offset to UTC conversion via Zod + Date constructor**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-13T02:42:14Z
- **Completed:** 2026-03-13T02:47:02Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added SENDING stall recovery to scheduler.ts — campaigns stuck for >10 minutes are re-enqueued without status change
- Exported `STALE_SENDING_THRESHOLD_MS = 600_000` for testability and documentation
- Verified timezone-offset ISO strings correctly convert to UTC via native Date constructor (no extra library)
- Confirmed Zod `z.string().datetime()` already enforces ISO 8601 format with offset — no code change needed

## Task Commits

Each task was committed atomically:

1. **Task 1: Add SENDING stall recovery to scheduler** - `5a20fe2` (feat)
2. **Task 2: Verify timezone conversion** - included in prior `de3b226` (test — campaign-schedule-tz test included in 09-01 commit by pre-commit hook stash mechanism)

_Note: TDD tasks may have multiple commits (test -> feat -> refactor)_

## Files Created/Modified
- `packages/workers/src/scheduler.ts` - Added STALE_SENDING_THRESHOLD_MS constant and SENDING stall recovery block
- `packages/api/tests/scheduler-recovery.unit.test.ts` - Source-code scan test verifying stall detection logic
- `packages/api/tests/campaign-schedule-tz.unit.test.ts` - Verifies UTC conversion correctness and Zod enforcement

## Decisions Made
- SENDING stall recovery re-enqueues without status change — campaign-send worker handles idempotency via shouldSkipSend dedup
- STALE_SENDING_THRESHOLD_MS exported at module scope so tests can import and assert the exact constant value
- No Luxon dependency added — ECMA-262 Date constructor handles ISO 8601 offset strings correctly
- Zod `z.string().datetime()` was already in place in campaigns route — task 2 became test-only verification

## Deviations from Plan

None - plan executed exactly as written. The Zod schema was already in place as expected, confirming the audit finding.

## Issues Encountered
- Pre-commit hook stash mechanism included `campaign-schedule-tz.unit.test.ts` in the 09-01 commit (`de3b226`) during a failed commit attempt for Task 1. File was already committed when Task 2 reached the commit stage. Both tests pass and artifacts are present on disk and in git.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Scheduler is now crash-safe — stuck SENDING campaigns auto-recover within one 60s poll cycle
- TypeScript compiles cleanly in both packages/api and packages/workers
- All unit tests pass (12/12 new tests green)
- Integration tests require running DB/Redis — pre-existing, not introduced by this plan

---
*Phase: 09-operational-readiness*
*Completed: 2026-03-13*

## Self-Check: PASSED

- FOUND: packages/workers/src/scheduler.ts
- FOUND: packages/api/tests/scheduler-recovery.unit.test.ts
- FOUND: packages/api/tests/campaign-schedule-tz.unit.test.ts
- FOUND: .planning/phases/09-operational-readiness/09-02-SUMMARY.md
- FOUND: commit 5a20fe2 (feat: SENDING stall recovery)
- FOUND: commit de3b226 (campaign-schedule-tz test)
