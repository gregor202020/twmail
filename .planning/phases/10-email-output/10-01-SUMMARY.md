---
phase: 10-email-output
plan: "01"
subsystem: email-output
tags: [mjml, compilation, email-guards, url-validation, workers]
dependency_graph:
  requires: []
  provides: [mjml-html-compilation, email-output-guards]
  affects: [bulk-send-worker, grapes-editor, email-delivery]
tech_stack:
  added: []
  patterns: [runCommand-mjml-code-to-html, assertAbsoluteUrls, isMjmlSource]
key_files:
  created:
    - packages/workers/src/email-output.ts
    - packages/api/tests/email-output.unit.test.ts
  modified:
    - packages/frontend/src/components/editor/grapes-editor.tsx
    - packages/workers/src/workers/bulk-send.worker.ts
decisions:
  - "[10-01]: GrapesEditor.getHtml() uses runCommand('mjml-code-to-html') — returns compiled HTML, not MJML XML"
  - "[10-01]: onChange debounce also uses compiled output — no raw MJML ever reaches the API"
  - "[10-01]: assertAbsoluteUrls placed before shouldSkipSend dedup check — no point dedupping invalid content"
  - "[10-01]: isMjmlSource guard returns skipped result, not throw — MJML detection is a soft guard; assertAbsoluteUrls throws as hard guard"
metrics:
  duration_seconds: 356
  completed_date: "2026-03-13"
  tasks_completed: 2
  files_changed: 4
---

# Phase 10 Plan 01: Email Output Guards Summary

**One-liner:** MJML-to-HTML compilation via runCommand('mjml-code-to-html') on save, plus assertAbsoluteUrls/isMjmlSource guards in bulk-send worker with 23 unit tests.

## What Was Built

### Task 1: Fix GrapesEditor MJML compilation (commit: c656cbb)

Replaced `editor.getHtml() + getCss()` with `editor.runCommand('mjml-code-to-html')` in two places:
- `useImperativeHandle getHtml()` — callers (campaign-accordion, template edit page) now receive compiled HTML
- `handleUpdate` debounce callback — onChange also delivers compiled HTML

MJML compile warnings are logged via `console.warn`. The `GrapesEditorRef` interface is unchanged — callers are unaffected.

### Task 2: Email output guards and unit tests (commit: 63d77aa)

Created `packages/workers/src/email-output.ts` with two exports:

- **`assertAbsoluteUrls(html, campaignId)`** — regex scans all `src`/`href` values, allows `https?:`, `mailto:`, `tel:`, `cid:`, `#`, and empty string; throws `OPS-05` error with up to 3 sample relative URLs if found.
- **`isMjmlSource(html)`** — checks if trimmed string starts with `<mjml>` or `<mjml ` — detects uncompiled MJML.

Wired both guards into `bulk-send.worker.ts` BEFORE the `shouldSkipSend` dedup check:
- MJML detection returns `{ skipped: true, reason: 'uncompiled_mjml' }` with console.error
- URL guard throws, which BullMQ catches as a job failure (campaign content is broken — correct behavior)

23 unit tests in `packages/api/tests/email-output.unit.test.ts` cover all pass/fail cases.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing useRef TypeScript error**
- **Found during:** Task 1 verification
- **Issue:** `useRef<ReturnType<typeof setTimeout>>()` was missing its required initial value argument, causing `TS2554: Expected 1 arguments, but got 0`. This error pre-existed (was at line 97 in original, shifted to 104 after edits).
- **Fix:** Changed to `useRef<ReturnType<typeof setTimeout> | undefined>(undefined)`
- **Files modified:** `packages/frontend/src/components/editor/grapes-editor.tsx`
- **Commit:** c656cbb (included in Task 1 commit)

## Verification Results

| Check | Result |
|-------|--------|
| `vitest run tests/email-output.unit.test.ts` | 23/23 passed |
| `tsc --noEmit packages/frontend` | Clean |
| `tsc --noEmit packages/workers` | Clean |
| No `editor.getHtml()` in grapes-editor.tsx | Confirmed |
| No `getCss()` in grapes-editor.tsx | Confirmed |
| `assertAbsoluteUrls` in bulk-send.worker.ts | Confirmed |

## Self-Check: PASSED

- [x] `packages/frontend/src/components/editor/grapes-editor.tsx` — exists, modified
- [x] `packages/workers/src/email-output.ts` — exists, created
- [x] `packages/workers/src/workers/bulk-send.worker.ts` — exists, modified
- [x] `packages/api/tests/email-output.unit.test.ts` — exists, created
- [x] Commit c656cbb — Task 1
- [x] Commit 63d77aa — Task 2
