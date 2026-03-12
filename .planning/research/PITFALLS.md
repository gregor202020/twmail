# Pitfalls Research

**Domain:** Email marketing platform (Fastify + Next.js + BullMQ + PostgreSQL + AWS SES)
**Researched:** 2026-03-13
**Confidence:** HIGH — based on direct codebase review plus verified external sources

---

## Critical Pitfalls

### Pitfall 1: Duplicate Email Sends on Worker Retry

**What goes wrong:**
The `bulk-send` worker creates a `messages` record and then sends via SES as two separate operations. If the process crashes or the job lock expires between these steps, BullMQ retries the job and sends the email again — to the same contact, for the same campaign. The contact receives the email twice (or more). There is no idempotency guard preventing a second `messages` INSERT for the same `(campaign_id, contact_id)` pair.

**Why it happens:**
BullMQ guarantees "at-least-once" delivery. If a worker dies after calling SES but before acknowledging the job, the job returns to the queue. The worker has no memory of the prior attempt, so it re-executes the full send path. The `messages` table has no unique constraint on `(campaign_id, contact_id)`, so the INSERT succeeds and a second SES call is made.

**How to avoid:**
Add a `UNIQUE` constraint on `messages(campaign_id, contact_id)` and use `INSERT ... ON CONFLICT DO NOTHING`, then check whether the row already has `ses_message_id` set before calling SES. Alternatively, set a BullMQ `jobId` of `send-{campaignId}-{contactId}` — BullMQ will deduplicate enqueue calls with the same job ID if the job is still waiting or active.

**Warning signs:**
- Contacts report receiving the same email twice
- `messages` table has more rows than `total_sent` on the campaign
- Duplicate `ses_message_id` values appearing across `messages` rows

**Phase to address:** Code review / remediation phase (pre-production hardening)

---

### Pitfall 2: Redis-Based Campaign Completion Counter Race Condition

**What goes wrong:**
The campaign completion mechanism uses `redis.decr('twmail:remaining:{campaignId}')` across 25 concurrent worker instances. If the counter goes below zero due to a retried or extra job, `remainingCount <= 0` fires multiple times and the campaign status update runs multiple times. Worse: if the Redis key expires (TTL is not set on this key — only on `ab-holdback`) before all jobs complete, `decr` on a missing key returns `-1` and the campaign transitions to `SENT` prematurely.

**Why it happens:**
The Redis counter is set once at campaign orchestration time but has no TTL. If Redis restarts or the key is evicted under memory pressure (the config uses `allkeys-lru` eviction policy), the key disappears. The `decr` command then creates a new key at `-1`, which satisfies `<= 0` and triggers a premature status transition.

**How to avoid:**
Set an explicit TTL on the counter key (e.g., 24 hours). Use a Lua script or a Redis transaction (`MULTI`/`EXEC`) to make the decrement-and-check atomic. Additionally, add a `WHERE status = SENDING` guard on the campaign status update (already present) and log anomalies when `remainingCount` goes negative.

**Warning signs:**
- Campaigns flip to `SENT` before all emails are dispatched
- `total_sent` count on a "sent" campaign is lower than the recipient list size
- Redis memory warnings in logs combined with `allkeys-lru` eviction

**Phase to address:** Code review / remediation phase

---

### Pitfall 3: AWS SES Account Suspension from Unchecked Bounce/Complaint Rates

**What goes wrong:**
AWS suspends sending ability when bounce rate exceeds 10% or complaint rate exceeds 0.5%. The application handles hard bounces by setting `ContactStatus.BOUNCED` on the contact, but this only prevents future sends — it does not clean the list retroactively or alert the operator when rates approach thresholds. Without proactive monitoring, an operator may not notice until SES suspends the account.

**Why it happens:**
The SNS bounce/complaint handler correctly processes events, but there is no CloudWatch alarm, no in-app warning, and no automatic suppression list check against the SES Account-Level Suppression List. Contacts marked `BOUNCED` or `COMPLAINED` in the local DB may still exist in SES's suppression list — if another campaign erroneously targets them (e.g., a list export re-imported without status filtering), SES will count the bounce again.

**How to avoid:**
- Configure CloudWatch alarms at 4% bounce and 0.08% complaint (well before AWS review thresholds)
- Surface deliverability health in the dashboard with color-coded status (existing reports exist but no alerting)
- Check the SES Account-Level Suppression List before marking a contact re-sendable
- Ensure segment and list queries always filter `status = ACTIVE` (currently done correctly)

