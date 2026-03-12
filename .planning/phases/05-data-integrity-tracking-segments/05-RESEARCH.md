# Phase 5: Data Integrity — Tracking & Segments - Research

**Researched:** 2026-03-13
**Domain:** Click tracking redirect correctness, URL encoding, segment rule evaluation, count consistency
**Confidence:** HIGH

## Summary

Phase 5 fixes four distinct bugs in the click tracking redirect path and the segment query engine. The codebase is already written — this is a surgical fix phase, not a build phase. All four bugs are locatable to specific functions in two files: `packages/api/src/routes/tracking.ts` (DATA-08, DATA-09) and `packages/api/src/services/segments.service.ts` (DATA-10, DATA-11).

**DATA-08/DATA-09** share the same root cause: the click redirect handler in `tracking.ts` queries the `events` table for an existing CLICK event first, then falls back to the SENT event's `link_map`. The intended design (DATA-09) is `link_map`-first — the CLICK event query is a legacy path that is both slower (full table scan on a partitioned table without a useful index on `metadata->>'link_hash'`) and wrong (it re-reads a URL from a previously-recorded click event, not the canonical source). **DATA-08** is not a code bug — the `rewriteLinks` function in `tracking.ts` (workers package) already preserves the original URL verbatim in `linkMap`. The bug is that the CLICK event path reconstructs the URL from an already-recorded click event's metadata, which is fine on first click but bypasses the proper lookup order defined by DATA-09.

**DATA-10** has a subtle but real bug: the `SegmentRule` type declares operators including `'between'`, `'before'`, `'after'`, and `'within_days'`, but `buildSingleRule` in `segments.service.ts` has no `case` for these four operators. Any rule using these operators throws `Unsupported operator` from the default case. Mixed AND/OR precedence itself is correct — `buildRuleFilter` correctly calls `eb.or()` or `eb.and()` — but incomplete operator coverage means some valid rules silently error.

**DATA-11**: The segment count endpoint (`getSegmentCount`) and the campaign send path (`createCampaignSendWorker`) use divergent queries for dynamic segments. `getSegmentCount` applies `buildRuleFilter`, but `createCampaignSendWorker` for `segment_id` campaigns uses a plain `innerJoin('contact_segments', ...)` — which is the static segment join, not a dynamic rule evaluation. This means a dynamic segment's preview count and actual send recipient count can diverge completely.

**Primary recommendation:** Fix tracking redirect to query SENT event link_map first (invert the lookup order), implement missing date/range operators in the segment rule engine, and fix the campaign send worker to use `buildRuleFilter` for dynamic segments rather than `contact_segments` join.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-08 | Click tracking redirect preserves original URL including encoded params and UTMs | `rewriteLinks` in `workers/src/tracking.ts` already preserves URL verbatim; fix is in redirect handler lookup order — use link_map as primary source |
| DATA-09 | Click tracking queries SENT event link_map first, not events table scan | Current code queries CLICK events first; fix inverts the lookup order: SENT event link_map primary, CLICK event metadata secondary (or removed entirely) |
| DATA-10 | Segment query AND/OR precedence produces correct contact lists | AND/OR logic itself is correct in `buildRuleFilter`; missing operators (`between`, `before`, `after`, `within_days`) cause runtime throws |
| DATA-11 | Segment preview counts match actual send counts | `getSegmentCount` uses `buildRuleFilter` for dynamic segments; `createCampaignSendWorker` uses `contact_segments` join (static path) for ALL segment-targeted campaigns |
</phase_requirements>

---

## Standard Stack

### Core (already in use — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Kysely | current | Type-safe query builder | Already the project ORM; `ExpressionBuilder` used in segment rule engine |
| PostgreSQL JSONB | - | `metadata` column on events table; `custom_fields` on contacts | Already indexed; `idx_events_message ON events (message_id, event_type)` covers SENT event lookup |
| Vitest | current | Test framework | Already configured; `packages/api/tests/` has segments and tracking test files |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `URL` | built-in | URL parsing and validation in redirect handler | Already used in tracking route for protocol validation |
| `crypto.createHash` | built-in | SHA-256 link hashing in `rewriteLinks` | Already used |

