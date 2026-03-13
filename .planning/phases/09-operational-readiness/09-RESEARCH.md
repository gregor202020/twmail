# Phase 9: Operational Readiness - Research

**Researched:** 2026-03-13
**Domain:** Node.js worker fault tolerance, BullMQ rate limiting, timezone conversion, HMAC security
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OPS-01 | Campaign state machine recovers correctly after worker crash (not stuck in SENDING) | Scheduler.ts already polls for SCHEDULED; extend with SENDING-stall detection using `send_started_at` staleness threshold |
| OPS-02 | SES rate limit respected under bulk send (worker concurrency ≤ 40/sec) | BullMQ limiter already configured at `{ max: 40, duration: 1000 }` — needs test verification and correctness audit |
| OPS-03 | Scheduled campaign timezone conversion correct (stored as UTC, evaluated correctly) | `scheduleCampaign()` stores `timezone` but performs no conversion; client sends ISO string that JavaScript parses as UTC — need server-side timezone-aware datetime parsing |
| OPS-06 | Webhook HMAC uses constant-time comparison | Outgoing signature is computed via `createHmac` but there is no inbound signature verification with `crypto.timingSafeEqual`; need to add verification on the webhook ingestion path if applicable, and audit all signature comparison sites |
| OPS-07 | Webhook endpoint auto-disable after 50 failures works correctly | Logic exists in webhook.worker.ts but is unreachable — `enqueueWebhookDelivery` in webhooks.service.ts uses `redis.lpush('twmail:webhook-send', ...)` (raw list), while the worker listens to BullMQ queue named `'webhook'`; jobs are never consumed |
</phase_requirements>

---

## Summary

Phase 9 addresses five operational correctness requirements. Code-reading reveals that two requirements
(OPS-02, OPS-07) have existing implementations that are either unverified or completely broken at the
wiring layer. OPS-01 requires a scheduler extension. OPS-03 requires server-side timezone parsing.
OPS-06 requires a constant-time comparison audit and a minimal addition to the signature path.

The most critical discovery is the **webhook queue wiring bug**: `enqueueWebhookDelivery` pushes jobs
to a raw Redis list (`twmail:webhook-send`) while the webhook worker polls a BullMQ-managed queue named
`webhook`. These two never connect — no webhook delivery job has ever been processed. This also means
OPS-07 (auto-disable after 50 failures) is impossible to verify until the wiring is fixed.

OPS-01 is a clean scheduler extension: the existing 60-second poll loop already handles SCHEDULED ->
SENDING; the same loop needs a second query to detect campaigns stuck in SENDING for longer than a
staleness threshold (suggest 10 minutes) and re-enqueue them.

**Primary recommendation:** Fix the webhook queue wiring first (it is a prerequisite for OPS-07), then
add SENDING recovery to the scheduler, then fix timezone conversion, then add the constant-time HMAC
comparison, then write tests for all four.

---

## Standard Stack

### Core (already in use)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bullmq | ^5.25.0 (workers), ^5.71.0 (api) | Job queue, rate limiter | Already used throughout; `limiter` option is the canonical way to cap throughput |
| node:crypto | built-in | HMAC, constant-time compare | `crypto.timingSafeEqual` is the Node.js standard — no third-party library needed |
| Kysely + PostgreSQL | existing | Database queries | All state machine transitions use Kysely UPDATE with WHERE guards |

### Timezone Handling
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Temporal (TC39) | Stage 3 | Timezone-aware datetimes | Not yet in Node LTS — do not use |
| Luxon | ^3.x | Timezone-aware datetime parsing | Preferred if a library is needed; `DateTime.fromISO(str, { zone })` is explicit |
| date-fns-tz | ^3.x | Timezone conversion | Alternative — lighter weight but more verbose |
| **No library** | N/A | Parse ISO 8601 with offset in client | Simplest: require the client to send a UTC-offset ISO string; `new Date()` handles correctly |