**Warning signs:**
- Complaint rate above 0.05% or bounce rate above 2% in the deliverability report
- Sudden drop in `total_delivered` relative to `total_sent` across recent campaigns
- SES "Under Review" notification email from AWS

**Phase to address:** Production readiness / deploy phase

---

### Pitfall 4: Denormalized Campaign Counters Drifting Under Concurrent Load

**What goes wrong:**
Campaign counters (`total_opens`, `total_clicks`, `total_bounces`, etc.) are updated via `eb('total_opens', '+', 1)` in multiple places: the tracking endpoint (fire-and-forget), the SNS webhook handler (fire-and-forget via `processNotification(...).catch()`), and the bulk-send worker. Each path executes independently. If errors silently swallow counter updates (the `.catch(() => {})` pattern) or if the same event is processed twice, counters drift from reality. PostgreSQL MVCC also creates row bloat when a frequently-updated single row receives concurrent increments at high send volumes.

**Why it happens:**
Fire-and-forget patterns suppress errors without logging them. The SNS handler returns `200` before processing completes, and the async `processNotification` can fail silently. Tracking pixel requests are also fire-and-forget. At 40 emails/sec with parallel opens, a single campaign row can receive hundreds of concurrent UPDATE operations within minutes of sending.

**How to avoid:**
- Replace bare `.catch(() => {})` with `.catch((err) => logger.error(...))` at minimum
- For open/click counter updates, consider accumulating events in the `events` table (already done) and computing counts from there rather than maintaining dual denormalized state — or accept eventual consistency with a periodic reconciliation job
- Add an index on `events(campaign_id, event_type)` if not already present

**Warning signs:**
- Campaign stats diverge from event-table-derived counts
- Unexplained zero or negative counter values
- High `pg_stat_activity` wait events on the campaigns table during active sends

**Phase to address:** Code review / remediation phase

---

### Pitfall 5: A/B Holdback Contacts Lost If Redis Key Expires or Is Evicted

**What goes wrong:**
The A/B holdback contact list is stored in Redis with a 7-day TTL (`EX 86400 * 7`). If Redis restarts without persistence, or if the `allkeys-lru` policy evicts the key under memory pressure before the A/B evaluation runs, the holdback contacts are permanently lost. Those contacts never receive the winning email. The A/B eval worker has no fallback to recover from a missing holdback key — it silently does nothing.

**Why it happens:**
Redis is configured with `--appendonly yes` (persistence enabled), which mitigates restart loss, but `allkeys-lru` eviction can still remove the key if Redis hits the 512MB memory limit. Large contact lists serialized to JSON and stored as a single Redis string can be significant in size.

**How to avoid:**
- Store the holdback contact IDs in the database (a `campaign_holdback_contacts` table or a JSONB column on campaigns) rather than Redis
- Keep Redis for ephemeral coordination only; use PostgreSQL for data that must survive eviction
- Alternatively, increase Redis memory or use a `noeviction` policy for keys that cannot be lost

**Warning signs:**
- A/B campaigns complete without the holdback group ever receiving emails
- `twmail:ab-holdback:{campaignId}` key is absent in Redis when the eval worker runs
- `total_sent` for A/B campaigns is significantly less than the recipient count

**Phase to address:** Code review / remediation phase

---

### Pitfall 6: Campaign Send Dispatched via Raw Redis LPUSH Instead of BullMQ Queue

**What goes wrong:**
`sendCampaign()` enqueues the campaign orchestration job by calling `redis.lpush('twmail:campaign-send', ...)` directly, bypassing BullMQ entirely. BullMQ is used for `bulk-send` and `ab-eval`, but the campaign orchestrator job goes through a raw Redis list. This means: no automatic retries, no job failure tracking, no job history, no visibility in Bull Board, no delay support, and no concurrency controls. If the worker crashes while orchestrating, the job is lost.

**Why it happens:**
Inconsistent implementation — the worker processes `bulk-send` through BullMQ but the trigger for the orchestrator was written using low-level Redis. The `createCampaignSendWorker` uses BullMQ's `Worker` listening on `'campaign-send'`, which reads from a BullMQ-managed queue, not a raw LPUSH list. This mismatch means the worker may never receive the job.

**How to avoid:**
Replace the `redis.lpush('twmail:campaign-send', ...)` in `campaigns.service.ts` and `sendCampaign()` with a proper BullMQ `Queue.add()` call. Verify the worker name and queue name match exactly.

