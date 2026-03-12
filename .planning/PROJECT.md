# Third Wave Mail

## What This Is

A full-featured email marketing platform built as a TypeScript monorepo (Fastify API, Next.js 16 frontend, BullMQ workers, shared types). It enables creating and managing email campaigns with drag-and-drop editing, contact management, audience segmentation, A/B testing, analytics, and AWS SES integration. Built for Third Wave Cafe's marketing needs with the potential to serve other businesses.

## Core Value

Reliably send targeted email campaigns with tracking and analytics — every email must be deliverable, trackable, and the data must be accurate.

## Requirements

### Validated

- ✓ JWT authentication with role-based access (admin/editor/viewer) — existing
- ✓ Campaign CRUD with full lifecycle (draft/scheduled/sending/sent/paused/cancelled) — existing
- ✓ Drag-and-drop email editor (GrapeJS + MJML) — existing
- ✓ Template system with categories, cloning, and save-as-template — existing
- ✓ Contact management with custom fields, search, and activity timeline — existing
- ✓ List management (public/private) with bulk operations — existing
- ✓ Dynamic segments with rule engine (17 operators, AND/OR logic) — existing
- ✓ Static segments with manual member management — existing
- ✓ A/B testing (2-4 variants, statistical evaluation, auto-winner) — existing
- ✓ Resend to non-openers — existing
- ✓ Campaign scheduling with timezone support — existing
- ✓ Open/click tracking with machine open detection (Apple MPP) — existing
- ✓ UTM parameter and Google Analytics tracking — existing
- ✓ AWS SES integration with SNS bounce/complaint handling — existing
- ✓ CSV/paste contact import with column mapping and presets — existing
- ✓ Outbound webhooks with HMAC signing and retry logic — existing
- ✓ Reporting: overview, campaign comparison, growth, engagement, deliverability — existing
- ✓ API key management with scoped permissions — existing
- ✓ User management (admin CRUD, password reset) — existing
- ✓ Organization settings (sender defaults, timezone) — existing
- ✓ Asset upload and management — existing
- ✓ BullMQ worker system (bulk send, imports, webhooks) — existing
- ✓ Docker Compose deployment (Postgres, PgBouncer, Redis, Nginx) — existing
- ✓ Rate limiting and security (CORS, HTTPS, input validation) — existing
- ✓ RFC 8058 one-click unsubscribe — existing

### Active

- [ ] Comprehensive code review and remediation (errors, simplicity, correctness, flow)
- [ ] Production readiness audit (deploy, polish, launch)

### Out of Scope

- Real-time chat — not relevant to email marketing
- Mobile app — web-first, responsive design sufficient
- Automation workflows — tables exist but feature deferred to post-launch
- Multi-tenant / SaaS — single-org deployment for now

## Context

- **Stack**: Fastify + Kysely (API), Next.js 16 App Router + Tailwind v4 + shadcn/ui (frontend), BullMQ (workers), PostgreSQL 16 + PgBouncer + Redis 7
- **Brand**: Third Wave Cafe — Blue #0170B9, Red #C41E2A, Black #0A0A0A
- **Email**: AWS SES for sending, SNS for bounce/complaint feedback
- **DB**: Time-partitioned events table, daily stats aggregation, GIN indexes on JSONB
- **Editor**: GrapeJS with grapesjs-mjml plugin, loaded via next/dynamic (no SSR)
- **Auth**: JWT + httpOnly cookies via Next.js API proxy route
- **API pattern**: `{ data: T }` for singles, `{ data: T[], meta: {...} }` for lists
- **Repo**: https://github.com/gregor202020/Third-Wave-Mail
- **Node**: >=22.0.0 required

## Constraints

- **Email provider**: AWS SES — all sending infrastructure depends on it
- **Database**: PostgreSQL 16 — Kysely types and partitioning depend on PG-specific features
- **Rate limit**: 40 emails/sec default — configurable but SES account limits apply
- **File upload**: 50MB max per asset
- **Webhook retries**: 5 attempts max, auto-disable after 50 consecutive failures

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fastify over Express | Performance, schema validation, TypeScript support | — Pending |
| Kysely over Drizzle/Prisma | Type-safe SQL without code generation | — Pending |
| GrapeJS for email editor | Mature drag-and-drop builder with MJML support | — Pending |
| BullMQ for job processing | Redis-backed, reliable, supports concurrency control | — Pending |
| PgBouncer for connection pooling | Handle worker + API connection demands | — Pending |
| Numeric enums in DB | Compact storage, fast comparisons | — Pending |
| Time-partitioned events table | Scale tracking data without performance degradation | — Pending |

---
*Last updated: 2026-03-13 after initialization*
