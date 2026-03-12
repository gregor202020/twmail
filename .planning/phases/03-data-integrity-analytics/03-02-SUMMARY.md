---
phase: 03-data-integrity-analytics
plan: "02"
subsystem: a/b-testing
tags: [a/b-test, tracking, bayesian, data-integrity]
dependency_graph:
  requires: [03-01]
  provides: [variant-counters, ab-eval-guards]
  affects: [campaign_variants, ab-eval-worker, tracking-routes]
tech_stack:
  added: []
  patterns: [bayesian-win-probability, tdd-pure-function-export]
key_files:
  created:
    - packages/api/tests/ab-eval.test.ts
  modified:
    - packages/api/src/routes/tracking.ts
    - packages/workers/src/workers/ab-eval.worker.ts
decisions:
  - "calculateBayesianWinProbability exported for unit testing without DB mocks"
  - "minSampleSize defaults to 100 but is overridable via campaign.ab_test_config.min_sample_size"
  - "WIN_PROBABILITY_THRESHOLD = 0.95 hardcoded (not configurable) — sufficient for current use case"
  - "Machine opens increment campaign_variants.total_opens only (not total_human_opens) — matches campaign-level logic"
metrics:
  duration_seconds: 183
  completed_date: "2026-03-12"
  tasks_completed: 2
  files_modified: 3
---

# Phase 03 Plan 02: A/B Test Winner Logic Fix Summary

**One-liner:** Fixed A/B eval to use human click counters from variant rows (now populated) with 95% win probability threshold and minimum 100-send sample size guard.

## What Was Built

Three coordinated fixes addressing two root causes in A/B test winner selection:

**Root Cause 1 (DATA-03):** `campaign_variants` counters were always 0 because `tracking.ts` never updated them. Fixed by adding `updateTable('campaign_variants')` calls in both `recordOpen()` and `recordClick()` when `message.variant_id` is present.

**Root Cause 2 (DATA-04):** `ab-eval.worker.ts` declared a winner immediately after any data was available — no sample size check, no confidence threshold. Fixed by:
- Querying `campaigns.ab_test_config.min_sample_size` (default 100) and returning `skipped/insufficient_sample` when `totalSent < minSampleSize`
- Checking `maxProb >= 0.95` (WIN_PROBABILITY_THRESHOLD) before marking any winner, returning `skipped/no_confident_winner` otherwise

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add variant counter updates to recordOpen and recordClick | fc336a6 | packages/api/src/routes/tracking.ts |
| 2 (RED) | Failing tests for calculateBayesianWinProbability | 822eaf9 | packages/api/tests/ab-eval.test.ts |
| 2 (GREEN) | Min sample size guard and 95% win probability threshold | ea27a66 | packages/workers/src/workers/ab-eval.worker.ts |

## Verification Results

- `npx vitest run tests/ab-eval.test.ts` — 5/5 tests pass
- `ab-eval.worker.ts` contains `minSampleSize` guard (line 38) before Bayesian calculation (line 46)
- `ab-eval.worker.ts` contains `WIN_PROBABILITY_THRESHOLD = 0.95` (line 58) before winner declaration
- `tracking.ts` contains `campaign_variants` updates in recordOpen (human: lines 226-233, machine: lines 251-257) and recordClick (lines 318-325)
- Pre-existing TypeScript error in `campaigns.service.ts` (BullMQ/ioredis version conflict) is out-of-scope and predated this plan

## Deviations from Plan

### Out-of-Scope Issues Observed

**Pre-existing TS error in campaigns.service.ts** — `Redis` type incompatibility between ioredis and BullMQ's bundled ioredis. Not related to this plan's changes. Logged here but not fixed.

No plan deviations — execution matched spec exactly.

## Self-Check

- [x] `packages/api/src/routes/tracking.ts` — exists and modified
- [x] `packages/workers/src/workers/ab-eval.worker.ts` — exists and modified
- [x] `packages/api/tests/ab-eval.test.ts` — exists, 68 lines (> min_lines: 30)
- [x] Commit fc336a6 — feat(03-02): add variant counter updates
- [x] Commit 822eaf9 — test(03-02): add failing tests
- [x] Commit ea27a66 — feat(03-02): add min sample size guard and 95% threshold

## Self-Check: PASSED
