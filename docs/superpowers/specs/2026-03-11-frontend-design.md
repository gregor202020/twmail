# TWMail Frontend Design Spec

**Date:** 2026-03-11
**Status:** Approved

## 1. Overview

Frontend dashboard for TWMail, a self-hosted email marketing platform & CRM for Third Wave BBQ. Consumes the existing Fastify API backend. Must be intuitive enough for non-technical marketing staff while providing full power for admins.

## 2. Tech Stack

- **Framework:** Next.js 15 (App Router), TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Email Editor:** GrapeJS + grapesjs-mjml + @grapesjs/react
- **Data Fetching:** TanStack Query v5
- **Forms:** React Hook Form + Zod
- **Charts:** Recharts
- **Auth:** JWT tokens from Fastify API, stored in httpOnly cookies via Next.js API route proxy

## 3. Brand & Visual Identity

### Colors
| Role | Hex | Usage |
|------|-----|-------|
| Primary Blue | `#0170B9` | Navigation active states, data values, links, secondary buttons |
| Brand Red | `#C41E2A` | Logo, primary CTAs (Send, Delete), revenue metrics, live/peak states |
| Black | `#1A1A1A` / `#0A0A0A` | Icon sidebar background, headings |
| Content Background | `#FAFAFA` | Main content area |
| Card Surface | `#FFFFFF` | Cards, modals, panels |
| Card Border | `#E8E8E8` | Card and input borders |
| Text Primary | `#1A1A1A` | Headings, primary text |
| Text Secondary | `#4B4F58` | Body text, descriptions |
| Text Muted | `#999999` | Labels, timestamps, placeholders |
| Success | `#22C55E` | Positive trends, sent status, healthy metrics |
| Warning | `#F59E0B` | Scheduled status, caution states |
| Danger | `#EF4444` | Error states, destructive confirmations |

### Typography
- System font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- Headings: 600-700 weight, tight letter-spacing (-0.3px to -1px)
- Body: 13-14px, regular weight
- Labels: 10-11px, uppercase, 0.5-1px letter-spacing

### Design Tokens
- Border radius: 8px (buttons, inputs), 10px (badges/pills), 12px (cards, logos), 14px (stat cards)
- Shadows: minimal — `0 2px 12px rgba(0,0,0,0.04)` for elevated elements only
- Transitions: 150ms ease for interactive states

## 4. Layout

### Icon Sidebar (68px wide)
- Background: `#0A0A0A`
- TW logo: 40x40px, red gradient (`#C41E2A` → `#a01520`), 12px radius, subtle glow shadow
- Navigation icons: 40x40px hit targets, 2px icon stroke
- Active state: `rgba(1,112,185,0.15)` background + 3px left border in `#0170B9`
- Sections top-to-bottom: Dashboard, Contacts, Campaigns, Templates, Segments, Reports
- Bottom: Settings gear, User avatar (initials, dropdown for profile/logout)

### Top Context Bar (52px)
- Background: white, 1px bottom border `#E8E8E8`
- Left: Section name (14px, 600 weight)
- Center: Contextual sub-tabs for the current section
- Right: Global search input + primary action button

### Content Area
- Background: `#FAFAFA`
- Max width: 1200px, centered
- Padding: 24px all sides
- Cards: white, 1px `#E8E8E8` border, 14px radius

### Responsive Breakpoints
- ≥1024px: Full sidebar + content
- 768-1023px: Sidebar stays as-is (already slim icons)
- <768px: Sidebar becomes slide-out drawer with hamburger trigger

## 5. Authentication

### Login Page
- Minimal layout: no sidebar, centered card
- TW logo above form (red, larger)
- Fields: Email, Password
- Login button (blue `#0170B9`)
- No "Forgot password" for v1 (single-tenant, admin can reset via CLI)

### Auth Flow
- Login POST → API returns JWT access + refresh tokens
- Next.js API route `/api/auth/login` proxies to Fastify, sets httpOnly cookies
- TanStack Query auth hook checks cookie validity
- Refresh token rotation via `/api/auth/refresh` proxy
- Unauthorized responses redirect to `/login`

## 6. Dashboard (`/dashboard`)

### Hero Stats Row (4 cards, grid)
- **Total Contacts** — Blue gradient card (`#0170B9` → `#014D80`), white text, decorative circle, "+X this month" subtitle
- **Open Rate** — White card, large blue value, green trend indicator
- **Click Rate** — White card, large value, green trend
- **Bounce Rate** — White card, large value, "Healthy" green badge when < 2%

