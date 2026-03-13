# Phase 8: Code Quality — Strictness - Research

**Researched:** 2026-03-13
**Domain:** TypeScript strict mode enforcement + API error response shape consistency
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| QUAL-08 | tsconfig strict: true verified; any escapes in JSONB handling removed | tsconfig.base.json already has `strict: true`; `as any` escapes identified in tracking.ts, webhooks-inbound.ts, services/segments.service.ts, workers/bulk-send.worker.ts — all removable with proper typing |
| QUAL-09 | Error response shape consistent across all routes ({ error: { code, message } }) | 4 non-conforming sends found in webhooks-inbound.ts (3) and assets.ts (1 conforming, already correct); errorHandlerPlugin centrally handles all thrown errors correctly |
</phase_requirements>

---

## Summary

Phase 8 has two tightly scoped tasks: (1) verify TypeScript strict mode is clean with zero suppressed `as any` escapes in service and worker code, and (2) ensure every API error response has the shape `{ error: { code, message } }`.

The baseline is strong. `tsconfig.base.json` already declares `strict: true` along with `noUncheckedIndexedAccess`, `noImplicitReturns`, and `noFallthroughCasesInSwitch`. All packages inherit from this base. The ESLint config from Phase 7 deliberately downgrades `no-explicit-any` and the `unsafe-*` family to `warn` for Phase 8 to clean up — these are the concrete target. Running `tsc --noEmit` across all packages reveals only two actual compile errors (both pre-existing): a BullMQ/ioredis dual-package type mismatch in api (already worked around with `as unknown as ConnectionOptions`) and a missing `campaign_holdback_contacts` table in the Kysely schema in workers (a real gap from Phase 1). Neither was introduced by Phase 7.

The error shape problem is isolated to `webhooks-inbound.ts`, which sends `{ error: 'string' }` (a bare string, not an object) in three early-exit paths for SNS webhook validation errors. These are the only non-conforming routes in the entire API. All other routes either use `AppError` (handled by the central error-handler plugin) or throw Zod errors (also handled centrally). The fix is mechanical: replace the three bare-string sends with `{ error: { code: ErrorCode.XXX, message: '...' } }`.

**Primary recommendation:** Two plans — Plan 01 cleans up all `as any` escapes and promotes ESLint unsafe rules from warn to error; Plan 02 fixes the three non-conforming error sends in webhooks-inbound.ts and adds a test that checks the shape of error responses from known error paths.

---

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| TypeScript | 5.x (via tsconfig.base.json) | Compiler | `strict: true` already set |
| typescript-eslint | v8 (eslint.config.mjs) | TS-aware lint rules | `unsafe-*` rules at warn level, need upgrading |
| Vitest | installed in api package | Test runner for error shape tests | vitest.config.ts exists |

No new packages are required for this phase.

---

## Architecture Patterns

### Current tsconfig Inheritance
```
tsconfig.base.json          ← strict: true, noUncheckedIndexedAccess, noImplicitReturns
├── packages/api/tsconfig.json
├── packages/workers/tsconfig.json
└── packages/shared/tsconfig.json (composite: true)
```

All three packages inherit `strict: true`. There is no override disabling it anywhere. The phase goal is not to enable strict — it is already on — but to eliminate all `as any` casts that suppress the strict checks.

### Error Shape — Current State
The central error handler (`packages/api/src/plugins/error-handler.ts`) produces the canonical shape for all thrown errors:
```typescript
// Canonical shape — already implemented and used for all AppError throws
{ error: { code: string, message: string, details?: Array<{field, message}> } }
```

The `setErrorHandler` plugin handles: ZodError, AppError, Fastify validation errors, rate-limit 429s, and unknown errors. All route-level `throw` statements already flow through this handler correctly.

**Non-conforming sends (inline `reply.send` calls that bypass the handler):**
- `webhooks-inbound.ts:142` — `{ error: 'Invalid SNS signature' }` (bare string)
- `webhooks-inbound.ts:156` — `{ error: 'Invalid SubscribeURL' }` (bare string)
- `webhooks-inbound.ts:159` — `{ error: 'Invalid SubscribeURL' }` (bare string)
- `webhooks-inbound.ts:176` — `{ error: 'Invalid SNS Message JSON' }` (bare string)

`assets.ts:12` already uses the correct shape: `{ error: { code: 'VALIDATION_ERROR', message: '...' } }`.

### as any Inventory (complete, by file)

