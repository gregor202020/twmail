---
phase: 02-compliance
verified: 2026-03-13T12:00:00Z
status: gaps_found
score: 5/6 success criteria verified
gaps:
  - truth: "Receiving the same SNS bounce or complaint notification twice produces no duplicate suppression events"
    status: failed
    reason: "The numInsertedOrUpdatedRows guard is checking the property on an InsertResult[] array rather than on the first element. Kysely execute() without .returning() returns Promise<InsertResult[]>. Accessing .numInsertedOrUpdatedRows on the array returns undefined, which never equals 0n, so the guard never fires and side effects (counter increments, status updates) always execute on duplicate SNS deliveries."
    artifacts:
      - path: "packages/api/src/routes/webhooks-inbound.ts"
        issue: "Line 210: (bounceInsert as any).numInsertedOrUpdatedRows === 0n — bounceInsert is InsertResult[] (array), not InsertResult. Property access returns undefined. Line 260: same bug for complaintInsert."
    missing:
      - "Change .execute() to .executeTakeFirst() on both bounce and complaint inserts (lines 207 and 257), OR access bounceInsert[0]?.numInsertedOrUpdatedRows instead of bounceInsert.numInsertedOrUpdatedRows"
---

# Phase 2: Compliance Verification Report

**Phase Goal:** Every send is legally compliant and suppressed contacts stay suppressed
**Verified:** 2026-03-13T12:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Success Criteria from ROADMAP.md

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Receiving the same SNS bounce or complaint notification twice produces no duplicate suppression events | FAILED | DB unique index exists and ON CONFLICT clause is present, but the numInsertedOrUpdatedRows guard is broken — it tests the property on an array, not on the InsertResult element. Duplicates are silently inserted past the guard and side effects always execute. |
| 2 | A contact that hard-bounced or complained cannot receive any future campaign email | VERIFIED | webhooks-inbound.ts Bounce case sets ContactStatus.BOUNCED on hard bounce (line 228); Complaint case sets ContactStatus.COMPLAINED (line 270). All send-path workers (bulk-send, campaign-send, resend) filter WHERE status = ContactStatus.ACTIVE, which excludes values 3 and 4. |
| 3 | Every outbound email contains RFC 8058 List-Unsubscribe and List-Unsubscribe-Post headers | VERIFIED | tracking.ts getUnsubscribeHeaders() returns both List-Unsubscribe and List-Unsubscribe-Post: List-Unsubscribe=One-Click. bulk-send.worker.ts line 139 calls getUnsubscribeHeaders(messageId) and passes headers to sendEmail() for every outbound message. |
| 4 | A server-to-server POST to the unsubscribe endpoint succeeds without session or CSRF token | VERIFIED | app.ts line 59 registers trackingRoutes at root level with no auth prefix and no preHandler. POST /t/u/:messageId in tracking.ts (line 99) has no preHandler, no auth decorator, and no CSRF check. |
| 5 | Importing a CSV cannot re-subscribe a previously bounced, complained, or unsubscribed contact | VERIFIED | import.worker.ts line 77 SELECTs status field. Lines 82-91: isSuppressed guard checks ContactStatus.BOUNCED, COMPLAINED, UNSUBSCRIBED before any update. Guard runs before the updateExisting check (line 93), so suppressed contacts are skipped even when updateExisting=true. The continue statement skips both the contact update and the list-add block. |
| 6 | A campaign cannot be sent without a physical mailing address, regardless of template content | VERIFIED | campaigns.service.ts sendCampaign() (lines 173-177): reads settings.physical_address for id=1, throws AppError 400 VALIDATION_ERROR if empty or whitespace. Check runs after existing validations and before the status update to SENDING. |

**Score:** 5/6 success criteria verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `db/migrations/005_compliance.sql` | Unique index for SNS dedup + physical_address column | VERIFIED | Contains ALTER TABLE settings ADD COLUMN physical_address TEXT NOT NULL DEFAULT '' and CREATE UNIQUE INDEX idx_events_dedup_bounce_complaint ON events (message_id, event_type) WHERE event_type IN (5, 6, 7) AND message_id IS NOT NULL |
| `packages/shared/src/schema.ts` | SettingsTable with physical_address field | VERIFIED | Line 470: physical_address: Generated<string> with comment // empty string = not configured (CAN-SPAM COMP-06) |
| `packages/api/src/routes/webhooks-inbound.ts` | Idempotent SNS bounce/complaint event insertion | STUB | ON CONFLICT clause present (lines 206, 256) and unique index exists, but the numInsertedOrUpdatedRows guard on the array is broken — idempotency at the DB layer works, but application-layer side-effect guard does not |
| `packages/api/src/services/campaigns.service.ts` | Physical address validation at send time | VERIFIED | Lines 173-177: reads settings.physical_address, throws 400 if empty/whitespace |
| `packages/api/src/routes/settings.ts` | physical_address in update schema | VERIFIED | Line 11: physical_address: z.string().max(500).optional() |
| `packages/workers/src/workers/import.worker.ts` | Suppression guard with isSuppressed check | VERIFIED | Lines 77, 82-91: status field selected, guard checks all three suppressed statuses before updateExisting |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| webhooks-inbound.ts | 005_compliance.sql | ON CONFLICT relies on unique index | PARTIAL | ON CONFLICT columns=['message_id', 'event_type'] matches the unique index. DB-layer dedup works. Application side-effect guard is broken (array vs element property access). |
| campaigns.service.ts | settings.service.ts (settings table) | sendCampaign reads settings.physical_address | VERIFIED | Line 174: db.selectFrom('settings').select('physical_address').where('id', '=', 1).executeTakeFirst() — correct query and validation |
| import.worker.ts | ContactStatus enum | checks status against BOUNCED, COMPLAINED, UNSUBSCRIBED before update | VERIFIED | Lines 84-86: explicit checks for ContactStatus.BOUNCED, ContactStatus.COMPLAINED, ContactStatus.UNSUBSCRIBED |
| bulk-send.worker.ts | tracking.ts | getUnsubscribeHeaders called for every email | VERIFIED | Line 6: imported. Line 139: const headers = getUnsubscribeHeaders(messageId) called for every send path |