### Alternatives Considered

None — this is a fix phase against an existing stack. No new libraries.

**Installation:** None required.

---

## Architecture Patterns

### Relevant Project Structure

```
packages/
├── api/src/routes/tracking.ts         # DATA-08, DATA-09: click redirect handler
├── api/src/services/segments.service.ts  # DATA-10, DATA-11: rule engine + count
├── workers/src/tracking.ts            # link map generation (correct as-is)
├── workers/src/workers/bulk-send.worker.ts  # DATA-11: send recipient resolution
└── api/tests/
    ├── tracking.test.ts               # existing test: detectMachineOpen only
    └── segments.test.ts               # existing test: CRUD only, no rule logic tests
```

### Pattern 1: Click Redirect — Current (Broken) Lookup Order

**What:** Handler first queries CLICK events for an existing metadata record, then falls back to SENT event link_map.
**Problem:** CLICK event query uses `sql\`metadata->>'link_hash'\`` with `=` comparison — this is a JSONB text extraction filter on a partitioned table. The `idx_events_message` index covers `(message_id, event_type)` but the additional `metadata` filter is not indexed, causing a partial index scan + JSONB extraction per row. More critically, the CLICK event does not exist on first click — so the handler always falls through to the SENT event lookup on the happy path, defeating the purpose.
**Correct design:** Query SENT event link_map directly. SENT event lookup uses `idx_events_message` cleanly (message_id + event_type=1). The CLICK event path should be removed entirely.

```typescript
// CURRENT (broken) — tracking.ts lines 58-84
const event = await db
  .selectFrom('events')
  .select('metadata')
  .where('message_id', '=', messageId)
  .where('event_type', '=', EventType.CLICK)
  .where(sql`metadata->>'link_hash'`, '=', linkHash)
  .executeTakeFirst();
// ... then fallback to SENT event
```

```typescript
// FIXED — query SENT event link_map first (DATA-09)
const sentEvent = await db
  .selectFrom('events')
  .select('metadata')
  .where('message_id', '=', messageId)
  .where('event_type', '=', EventType.SENT)
  .executeTakeFirst();

if (sentEvent?.metadata && typeof sentEvent.metadata === 'object' && 'link_map' in sentEvent.metadata) {
  const map = sentEvent.metadata.link_map as Record<string, string>;
  if (map[linkHash]) {
    targetUrl = map[linkHash];
  }
}
```

### Pattern 2: URL Preservation (DATA-08)

**What:** `rewriteLinks` in `workers/src/tracking.ts` hashes the original URL and stores it verbatim in `linkMap`. The `linkMap` is written to the SENT event metadata. The URL is not modified or re-encoded at any point in the worker.
**Finding:** There is no URL encoding bug in `rewriteLinks`. The hash is SHA-256 of the raw URL string including query params. The linkMap value is the exact original URL string.
**Risk:** If the redirect handler reads from the SENT event link_map (after fix), URL fidelity is guaranteed. The current CLICK event path also stored `url` verbatim in `recordClick` — so DATA-08 is addressed automatically by fixing DATA-09.
**Caveat to verify:** The URL regex in `rewriteLinks` is `href="(https?:\/\/[^"]+)"`. If a URL contains a double-quote character (percent-encoded as `%22`), the regex would truncate at the first `"`. This is an edge case worth documenting but unlikely in practice with well-formed HTML email templates.

### Pattern 3: Segment Rule Engine — Missing Operators (DATA-10)

**What:** `buildSingleRule` in `segments.service.ts` has a `switch(operator)` with cases for: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `not_contains`, `starts_with`, `ends_with`, `is_set`, `is_not_set`, `in`, `not_in`. Throws on `default`.
**Missing from switch but declared in `SegmentRule` type:**
- `between` — range between two values (e.g., engagement_score between 50 and 80)
- `before` — date before (e.g., last_open_at before 30 days ago)
- `after` — date after
- `within_days` — relative date range (e.g., last_click_at within 7 days)

