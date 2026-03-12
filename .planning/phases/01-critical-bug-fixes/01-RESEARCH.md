# Phase 1: Critical Bug Fixes - Research

**Researched:** 2026-03-13
**Domain:** BullMQ job dispatch, PostgreSQL schema constraints, Redis atomicity, campaign scheduler, resend trigger wiring
**Confidence:** HIGH (all findings from direct source inspection)

## Summary

This phase fixes six discrete bugs that prevent campaigns from ever sending, enable duplicate sends on worker retry, silently lose A/B holdback contacts, create a race condition in campaign completion detection, and leave the scheduled campaign and resend-to-non-openers features entirely un-triggered.

The most critical bug (BUG-01) is a systematic mismatch: the API pushes jobs via raw `redis.lpush` on custom key names, but every BullMQ worker listens on BullMQ-managed queues with a different internal key format. No job ever flows from the API to any worker. This same LPUSH pattern affects campaign-send, import-jobs, and webhook-send — the workers package was built on BullMQ but the API was built without BullMQ installed, using raw Redis as a substitute.

BUG-05 (scheduled campaign trigger) and BUG-06 (resend trigger) are completely absent — there is no code path that polls for SCHEDULED campaigns due to fire or triggers the resend worker after a campaign reaches SENT status. Both must be built from scratch, not just fixed. BUG-02 through BUG-04 are localized fixes in the bulk-send worker and schema.

**Primary recommendation:** Fix BUG-01 first by installing BullMQ in the API package and replacing all `redis.lpush` dispatch calls with `Queue.add()`. Then apply BUG-02 through BUG-04 in the worker and schema. Then build the scheduler and resend trigger (BUG-05, BUG-06) as new components.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BUG-01 | Campaign send dispatched via BullMQ Queue.add() not raw redis.lpush | Direct inspection: `campaigns.service.ts` line 182 uses `redis.lpush('twmail:campaign-send', ...)` but worker listens on BullMQ queue named `campaign-send`. BullMQ internal key is `bull:campaign-send:wait`, not `twmail:campaign-send`. |
| BUG-02 | Duplicate send prevented with UNIQUE constraint on messages(campaign_id, contact_id) and SES idempotency check | Direct inspection: migration `001_initial_schema.sql` has no UNIQUE on messages(campaign_id, contact_id). Worker inserts message row before calling SES — retry creates second row and second SES call. |
| BUG-03 | A/B holdback contacts persisted in PostgreSQL, not Redis-only storage | Direct inspection: `bulk-send.worker.ts` lines 303-309 store holdback as `redis.set('twmail:ab-holdback:{id}', JSON.stringify(contactIds), 'EX', 86400 * 7)`. No database copy. Redis eviction or 7-day expiry silently loses data. |
| BUG-04 | Redis campaign completion counter uses atomic Lua script and noeviction policy | Direct inspection: `bulk-send.worker.ts` lines 166-175 use non-atomic `redis.decr()` then separate conditional `redis.del()` + DB update. If key evicted, `decr` returns -1 and triggers false SENT. |
| BUG-05 | Scheduled campaign trigger exists and correctly transitions SCHEDULED → SENDING | Direct inspection: no file in `packages/workers/src/` or `packages/api/src/` contains any interval, cron, or polling loop that checks `scheduled_at <= NOW()`. Entire scheduler path is absent. |
| BUG-06 | Resend-to-non-openers trigger is wired up and functional | Direct inspection: `resend.worker.ts` exists and is started in `index.ts`, but `Queue('resend')` is never called with `.add()` anywhere in the codebase. The resend worker sits idle — no trigger enqueues jobs into it. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bullmq | ^5.25.0 | Job queue management, retry, concurrency | Already in workers package; is the correct queue for this system |
| ioredis | (peer of bullmq) | Redis connection | Already in shared package via getRedis() |
| kysely | (via @twmail/shared) | PostgreSQL migrations and queries | Already the DB layer |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| bullmq Queue | (same) | Enqueue jobs from API | Use `Queue.add()` instead of `redis.lpush` |
| node-cron or setInterval | (node stdlib) | Scheduler poll loop | For BUG-05 SCHEDULED campaign trigger in workers |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node setInterval for scheduler | pg_cron | pg_cron needs superuser install; setInterval in the workers process is simpler and avoids external dependency |
| Redis Lua for atomic decr | MULTI/EXEC | Lua is cleaner and more atomic in a single round-trip; MULTI/EXEC with watch() has retry complexity |