### Send Volume Chart
- Recharts BarChart, blue bars, red highlight for peak day
- Top label on peak bar showing count
- Day labels on x-axis
- Toggle: 7d / 30d / 90d

### Recent Campaigns
- Compact list (4-5 items)
- Status dot (green=sent, amber=scheduled, blue pulse=sending, gray=draft)
- Campaign name, open rate, time ago

### Quick Actions
- 3 shortcut buttons: New Campaign, Import Contacts, View Reports
- Small colored dot indicator per action

## 7. Contacts

### List View (`/contacts`)
- DataTable: Name, Email, Status (badge), Lists, Last Activity, Created
- Sortable columns, server-side search, paginated (50 per page)
- Status filter tabs: All / Active / Unsubscribed / Bounced
- Bulk select → floating action bar: Add to List, Remove from List, Delete
- Note: CSV export and list management are v2 features (backend APIs needed)
- "Add Contact" button in top bar → slide-out drawer with form: email (required), first name, last name, custom fields, list assignment. Uses `POST /api/contacts`.

### Contact Detail (`/contacts/:id`)
- Profile header: name, email, status badge, created date, last activity
- Action buttons: Edit, Unsubscribe, Delete
- Tabs:
  - **Overview** — Custom fields (key-value display, inline editable), Lists (chips with remove), Segments (read-only chips)
  - **Activity** — Event timeline (opens, clicks, bounces, unsubscribes) with timestamp and campaign name
  - **Campaigns** — Table of emails received: campaign name, sent date, status (delivered/opened/clicked/bounced)

### Import (`/contacts/import`)
- Two-path entry: Paste text area or CSV file upload
- Auto-format detection (tabs, commas, email-per-line)
- Column mapping UI: detected columns on left → TWMail fields on right, auto-mapped where possible
- Save/load mapping presets
- Progress bar during import processing (via Redis pub/sub or polling)
- Completion summary: imported, updated, skipped, errors
- Error detail table (downloadable)

## 8. Campaigns

### List View (`/campaigns`)
- Status filter tabs: All / Draft / Scheduled / Sending / Sent / Paused / Cancelled
- Card or table view toggle
- Each campaign shows: name, status badge, recipients count, open rate (if sent), sent/scheduled date
- Actions: Edit, Duplicate, Pause (if sending/scheduled), Cancel (if sending/scheduled), Delete
- After Duplicate: redirect to new campaign's edit page
- After Send/Schedule confirmation: redirect to campaign report page
- "New Campaign" button (red `#C41E2A`)

### Create/Edit (`/campaigns/:id/edit`)

Single-page accordion — sections stack vertically, auto-collapse when completed, expand on click. Numbered sections with completion checkmarks.

#### Section 1: Setup
- Campaign name (text input)
- Subject line (text input, with character count)
- Preview text (text input, shown in inbox previews)
- Sender name (dropdown of verified senders)
- Sender email (dropdown)

#### Section 2: Recipients
- Segment or List picker (searchable dropdown)
- Shows estimated contact count after selection
- Exclude segment option (secondary dropdown)
- Warning if estimated count is 0

#### Section 3: Design
- Template picker grid (thumbnails, click to select, "Start from Blank")
- Selected template opens GrapeJS editor:
  - Hybrid mode: template sections have locked structure, content is editable
  - Power users can unlock full builder mode (toggle)
  - Desktop / Mobile preview toggle
  - Save and return to accordion

#### Section 4: Scheduling
- **Send Now** — radio option, immediate send
- **Schedule** — date picker + time picker + timezone selector

#### Section 5: A/B Testing
- Toggle on/off (off by default)
- **Test variable:** Subject line | Sender name | Content (full variant) | Send time
- **Variants:** 2-4 variants, inline editable based on test variable
- **Test audience:** Slider — % of total audience for test (e.g., 20%, split evenly across variants)
- **Win criteria:** Dropdown — Best open rate | Best click rate
- **Auto-send winner:** Toggle — automatically send winning variant to remaining audience
- **Test duration:** Dropdown — 1h, 2h, 4h, 12h, 24h (how long before winner is declared)

#### Section 6: Resend Settings
- **Auto-resend to non-openers:** Toggle on/off (off by default)
- **Resend delay:** Dropdown — 24h, 48h, 72h, 1 week
- **Resend subject line:** Radio — Same as original | Custom (text input, pre-filled with "In case you missed it: {original}")
- **Only to engaged contacts:** Toggle + dropdown for recency window (30 / 60 / 90 days)
- **Max resends:** Radio — 1 attempt | 2 attempts