**Implementation pattern for date operators:**

```typescript
case 'before':
  return eb(col, '<', new Date(value as string) as any);
case 'after':
  return eb(col, '>', new Date(value as string) as any);
case 'between': {
  const [low, high] = value as [string | number, string | number];
  return eb.and([eb(col, '>=', low as any), eb(col, '<=', high as any)]);
}
case 'within_days': {
  const days = Number(value);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return eb(col, '>=', cutoff as any);
}
```

### Pattern 4: Dynamic Segment Send Resolution (DATA-11)

**What:** `createCampaignSendWorker` resolves contacts for `campaign.segment_id` using:
```typescript
const contacts = await db
  .selectFrom('contacts')
  .select('id')
  .where('status', '=', ContactStatus.ACTIVE)
  .innerJoin('contact_segments', 'contact_segments.contact_id', 'contacts.id')
  .where('contact_segments.segment_id', '=', campaign.segment_id)
  .execute();
```
This is the **static segment join** — it reads from the `contact_segments` pivot table. Dynamic segments do NOT populate `contact_segments`; that table is only for `SegmentType.STATIC` (type=2) segments. Dynamic segments (type=1) are evaluated on-demand by `buildRuleFilter`.

**Fix requires:** The send worker must fetch the segment, check its type, and apply `buildRuleFilter` for dynamic segments. The `buildRuleFilter` function lives in `segments.service.ts` — it needs to be exported (or a helper exported) so the worker can import and use it. Alternatively, duplicate the query logic in the worker (not preferred — divergence risk).

**Preferred approach:** Export a `resolveSegmentContactIds(segmentId: number): Promise<number[]>` function from `segments.service.ts` that handles both static (contact_segments join) and dynamic (buildRuleFilter) cases. The send worker imports and calls this function.

```typescript
// segments.service.ts — new export
export async function resolveSegmentContactIds(segmentId: number): Promise<number[]> {
  const db = getDb();
  const segment = await getSegment(segmentId);

  if (segment.type === SegmentType.STATIC) {
    const rows = await db
      .selectFrom('contact_segments')
      .innerJoin('contacts', 'contacts.id', 'contact_segments.contact_id')
      .select('contacts.id')
      .where('contact_segments.segment_id', '=', segmentId)
      .where('contacts.status', '=', ContactStatus.ACTIVE)
      .execute();
    return rows.map((r) => r.id);
  }

  // Dynamic segment
  if (!segment.rules) return [];
  const ruleGroup = segment.rules as unknown as SegmentRuleGroup;
  const rows = await db
    .selectFrom('contacts')
    .select('id')
    .where('status', '=', ContactStatus.ACTIVE)
    .where(buildRuleFilter(ruleGroup))
    .execute();
  return rows.map((r) => r.id);
}
```

### Anti-Patterns to Avoid

- **Removing the SENT event link_map fallback in tracking.ts:** The SENT event link_map IS the correct primary source (DATA-09). Keep it; eliminate the CLICK event query.
- **Importing `buildRuleFilter` directly into the worker:** `buildRuleFilter` is not currently exported. Either export a higher-level function (`resolveSegmentContactIds`) or export `buildRuleFilter`. Prefer the higher-level function — it encapsulates the static/dynamic branching.
- **Adding a new DB index for JSONB metadata scanning:** After fixing DATA-09, the CLICK event JSONB metadata path is removed. Do not add an index for a code path being deleted.
- **Modifying `getSegmentCount` for DATA-11:** `getSegmentCount` is already correct for dynamic segments (uses `buildRuleFilter`). The bug is in the send worker only. Do not change count logic.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL parameter preservation | Custom URL re-encoding/reconstruction | Trust the existing `linkMap` value verbatim | `rewriteLinks` already stores the original URL string exactly as it appeared in the HTML |
| AND/OR condition building | String SQL concatenation | Kysely `eb.and()` / `eb.or()` | Type-safe, injection-safe, already used in `buildRuleFilter` |
| Date arithmetic for `within_days` | Raw SQL | `new Date(Date.now() - days * ms)` in JS, pass as Kysely parameter | Kysely handles parameterization; keeps logic in application layer |
| Segment type dispatch | Duplicate query logic in worker | Exported `resolveSegmentContactIds` helper | Single source of truth; both preview and send use same logic |