**packages/api/src/:**
| File | Usage | Correct Fix |
|------|-------|-------------|
| middleware/auth.ts:6 | `(request.server as any).authenticate` | Extend FastifyInstance type via declaration merge |
| plugins/error-handler.ts:47 | `error as any` for Fastify validation errors | Use `FastifyError` type from fastify |
| routes/assets.ts:20 | `(request.query as any)?.campaign_id` | Declare Querystring generic on route |
| routes/users.ts:18,27 | `r as any` in z.refine | Use `Object.values(UserRole).includes(r)` or cast to `number` |
| routes/webhooks-inbound.ts:115,129 | `db as any` in processBounceSnsEvent, result casts | Pass typed `db` directly; use Kysely's `InsertResult` type |
| routes/webhooks-inbound.ts:214,235,243,292 | `data as any`, `bounce as any`, result casts | Narrow types via runtime checks or typed interfaces |
| services/auth.service.ts:102 | `payload as any` in jwt.sign | Provide correct `JwtPayload` interface |
| services/contacts.service.ts:49 | `sortBy as any` in orderBy | Validate against keyof Contact before passing |
| services/segments.service.ts:348–387 | `value as any` in Kysely operators | Use Kysely's `ReferenceExpression` / `ValueExpression` or `sql` template |
| services/settings.service.ts:11 | `{ id: 1 } as any` | Fix Kysely insert type for settings upsert |

**packages/workers/src/:**
| File | Usage | Correct Fix |
|------|-------|-------------|
| workers/bulk-send.worker.ts:39 | `db as any` in shouldSkipSend | Remove cast; Kysely query already typed correctly |
| workers/bulk-send.worker.ts:210 | `(eb: any)` in updateTable callback | Declare `eb` as `ExpressionBuilder` from kysely |
| workers/import.worker.ts:187 | `errors as any` | Use `errors.length > 0 ? errors : null` with proper typing |
| workers/import.worker.ts:196 | `redis as any` for BullMQ connection | Use `redis as unknown as ConnectionOptions` pattern (already established in Phase 6) |
| workers/ab-eval.worker.ts:80,99 | `redis as any` | Same pattern as above |
| workers/resend.worker.ts:105,117 | `redis as any` | Same pattern |
| workers/webhook.worker.ts:20,147 | `redis as any` | Same pattern |
| scheduler.ts:17 | `redis as any` | Same pattern |

**packages/shared/src/:**
| File | Usage | Correct Fix |
|------|-------|-------------|
| segments.ts:73–112 | `value as any` in Kysely operators | Same approach as api/services/segments.service.ts |

### Known Pre-Existing Compile Errors (not introduced by Phase 8)

1. **api — BullMQ/ioredis dual-package type mismatch** (`campaigns.service.ts:175`): BullMQ bundles its own vendored ioredis. The `redis.duplicate()` return type from the outer ioredis doesn't satisfy BullMQ's ConnectionOptions. This was noted in Phase 6 decision log: "use `as unknown as ConnectionOptions`". Fix: replace `redis.duplicate()` with `redis as unknown as ConnectionOptions` to match the established pattern.

2. **workers — `campaign_holdback_contacts` missing from Database interface** (`bulk-send.worker.ts:395`, `ab-eval.worker.ts:73,93`): The Kysely `Database` type in `packages/shared/src/schema.ts` does not include a `campaign_holdback_contacts` table, but the code references it. This table was created in Phase 1 migrations but not added to the schema type. Fix: add `CampaignHoldbackContactsTable` to the `Database` interface in `schema.ts`.

### Anti-Patterns to Avoid

- **`as any` to satisfy Kysely expression builders**: Kysely's `eb()` function accepts `ReferenceExpression | ValueExpression` — use `sql.lit(value)` or the proper Kysely generic types rather than casting.
- **Bare string error sends**: Never `reply.send({ error: 'string' })`. Always go through AppError throw or use the exact object shape `{ error: { code, message } }`.
- **`as any` on `db`**: The database is `Kysely<Database>` — using `db as any` defeats all query type-checking. The only exception is the BullMQ connection which requires `as unknown as ConnectionOptions`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| BullMQ connection type compatibility | Custom connection wrapper | `redis as unknown as ConnectionOptions` (established Phase 6 pattern) |
| Fastify error type narrowing | Custom error type guard | Import `FastifyError` from `'fastify'` |
| Kysely expression builder typing | Custom expression wrapper | `ExpressionBuilder<Database, TableName>` from `'kysely'` |
| Zod enum validation for UserRole | Custom role validator | `z.nativeEnum(UserRole)` or a z.union of the literal values |

---

## Common Pitfalls