**Recommendation for OPS-03:** The simplest and most robust approach is to require the frontend to
send the scheduled time as a fully offset ISO 8601 string (e.g., `2026-03-14T09:00:00+11:00`).
`new Date('2026-03-14T09:00:00+11:00')` in Node correctly converts to UTC. The `timezone` field in
the DB stores the IANA zone name for display purposes only. No additional library required.

If the frontend only sends a naive local time + timezone name (no offset), then Luxon is needed:
`DateTime.fromISO(naiveTime, { zone: ianaZone }).toJSDate()`. Verify what the frontend actually sends
before choosing.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `crypto.timingSafeEqual` | `==` string compare | String compare leaks length via early exit — timing attack surface |
| Luxon | `date-fns-tz` | date-fns-tz is lighter but less ergonomic for IANA zone lookups |
| Scheduler poll for stuck campaigns | BullMQ job timeouts | BullMQ `lockDuration` handles individual job hangs, not whole-campaign stalls after a crash |

---

## Architecture Patterns

### OPS-01: SENDING State Recovery

The scheduler at `packages/workers/src/scheduler.ts` already has a 60-second poll loop. The recovery
logic belongs in the same loop as a second query block.

**Pattern:** Detect staleness by comparing `send_started_at` to `NOW() - interval`. Re-enqueue a
`campaign-send` job only if the campaign row can be atomically transitioned (prevent duplicate re-queue
from two worker replicas):

```typescript
// Source: pattern consistent with existing scheduler.ts atomic UPDATE approach
const staleThreshold = new Date(Date.now() - STALE_SENDING_THRESHOLD_MS);

const stuckCampaigns = await db
  .selectFrom('campaigns')
  .select(['id'])
  .where('status', '=', CampaignStatus.SENDING)
  .where('send_started_at', '<=', staleThreshold)
  .execute();

for (const campaign of stuckCampaigns) {
  // Re-enqueue without status change — the campaign-send worker will
  // re-resolve recipients and enqueue only unsent contacts (idempotent
  // due to shouldSkipSend dedup check on messages table).
  // Alternatively, reset to SCHEDULED then immediately re-enqueue.
  await campaignSendQueue.add('send', { campaignId: campaign.id });
  console.log(`Scheduler: re-enqueued stuck campaign ${campaign.id}`);
}
```

**Threshold choice:** 10 minutes (`600_000` ms) is conservative. A campaign that starts sending and has
its worker killed will show no activity, but a large campaign actively sending may take longer. The
scheduler success criterion says "next scheduler cycle" (60s), so the threshold should be clearly
longer than one poll cycle but short enough to be operationally useful. 10 minutes is safe.

**Idempotency:** Re-enqueuing works safely because `createCampaignSendWorker` resolves fresh contacts
and sets the Redis counter from scratch, and `shouldSkipSend` skips any contact already in `messages`.
The only risk is double-counting `total_sent` but that is already addressed by the UNIQUE constraint
and dedup guard.

**What NOT to do:** Do not transition stuck campaigns from SENDING back to SCHEDULED — that would
confuse the UI and complicate reporting. Leave status as SENDING and re-enqueue.

### OPS-02: Rate Limiting (Already Implemented)

The bulk-send worker at `packages/workers/src/workers/bulk-send.worker.ts` already uses:

```typescript
// Source: existing code — line 266-272 of bulk-send.worker.ts
{
  connection: redis as unknown as ConnectionOptions,
  concurrency: 25,
  limiter: {
    max: 40,
    duration: 1000, // 40 emails/sec
  },
}
```

**What `limiter` does in BullMQ 5.x:** The `limiter` option causes the worker to pause processing
when `max` jobs have been processed within `duration` milliseconds. All workers sharing the same
queue and Redis instance respect this limit globally — multiple replicas coordinate via Redis.
This is exactly what is needed.

**Verification needed:** The requirement says "under full load" — the existing concurrency of 25 and
limiter of 40/sec should cooperate correctly (25 jobs can be in-flight simultaneously, but no more
than 40 complete per second). A unit/integration test should assert that job throughput does not
exceed 40/sec under burst conditions.