**Warning signs:**
- Campaigns stuck in `SENDING` status indefinitely
- No jobs appear in Bull Board for the `campaign-send` queue
- Worker logs show no activity after a campaign is triggered

**Phase to address:** Code review / remediation phase (this is a functional bug, not just a code quality issue)

---

### Pitfall 7: CORS Wildcard in Production Allowing Any Origin

**What goes wrong:**
The Fastify app registers CORS with `origin: true`, which reflects any origin back with `Access-Control-Allow-Origin: <requester>`. In production, this allows any website to make credentialed cross-origin requests to the API, defeating CORS protection entirely for the admin interface.

**Why it happens:**
`origin: true` is a development convenience that was not changed for production. Credentials are also enabled (`credentials: true`), making this a meaningful security exposure — it allows cross-site requests that include the session cookie.

**How to avoid:**
Set `origin` to an explicit allowlist: `origin: ['https://mail.thirdwavebbq.com.au']` for production, controlled by an environment variable. Apply this at the CORS plugin level, not per-route.

**Warning signs:**
- `Access-Control-Allow-Origin` response header reflects arbitrary origins in production network traces
- Any origin can make authenticated API calls from a third-party site

**Phase to address:** Production readiness / security audit phase

---

### Pitfall 8: Click Tracking Redirect Queries the Wrong Table