#### Section 7: Review & Send
- Full summary card: all settings displayed read-only
- Estimated delivery time (based on list size ÷ 40/sec rate limit)
- Pre-send checklist (auto-validated):
  - ✓ Subject line set
  - ✓ Content not empty
  - ✓ Recipients selected
  - ✓ Unsubscribe link present in content
- **Send** / **Schedule** button (red `#C41E2A`, large, prominent)
- Confirmation modal: "You're about to send to **X contacts**. This cannot be undone." with Cancel / Confirm

### Campaign Report (`/campaigns/:id/report`)
- **Delivery funnel** — Visual funnel: Sent → Delivered → Opened → Clicked (counts and percentages)
- **Timeline chart** — Opens and clicks over time since send (Recharts line chart, dual lines blue/red)
- **A/B Results** (if applicable) — Variant comparison table with winner badge, confidence percentage
- **Recipient table** — Paginated table: contact name, email, status (delivered/opened/clicked/bounced), timestamps
- **Bounce/Complaint details** — Expandable section with bounce types and complaint info
- **Resend info** (if applicable) — Linked resend campaign with its own mini-report

## 9. Templates

### Grid View (`/templates`)
- Template cards in 3-4 column grid
- Card: thumbnail preview, name, category badge, created date
- Hover overlay: "Edit", "Clone", and "Use in Campaign" buttons
- Filter by category (dropdown)
- "New Template" button (navigates to `/templates/new/edit`)

### Template Editor (`/templates/:id/edit`)
- Full-screen GrapeJS editor
- Left panel: Content blocks palette (text, image, button, divider, columns, product grid, social links)
- Center: MJML canvas with drag-and-drop
- Right panel: Style properties for selected element (colors, spacing, fonts, link URLs)
- Top bar: Template name (editable), Save, Preview, Desktop/Mobile toggle, Back button
- Asset manager integration: GrapeJS asset manager configured to use `POST /api/assets/upload` for uploads and `GET /api/assets` for browsing. Users can upload and select images directly within the editor.
- GrapeJS provides its own component locking via `editable`, `draggable`, `removable` traits on components. Template blocks can be marked as non-removable/non-draggable while keeping content editable. No custom plugin needed — this is built-in GrapeJS functionality.

### Template Picker (modal)
- Used when creating a campaign, invoked from Design section
- Grid of available templates with thumbnails
- Search and category filter
- "Start from Blank" option
- Click to select → loads into GrapeJS editor

## 10. Segments

### List View (`/segments`)
- Table: Name, Contact Count (queried live), Rules summary (human-readable), Created date
- "New Segment" button

### Segment Builder (`/segments/:id/edit`)
- Visual rule builder
- **Rule groups** with AND/OR toggle between groups
- **Rules within a group** with AND logic
- Each rule: Field picker (dropdown of contact fields + custom fields) → Operator (equals, contains, greater than, before, after, is set, is not set) → Value input
- "Add Rule" button within a group, "Add Group" button for new OR group
- **Live count preview** — shows matching contact count as rules change (debounced 500ms API call to `GET /api/segments/:id/count`)
- Save button

### Segment Detail (`/segments/:id`)
- Contact list for this segment (paginated, via `GET /api/segments/:id/contacts`)
- For static segments: "Add Contacts" and "Remove" actions
- Link to edit rules

## 11. Reports

### Overview (`/reports`)
- Same hero stat cards as dashboard
- **Growth chart** — New contacts per day (Recharts area chart), 30d/90d/1y toggle
- **Engagement tiers** — Donut chart showing distribution: Highly Engaged, Engaged, Lapsed, Inactive
- **Deliverability trend** — Line chart of bounce rate and complaint rate over time

### Campaign Comparison (`/reports/campaigns`)
- Table of last 50 sent campaigns
- Columns: Name, Sent Date, Recipients, Open Rate, Click Rate, Bounce Rate
- Sparkline mini-charts in rate columns
- Sortable by any column

### Deliverability (`/reports/deliverability`)
- Bounce rate and complaint rate over time (line chart)
- Domain breakdown table: domain, sent count, bounce rate, complaint rate
- Alert banner if any metric exceeds thresholds (bounce > 5%, complaints > 0.1%)

## 12. Settings

> **Backend note:** Settings pages for General, API Keys, Users, and Domain require new backend API routes that don't exist yet. These will be added to the backend as part of the implementation plan. The Webhooks settings page already has full backend support.

### Webhooks (`/settings/webhooks`) — Has Backend
- Endpoint table: URL, Events (badges), Status (active/disabled), Failure count
- Create/Edit modal: URL, event type checkboxes, active toggle
- Secret display (masked, click to reveal, copy button)
- "Test" button to send a test payload
- Delivery log: expandable per-endpoint, shows recent deliveries with status/response