---

## Common Pitfalls

### Pitfall 1: Assuming CLICK event always exists before first click
**What goes wrong:** Current code queries CLICK events for URL resolution. On first click there are no CLICK events for this message, so the query returns undefined and the code falls to the SENT event lookup. This means DATA-08 "works" accidentally on first click but only because it falls through to the correct path.
**Why it happens:** The CLICK event lookup was intended as a cache-style read of previously-seen clicks, but the real canonical source is always the SENT event link_map.
**How to avoid:** Remove the CLICK event query entirely. The SENT event link_map is written atomically at send time and is always present for a valid messageId.

### Pitfall 2: Conflating static and dynamic segment resolution
**What goes wrong:** The send worker uses the `contact_segments` join for all segment-targeted campaigns. Dynamic segments never populate `contact_segments`, so a campaign targeting a dynamic segment reaches zero contacts.
**Why it happens:** The static segment path was written first; dynamic segment support was added to the API layer but the worker was not updated.
**How to avoid:** Check `segment.type` before resolving recipients. Use `contact_segments` only for `SegmentType.STATIC`.

### Pitfall 3: Missing operator throws at query time, not at rule creation time
**What goes wrong:** Creating a segment with `operator: 'within_days'` succeeds (no validation on input schema). The error only surfaces when the segment is evaluated (preview, count, or send), returning a 400 or 500 to the user with no clear message about which rule is invalid.
**Why it happens:** The `createSchema` / `updateSchema` Zod schemas in `segments.ts` accept `rules` as `z.record(z.unknown())` — no operator validation.
**How to avoid:** Implement missing operators. Optionally add Zod validation for operator values, but that is a code quality concern (QUAL phase), not the primary fix here.

### Pitfall 4: `within_days` operator semantics
**What goes wrong:** "within last N days" should mean `column >= now - N days`. If implemented as `column <= now - N days` it produces the inverse (contacts who have NOT engaged recently).
**How to avoid:** `within_days` = `column >= cutoff` where cutoff = `Date.now() - N * 86400000`. Document the semantics clearly in the implementation.

### Pitfall 5: URL with encoded query strings double-encoded on redirect
**What goes wrong:** If `targetUrl` from link_map is passed through `new URL(targetUrl)` and then `url.href` is used for redirect, percent-encoded characters may be re-encoded (e.g., `%20` becomes `%2520`).
**How to avoid:** Use `targetUrl` directly for `reply.redirect(targetUrl)` after protocol validation. Do not reconstruct via `url.href`. The existing code already does `return reply.redirect(targetUrl)` with the raw string — this is correct.

---

## Code Examples

### DATA-09 Fixed Redirect Handler

```typescript
// Source: packages/api/src/routes/tracking.ts — corrected lookup order
app.get<{ Params: { messageId: string; linkHash: string } }>(
  '/t/c/:messageId/:linkHash',
  { config: { rateLimit: false } },
  async (request, reply) => {
    const { messageId, linkHash } = request.params;
    const db = getDb();

    let targetUrl = 'https://thirdwavebbq.com.au'; // fallback

    // DATA-09: Query SENT event link_map first (idx_events_message covers this)
    const sentEvent = await db
      .selectFrom('events')
      .select('metadata')
      .where('message_id', '=', messageId)
      .where('event_type', '=', EventType.SENT)
      .executeTakeFirst();

    if (
      sentEvent?.metadata &&
      typeof sentEvent.metadata === 'object' &&
      'link_map' in sentEvent.metadata
    ) {
      const map = sentEvent.metadata.link_map as Record<string, string>;
      if (map[linkHash]) {
        targetUrl = map[linkHash]; // DATA-08: original URL preserved verbatim
      }
    }

    // Validate redirect URL to prevent open redirect
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        targetUrl = 'https://thirdwavebbq.com.au';
      }
    } catch {
      targetUrl = 'https://thirdwavebbq.com.au';
    }

    // Record click event async
    recordClick(db, messageId, linkHash, targetUrl, request).catch((err) => {
      request.log.error({ err, messageId, linkHash }, 'recordClick failed');
    });

    return reply.redirect(targetUrl); // targetUrl is the raw string, not url.href
  },
);
```