**Potential issue:** BullMQ version mismatch — the workers package has `^5.25.0` but the API has
`^5.71.0`. Both should resolve to a compatible range. Verify `node_modules` does not contain two
conflicting BullMQ versions.

### OPS-03: Timezone Conversion

**Current state:** `scheduleCampaign()` in campaigns.service.ts:
```typescript
const scheduledAt = new Date(data.scheduled_at);  // line 197
```
This works correctly only if the client sends a UTC-offset ISO 8601 string such as
`2026-03-14T09:00:00+11:00`. Node's `Date` constructor parses the offset and stores UTC internally.

**Gap:** The schema stores `timezone: Generated<string>` (default empty string) as a cosmetic/display
field. If the frontend sends a naive local datetime string (no offset) plus a timezone name, the
conversion is wrong — `new Date('2026-03-14 09:00:00')` treats the string as local time of the
Node process (UTC in production), not the user's timezone.

**Fix decision:** Audit what the frontend actually sends. If it already sends offset strings, the
only fix needed is a test. If it sends naive strings + timezone, add server-side conversion using
the stored `timezone` field with Luxon or date-fns-tz.

**Recommended fix (server-side, covers both cases):**
```typescript
// Source: Luxon docs — DateTime.fromISO with zone
import { DateTime } from 'luxon';

// If scheduled_at may be timezone-naive, use the timezone field to interpret it
const scheduledAt = data.timezone
  ? DateTime.fromISO(data.scheduled_at, { zone: data.timezone }).toJSDate()
  : new Date(data.scheduled_at); // falls back to JS Date if no timezone
```

If Luxon is added as a dependency, install in the `api` package only.

### OPS-06: Constant-Time HMAC Comparison

**Current state — outgoing webhooks:** `webhook.worker.ts` computes a signature and sends it in the
`X-Webhook-Signature` header. There is no inbound comparison (the worker sends TO external systems,
not from them). No timing attack surface exists here — this path only produces a signature, not
compares one.

**Where comparison WOULD occur:** If TWMail has an endpoint that RECEIVES webhook calls from
external systems (e.g., Stripe, third-party triggers) and needs to verify the HMAC signature those
systems send. Looking at `webhooks-inbound.ts` — this handles incoming SNS notifications with AWS
RSA certificate-based verification (not HMAC). No HMAC comparison currently exists there.

**OPS-06 requirement interpretation:** The requirement says "Webhook HMAC signatures use a
constant-time comparison that does not leak timing information." The most likely intended meaning
is: if the webhook system allows external callers to submit events back to TWMail via an HMAC-secured
endpoint, that comparison must use `crypto.timingSafeEqual`. Alternatively, it applies to any future
inbound webhook verification flow.

**Minimal safe fix:** Add a utility function `verifyHmacSignature(secret, body, receivedSig)` that
uses `crypto.timingSafeEqual`, and document it as the standard for any inbound signature verification.
Even if not currently called on a live path, this guards against future-insecure implementations.

```typescript
// Source: Node.js crypto docs — timingSafeEqual
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyHmacSignature(secret: string, body: string, receivedSignature: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  const expectedBuf = Buffer.from(`sha256=${expected}`, 'utf8');
  const receivedBuf = Buffer.from(receivedSignature, 'utf8');
  // timingSafeEqual requires same-length buffers — pad if different lengths would
  // leak length info via exception, but here we return false on length mismatch first
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}
```

### OPS-07: Webhook Auto-Disable — Queue Wiring Bug

**Critical finding:** The auto-disable logic in `webhook.worker.ts` (lines 106-115) is unreachable
because no jobs ever arrive in the BullMQ `'webhook'` queue.

`enqueueWebhookDelivery()` in `webhooks.service.ts` calls:
```typescript
await redis.lpush('twmail:webhook-send', JSON.stringify({ ... }));
```

The webhook worker creates a BullMQ Worker on queue `'webhook'` — a completely different mechanism.
BullMQ uses key `bull:webhook:...` in Redis (with its own format), not `twmail:webhook-send`.