---

## COMP-01 Bug Detail

The SUMMARY claims `numInsertedOrUpdatedRows` is correctly checked, but the code is:

```typescript
const bounceInsert = await db
  .insertInto('events')
  .values({...})
  .onConflict((oc: any) => oc.columns(['message_id', 'event_type']).doNothing())
  .execute();  // returns Promise<InsertResult[]> — an ARRAY

if ((bounceInsert as any).numInsertedOrUpdatedRows === 0n) {  // BUG: array has no this property
  break;
}
```

Kysely's `.execute()` on an INSERT without `.returning()` returns `InsertResult[]` (array), not `InsertResult`. The `numInsertedOrUpdatedRows` property is on `InsertResult`, not on the array. Accessing it returns `undefined`. `undefined === 0n` is `false`. The guard never fires.

The unique index `idx_events_dedup_bounce_complaint` correctly prevents the duplicate event row at the database level — so duplicate suppression records in the `events` table are blocked. However, the application-level side effects (counter increments via `total_bounces`/`total_complaints` and contact/message status updates) execute twice on duplicate SNS delivery because the guard fails to detect the conflict.

**Fix required:** Change `.execute()` to `.executeTakeFirst()` on both Bounce (line 207) and Complaint (line 257) event inserts, then check `bounceInsert?.numInsertedOrUpdatedRows === 0n`.

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| COMP-01 | 02-01-PLAN | SNS bounce/complaint handler is idempotent | BLOCKED | DB-layer dedup works (unique index + ON CONFLICT present). Application-layer guard broken: .execute() returns InsertResult[] and property access on array is undefined. Counter increments fire on duplicate delivery. |
| COMP-02 | 02-02-PLAN | Hard bounces immediately suppress contact and prevent future sends | SATISFIED | webhooks-inbound.ts line 228 sets ContactStatus.BOUNCED on hard bounce; bulk-send/campaign-send/resend all filter WHERE status=ACTIVE |
| COMP-03 | 02-02-PLAN | Complaints immediately suppress contact and prevent future sends | SATISFIED | webhooks-inbound.ts line 270 sets ContactStatus.COMPLAINED; same ACTIVE filter excludes value 4 |
| COMP-04 | 02-02-PLAN | RFC 8058 List-Unsubscribe and List-Unsubscribe-Post headers on every outbound email | SATISFIED | tracking.ts getUnsubscribeHeaders() returns both headers; bulk-send.worker.ts line 139 applies them to every email |
| COMP-05 | 02-02-PLAN | Unsubscribe endpoint handles server-to-server POST without session/CSRF requirements | SATISFIED | trackingRoutes registered without auth; POST /t/u/:messageId has no preHandler |
| COMP-06 | 02-01-PLAN | Physical mailing address enforced at send layer | SATISFIED | campaigns.service.ts lines 173-177 guard in sendCampaign() before status update |
| COMP-07 | 02-02-PLAN | Import flow does not overwrite bounced/unsubscribed/complained contact status | SATISFIED | import.worker.ts isSuppressed guard runs before updateExisting check, skips both update and list-add |
| COMP-08 | 02-02-PLAN | Unsubscribed contacts excluded from pending/scheduled sends at query time | SATISFIED | campaign-send worker (lines 269, 279), bulk-send worker (line 45), resend worker (line 75) all filter WHERE status = ContactStatus.ACTIVE |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| packages/api/src/routes/webhooks-inbound.ts | 210 | `(bounceInsert as any).numInsertedOrUpdatedRows` — array has no such property, always undefined | BLOCKER | SNS duplicate deliveries cause double-counting of total_bounces, double status updates on messages, and double BOUNCED status sets on contacts |
| packages/api/src/routes/webhooks-inbound.ts | 260 | `(complaintInsert as any).numInsertedOrUpdatedRows` — same bug on complaint path | BLOCKER | SNS duplicate complaint deliveries cause double-counting of total_complaints and double COMPLAINED status sets |
| packages/api/src/routes/webhooks-inbound.ts | 150-152 | `processNotification(...).catch((err) => { console.error(...) })` — fire-and-forget swallows errors beyond logging | INFO | Not a compliance issue; logged as pre-existing pattern for Phase 4 (DATA-06) |

---

## Human Verification Required

None — all compliance behaviors can be verified programmatically by code trace.

---

## Gaps Summary

One gap blocks full phase goal achievement.

**COMP-01 — Idempotency guard is broken at application layer.** The database unique index correctly prevents duplicate rows in the `events` table. The ON CONFLICT DO NOTHING clause is correctly formed. However, the code intended to detect conflicts and skip side effects reads `numInsertedOrUpdatedRows` from the return value of `.execute()`, which on PostgreSQL via Kysely returns `InsertResult[]` (an array). The property does not exist on the array, evaluates to `undefined`, and the guard condition `undefined === 0n` is always `false`. As a result, on every duplicate SNS delivery: `total_bounces` or `total_complaints` is incremented a second time, message status is set again (idempotent, so harmless), and contact status is set again (also idempotent). The counter drift is the practical harm.

The fix is a one-line change per case: replace `.execute()` with `.executeTakeFirst()`, which returns `InsertResult | undefined` instead of `InsertResult[]`.

All other seven compliance requirements (COMP-02 through COMP-08) are correctly implemented and verified by code trace.

---

_Verified: 2026-03-13T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