**Installation (BUG-01 fix):**
```bash
# Install BullMQ in the API package so it can call Queue.add()
cd packages/api && npm install bullmq
```

## Architecture Patterns

### Recommended Project Structure

No structural changes required. The fix is:
- Add BullMQ to `packages/api/package.json` dependencies
- Replace all `redis.lpush` dispatch calls in the API with `Queue.add()`
- Add migration for messages UNIQUE constraint (BUG-02)
- Rewrite decr + check in bulk-send worker with Lua (BUG-04)
- Add holdback persistence to PostgreSQL (BUG-03)
- Add scheduler loop in workers (BUG-05)
- Wire resend trigger from campaign SENT transition (BUG-06)

### Pattern 1: BullMQ Queue.add() from the API (BUG-01 Fix)

**What:** Replace raw `redis.lpush('twmail:campaign-send', ...)` with `Queue.add()` using BullMQ.

**Key detail:** BullMQ stores jobs in `bull:{queueName}:wait` (a Redis sorted set or list depending on version and job type). The raw LPUSH key `twmail:campaign-send` is completely separate from BullMQ's internal data structures. Jobs pushed via LPUSH are invisible to any BullMQ Worker.

**The fix:**
```typescript
// In packages/api/src/services/campaigns.service.ts
// BEFORE (broken):
const redis = getRedis();
await redis.lpush('twmail:campaign-send', JSON.stringify({ campaignId: id }));

// AFTER (correct):
import { Queue } from 'bullmq';
const redis = getRedis();
const campaignSendQueue = new Queue('campaign-send', { connection: redis as any });
await campaignSendQueue.add('send', { campaignId: id });
await campaignSendQueue.close();
```

**Same fix applies to:**
- `imports.service.ts`: `redis.lpush('twmail:import-jobs', ...)` → `Queue('import').add('process', data)`
- `webhooks.service.ts`: `redis.lpush('twmail:webhook-send', ...)` → `Queue('webhook').add('deliver', data)`

Note: The import and webhook queue fixes are out of scope for Phase 1 (they belong to later phases) but should be noted so the planner does not miss them.

**Queue name alignment (verified):**

| API sends to | Worker listens on | Match? |
|---|---|---|
| `'twmail:campaign-send'` (LPUSH) | `'campaign-send'` (BullMQ Worker) | NO — broken |
| After fix: `Queue('campaign-send')` | `'campaign-send'` (BullMQ Worker) | YES |

### Pattern 2: Atomic Lua Script for Redis Counter (BUG-04 Fix)

**What:** Replace the non-atomic decr + conditional in bulk-send worker with a Lua script.

**Current broken code (bulk-send.worker.ts lines 166-175):**
```typescript
// NON-ATOMIC: two separate round-trips, race condition possible
const remainingCount = await redis.decr(`twmail:remaining:${campaignId}`);
if (remainingCount <= 0) {
  await redis.del(`twmail:remaining:${campaignId}`);
  await db.updateTable('campaigns')
    .set({ status: CampaignStatus.SENT, send_completed_at: new Date() })
    .where('id', '=', campaignId)
    .where('status', '=', CampaignStatus.SENDING)
    .execute();
}
```

**Fixed pattern using Lua:**
```typescript
// ATOMIC: single Lua script evaluated as one Redis command
const luaScript = `
  local key = KEYS[1]
  local current = redis.call('DECR', key)
  if current <= 0 then
    redis.call('DEL', key)
    return 1
  end
  return 0
`;

const shouldComplete = await redis.eval(
  luaScript,
  1,
  `twmail:remaining:${campaignId}`,
) as number;

if (shouldComplete === 1) {
  await db.updateTable('campaigns')
    .set({ status: CampaignStatus.SENT, send_completed_at: new Date() })
    .where('id', '=', campaignId)
    .where('status', '=', CampaignStatus.SENDING)
    .execute();
}
```

**Why this matters:** With concurrent workers (concurrency: 25), multiple workers can read `decr = 0` simultaneously if not atomic. The Lua script is executed atomically by Redis — only one worker will get return value `1`.

### Pattern 3: UNIQUE Constraint + Idempotency Check (BUG-02 Fix)

**Migration:**
```sql
-- Migration 004: prevent duplicate messages per campaign/contact
ALTER TABLE messages
  ADD CONSTRAINT uq_messages_campaign_contact
  UNIQUE (campaign_id, contact_id);
```