**Fix:** Replace the `redis.lpush` call with `new Queue('webhook', ...).add('deliver', jobData)`.
This aligns with how `bulk-send`, `campaign-send`, `ab-eval`, and `resend` queues all work.

```typescript
// In enqueueWebhookDelivery — replace redis.lpush with:
const webhookQueue = new Queue('webhook', { connection: redis as unknown as ConnectionOptions });
await webhookQueue.add('deliver', {
  deliveryId: delivery.id,
  endpointId: endpoint.id,
  url: endpoint.url,
  secret: endpoint.secret,
  eventType,
  payload,
  attempt: 1,
});
await webhookQueue.close();
```

**Secondary issue:** `failure_count` in `webhook_endpoints` tracks consecutive failures but is
incremented by the worker on every throw. The reset to 0 on success (line 74-76 of webhook.worker.ts)
is correct. However, the comparison `endpoint.failure_count >= 50` uses the pre-increment count
(the count is incremented on the same transaction before the select). This means the disable fires
after the 51st failure, not the 50th. Fix: compare after increment, or use `> 49`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting across workers | Custom Redis token bucket | BullMQ `limiter: { max, duration }` | Already implemented correctly; BullMQ coordinates across replicas via Redis |
| Timezone parsing | Custom string manipulation | `new Date(offsetISO)` or Luxon | Edge cases around DST, leap seconds, ambiguous times are numerous |
| Constant-time comparison | `===` with timing tricks | `crypto.timingSafeEqual` | Node.js built-in; correct, auditable, no dependencies |
| Exponential backoff | Custom sleep/retry loop | BullMQ `delay` on `.add()` | Already implemented in webhook.worker.ts |
| Campaign stuck-detection timeout | Complex state machine | Staleness query on `send_started_at` | Simple, observable, no additional infrastructure |

**Key insight:** All five OPS requirements can be satisfied with minimal code. The most expensive
fix is the webhook queue wiring — but it's a one-line change (swap `redis.lpush` for `queue.add`).

---

## Common Pitfalls

### Pitfall 1: Re-queuing Stuck Campaigns Causes Double-Sends
**What goes wrong:** Re-enqueuing a campaign-send job causes `createCampaignSendWorker` to re-resolve
all recipients and re-enqueue all contacts, including ones already sent.
**Why it happens:** If the idempotency check is bypassed or fails.
**How to avoid:** `shouldSkipSend` checks for an existing `messages` row before inserting — contacts
already sent will be skipped. Verify this is tested. The Redis counter will be reset to the full
contact count, which means the completion check fires too early after the recovery send finishes.
**Better alternative:** Consider re-queuing only the remaining (unsent) contacts by joining
`messages` to exclude already-sent contacts when resolving recipients in `createCampaignSendWorker`.
This makes the recovery more surgical.

### Pitfall 2: BullMQ `limiter` is Per-Queue, Not Per-Worker-Instance
**What goes wrong:** Assuming two worker replicas each get 40/sec → 80/sec total.
**Why it happens:** Misreading the limiter semantics.
**How to avoid:** BullMQ 5.x `limiter` is enforced globally via Redis — all workers on the same
queue share the rate limit. 40/sec is the global max regardless of replica count. This is correct
behavior for SES rate limiting.

### Pitfall 3: `timingSafeEqual` Throws on Different Buffer Lengths
**What goes wrong:** `crypto.timingSafeEqual(a, b)` throws a TypeError if `a.length !== b.length`.
**Why it happens:** The function requires equal-length inputs; the comparison returns false for
different lengths anyway, but it doesn't handle the case gracefully.
**How to avoid:** Always check lengths before calling `timingSafeEqual`, or pad both to the same
length before comparing.

### Pitfall 4: Timezone "Naive" Datetimes
**What goes wrong:** `new Date('2026-03-14 09:00:00')` returns a different UTC time depending on
the Node process's TZ environment variable.
**Why it happens:** Strings without a UTC offset are parsed as local time.
**How to avoid:** Always enforce ISO 8601 with explicit offset. In Zod, use `z.string().datetime()`
which requires the `Z` or `+offset` suffix.

