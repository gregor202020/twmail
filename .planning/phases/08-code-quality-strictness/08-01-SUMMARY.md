---
phase: "08"
plan: "01"
subsystem: "code-quality"
tags: ["typescript", "eslint", "type-safety", "as-any-removal"]
dependency_graph:
  requires: []
  provides: ["strict-type-checking", "zero-as-any"]
  affects: ["packages/api", "packages/workers", "packages/shared"]
tech_stack:
  added: []
  patterns:
    - "sql<SqlBool> template literals with sql.ref() for heterogeneous column comparisons"
    - "Expression<SqlBool> as common supertype for Kysely filter functions"
    - "redis as unknown as ConnectionOptions for BullMQ ioredis dual-package incompatibility"
    - "err: unknown with instanceof Error narrowing in catch blocks"
    - "JSON.parse() typed cast via as Record<string, string>"
key_files:
  created: []
  modified:
    - "packages/shared/src/schema.ts"
    - "packages/shared/src/segments.ts"
    - "packages/api/src/plugins/auth.ts"
    - "packages/api/src/middleware/auth.ts"
    - "packages/api/src/plugins/error-handler.ts"
    - "packages/api/src/routes/assets.ts"
    - "packages/api/src/routes/tracking.ts"
    - "packages/api/src/routes/users.ts"
    - "packages/api/src/routes/webhooks-inbound.ts"
    - "packages/api/src/services/auth.service.ts"
    - "packages/api/src/services/campaigns.service.ts"
    - "packages/api/src/services/contacts.service.ts"
    - "packages/api/src/services/segments.service.ts"
    - "packages/api/src/services/settings.service.ts"
    - "packages/api/src/services/imports.service.ts"
    - "packages/api/src/seed-admin.ts"
    - "packages/api/src/seed-templates.ts"
    - "packages/workers/src/scheduler.ts"
    - "packages/workers/src/workers/ab-eval.worker.ts"
    - "packages/workers/src/workers/bulk-send.worker.ts"
    - "packages/workers/src/workers/import.worker.ts"
    - "packages/workers/src/workers/resend.worker.ts"
    - "packages/workers/src/workers/webhook.worker.ts"
    - "eslint.config.mjs"
decisions:
  - "Use sql<SqlBool> template literals with sql.ref() rather than eb() operator calls for heterogeneous column comparisons — Kysely's OperandValueExpressionOrList does not accept RawBuilder as the third argument to eb()"
  - "Use Expression<SqlBool> as common return type for buildRuleFilter/buildSingleRule/buildJsonbRule — covers both ExpressionWrapper and RawBuilder<unknown> from sql templates"
  - "Use redis as unknown as ConnectionOptions for all BullMQ queue/worker connections — BullMQ expects its own ConnectionOptions type but ioredis Redis class is structurally compatible"
  - "Add CampaignHoldbackContactsTable to schema.ts — table was referenced in workers but missing from Database interface, causing 3 compile errors"
  - "Fastify plugin functions must be async per FastifyPluginAsync type but don't need await — suppress require-await per-function with eslint-disable-next-line"
metrics:
  duration_minutes: 120
  tasks_completed: 2
  files_modified: 24
  completed_date: "2026-03-13"
requirements: ["QUAL-08"]
---

# Phase 08 Plan 01: Remove as-any Casts and Enforce Strict ESLint Rules Summary

Remove all `as any` casts from backend TypeScript source, fix compile errors to achieve `tsc --noEmit` exit 0, then upgrade ESLint type-safety rules from warn to error.

## Tasks Completed

| Task | Description | Commit | Outcome |
|------|-------------|--------|---------|
| 1 | Remove all as-any casts, achieve tsc --noEmit exit 0 | 199c26f | 18 files changed, zero as-any in plan scope |
| 2 | Upgrade ESLint strict rules to error, achieve ESLint exit 0 | 469755d | 5 files fixed, 0 errors, 20 warnings |

