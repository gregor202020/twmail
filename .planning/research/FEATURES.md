# Feature Research

**Domain:** Email marketing platform (self-hosted, single-org, AWS SES)
**Researched:** 2026-03-13
**Confidence:** HIGH (platform is built; this audits what's present, what gaps exist, what must be production-perfect)

---

## Context: This Is a Pre-Ship Audit

Third Wave Mail is feature-complete. This research answers two questions:

1. Does the feature set match industry table stakes — or are gaps hiding that will embarrass a launch?
2. Which already-built features are production-critical and must be audited most thoroughly?

The codebase has: campaign lifecycle, drag-and-drop editor (GrapeJS/MJML), contact management, list/segment management, A/B testing, open/click tracking with MPP detection, AWS SES + SNS bounce/complaint handling, RFC 8058 one-click unsubscribe, webhooks, analytics dashboards, BullMQ workers, RBAC, API keys. That covers the full Mailchimp-equivalent feature surface for a self-hosted platform. The question is not "what to build" — it is "what must work perfectly."

---

## Feature Landscape

### Table Stakes (Users Expect These — Broken = Platform Is Broken)

| Feature | Why Expected | Complexity | Production-Critical Notes |
|---------|--------------|------------|--------------------------|
| One-click unsubscribe (RFC 8058 + link) | Gmail/Yahoo mandate since 2024; non-compliant = deliverability penalty | MEDIUM | RFC 8058 header must be present on every outbound email, not just campaign footer link. The `List-Unsubscribe-Post` header must be set. Both are required. Verify header generation in the sending worker, not just the template. |
| Bounce hard-stop (suppression list) | AWS SES suspends accounts above 5% bounce rate; 10% = suspension | HIGH | Hard bounces must be added to a permanent suppression list immediately on SNS notification. Sending to a suppressed address a second time is a compliance and deliverability failure. The SNS webhook handler is the failure point — if it drops or misorders events, bounces accumulate silently. |
| Complaint auto-suppression | AWS SES complaint rate > 0.1% triggers review; > 0.5% = suspension | HIGH | Same as bounces: SNS complaint notification must instantly suppress. The SNS handler must be idempotent (duplicate SNS deliveries are common). Must verify: the contact status is set AND the contact is excluded from all future sends. |
| Unsubscribe honoring within 10 days (CAN-SPAM) / 72 hours (GDPR) | Legal requirement; violations are $51,744 per email (CAN-SPAM) or 4% revenue (GDPR) | MEDIUM | The unsubscribe flow must: (1) record opt-out immediately, (2) exclude from pending/scheduled sends, (3) not be re-subscribed by a subsequent import without explicit re-consent. The import flow is the most common place this breaks — imports should not overwrite unsubscribed status. |
| Physical mailing address in email footer | CAN-SPAM requirement — must be in every commercial email | LOW | Must be in every sent email, not just templates. If it's hardcoded in templates only, custom HTML campaigns can accidentally omit it. Best enforced at the sending layer, not the template layer. |
| Campaign send-state accuracy | Users need to know if a campaign is sending, paused, or failed | MEDIUM | The lifecycle (draft → scheduled → sending → sent/failed/paused) must be accurate under error conditions. If the worker crashes mid-send, does the campaign get stuck in "sending" state forever? Must verify job failure → campaign state update. |
| Tracking pixel delivery | Opens are the primary engagement signal; broken tracking = wrong analytics | MEDIUM | The pixel endpoint must handle high concurrency (bulk sends create a spike). Must survive the same traffic surge as the send itself. Check that the pixel URL is absolute, not relative, and survives URL encoding in email clients. |
| Click tracking redirect accuracy | Click data is now the primary reliable engagement metric (MPP degraded open data) | MEDIUM | Redirect must preserve original URL exactly. Must handle URL-encoded params, UTM params appended to tracked URLs, and redirects from within HTML editor. A broken redirect is visible to recipients and destroys trust. |
| HTML email rendering correctness | 74% of emails have structural HTML issues; Gmail/Outlook have different renderers | HIGH | MJML compilation must produce valid, table-based HTML that renders in Outlook (which rejects modern CSS). Must verify MJML output doesn't break in dark mode, on mobile, or with images disabled. GrapeJS + grapesjs-mjml output can produce invalid MJML if the plugin is not constrained properly. |
| Scheduled send accuracy (timezone) | Campaigns scheduled for 9am must arrive at 9am, not 9am UTC | MEDIUM | Timezone conversion must happen at schedule time, not at evaluation time. If the server timezone differs from the org timezone, sends can arrive hours off. BullMQ's delayed job timing is wall-clock, not timezone-aware natively — the worker must convert correctly. |
| Rate limiting to SES quota | SES accounts have a max sending rate (40/sec default); exceeding it causes throttling errors and lost sends | HIGH | The BullMQ worker concurrency must be tuned to stay under the SES rate limit. If a large list sends in a burst, the worker must not exceed the account limit. Verify that SES throttle errors are caught and the job is retried with backoff, not dropped. |
| Unsubscribe page UX | Broken unsubscribe = spam complaints, legal exposure | LOW | The one-click unsubscribe landing page must work without JavaScript (some email clients pre-fetch links). Must be accessible, confirm the action clearly, and not require login. |

### Differentiators (Competitive Advantage — Built, Must Work Well)

| Feature | Value Proposition | Complexity | Production Notes |
|---------|-------------------|------------|-----------------|
| Apple MPP machine open detection | Prevents inflated open rate from Apple's proxy pre-fetching; up to 75% of reported opens can be artificial without this | HIGH | This is genuinely differentiating — most small platforms don't handle it. Detection based on user-agent analysis must correctly identify Apple's proxy. Must verify: (1) machine opens are flagged but not deleted (data integrity), (2) analytics dashboards show adjusted vs raw open rate, (3) the A/B test winner logic does not use raw open rate as the sole signal. |
| A/B testing with auto-winner | Removes manual work from campaign optimization; most small platforms don't have statistical evaluation | HIGH | The statistical significance calculation must be correct. Binomial test or chi-squared on click/open rates. Must verify: (1) minimum sample size before declaring a winner, (2) what happens to the remaining audience if the test variant list is exhausted before significance is reached, (3) that auto-winner respects machine open inflation. |
| Dynamic segments with 17-operator rule engine | Real-time personalization without manual list exports | HIGH | The segment evaluation query must be correct and performant. If segment counts are stale or query performance degrades on large contact sets, the feature becomes unreliable. Must verify: (1) AND/OR logic precedence is correct in the query builder, (2) segment preview counts match actual send counts. |
| Resend to non-openers | Common requested feature that most platforms offer, but the "non-opener" definition is critical in the MPP era | MEDIUM | The non-opener query must exclude machine opens, not just "opens = 0." If MPP-inflated opens are counted as "opened," resend-to-non-openers will fail to reach Apple Mail users who never truly opened. This is a direct consequence of MPP detection correctness. |
| RFC 8058 one-click unsubscribe | Gmail/Yahoo compliance from 2024 mandate — differentiating because many small platforms implemented it incorrectly | MEDIUM | The `List-Unsubscribe-Post` header must point to an endpoint that processes the unsubscribe without requiring browser interaction (it's a server-to-server POST). Must verify the endpoint handles this correctly and does not require a session cookie or CSRF token. |
| Outbound webhooks with HMAC signing | Enables integrations without polling; HMAC prevents spoofed webhook events | MEDIUM | Must verify retry logic handles transient failures correctly and does not duplicate events on retry. The 50-failure auto-disable threshold must be tested. HMAC signature verification must use constant-time comparison (timing attack prevention). |
| UTM + Google Analytics tracking | Connects email campaigns to downstream revenue attribution | LOW | UTM params must be appended correctly to every tracked link, not double-appended if the sender already included UTMs. Must verify the click tracking redirect preserves the UTM params through the redirect. |
| Drag-and-drop editor with MJML output | Email-safe HTML without needing to know email coding; most self-hosted platforms lack this | HIGH | GrapeJS + grapesjs-mjml is mature but has known issues with certain block combinations producing invalid MJML. The editor must be tested with the full block set. Must verify: (1) custom HTML blocks don't bypass MJML sanitization, (2) image upload within the editor produces absolute URLs (relative URLs break in email clients), (3) mobile preview is accurate. |
| Statistical deliverability reporting | Bounce rate, complaint rate, open rate per campaign — surfaces reputation issues before AWS acts | MEDIUM | The deliverability reports must use accurate data. If bounce/complaint SNS handlers have any data loss, the reports will undercount and create false confidence. Must cross-verify: platform bounce rate vs AWS SES account-level bounce rate in the console. |

### Anti-Features (Deliberately Out of Scope — Right Call)

| Anti-Feature | Why Requested | Why Problematic | Alternative / Status |
|--------------|---------------|-----------------|---------------------|
| Real-time automation workflows | Triggered email sequences (welcome series, drip campaigns) are in every major competitor | Database tables exist but feature is deferred; correct call — shipping incomplete automation is worse than no automation, creates support burden and half-finished UX | Post-launch milestone. Tables exist, so the foundation is there. |
| Multi-tenant / SaaS mode | Monetization opportunity | Adds auth isolation, billing, per-tenant SES configuration complexity that would double the launch scope | Explicitly deferred. Single-org is the correct launch posture. |
| Real-time chat | Not email marketing | Unrelated domain, would dilute focus | Correctly excluded. |
| Mobile native app | Users want access anywhere | Web-responsive is sufficient; native app doubles the maintenance surface | Correctly excluded. |
| Email validation / list cleaning service | Users ask for this to improve deliverability | Third-party API dependency, cost-per-lookup, and the platform already handles bounces which is the real mechanism | Integration via webhook/API is the right answer post-launch. |
| Social proof / template marketplace | Nice to have | High content curation burden, distraction from core reliability | Not in scope, correctly. |
| Predictive send-time optimization (AI) | Klaviyo differentiator | Requires significant ML infrastructure and sufficient historical data to be meaningful | Post-PMF feature. |

---

## Feature Dependencies

```
Unsubscribe Handling
    └──requires──> SNS Webhook Handler (correct, idempotent)
                       └──requires──> Contact Status Update (suppression)
                                          └──required by──> Send Worker (exclusion filter)

A/B Testing - Auto Winner
    └──depends on──> Machine Open Detection (MPP)
                         └──if broken──> Auto Winner uses inflated data → wrong variant wins

Resend to Non-Openers
    └──depends on──> Machine Open Detection (MPP)
                         └──if broken──> Non-opener query includes MPP-inflated "openers" → reach collapses for Apple Mail users

Scheduled Sends
    └──depends on──> Timezone conversion at schedule-time (not at eval-time)
    └──depends on──> BullMQ delayed job reliability

Click Tracking
    └──must precede──> UTM param append (avoid double-append)
    └──must survive──> URL encoding, special characters in destination URLs

Import Flow
    └──must NOT override──> Unsubscribed / bounced / complained contact status
    └──must respect──> Suppression list before adding contacts to lists

RFC 8058 One-Click Unsubscribe
    └──requires──> Server-to-server POST endpoint (no session, no CSRF)
    └──requires──> Header on every outbound email (not just template footer)
```

### Dependency Notes

- **MPP detection correctness gates multiple features:** A/B test winner logic, resend-to-non-openers, and open rate reporting all depend on machine opens being correctly identified and excluded. This is the single highest-leverage correctness check in the platform.
- **SNS handler correctness gates compliance:** Both bounce suppression and complaint suppression flow through the SNS handler. It must be idempotent (SNS can deliver the same notification multiple times), handle the full range of bounce types (hard vs soft), and update contact status atomically.
- **Import flow must respect suppression:** The most common real-world compliance failure is a CSV import that re-subscribes unsubscribed contacts. The import pipeline must check the suppression list before activating contacts.
- **Send worker must apply exclusion filter at send time, not at schedule time:** Contacts unsubscribed after a campaign is scheduled must still be excluded when the send executes. The exclusion must be a query-time filter, not a snapshot taken at schedule time.

---

## Production-Perfect Before Shipping

This section specifically answers: what existing features must be audited most rigorously before launch?

### Tier 1: Legal and Deliverability Risk (Broken = Account Suspension or Legal Liability)

1. **SNS bounce/complaint handler** — idempotency, hard vs soft bounce distinction, suppression write atomicity, error handling if the DB write fails after SNS acknowledgment
2. **Unsubscribe flow end-to-end** — link click → status update → exclusion from all future sends → RFC 8058 server POST → no re-subscription via import
3. **RFC 8058 header presence** — the `List-Unsubscribe` and `List-Unsubscribe-Post` headers must be on every outbound email, not just those using standard templates
4. **Physical address in every email** — enforced at send layer, not template layer

### Tier 2: Data Accuracy Risk (Broken = Wrong Business Decisions)

5. **MPP machine open detection** — correct user-agent matching, flagging not deleting, propagation to analytics and A/B test logic
6. **A/B test statistical evaluation** — correct significance formula, minimum sample size guard, correct winner application
7. **Click tracking redirect** — URL preservation through encoding, UTM param handling, redirect latency under load
8. **Segment query correctness** — AND/OR precedence, count accuracy vs actual send count

### Tier 3: Operational Risk (Broken = Campaigns Fail Silently)

9. **Campaign state machine under failure** — what happens if the send worker crashes mid-campaign? Does state recover correctly?
10. **SES rate limit compliance in worker** — concurrency tuned to stay under 40/sec; throttle errors retried with backoff, not dropped
11. **Scheduled timezone conversion** — conversion happens at schedule time, stored as UTC, correctly evaluated by BullMQ
12. **MJML output validity** — all editor block combinations produce renderable output; no relative image URLs in output

---

## MVP Definition (Reframed for Audit Context)

This platform is not defining an MVP — it is auditing a complete platform pre-ship. The framing becomes: "What must pass before we can call this production-ready?"

### Must Pass for Launch

- [ ] Bounce and complaint suppression works correctly under SNS replay (idempotency test)
- [ ] Unsubscribed contacts cannot be re-subscribed by CSV import
- [ ] RFC 8058 `List-Unsubscribe-Post` header is present on all sends
- [ ] Physical mailing address is enforced at send layer
- [ ] Campaign state recovers correctly after worker crash
- [ ] SES rate limit is not exceeded under bulk send load
- [ ] MPP machine opens are correctly excluded from A/B winner evaluation
- [ ] Click redirect preserves all URL parameters including special characters
- [ ] Segment query AND/OR logic produces correct contact lists

### Add After Launch (v1.x)

- [ ] Email validation / bounce prediction before send (third-party integration)
- [ ] CloudWatch alarm integration for bounce rate thresholds
- [ ] Engagement-based sunset policies (auto-suppress contacts with 0 engagement in 6 months)
- [ ] Suppression list export (compliance evidence)

### Future Consideration (v2+)

- [ ] Automation workflows (tables are ready, feature needs design and build)
- [ ] Predictive send-time optimization
- [ ] Multi-tenant / SaaS mode

---

## Feature Prioritization Matrix (Audit Focus)

| Feature / Area | User Value | Audit Cost | Audit Priority |
|----------------|------------|------------|---------------|
| SNS bounce/complaint handling | HIGH | MEDIUM | P1 |
| Unsubscribe flow (end-to-end) | HIGH | MEDIUM | P1 |
| RFC 8058 header presence | HIGH | LOW | P1 |
| MPP open detection correctness | HIGH | MEDIUM | P1 |
| Campaign state machine under failure | HIGH | MEDIUM | P1 |
| SES rate limit compliance | HIGH | LOW | P1 |
| A/B test statistical logic | MEDIUM | HIGH | P1 |
| Click tracking redirect accuracy | HIGH | LOW | P2 |
| MJML output validity | MEDIUM | MEDIUM | P2 |
| Segment query correctness | MEDIUM | MEDIUM | P2 |
| Timezone scheduling accuracy | MEDIUM | LOW | P2 |
| Import suppression respect | HIGH | LOW | P1 |
| Webhook HMAC constant-time compare | LOW | LOW | P2 |
| Physical address enforcement | HIGH | LOW | P1 |

**Priority key:**
- P1: Must pass before launch — legal, deliverability, or data integrity risk
- P2: Should be verified — correctness matters but failure is recoverable
- P3: Nice to audit — low risk, can be deferred

---

## Competitor Feature Analysis

| Feature | Mailchimp | Klaviyo | Campaign Monitor | Third Wave Mail |
|---------|-----------|---------|-----------------|----------------|
| Drag-and-drop editor | Yes (own builder) | Yes | Yes | Yes (GrapeJS + MJML) |
| A/B testing | Yes (2 variants) | Yes (multi-variant) | Yes | Yes (2-4 variants, auto-winner) |
| Dynamic segments | Yes | Yes (predictive) | Yes | Yes (17 operators) |
| Open tracking + MPP handling | Yes (Adjusted opens) | Yes | Partial | Yes (machine open detection) |
| RFC 8058 one-click unsubscribe | Yes | Yes | Yes | Yes |
| Bounce/complaint auto-suppression | Yes | Yes | Yes | Yes (SNS) |
| Resend to non-openers | Yes | Yes | Yes | Yes |
| UTM tracking | Yes | Yes | Yes | Yes |
| Outbound webhooks | Yes (paid) | Yes | Yes | Yes (all plans) |
| Automation workflows | Yes (45+ triggers) | Yes (80+ flows) | Yes (journeys) | Tables built, feature deferred |
| Multi-tenant | SaaS (multi-org) | SaaS | SaaS | Single-org (by design) |
| Self-hosted | No | No | No | Yes (differentiator) |

The feature parity with Mailchimp for a v1 self-hosted platform is strong. The gap is automation workflows — which is correctly deferred. The differentiator is self-hosted ownership and AWS SES cost efficiency.

---

## Sources

- [Email Deliverability in 2026: SPF, DKIM, DMARC Checklist for SMBs](https://www.egenconsulting.com/blog/email-deliverability-2026.html)
- [2026 Email Marketing Compliance Checklist](https://mailfloss.com/email-marketing-compliance-checklist/)
- [GDPR Email Compliance Checklist for 2026](https://www.mailreach.co/blog/gdpr-email-compliance-checklist)
- [CAN-SPAM Act: A Compliance Guide for Business (FTC)](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
- [How to Handle Bounces and Complaints with AWS SES and SNS](https://bluefox.email/posts/how-to-handle-bounces-and-complaints-with-aws-ses-and-sns)
- [Amazon SES Sending Review Process FAQs](https://docs.aws.amazon.com/ses/latest/dg/faqs-enforcement.html)
- [Apple MPP Open Rate Tracking: How Do ESPs Handle Them?](https://www.emailtooltester.com/en/blog/apple-mpp-open-rate/)
- [Email Open Rates in 2025: Truth, Metrics & Apple MPP](https://eksido.com/the-new-rules-of-open-rates-in-2025-reading-between-the-pixels/)
- [2025 Email Deliverability Report (Unspam)](https://unspam.email/articles/email-deliverability-report/)
- [B2B Email Deliverability Report 2025](https://thedigitalbloom.com/learn/b2b-email-deliverability-benchmarks-2025/)
- [Handle SES Bounces and Complaints with SNS](https://oneuptime.com/blog/post/2026-02-12-handle-ses-bounces-and-complaints-with-sns/view)
- [Gmail Enforcement 2025: Google Begins Rejecting Emails](https://powerdmarc.com/gmail-enforcement-email-rejection/)

---
*Feature research for: Email marketing platform (Third Wave Mail — pre-ship audit)*
*Researched: 2026-03-13*