### Pitfall 5: Webhook `failure_count` Is Not Truly "Consecutive"
**What goes wrong:** If a webhook succeeds once, then fails 50 times, it disables — correct.
But if it fails 49 times, then succeeds (failure_count reset to 0), then fails again — it takes
another 50 fails to disable. This is the intended behavior, but test it explicitly.
**How to avoid:** Document the semantics: "50 consecutive failures since last success."

---

## Code Examples

### Scheduler Extension (OPS-01)
```typescript
// Source: extend packages/workers/src/scheduler.ts
const STALE_SENDING_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

// Inside the poll() function, after the SCHEDULED block:
const staleThreshold = new Date(Date.now() - STALE_SENDING_THRESHOLD_MS);

const stuck = await db
  .selectFrom('campaigns')
  .select(['id'])
  .where('status', '=', CampaignStatus.SENDING)
  .where('send_started_at', '<=', staleThreshold)
  .execute();

for (const campaign of stuck) {
  await campaignSendQueue.add('send', { campaignId: campaign.id });
  console.log(`Scheduler: re-enqueued stuck campaign ${campaign.id} (SENDING > 10min)`);
}
```

### Constant-Time HMAC Comparison (OPS-06)
```typescript
// Source: Node.js docs https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyHmacSignature(
  secret: string,
  body: string,
  receivedSignature: string, // expected format: "sha256=<hex>"
): boolean {
  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(receivedSignature, 'utf8');
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}
```

### Webhook Queue Fix (prerequisite for OPS-07)
```typescript
// Source: consistent with BullMQ usage in campaigns.service.ts and bulk-send.worker.ts
// In packages/api/src/services/webhooks.service.ts — enqueueWebhookDelivery()
// Replace:
//   await redis.lpush('twmail:webhook-send', JSON.stringify({ ... }));
// With:
const Queue = (await import('bullmq')).Queue;
const webhookQueue = new Queue('webhook', { connection: redis as unknown as ConnectionOptions });
await webhookQueue.add('deliver', {
  deliveryId: delivery.id,
  endpointId: endpoint.id,
  url: endpoint.url,
  secret: endpoint.secret,
  eventType,
  payload,
  attempt: 1,
});
await webhookQueue.close();
```