### Pitfall 1: Trying to eliminate the BullMQ/ioredis `as unknown as ConnectionOptions`
**What goes wrong:** Attempting to pass `getRedis()` directly to BullMQ Queue/Worker constructors fails because BullMQ bundles its own vendored ioredis with an incompatible type interface. This is a known structural incompatibility — not fixable without changing the dependency tree.
**How to avoid:** Keep `redis as unknown as ConnectionOptions` for all BullMQ connection arguments. This is already the established pattern from Phase 6 for workers. The api-side `campaigns.service.ts` is using `redis.duplicate()` — change to `redis as unknown as ConnectionOptions` to match.
**Confidence:** HIGH (Phase 6 decision log explicitly documents this)

### Pitfall 2: Expecting `noUncheckedIndexedAccess` to be compatible with all array patterns
**What goes wrong:** With `noUncheckedIndexedAccess: true` (already in tsconfig.base.json), array element access returns `T | undefined`. Code that does `array[0].id` will fail if it hasn't guarded with the non-null assertion. The existing code uses `shuffled[i]!` and `shuffled[j]!` in bulk-send.worker.ts — this is correct.
**How to avoid:** Check indexed accesses — use `?? fallback` or `!` assertion only when the index is provably non-null (e.g., inside a `for (let i = 0; i < arr.length; i++)` loop).

### Pitfall 3: Upgrading `no-explicit-any` to `error` while any remain
**What goes wrong:** If `no-explicit-any` is upgraded to `error` in eslint.config.mjs before all `as any` casts are removed, the pre-commit hook will block all commits including the fix commits.
**How to avoid:** Remove all `as any` casts first, then upgrade the ESLint rule to `error` in the same commit or a follow-on commit. Upgrade the unsafe-* rules to `error` only after confirming lint passes cleanly.

### Pitfall 4: webhooks-inbound.ts error sends going through the central handler
**What goes wrong:** The non-conforming sends use `reply.status(N).send({ error: 'string' })` — they bypass the error handler entirely. Refactoring to `throw new AppError(...)` would work but is a slightly larger change. The simpler fix is to change the `send()` payload to `{ error: { code, message } }` inline (matching exactly what the error handler would produce) without restructuring the control flow.
**Why it matters:** This is an SNS webhook endpoint. If the shape changes to use `throw`, Fastify's async error handling still works correctly, but the SNS caller ignores error bodies anyway — the important thing is test coverage asserting the correct shape.

### Pitfall 5: `campaign_holdback_contacts` table not in Kysely schema
**What goes wrong:** Workers compile with 3 errors because the table is referenced but not declared in `Database`. This is a real gap — Phase 1 added the migration but the schema type was never updated.
**How to avoid:** Add `CampaignHoldbackContactsTable` interface to `packages/shared/src/schema.ts` as part of QUAL-08 work. This eliminates 3 compile errors and removes the need for any `as any` workaround in workers.

---

## Code Examples

### Extending FastifyInstance for authenticate (auth.ts)
```typescript
// Instead of: await (request.server as any).authenticate(request)
// Declare in plugins/auth.ts (or a types.d.ts):
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}
// Then in middleware/auth.ts:
await request.server.authenticate(request);
```

### Fixing Fastify error type (error-handler.ts)
```typescript
import type { FastifyError } from 'fastify';
// Instead of: const fastifyError = error as any;
const fastifyError = error as FastifyError;
if (fastifyError.validation) { ... }
```

### Fixing Kysely expression builder callback typing
```typescript
import type { ExpressionBuilder } from 'kysely';
import type { Database } from '@twmail/shared';
// Instead of: .set((eb: any) => ({ total_sent: eb('total_sent', '+', 1) }))
.set((eb: ExpressionBuilder<Database, 'campaigns'>) => ({
  total_sent: eb('total_sent', '+', 1),
}))
```

### Fixing the assets route Querystring type
```typescript
// Instead of: (request.query as any)?.campaign_id
app.post<{
  Querystring: { campaign_id?: string };
}>('/upload', async (request, reply) => {
  const campaignId = request.query.campaign_id ? Number(request.query.campaign_id) : undefined;
  ...
})
```

### Non-conforming error send fix (webhooks-inbound.ts)
```typescript
// Instead of:
return reply.status(403).send({ error: 'Invalid SNS signature' });
// Use:
return reply.status(403).send({ error: { code: 'INVALID_SNS_SIGNATURE', message: 'Invalid SNS signature' } });
```

### Adding campaign_holdback_contacts to Database schema
```typescript
// In packages/shared/src/schema.ts:
export interface CampaignHoldbackContactsTable {
  id: Generated<number>;
  campaign_id: number;
  contact_id: number;
  created_at: Generated<Date>;
}
// Add to Database interface:
campaign_holdback_contacts: CampaignHoldbackContactsTable;
```

