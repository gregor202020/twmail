---
phase: 09-operational-readiness
plan: "01"
subsystem: webhook-delivery
tags: [webhooks, bullmq, hmac, rate-limiting, security, testing]
dependency_graph:
  requires: []
  provides: [webhook-queue-wiring, hmac-utility, rate-limiter-verification, auto-disable-verification]
  affects: [packages/api/src/services/webhooks.service.ts, packages/api/src/utils/hmac.ts]
tech_stack:
  added: [packages/api/src/utils/hmac.ts]
  patterns: [source-code-scan-tests, bullmq-queue-add, crypto-timingSafeEqual, tdd-red-green]
key_files:
  created:
    - packages/api/src/utils/hmac.ts
    - packages/api/tests/webhook-queue-wiring.unit.test.ts
    - packages/api/tests/hmac-constant-time.unit.test.ts
    - packages/api/tests/bulk-send-rate-limit.unit.test.ts
    - packages/api/tests/webhook-auto-disable.unit.test.ts
  modified:
    - packages/api/src/services/webhooks.service.ts
decisions:
  - "[09-01]: enqueueWebhookDelivery creates a Queue per call and calls queue.close() after add — ephemeral queue instance pattern consistent with bulk-send resend path"
  - "[09-01]: verifyHmacSignature returns false on length mismatch instead of throwing — timingSafeEqual requires equal-length buffers; consumer never needs to distinguish mismatch from tamper"
  - "[09-01]: Task 2 uses source-code scan strategy (fs.readFileSync) for rate limiter and auto-disable verification — avoids Redis/DB setup while guaranteeing config thresholds are correct"
metrics:
  duration: "4m 28s"
  completed: "2026-03-13"
  tasks_completed: 2
  files_created: 5
  files_modified: 1
---

# Phase 9 Plan 01: Webhook Queue Wiring + HMAC Utility Summary

**One-liner:** Fixed webhook delivery bug (lpush -> BullMQ Queue.add), added crypto.timingSafeEqual HMAC verification utility, and confirmed rate limiter (max=40/sec) and auto-disable (50 failures) configuration with source-scan tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix webhook queue wiring + add HMAC utility | de3b226 | webhooks.service.ts, hmac.ts, 2 test files |
| 2 | Verify bulk-send rate limiter + webhook auto-disable | a5a05a6 | 2 test files |

## What Was Built

### Task 1: Webhook Queue Wiring Fix (OPS-02)

The webhook delivery system had a critical bug: `enqueueWebhookDelivery` used `redis.lpush('twmail:webhook-send', ...)` to push to a raw Redis list, while the webhook worker listened on a BullMQ queue named `'webhook'`. Jobs were silently dropped — the worker never saw them.

Fixed by replacing the lpush call with:
```typescript
const queue = new Queue('webhook', { connection: getRedis() as unknown as ConnectionOptions });
await queue.add('deliver', { deliveryId, endpointId, url, secret, eventType, payload, attempt: 1 });
await queue.close();
```

Also removed unused `createHmac` import and cleaned up the unused `endpoint` variable in `testWebhookEndpoint`.

### Task 1: HMAC Constant-Time Verification Utility (OPS-06)

Created `packages/api/src/utils/hmac.ts` exporting `verifyHmacSignature(secret, body, receivedSignature)`:
- Computes expected signature as `sha256=<hex>` using SHA-256 HMAC
- Converts both expected and received to Buffers
- Returns `false` on length mismatch (instead of throwing, which timingSafeEqual would do)
- Uses `crypto.timingSafeEqual` for constant-time comparison — prevents timing oracle attacks

### Task 2: Rate Limiter + Auto-Disable Verification (OPS-02, OPS-07)

Added two source-code scan tests to confirm pre-existing correct configurations:

- **bulk-send-rate-limit.unit.test.ts**: Confirms `createBulkSendWorker` has `limiter: { max: 40, duration: 1000 }` and `concurrency <= 40`
- **webhook-auto-disable.unit.test.ts**: Confirms `failure_count >= 50` threshold triggers `active: false` disable, and `failure_count: 0` reset on success

## Success Criteria Verification

- [x] enqueueWebhookDelivery uses BullMQ Queue.add() instead of redis.lpush
- [x] verifyHmacSignature utility exists and uses crypto.timingSafeEqual
- [x] Bulk-send rate limiter confirmed at max=40, duration=1000
- [x] Webhook auto-disable at failure_count >= 50 confirmed
- [x] All 19 new tests pass
- [x] TypeScript compiles (npx tsc --noEmit — no output = clean)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused `createHmac` import from webhooks.service.ts**
- **Found during:** Task 1 commit (ESLint pre-commit hook caught it)
- **Issue:** `createHmac` was imported but unused after removing the lpush block
- **Fix:** Removed from crypto import
- **Files modified:** packages/api/src/services/webhooks.service.ts
- **Commit:** de3b226

**2. [Rule 1 - Bug] Removed unused `endpoint` variable in testWebhookEndpoint**
- **Found during:** Task 1 commit (ESLint pre-commit hook caught it)
- **Issue:** `const endpoint = await getWebhookEndpoint(id)` assigned but value unused (call was validation-only)
- **Fix:** Changed to `await getWebhookEndpoint(id)` with explanatory comment
- **Files modified:** packages/api/src/services/webhooks.service.ts
- **Commit:** de3b226

## Self-Check: PASSED

All created files exist on disk. Both task commits (de3b226, a5a05a6) confirmed in git log.