**Worker idempotency check (before the INSERT):**
```typescript
// Check for existing message before inserting
const existing = await db
  .selectFrom('messages')
  .select(['id', 'ses_message_id', 'status'])
  .where('campaign_id', '=', campaignId)
  .where('contact_id', '=', contactId)
  .executeTakeFirst();

if (existing) {
  // Already sent or in progress — skip this retry
  return { skipped: true, reason: 'already_sent', messageId: existing.id };
}
```

**Key concern:** The UNIQUE constraint alone is not sufficient — BullMQ retries the entire job processor, which would re-attempt the INSERT and get a unique violation error. The explicit pre-check ensures graceful skip behavior. The UNIQUE constraint acts as a safety net against any race condition between the check and the insert.

### Pattern 4: PostgreSQL Persistence for A/B Holdback (BUG-03 Fix)

**Migration:**
```sql
-- Migration 004 (or 005): persist A/B holdback contacts in PostgreSQL
CREATE TABLE campaign_holdback_contacts (
  campaign_id  bigint NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id   bigint NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, contact_id)
);

CREATE INDEX idx_holdback_campaign ON campaign_holdback_contacts (campaign_id);
```

**In the campaign-send orchestrator (bulk-send.worker.ts), replace Redis set:**
```typescript
// BEFORE:
await redis.set(`twmail:ab-holdback:${campaignId}`, JSON.stringify(holdbackContacts), 'EX', 86400 * 7);

// AFTER: persist to PostgreSQL
if (holdbackContacts.length > 0) {
  const rows = holdbackContacts.map((contactId: number) => ({
    campaign_id: campaignId,
    contact_id: contactId,
  }));
  await db.insertInto('campaign_holdback_contacts').values(rows).execute();
}
```

**In ab-eval.worker.ts, replace Redis get:**
```typescript
// BEFORE:
const holdbackJson = await redis.get(`twmail:ab-holdback:${campaignId}`);
const holdbackContactIds = JSON.parse(holdbackJson);

// AFTER: read from PostgreSQL
const holdbackRows = await db
  .selectFrom('campaign_holdback_contacts')
  .select('contact_id')
  .where('campaign_id', '=', campaignId)
  .execute();
const holdbackContactIds = holdbackRows.map(r => r.contact_id);

// After winner send is queued:
await db.deleteFrom('campaign_holdback_contacts')
  .where('campaign_id', '=', campaignId)
  .execute();
```

### Pattern 5: Scheduled Campaign Trigger (BUG-05 Build)

**What:** A polling loop that runs inside the bulk workers process, checking every minute for campaigns with `status = SCHEDULED` and `scheduled_at <= NOW()`, then transitioning them to SENDING and enqueuing a campaign-send job.

**Implementation location:** Add to `packages/workers/src/index.ts` in the `workerType === 'bulk'` branch (alongside the existing worker creation).

```typescript
// In workers/src/index.ts, add scheduler alongside other workers:
async function startScheduler(): Promise<NodeJS.Timeout> {
  const db = getDb();
  const redis = getRedis();
  const campaignSendQueue = new Queue('campaign-send', { connection: redis as any });

  const poll = async () => {
    try {
      const due = await db
        .selectFrom('campaigns')
        .select(['id'])
        .where('status', '=', CampaignStatus.SCHEDULED)
        .where('scheduled_at', '<=', new Date())
        .execute();

      for (const campaign of due) {
        // Atomic transition: only move to SENDING if still SCHEDULED
        const result = await db
          .updateTable('campaigns')
          .set({ status: CampaignStatus.SENDING, send_started_at: new Date() })
          .where('id', '=', campaign.id)
          .where('status', '=', CampaignStatus.SCHEDULED) // guard against race
          .returningAll()
          .executeTakeFirst();

        if (result) {
          await campaignSendQueue.add('send', { campaignId: campaign.id });
        }
      }
    } catch (err) {
      console.error('Scheduler poll error:', err);
    }
  };

  // Run immediately then every 60 seconds
  await poll();
  return setInterval(poll, 60_000);
}
```

**Shutdown integration:**
```typescript
// In the shutdown function, clear the interval:
const schedulerInterval = await startScheduler();
// ...
const shutdown = async (signal: string) => {
  clearInterval(schedulerInterval);
  // existing worker close calls...
};
```