### BullMQ Rate Limiter (OPS-02 — already implemented, for reference)
```typescript
// Source: existing bulk-send.worker.ts lines 266-275
// BullMQ 5.x limiter: max N jobs per duration ms, globally coordinated via Redis
const worker = new Worker<BulkSendJobData>(
  'bulk-send',
  handler,
  {
    connection: redis as unknown as ConnectionOptions,
    concurrency: 25,
    limiter: {
      max: 40,
      duration: 1000, // 40 per second
    },
  },
);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom Redis job lists (lpush/brpop) | BullMQ Queue.add() | Phase 1 | Webhook service missed this migration |
| String `==` HMAC comparison | `crypto.timingSafeEqual` | Security best practice | Prevents timing attacks |
| Storing naive datetimes | ISO 8601 with explicit UTC offset | Phase 1 standard | Prevents DST and timezone ambiguity |

**Deprecated/outdated:**
- `redis.lpush('twmail:webhook-send', ...)`: Left over from pre-BullMQ design. Replace with BullMQ `Queue.add()`.

---

## Open Questions

1. **What datetime format does the frontend send for scheduled campaigns?**
   - What we know: The Zod schema uses `z.string().datetime()` which requires ISO 8601 with `Z` or `+offset`
   - What's unclear: Whether the frontend respects this and always includes a UTC offset, or whether users can enter a local time in a timezone picker
   - Recommendation: Inspect the frontend scheduling UI. If the Zod schema already enforces `z.string().datetime()`, then `new Date(data.scheduled_at)` is correct and no Luxon dependency is needed. Just add a test.

2. **Should stuck SENDING campaigns be re-queued or reset?**
   - What we know: Re-enqueuing is idempotent due to `shouldSkipSend`
   - What's unclear: Whether the `total_sent` counter drift is acceptable when the Redis remaining counter is reset
   - Recommendation: Re-enqueue only (do not change status). Accept that `total_sent` may advance from pre-crash value — this is correct behavior. The counter represents emails actually sent, not attempted.

3. **Is the SES rate limit 40/sec or higher for this account?**
   - What we know: STATE.md notes "SES account sending limit may differ from the 40/sec default — verify via SES console before Phase 9"
   - What's unclear: The actual SES account limit
   - Recommendation: The worker is capped at 40/sec regardless. This is safe by default. If the account limit is higher, the cap can be raised later via env var or config.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^2.1.0 |
| Config file | packages/api/vitest.config.ts (inferred from test:vitest script) |
| Quick run command | `cd packages/api && npm run test` |
| Full suite command | `cd packages/api && npm run test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPS-01 | Scheduler detects campaigns stuck in SENDING for > threshold and re-enqueues | unit | `vitest run packages/api/tests/scheduler-recovery.unit.test.ts` | No — Wave 0 |
| OPS-02 | BullMQ limiter configured at max=40 duration=1000 | unit (config inspection) | `vitest run packages/api/tests/bulk-send-rate-limit.unit.test.ts` | No — Wave 0 |
| OPS-03 | `scheduleCampaign` stores UTC-correct datetime for non-UTC input | unit | `vitest run packages/api/tests/campaign-schedule-tz.unit.test.ts` | No — Wave 0 |
| OPS-06 | `verifyHmacSignature` uses `timingSafeEqual`, not string equality | unit | `vitest run packages/api/tests/hmac-constant-time.unit.test.ts` | No — Wave 0 |
| OPS-07 | Webhook endpoint auto-disables at failure_count >= 50 | unit (mock db) | `vitest run packages/api/tests/webhook-auto-disable.unit.test.ts` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/api && npm run test`
- **Per wave merge:** `cd packages/api && npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/tests/scheduler-recovery.unit.test.ts` — covers OPS-01
- [ ] `packages/api/tests/bulk-send-rate-limit.unit.test.ts` — covers OPS-02
- [ ] `packages/api/tests/campaign-schedule-tz.unit.test.ts` — covers OPS-03
- [ ] `packages/api/tests/hmac-constant-time.unit.test.ts` — covers OPS-06
- [ ] `packages/api/tests/webhook-auto-disable.unit.test.ts` — covers OPS-07

---

## Sources

### Primary (HIGH confidence)
- Codebase direct inspection — `packages/workers/src/scheduler.ts`, `packages/workers/src/workers/bulk-send.worker.ts`, `packages/workers/src/workers/webhook.worker.ts`, `packages/api/src/services/webhooks.service.ts`, `packages/api/src/services/campaigns.service.ts`
- Node.js built-in `crypto.timingSafeEqual` — available since Node.js 6.6.0, present in all supported versions

### Secondary (MEDIUM confidence)
- BullMQ 5.x `limiter` option behavior — documented in BullMQ docs; global rate coordination via Redis is the stated design
- ISO 8601 parsing behavior in V8 — `new Date('2026-03-14T09:00:00+11:00')` correctly converts to UTC per ECMA-262

### Tertiary (LOW confidence)
- Staleness threshold of 10 minutes — reasonable engineering judgment; no official standard exists for "stuck campaign" detection interval

---

## Metadata

**Confidence breakdown:**
- OPS-01 (SENDING recovery): HIGH — the fix is a direct extension of existing scheduler pattern
- OPS-02 (rate limiting): HIGH — code already exists, just needs a test
- OPS-03 (timezone): MEDIUM — depends on what the frontend sends; requires frontend audit before committing to Luxon vs no-change
- OPS-06 (constant-time HMAC): HIGH — Node.js `crypto.timingSafeEqual` is the unambiguous standard
- OPS-07 (auto-disable): HIGH — bug is definitively identified; fix is a one-line queue wiring change

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable codebase, no external APIs beyond BullMQ)