**What goes wrong:**
The click tracking redirect handler at `/t/c/:messageId/:linkHash` first queries the `events` table looking for an existing `CLICK` event with `metadata->>'link_hash' = linkHash`. This is backwards — on the first click there is no such event yet, so it always falls through to the second query (the `SENT` event's `link_map`). The first query is wasted work on every first click, and the `events` table query uses a raw `sql` expression against an unindexed JSONB path, causing a full scan of the events partition.

**Why it happens:**
The logic was written to first check if the URL was already resolved (from a previous click event), but the correct and efficient path is always the `SENT` event's `link_map`. The first-click path is the common case, not the exceptional one.

**How to avoid:**
Reorder the queries: always go to the `SENT` event's `link_map` first (the authoritative source). Only fall back to a prior click event as a secondary lookup. Add a GIN index on the `events` metadata column or, better, maintain a dedicated `message_links` table mapping `(message_id, link_hash) -> url` populated at send time.

**Warning signs:**
- Slow click redirect response times under load
- High `seq scan` counts on the events table in `pg_stat_user_tables`

**Phase to address:** Code review / remediation phase

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `any` casts in Kysely queries (`eb: any`, `db: any` in worker/SNS handler) | Avoids type gymnastics | Type errors surface at runtime not compile time; refactors become unsafe | Never in service/worker code |
| `.catch(() => {})` on fire-and-forget DB updates | Fast response times | Errors disappear silently; counters drift; debugging is impossible | Never — use `.catch(err => log.error(err))` at minimum |
| Storing holdback contacts in Redis | Simple implementation | Data lost on eviction/restart; unrecoverable state | Never for durable business data |
| Raw `redis.lpush` instead of BullMQ Queue | Familiar API | No retries, no visibility, possible queue mismatch | Never when a BullMQ worker is the consumer |
| Hardcoded `BASE_URL` fallback in tracking.ts | Works without config | Production sends point to wrong domain if env var missing | Only in local dev |
| `origin: true` in CORS | No config needed in dev | Any origin can make credentialed requests to API in prod | Never in production |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| AWS SES | Sending at full rate immediately from a new account | Warm up sending volume gradually over days/weeks; SES enforces reputation-based limits |
| AWS SES | Assuming SNS delivers every notification exactly once | SNS can retry deliveries; the SNS handler must be idempotent (check for existing event by `ses_message_id` before inserting) |
| AWS SES | Not checking Account-Level Suppression List before re-importing contacts | SES silently suppresses sends to addresses on its suppression list; bounces still count against your rate |
| AWS SES | Using `configurationSet: 'marketing'` hardcoded in two places (ses-client.ts and bulk-send.worker.ts) | The configuration set name must exist in SES; deploy will silently fail sends if the set is not created in the target AWS account |
| PgBouncer | Using transaction-mode pooling with Kysely's prepared statements | PgBouncer < 1.21 silently corrupts prepared statement state in transaction mode; verify `max_prepared_statements` setting or use `pg` driver with `no_prepare` mode |
| BullMQ | Not setting `removeOnComplete` / `removeOnFail` limits | Completed/failed job records accumulate in Redis indefinitely; Redis memory bloats over time for high-volume sends |
| BullMQ | Closing `bulkSendQueue` inside the orchestrator worker | `bulkSendQueue.close()` after `add()` calls is correct, but if the process dies before close, the queue connection leaks — ensure `try/finally` |
| Redis | `allkeys-lru` eviction with durable application data | Any Redis key can be evicted under memory pressure; never store recoverable state (holdback lists, mapping presets) in Redis only |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Enqueuing 10,000+ BullMQ jobs one-by-one in a loop | Orchestrator job takes minutes; Redis write pressure spikes | Use `Queue.addBulk()` instead of looping `queue.add()` | At ~1,000+ recipients |
| Dynamic segment query executed at send time against full contacts table | Campaign send is slow to start; DB CPU spikes during orchestration | Pre-compute and cache segment membership, or paginate the contact query | At 50,000+ contacts |
| Click tracking redirect doing two sequential DB queries on every click | Redirect latency is 200-500ms instead of <50ms | Go directly to the `SENT` event link_map; use a dedicated `message_links` table | From first send |
| Concurrent UPDATE on `campaigns.total_opens` at 40 emails/sec | Row contention, lock waits in `pg_stat_activity` | Batch counter updates via a background aggregation job or use the events table as the source of truth | At sustained 20+ opens/sec |
| `selectAll()` on messages for campaign recipients endpoint | Slow pagination; large payloads | Select only needed columns; the messages table will be very wide for large campaigns | At 100,000+ messages |
| CSV import storing full row data in Redis job payload | Redis memory spike on large imports | Stream CSV rows or store import data in a temp table in PostgreSQL, pass only the import ID through the queue | At 50,000+ row imports |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `origin: true` CORS reflecting any origin with credentials | CSRF-equivalent attacks from any origin against the API | Explicit origin allowlist via `CORS_ORIGIN` env var |
| API key bcrypt comparison iterating all keys with matching prefix | Timing side-channel (minor) and unnecessary DB load | Already prefix-filtered; ensure prefix is long enough (12 chars is sufficient) |
| SNS SubscribeURL only validates `.amazonaws.com` suffix | A crafted URL like `evil.amazonaws.com.attacker.com` might bypass a naive suffix check | Current code uses `new URL()` and `.test(parsed.hostname)` — this is correct; verify regex anchoring |
| Tracking pixel / unsubscribe endpoints have no rate limiting | Open redirect and unsubscribe endpoints can be enumerated/abused | Apply lightweight rate limiting per IP to tracking routes even though they are public |
| `JWT_SECRET` minimum length of 32 chars enforced in Zod schema | Weak secrets allowed | Add entropy check (reject non-random strings); generate with `openssl rand -base64 48` in deployment docs |
| Merge tag rendering does not sanitize custom field values | If a custom field contains `<script>` or HTML, it is injected into the email HTML | Sanitize or HTML-encode custom field values before substitution in `processMergeTags` |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Campaign stuck in `SENDING` status with no progress indicator or timeout | Operator has no visibility into whether the send is progressing or hung | Add a `progress` field or compute send progress from `total_sent / expected_recipients`; surface in UI |
| No pre-send validation of merge tags | Emails go out with `{{first_name}}` literally rendered if fallback is omitted and field is empty | Add a pre-send content check that scans HTML for unresolved merge tag patterns |
| A/B test "winner" declared even when sample size is too small for statistical significance | Operator trusts a winner that is random noise | Require minimum sample size (e.g., 100 sends per variant) before evaluating; show confidence intervals |
| No confirmation step before sending to large list | Accidental sends to entire contact list | Require explicit confirmation with recipient count shown before transitioning from draft to sending |
| Import errors stored in DB but no UI path to view them | Operator cannot see why contacts failed to import | Ensure the import error details endpoint is surfaced in the UI, not just available via API |

---

## "Looks Done But Isn't" Checklist

- [ ] **Campaign send pipeline:** The `sendCampaign` service uses `redis.lpush` — verify this actually reaches the `createCampaignSendWorker` BullMQ worker or campaigns will silently not send
- [ ] **A/B holdback persistence:** Verify holdback contacts survive Redis restart before enabling A/B campaigns in production — test with `redis-cli DEBUG SLEEP` to simulate eviction
- [ ] **SES configuration set:** Confirm a configuration set named `'marketing'` exists in the target AWS account and region before first send
- [ ] **SNS subscription:** Verify the SES→SNS→API webhook chain is confirmed and active; without this, bounces and complaints are not processed and contacts remain active
- [ ] **PgBouncer prepared statements:** Confirm `pg_node_postgres` driver used by Kysely does not use prepared statements by default, or that PgBouncer is configured with `max_prepared_statements > 0` (requires PgBouncer >= 1.21)
- [ ] **Bull Board:** Currently a placeholder container (`echo "placeholder"`); no worker monitoring is possible without it — verify it is functional before production
- [ ] **Scheduled campaigns:** There is no scheduler job that checks for campaigns with `status = SCHEDULED` and `scheduled_at <= NOW()` and triggers them — verify this path exists in the workers
- [ ] **Tracking BASE_URL:** Env var `BASE_URL` must be set in workers and API; the fallback is a hardcoded domain that may not resolve in a new deployment
- [ ] **Duplicate message guard:** No unique constraint on `messages(campaign_id, contact_id)` — a worker retry can insert a duplicate and send twice
- [ ] **Resend-to-non-openers logic:** The `resend_enabled` and `resend_config` fields are stored on campaigns but there is no visible worker path that implements the resend trigger — verify this is wired up

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Campaign sent twice (duplicate) | HIGH | Identify affected contacts via duplicate `messages` rows; send apology email; add unique constraint to prevent recurrence |
| SES account suspended | HIGH | Stop all sends immediately; review bounce/complaint sources; contact AWS support; clean suppression list; wait 24-72 hours for review |
| A/B holdback contacts lost | MEDIUM | Identify holdback group from campaign config (test percentage × list size); re-enqueue manually with winning variant; add DB persistence going forward |
| Campaign stuck in SENDING (lpush/BullMQ mismatch) | MEDIUM | Manually update campaign status to DRAFT via DB; fix the queue mismatch; retry send |
| Counter drift in campaign stats | LOW | Recompute from events table: `SELECT COUNT(*) FROM events WHERE campaign_id = X AND event_type = Y`; update campaigns row; add reconciliation job |
| Redis eviction of mapping presets | LOW | Presets are user-friendly shortcuts only; users re-create them; move storage to DB for durability |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Duplicate sends on retry | Code review / remediation | Unique constraint on `messages(campaign_id, contact_id)` present; BullMQ jobId deduplication set |
| Redis counter race / eviction | Code review / remediation | Counter has TTL; allkeys-lru removed from critical data paths; integration test with Redis restart |
| SES bounce/complaint thresholds | Production readiness | CloudWatch alarms configured; deliverability dashboard shows thresholds |
| Counter drift from silent catch | Code review / remediation | All `.catch(() => {})` replaced with logging; no silent swallows in service layer |
| A/B holdback data loss | Code review / remediation | Holdback stored in DB; test with Redis flush |
| Campaign send via raw lpush | Code review / remediation | Functional end-to-end test: create campaign → send → verify BullMQ queue receives job |
| CORS wildcard in production | Production readiness / security | CORS origin is env-var configured; tested with cross-origin request from non-allowlisted origin |
| Click tracking double-query | Code review / remediation | Single query path to link_map; p99 redirect latency under 100ms |
| Scheduled campaigns trigger | Code review / remediation | Scheduler job exists and fires; test with a campaign scheduled 1 minute in future |
| Pre-send merge tag validation | Code review / remediation | Content check runs before status transitions to SENDING |

---

## Sources

- AWS SES enforcement FAQ and bounce/complaint thresholds: https://docs.aws.amazon.com/ses/latest/dg/faqs-enforcement.html
- AWS SES quota error handling: https://docs.aws.amazon.com/ses/latest/dg/manage-sending-quotas-errors.html
- BullMQ stalled jobs documentation: https://docs.bullmq.io/guide/workers/stalled-jobs
- BullMQ job deduplication documentation: https://docs.bullmq.io/guide/jobs/deduplication
- PgBouncer prepared statements in transaction mode (PgBouncer 1.21): https://www.crunchydata.com/blog/prepared-statements-in-transaction-mode-for-pgbouncer
- PostgreSQL concurrent counter update contention analysis: https://medium.com/fever-engineering/why-concurrent-updates-and-inserts-can-severely-impact-postgresql-performance-73b14bad5ee9
- Idempotency in email systems (River blog): https://riverqueue.com/blog/idempotent-email-api-with-river
- Direct codebase review of: `bulk-send.worker.ts`, `campaigns.service.ts`, `tracking.ts`, `webhooks-inbound.ts`, `segments.service.ts`, `ab-eval.worker.ts`, `app.ts`, `config.ts`, `docker-compose.yml`

---

*Pitfalls research for: email marketing platform (Third Wave Mail)*
*Researched: 2026-03-13*