### Pattern 6: Resend Trigger Wiring (BUG-06 Build)

**What:** After a campaign transitions to SENT status (in the bulk-send worker's completion check), enqueue a delayed job into the `resend` queue if `resend_enabled = true` on the campaign.

**The resend worker is ready** — it processes jobs from the `'resend'` BullMQ queue. No code currently calls `Queue('resend').add()`. The trigger needs to be inserted in the campaign completion path inside `bulk-send.worker.ts`.

**Implementation:**
```typescript
// In bulk-send.worker.ts, after the SENT status transition:
if (shouldComplete === 1) {
  const updatedCampaign = await db
    .updateTable('campaigns')
    .set({ status: CampaignStatus.SENT, send_completed_at: new Date() })
    .where('id', '=', campaignId)
    .where('status', '=', CampaignStatus.SENDING)
    .returningAll()
    .executeTakeFirst();

  if (updatedCampaign?.resend_enabled && updatedCampaign?.resend_config) {
    const config = updatedCampaign.resend_config as { wait_hours?: number };
    const waitHours = config.wait_hours ?? 72; // default 72h before resend
    const resendQueue = new Queue('resend', { connection: redis as any });
    await resendQueue.add('evaluate', { campaignId }, { delay: waitHours * 3600 * 1000 });
    await resendQueue.close();
  }
}
```

**Resend worker gap to fix:** `resend.worker.ts` queries `messages` for `first_open_at IS NULL` to find non-openers, but it does not exclude machine opens. This is a data integrity issue (DATA-05) scoped to Phase 3 — note it but do not fix in Phase 1.

### Anti-Patterns to Avoid

- **Re-using the same Queue instance across job calls without closing:** BullMQ Queue holds a Redis connection. Create once and reuse, or close after use. In the worker context (BUG-05 scheduler), keep the Queue open for the lifetime of the process. In the worker context (BUG-06 trigger), create and close per completion event.
- **Using `redis.lpush` anywhere new:** All new job dispatch must use `Queue.add()`. The existing lpush calls in `imports.service.ts` and `webhooks.service.ts` are broken for the same reason but are out of Phase 1 scope.
- **Adding a TTL to the Redis completion counter without noeviction:** Setting a TTL and relying on `allkeys-lru` is still unsafe. Phase 6 will change the Redis memory policy to `noeviction`. For Phase 1, the Lua script fix (BUG-04) is the safety net; note in the plan that `noeviction` must also be set (Phase 6).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job queue | Custom Redis LPUSH + BRPOP consumer | BullMQ Queue.add() + Worker | BullMQ handles retry, backoff, concurrency, job persistence, delay, deduplication — all features already relied on in this codebase |
| Atomic counter decrement | Application-level lock | Redis Lua script | Single round-trip, atomically evaluated, no distributed lock needed |
| Scheduled job dispatch | Custom cron library | setInterval + DB poll OR BullMQ delayed jobs | setInterval is sufficient for 60-second granularity; no new dependency |

## Common Pitfalls

### Pitfall 1: BullMQ Queue vs Redis key namespace

**What goes wrong:** BullMQ stores job data under `bull:{queueName}:wait`, `bull:{queueName}:active`, etc. Pushing to `twmail:campaign-send` with lpush writes to a completely different Redis key. The BullMQ worker never sees it.

**Why it happens:** The API package does not have bullmq installed. The developer improvised with raw Redis, not realizing BullMQ uses its own key format.

**How to avoid:** Install bullmq in the API package. Verify with `Queue.getWaiting()` or Redis `KEYS bull:campaign-send:*` that jobs appear after `Queue.add()`.

**Warning signs:** Campaign status shows SENDING but no bulk-send jobs appear in Bull Board. Counter `twmail:remaining:*` key is never set.

### Pitfall 2: UNIQUE constraint conflicts on retry

**What goes wrong:** Adding `UNIQUE(campaign_id, contact_id)` to messages will cause existing duplicate rows (if any) to fail the migration with a unique violation.

**Why it happens:** If any campaigns have already been "sent" (actually failed silently), duplicate message rows may exist.

**How to avoid:** Before adding the constraint, check for duplicates: `SELECT campaign_id, contact_id, COUNT(*) FROM messages GROUP BY 1, 2 HAVING COUNT(*) > 1`. If duplicates exist, deduplicate before adding the constraint. The migration should handle this with a dedup step.

### Pitfall 3: Scheduler race condition when running multiple worker replicas

**What goes wrong:** Two bulk worker containers both poll SCHEDULED campaigns simultaneously and both enqueue the same campaign, resulting in double-send.

**Why it happens:** The `setInterval` poll runs in every container. Both see the same SCHEDULED row before either has updated it.

**How to avoid:** The pattern above already guards against this with a conditional UPDATE: `.where('status', '=', CampaignStatus.SCHEDULED)`. Only the container that successfully updates the row (PostgreSQL row-level lock ensures exactly one wins) will proceed to enqueue. The other container's update returns 0 rows, `executeTakeFirst()` returns `undefined`, and it skips.

### Pitfall 4: A/B holdback migration with existing Redis data

**What goes wrong:** If any campaigns are mid-flight with holdback contacts in Redis when Phase 1 is deployed, those contacts will be lost (the code switches to reading from PG, which will be empty).

**Why it happens:** In-flight campaigns stored holdback in Redis before the migration.

**How to avoid:** Phase 1 fixes apply to a pre-production system — no campaigns have sent yet. Note in the plan that this migration must be applied before any production sends.

### Pitfall 5: Queue.close() timing

**What goes wrong:** Creating a `Queue` in a worker job processor and calling `close()` at the end of the same job can cause issues if multiple jobs are processed concurrently — one job may call `close()` while another job's queue is still in use.

**Why it happens:** BullMQ Queue instances share the underlying Redis connection by reference.

**How to avoid:** For queues that need to be called from within a worker job (like bulkSendQueue in campaign-send orchestrator, abEvalQueue in ab-eval), create the queue instance outside the job processor function (at worker creation time) and close it only on shutdown. The existing code creates and closes queues inside the job processor — this should be refactored.

## Code Examples

Verified patterns from direct source inspection:

### Existing correct BullMQ usage (in workers) — reference for API fix

```typescript
// packages/workers/src/workers/bulk-send.worker.ts — CORRECT pattern to replicate in API
const bulkSendQueue = new Queue('bulk-send', { connection: redis as any });
await bulkSendQueue.add('send', { contactId, campaignId, variantId: variants[i]!.id });
await bulkSendQueue.close();
```

### ioredis eval() for Lua scripts

```typescript
// Standard ioredis eval signature:
// redis.eval(script: string, numkeys: number, ...keys: string[], ...args: string[])
const result = await redis.eval(luaScript, 1, keyName) as number;
```

### BullMQ delayed job (used in ab-eval, reference for resend trigger)

```typescript
// packages/workers/src/workers/bulk-send.worker.ts line 314-318 — existing correct pattern
await abEvalQueue.add(
  'evaluate',
  { campaignId },
  { delay: waitHours * 3600 * 1000 },
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw LPUSH/BRPOP for background jobs | BullMQ Queue.add() + Worker | Phase 1 fix | Jobs gain retry, backoff, visibility, delayed dispatch |
| Redis-only holdback storage | PostgreSQL table | Phase 1 fix | Holdback survives Redis restart, eviction, and 7-day TTL |
| Non-atomic decr + conditional | Lua atomic script | Phase 1 fix | Eliminates false SENT transitions under concurrency |

## Open Questions

1. **Import and webhook queue mismatch**
   - What we know: `imports.service.ts` uses `redis.lpush('twmail:import-jobs', ...)` and `webhooks.service.ts` uses `redis.lpush('twmail:webhook-send', ...)` — same broken pattern as campaign-send
   - What's unclear: The plan scope says only campaign-send is BUG-01. Should the import and webhook lpush fixes also be included in Phase 1 since they are the same root cause?
   - Recommendation: Include all three lpush-to-BullMQ fixes in Phase 1 under BUG-01 scope. They are the same change pattern, same root cause, and fixing campaign-send while leaving import broken would leave the system in a partially broken state.

2. **Migration numbering and dedup step**
   - What we know: Three migrations exist (001, 002, 003). New migration for UNIQUE constraint and holdback table should be 004.
   - What's unclear: Whether any data exists in messages table that would violate the new UNIQUE constraint.
   - Recommendation: Include a dedup check in the migration as a safety step, even though no production data exists yet.

3. **Queue instance lifecycle in workers**
   - What we know: The campaign-send orchestrator creates `new Queue('bulk-send', ...)` inside the job processor and closes it at the end. This is called with concurrency 5 — five jobs could run simultaneously.
   - What's unclear: Whether BullMQ v5 handles multiple Queue instances to the same queue gracefully in concurrent job processors.
   - Recommendation: Refactor the queue instantiation in `createCampaignSendWorker` to create the `bulkSendQueue` once outside the processor function and close it only on worker shutdown, matching the webhook worker pattern.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^2.1.0 |
| Config file | None detected — Wave 0 gap |
| Quick run command | `npx vitest run --reporter=verbose` (from repo root) |
| Full suite command | `npx vitest run --coverage` (from repo root) |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUG-01 | `Queue.add()` enqueues jobs visible to BullMQ worker | unit (mock redis) | `npx vitest run packages/api/src/services/campaigns.service.test.ts` | Wave 0 |
| BUG-02 | Duplicate message insert rejected; worker skips cleanly on retry | unit | `npx vitest run packages/workers/src/workers/bulk-send.worker.test.ts` | Wave 0 |
| BUG-03 | Holdback contacts written to `campaign_holdback_contacts` table | unit (db transaction) | `npx vitest run packages/workers/src/workers/bulk-send.worker.test.ts` | Wave 0 |
| BUG-04 | Lua script returns 1 exactly once when counter hits 0 under concurrency | unit (mock redis eval) | `npx vitest run packages/workers/src/workers/bulk-send.worker.test.ts` | Wave 0 |
| BUG-05 | Scheduler updates SCHEDULED campaign to SENDING and enqueues job | unit (mock db + queue) | `npx vitest run packages/workers/src/scheduler.test.ts` | Wave 0 |
| BUG-06 | SENT campaign with resend_enabled triggers delayed resend queue job | unit (mock queue) | `npx vitest run packages/workers/src/workers/bulk-send.worker.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/services/campaigns.service.test.ts` — covers BUG-01
- [ ] `packages/workers/src/workers/bulk-send.worker.test.ts` — covers BUG-02, BUG-03, BUG-04, BUG-06
- [ ] `packages/workers/src/scheduler.test.ts` — covers BUG-05
- [ ] `vitest.config.ts` (monorepo root or per-package) — no config detected
- [ ] Framework already installed in api package (vitest ^2.1.0 in devDependencies) — workers package needs vitest added

## Sources

### Primary (HIGH confidence)

- Direct source: `packages/api/src/services/campaigns.service.ts` — lpush on line 182-185, confirmed no bullmq import, confirmed API package.json has no bullmq dependency
- Direct source: `packages/workers/src/workers/bulk-send.worker.ts` — Worker('campaign-send') on line 206, non-atomic decr lines 166-175, Redis holdback lines 303-309
- Direct source: `packages/workers/src/workers/ab-eval.worker.ts` — holdback read from Redis lines 60-74
- Direct source: `packages/workers/src/workers/resend.worker.ts` — worker exists and is complete; confirmed no caller enqueues into 'resend' queue
- Direct source: `packages/workers/src/index.ts` — confirmed no scheduler/interval code; confirmed resend worker is started but never triggered
- Direct source: `db/migrations/001_initial_schema.sql` — messages table has no UNIQUE constraint on (campaign_id, contact_id)
- Direct source: `packages/api/src/services/imports.service.ts` — lpush 'twmail:import-jobs' same pattern
- Direct source: `packages/api/src/services/webhooks.service.ts` — lpush 'twmail:webhook-send' same pattern
- BullMQ documentation: Queue key format `bull:{name}:wait` — https://docs.bullmq.io/guide/queues

### Secondary (MEDIUM confidence)

- BullMQ Going to Production guide — https://docs.bullmq.io/guide/going-to-production
- Redis Lua scripting — https://redis.io/docs/manual/programmability/eval-intro/

## Metadata

**Confidence breakdown:**
- BUG-01 root cause: HIGH — confirmed by direct code inspection and package.json verification
- BUG-02 schema gap: HIGH — confirmed missing UNIQUE constraint in migration 001
- BUG-03 Redis-only holdback: HIGH — confirmed by direct source inspection of worker code
- BUG-04 non-atomic counter: HIGH — confirmed by direct source inspection
- BUG-05 scheduler absent: HIGH — exhaustive search of all worker source files finds no interval/cron/poll
- BUG-06 resend never triggered: HIGH — confirmed 'resend' queue name appears only in resend.worker.ts listener, never in any Queue.add() call

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable codebase, changes only on implementation)