## Verification Results

**Task 1 — TypeScript compile:**
- `npx tsc --noEmit -p packages/api/tsconfig.json` — exit 0
- `npx tsc --noEmit -p packages/workers/tsconfig.json` — exit 0
- `npx tsc --noEmit -p packages/shared/tsconfig.json` — exit 0

**Task 2 — ESLint strict rules:**
- `npx eslint packages/api/src packages/workers/src packages/shared/src` — 0 errors, 20 warnings
- All 6 target rules now enforced as errors: `no-explicit-any`, `no-unsafe-assignment`, `no-unsafe-call`, `no-unsafe-member-access`, `no-unsafe-argument`, `no-unsafe-return`
- Additional rule added: `no-unnecessary-type-assertion` as error

**Vitest tests:** 47 unit tests pass (tracking, segment-logic, sns-idempotency, error-shapes, ab-eval, bulk-send-dedup). Integration tests require live DB — pre-existing environment constraint, not related to this plan's changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added CampaignHoldbackContactsTable to schema.ts**
- **Found during:** Task 1
- **Issue:** `campaign_holdback_contacts` table was referenced in `bulk-send.worker.ts` and `ab-eval.worker.ts` but the `Database` interface in `schema.ts` had no entry for it, causing 3 compile errors.
- **Fix:** Added `CampaignHoldbackContactsTable` interface and wired it into `Database`.
- **Files modified:** `packages/shared/src/schema.ts`
- **Commit:** 199c26f

**2. [Rule 2 - Missing critical functionality] Fixed tracking.ts in Task 2 scope**
- **Found during:** Task 2
- **Issue:** `tracking.ts` contained `db: any`, `request: any`, and unsafe `(eb: any)` callbacks — not in the plan's listed files but caused ESLint error count to exceed zero.
- **Fix:** Added proper Kysely/Fastify types, typed all eb callbacks, replaced type assertions with `String()` coercion.
- **Files modified:** `packages/api/src/routes/tracking.ts`
- **Commit:** 469755d

**3. [Rule 2 - Missing critical functionality] Fixed seed scripts and imports.service.ts**
- **Found during:** Task 2 ESLint run
- **Issue:** `seed-admin.ts`, `seed-templates.ts` had `err.message` on untyped catch `err`; `imports.service.ts` had unsafe `JSON.parse()` assignment — all out-of-scope files that produced ESLint errors.
- **Fix:** Changed catch signatures to `err: unknown` with `instanceof Error` narrowing; added typed cast to `JSON.parse()`.
- **Files modified:** `packages/api/src/seed-admin.ts`, `packages/api/src/seed-templates.ts`, `packages/api/src/services/imports.service.ts`
- **Commit:** 469755d

## Key Patterns Established

- **Kysely heterogeneous comparisons:** `sql<SqlBool>\`${sql.ref(field)} = ${sql.val(value)}\`` avoids `as any` where column types differ from value types in `eb()` calls.
- **Kysely filter return type:** `Expression<SqlBool>` is the correct supertype for both `ExpressionWrapper` (from `eb()`) and `RawBuilder<unknown>` (from `sql` template literals).
- **BullMQ/ioredis:** `redis as unknown as ConnectionOptions` is the established pattern — both types represent the same ioredis class but BullMQ re-exports its own interface.
- **Fastify plugin async:** Plugins typed as `FastifyPluginAsync` must be async but handlers register routes synchronously — suppress `require-await` per-function with `// eslint-disable-next-line`.

## Self-Check: PASSED

- `199c26f` — `feat(08-01): remove all as-any casts and fix compile errors` — confirmed present
- `469755d` — `feat(08-01): enforce strict ESLint type-safety rules as errors` — confirmed present
- `packages/shared/src/schema.ts` — found
- `eslint.config.mjs` — found, all 6 rules at 'error' level verified