### General (`/settings`) — Needs Backend
- Organization name, default sender name, default sender email, timezone picker
- Save button

### API Keys (`/settings/api-keys`) — Needs Backend
- Table: Name, Key prefix (masked), Created, Last Used
- "Create API Key" button → modal with name input → shows full key once (copy button, warning it won't be shown again)
- Revoke button with confirmation

### Users (`/settings/users`) — Needs Backend
- User table: Name, Email, Role (Admin/Editor/Viewer), Last Login
- Invite button → modal: email + role picker
- Edit role, remove user

### Domain (`/settings/domain`) — Needs Backend
- SES domain verification status
- DNS records to add (DKIM, SPF, DMARC) displayed as copyable text
- Verification check button

## 13. Shared Components

### DataTable
- Built on shadcn Table
- Server-side sorting, pagination, search
- Configurable columns with custom renderers
- Bulk checkbox select with floating action bar
- Empty state when no results
- Loading skeleton state

### StatusBadge
- Color-coded pill component
- Campaign statuses: Draft (gray), Scheduled (amber), Sending (blue pulse), Sent (green), Paused (amber), Cancelled (gray)
- Contact statuses: Active (green), Unsubscribed (gray), Bounced (red), Complained (red)

### EmptyState
- Centered layout: icon/illustration + title + description + CTA button
- Used on all list pages when no data exists

### ConfirmDialog
- Modal overlay with title, description, Cancel + Confirm buttons
- Destructive variant: red confirm button, requires typing resource name for critical actions

### PageHeader
- Consistent pattern: Title (h1) + optional subtitle + right-aligned action button(s)
- Used on every list page

### LoadingSkeleton
- Animated pulse placeholders matching the shape of content being loaded
- Per-component variants: table rows, stat cards, chart area

## 14. State Management

- **Server state:** TanStack Query for all API data. Stale-while-revalidate. Optimistic updates for mutations (delete, status changes).
- **Query key factory:** Centralized in `lib/query-keys.ts` for consistent cache invalidation.
- **Form state:** React Hook Form with Zod schemas matching the API's Zod validation.
- **UI state:** React useState/useContext for sidebar collapse, modals, active tabs. No global store needed.
- **Real-time updates:** Polling for campaign send progress (every 5s while sending — progress bar on campaign report page showing sent/total). Import progress via polling (progress bar on import page).

## 15. API Integration

All API calls go through `lib/api-client.ts`:
- Base URL: configured via `NEXT_PUBLIC_API_URL` env var
- Auth: httpOnly cookie attached automatically
- Error handling: 401 → redirect to login, 422 → surface Zod validation errors on form fields, 4xx/5xx → toast notification
- Response shape: all endpoints return `{ data: T }` or `{ data: T[], meta: { page, per_page, total, total_pages } }`

### Key API Endpoints Consumed
| Frontend Page | API Endpoints |
|---|---|
| Login | `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Dashboard | `GET /api/reports/overview` |
| Contacts List | `GET /api/contacts`, `POST /api/contacts` (create), `POST /api/contacts/search` |
| Contact Detail | `GET /api/contacts/:id`, `PATCH /api/contacts/:id`, `DELETE /api/contacts/:id`, `GET /api/contacts/:id/timeline` |
| Contact Import | `POST /api/imports/paste`, `POST /api/imports/csv`, `GET /api/imports/:id`, `GET /api/imports/:id/errors`, `POST /api/imports/mappings`, `GET /api/imports/mappings` |
| Campaigns List | `GET /api/campaigns` |
| Campaign Edit | `POST/PATCH /api/campaigns/:id`, `POST /api/campaigns/:id/send`, `POST /api/campaigns/:id/schedule`, `POST /api/campaigns/:id/pause`, `POST /api/campaigns/:id/cancel`, `POST /api/campaigns/:id/duplicate` |
| Campaign A/B | `POST /api/campaigns/:id/ab-test`, `GET /api/campaigns/:id/ab-results` |
| Campaign Report | `GET /api/campaigns/:id/report`, `GET /api/campaigns/:id/recipients` |
| Templates | `GET/POST/PATCH/DELETE /api/templates`, `POST /api/templates/:id/clone` |
| Segments | `GET/POST/PATCH/DELETE /api/segments`, `GET /api/segments/:id/count`, `GET /api/segments/:id/contacts`, `POST /api/segments/:id/contacts`, `DELETE /api/segments/:id/contacts/:cid` |
| Reports Overview | `GET /api/reports/overview` |
| Reports Growth | `GET /api/reports/growth` |
| Reports Engagement | `GET /api/reports/engagement` |
| Reports Deliverability | `GET /api/reports/deliverability` |
| Reports Campaigns | `GET /api/reports/campaigns` |
| Assets | `POST /api/assets/upload`, `GET /api/assets`, `DELETE /api/assets/:id` |
| Settings/Webhooks | `GET/POST/PATCH/DELETE /api/webhooks`, `POST /api/webhooks/:id/test`, `GET /api/webhooks/:id/deliveries` |

## 16. Error Handling & UX Patterns

- **Toast notifications** — Success (green), Error (red), Info (blue). Auto-dismiss after 5s. Stack in bottom-right.
- **Form validation** — Inline errors below fields, red border. Validated on blur and submit.
- **Optimistic updates** — Delete and status changes reflect immediately, rollback on API error.
- **Loading states** — Skeleton loaders for initial page load, subtle spinner for mutations.
- **Empty states** — Every list page has a friendly empty state with CTA to create first item.
- **Confirmation modals** — All destructive actions (delete campaign, remove contacts, revoke API key) require confirmation.

## 17. Performance

- **Code splitting** — Each route group lazy-loaded. GrapeJS editor loaded only when needed (dynamic import).
- **Image optimization** — Next.js Image component for all images. Template thumbnails served as optimized WebP.
- **Caching** — TanStack Query stale times: dashboard 30s, lists 60s, detail views 30s. Background refetch on window focus.
- **Bundle size** — GrapeJS is the largest dependency (~500KB). Loaded dynamically only on editor pages.

## 18. Project Structure

```
packages/frontend/
  src/
    app/
      layout.tsx                    # Root layout (font, providers)
      (auth)/
        layout.tsx                  # Centered minimal layout
        login/page.tsx
      (dashboard)/
        layout.tsx                  # Sidebar + TopBar layout
        dashboard/page.tsx
        contacts/
          page.tsx                  # Contact list
          [id]/page.tsx             # Contact detail
          import/page.tsx           # Import flow
        campaigns/
          page.tsx                  # Campaign list
          new/page.tsx              # Create campaign
          [id]/
            edit/page.tsx           # Edit campaign (accordion)
            report/page.tsx         # Campaign report
        templates/
          page.tsx                  # Template grid
          new/edit/page.tsx         # New template editor
          [id]/edit/page.tsx        # Edit template editor
        segments/
          page.tsx                  # Segment list
          new/edit/page.tsx         # New segment builder
          [id]/page.tsx             # Segment detail (contact list)
          [id]/edit/page.tsx        # Edit segment builder
        reports/
          page.tsx                  # Reports overview
          campaigns/page.tsx        # Campaign comparison
          deliverability/page.tsx   # Deliverability report
        settings/
          page.tsx                  # General settings
          api-keys/page.tsx
          webhooks/page.tsx
          users/page.tsx
          domain/page.tsx
    components/
      ui/                           # shadcn/ui primitives
      layout/
        sidebar.tsx                 # Dark icon sidebar
        top-bar.tsx                 # Context bar
        breadcrumbs.tsx
      shared/
        data-table.tsx
        status-badge.tsx
        empty-state.tsx
        confirm-dialog.tsx
        page-header.tsx
        loading-skeleton.tsx
      campaigns/
        campaign-accordion.tsx      # The 7-section accordion
        campaign-card.tsx
        delivery-funnel.tsx
        ab-results.tsx
      contacts/
        contact-profile.tsx
        activity-timeline.tsx
        import-mapper.tsx
      editor/
        grapes-editor.tsx           # GrapeJS React wrapper
        template-picker.tsx
        block-palette.tsx
      segments/
        rule-builder.tsx
        rule-group.tsx
        rule-row.tsx
      reports/
        stat-card.tsx
        bar-chart.tsx
        line-chart.tsx
        donut-chart.tsx
        sparkline.tsx
    lib/
      api-client.ts                 # Fetch wrapper with auth
      query-keys.ts                 # TanStack Query key factory
      utils.ts                      # cn(), formatNumber(), formatDate()
      constants.ts                  # Status colors, role labels
    hooks/
      use-auth.ts
      use-debounce.ts
      use-pagination.ts
      use-confirm.ts
    types/
      index.ts                      # Re-exports from @twmail/shared + frontend-specific types
  public/
    logo.svg
  tailwind.config.ts
  next.config.ts
  package.json
  tsconfig.json
```