### DATA-10 Missing Operators

```typescript
// Source: packages/api/src/services/segments.service.ts — buildSingleRule additions
case 'before':
  return eb(col, '<', new Date(value as string) as any);
case 'after':
  return eb(col, '>', new Date(value as string) as any);
case 'between': {
  const [low, high] = value as [string | number, string | number];
  return eb.and([eb(col, '>=', low as any), eb(col, '<=', high as any)]);
}
case 'within_days': {
  const days = Number(value);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return eb(col, '>=', cutoff as any);
}
```

### DATA-11 resolveSegmentContactIds helper

```typescript
// Source: packages/api/src/services/segments.service.ts — new export
export async function resolveSegmentContactIds(segmentId: number): Promise<number[]> {
  const db = getDb();
  const segment = await getSegment(segmentId);

  if (segment.type === SegmentType.STATIC) {
    const rows = await db
      .selectFrom('contact_segments')
      .innerJoin('contacts', 'contacts.id', 'contact_segments.contact_id')
      .select('contacts.id')
      .where('contact_segments.segment_id', '=', segmentId)
      .where('contacts.status', '=', ContactStatus.ACTIVE)
      .execute();
    return rows.map((r) => r.id);
  }

  // Dynamic segment: evaluate rules
  if (!segment.rules) return [];
  const ruleGroup = segment.rules as unknown as SegmentRuleGroup;
  const rows = await db
    .selectFrom('contacts')
    .select('id')
    .where('status', '=', ContactStatus.ACTIVE)
    .where(buildRuleFilter(ruleGroup))
    .execute();
  return rows.map((r) => r.id);
}
```

### DATA-11 Send Worker Update

```typescript
// Source: packages/workers/src/workers/bulk-send.worker.ts — createCampaignSendWorker
// Replace the segment resolution block:
if (campaign.segment_id) {
  // Import resolveSegmentContactIds from segments.service (or shared helper)
  contactIds = await resolveSegmentContactIds(campaign.segment_id);
}
```

Note: The worker package currently has no import from the API package's services. Two options:
1. Move `resolveSegmentContactIds` to `packages/shared/src/` (accessible from both api and workers)
2. Duplicate the segment resolution logic in the worker (not preferred)

The cleanest solution is option 1: add a `resolveSegmentContactIds` function to the shared package, which already contains `getDb`, `ContactStatus`, and `SegmentType`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CLICK event query for URL resolution | SENT event link_map lookup (after fix) | Phase 5 | Single DB query instead of two; uses covered index |
| Static-only segment join in send worker | Type-aware dispatch (static vs dynamic) | Phase 5 | Dynamic segments can now be used as campaign targets |

**Deprecated/outdated:**
- CLICK event metadata query in redirect handler: Remove entirely. The CLICK event is a write-only audit trail; URL resolution must use the SENT event's link_map.

---

## Open Questions

1. **Should the `between` operator value be typed as a tuple `[low, high]` or an object `{ min, max }`?**
   - What we know: The `SegmentRule.value` type is `string | number | boolean | string[] | number[]` — no tuple type, no object type
   - What's unclear: The frontend likely passes this as a two-element array based on the existing array type in the union
   - Recommendation: Implement as two-element array `[low, high]` — matches the existing type. Document clearly in code.

2. **Should `resolveSegmentContactIds` live in shared or api?**
   - What we know: Workers cannot import from api (dependency direction). Shared can be imported by both.
   - What's unclear: Whether `buildRuleFilter` uses any API-specific types that would need to move to shared
   - Recommendation: `buildRuleFilter` uses `ExpressionBuilder<Database, 'contacts'>` from Kysely and `Database` from shared — all these are already in shared. Move `resolveSegmentContactIds` + `buildRuleFilter` to shared. Keep `segments.service.ts` importing from shared.