### z.nativeEnum for UserRole (cleaner than refine + as any)
```typescript
// Instead of: z.number().refine((r) => [...].includes(r as any), ...)
// Use:
import { UserRole } from '@twmail/shared';
role: z.nativeEnum(UserRole)
// Note: z.nativeEnum works on numeric enums
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (packages/api/vitest.config.ts) |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` (from packages/api/) |
| Full suite command | `npx vitest run --coverage` (from packages/api/) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUAL-08 | `tsc --noEmit` exits 0 across all packages | type-check (not vitest) | `npx tsc --noEmit -p packages/api/tsconfig.json && npx tsc --noEmit -p packages/workers/tsconfig.json && npx tsc --noEmit -p packages/shared/tsconfig.json` | N/A (compiler check) |
| QUAL-08 | ESLint `no-explicit-any` at error level exits 0 | lint | `npx eslint packages/api/src packages/workers/src packages/shared/src` | N/A (lint check) |
| QUAL-09 | SNS signature failure returns `{ error: { code, message } }` | unit | `npx vitest run tests/error-shapes.test.ts` | ❌ Wave 0 |
| QUAL-09 | All inline error sends in webhooks-inbound.ts are conforming | unit | `npx vitest run tests/error-shapes.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit -p packages/api/tsconfig.json && npx tsc --noEmit -p packages/workers/tsconfig.json`
- **Per wave merge:** Full: `npx tsc --noEmit -p packages/api/tsconfig.json && npx tsc --noEmit -p packages/workers/tsconfig.json && npx tsc --noEmit -p packages/shared/tsconfig.json && npx vitest run --coverage`
- **Phase gate:** All of the above green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/tests/error-shapes.test.ts` — covers QUAL-09 (error response shape conformance); tests that inline sends from webhooks-inbound use `{ error: { code, message } }` shape. Can be done with unit tests against the resolved app routes or by inspecting the route handlers directly.

---

## Open Questions

1. **Should `no-explicit-any` be upgraded to `error` in eslint.config.mjs?**
   - What we know: Phase 7 deliberately left it at `warn` for Phase 8 to clean up (Phase 7 decision log: "unsafe-* rules downgraded to warn for Phase 8")
   - Recommendation: Yes — upgrade to `error` once all `as any` are removed. This is the stated intent from Phase 7. Also upgrade `no-unsafe-assignment`, `no-unsafe-call`, `no-unsafe-member-access`, `no-unsafe-argument`, `no-unsafe-return` from `warn` to `error`.

2. **Should webhooks-inbound.ts non-conforming sends use `throw new AppError` or inline `reply.send`?**
   - What we know: The existing pattern uses inline `reply.send` for these early exits because they are in `if/try/catch` blocks returning early. The AppError pattern also works since the error handler catches all thrown errors.
   - Recommendation: Use inline `reply.send({ error: { code, message } })` for these — avoids restructuring the control flow, and the SNS caller discards the body anyway. Keeps change minimal.

3. **Does QUAL-09 apply to tracking routes (pixel, click, unsubscribe)?**
   - What we know: Tracking routes do not return structured errors — they return HTTP 200 always (pixel, unsubscribe) or perform a redirect (click). No error shapes are sent by these routes.
   - Recommendation: Tracking routes are out of scope for QUAL-09. The requirement says "every API error response" — these routes don't produce error responses.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `packages/api/src/plugins/error-handler.ts` — canonical error shape
- Direct code inspection: `tsconfig.base.json` — `strict: true` already set
- Direct code inspection: `eslint.config.mjs` — Phase 7 decisions about downgraded rules
- `tsc --noEmit` output — actual compile errors confirmed by running the compiler
- Direct grep: all `as any` occurrences enumerated across all source files

### Secondary (MEDIUM confidence)
- TypeScript handbook strict mode flags — confirms that `strict: true` enables: `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitAny`, `noImplicitThis`, `alwaysStrict`
- Kysely documentation — `ExpressionBuilder` generic usage for typed query callbacks

### Tertiary (LOW confidence — not needed, phase is well-understood from code)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — tsconfig already has strict: true, all packages inherit it, verified by compiler
- Architecture: HIGH — error handler plugin inspected directly, all non-conforming sends found by grep
- Pitfalls: HIGH — BullMQ dual-package issue already documented in Phase 6 decisions; campaign_holdback_contacts gap confirmed by tsc output
- `as any` inventory: HIGH — grep enumeration of actual source files, complete list

**Research date:** 2026-03-13
**Valid until:** Indefinite (stable TypeScript, Fastify, Kysely APIs; no external dependency on changing third-party docs)