3. **Are there any campaigns currently using dynamic segments that have sent zero emails due to DATA-11?**
   - What we know: The bug exists in the current code. Any SENT campaign with `segment_id` targeting a dynamic segment (type=1) would have resolved via `contact_segments`, which is empty for dynamic segments.
   - What's unclear: Whether any live campaigns were affected
   - Recommendation: This is a production correctness question, not a research question. The fix prevents future occurrences. Past campaigns cannot be re-sent without user action.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (configured) |
| Config file | `packages/api/vitest.config.ts` (inferred from existing tests) |
| Quick run command | `cd packages/api && npx vitest run tests/tracking.test.ts tests/segments.test.ts` |
| Full suite command | `cd packages/api && npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-08 | Redirect preserves URL with UTM params and encoded chars | unit | `cd packages/api && npx vitest run tests/tracking.test.ts` | Partial (file exists, needs new tests) |
| DATA-09 | Redirect reads SENT event link_map, not CLICK event scan | unit | `cd packages/api && npx vitest run tests/tracking.test.ts` | Partial (file exists, needs new tests) |
| DATA-10 | AND/OR rules + date operators produce correct contact sets | unit | `cd packages/api && npx vitest run tests/segments.test.ts` | Partial (file exists, needs new tests) |
| DATA-11 | Dynamic segment preview count equals send recipient count | unit | `cd packages/api && npx vitest run tests/segments.test.ts` | Partial (file exists, needs new tests) |

### Sampling Rate

- **Per task commit:** `cd packages/api && npx vitest run tests/tracking.test.ts tests/segments.test.ts`
- **Per wave merge:** `cd packages/api && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

The test files exist but cover only surface behaviors (detectMachineOpen, basic CRUD). New test cases are needed:

- [ ] `packages/api/tests/tracking.test.ts` — Add: redirect URL preservation with UTM params, redirect reads link_map not CLICK events, fallback on missing messageId
- [ ] `packages/api/tests/segments.test.ts` — Add: `within_days` operator, `before`/`after` operators, `between` operator, AND/OR mixed precedence with multiple rule groups, dynamic segment count vs static segment count divergence test

Note: Full integration tests for tracking routes require a test DB. Unit tests for `buildRuleFilter` and `buildSingleRule` are achievable if those functions are exported — add exports as needed.

---

## Sources

### Primary (HIGH confidence)

- Direct code inspection — `packages/api/src/routes/tracking.ts` (full file read)
- Direct code inspection — `packages/api/src/services/segments.service.ts` (full file read)
- Direct code inspection — `packages/workers/src/workers/bulk-send.worker.ts` (full file read)
- Direct code inspection — `packages/workers/src/tracking.ts` (full file read)
- Direct code inspection — `packages/shared/src/types.ts` (SegmentRule operators, EventType)
- Direct code inspection — `db/migrations/001_initial_schema.sql` (events table DDL and indexes)

### Secondary (MEDIUM confidence)

- Kysely expression builder pattern — observed from existing `buildRuleFilter` usage; consistent with Kysely documentation patterns

### Tertiary (LOW confidence)

- None

---

## Metadata

**Confidence breakdown:**
- Bug identification (DATA-08/09): HIGH — code path traced end-to-end from `rewriteLinks` through SENT event insert through click redirect handler
- Bug identification (DATA-10): HIGH — `buildSingleRule` switch statement inspected; missing cases confirmed against `SegmentRule` operator type union
- Bug identification (DATA-11): HIGH — `createCampaignSendWorker` segment resolution traced; `contact_segments` join confirmed as static-only path
- Fix patterns: HIGH — Kysely APIs already in use; patterns match existing code style
- `resolveSegmentContactIds` location (shared vs api): MEDIUM — requires checking if Kysely types needed are available in shared (likely yes based on existing shared/src/schema.ts contents, but not verified for ExpressionBuilder import)

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable codebase, no external dependencies changing)
