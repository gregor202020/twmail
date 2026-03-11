export interface HelpArticle {
  id: string;
  category: string;
  title: string;
  summary: string;
  body: string;
}

export const HELP_CATEGORIES = [
  'Getting Started',
  'Contacts',
  'Campaigns',
  'Templates',
  'Segments',
  'Reports',
  'Settings',
  'API',
] as const;

export const HELP_ARTICLES: HelpArticle[] = [
  // ── Getting Started ──
  {
    id: 'getting-started-overview',
    category: 'Getting Started',
    title: 'Welcome to TWMail',
    summary: 'An overview of TWMail and how to get started with your first campaign.',
    body: `TWMail is a self-hosted email marketing platform and CRM. It gives you full control over your contact data, campaigns, and analytics without relying on third-party SaaS providers.

**Key features:**
- **Contacts** — Import, manage, and segment your subscriber lists.
- **Campaigns** — Design, schedule, and send email campaigns with A/B testing.
- **Templates** — Build reusable email templates with a drag-and-drop editor.
- **Segments** — Create dynamic audience segments using rule-based filters.
- **Reports** — Track opens, clicks, bounces, and deliverability metrics.
- **API** — Integrate TWMail with your applications using API keys.

**First steps:**
1. Import your contacts (Contacts → Import).
2. Create a template or use the built-in editor.
3. Create your first campaign and select recipients.
4. Review, schedule, or send immediately.`,
  },
  {
    id: 'getting-started-first-campaign',
    category: 'Getting Started',
    title: 'Sending Your First Campaign',
    summary: 'A step-by-step guide to creating and sending your first email campaign.',
    body: `**1. Navigate to Campaigns**
Click "Campaigns" in the sidebar, then "New Campaign".

**2. Set Up Your Campaign**
Fill in the campaign name, subject line, and sender details in the Setup section.

**3. Choose Recipients**
In the Recipients section, select a segment or choose "All Contacts" to send to everyone.

**4. Design Your Email**
Use the Design section to choose a template or build your email from scratch using the drag-and-drop editor (powered by GrapeJS).

**5. Schedule or Send**
- **Send now** — Click "Review & Send" and confirm.
- **Schedule** — Set a future date and time in the Scheduling section.

**6. Monitor Results**
After sending, view the campaign report for opens, clicks, bounces, and unsubscribes.`,
  },
  {
    id: 'getting-started-user-roles',
    category: 'Getting Started',
    title: 'User Roles & Permissions',
    summary: 'Understand Admin, Editor, and Viewer roles and what each can do.',
    body: `TWMail supports three user roles:

**Admin**
- Full access to all features and settings.
- Can manage users (invite, change roles, reset passwords, delete).
- Can manage API keys, webhooks, and domain settings.
- Can create and send campaigns.

**Editor**
- Can create and manage contacts, campaigns, templates, and segments.
- Can view reports.
- Cannot access user management or system settings.

**Viewer**
- Read-only access to dashboards and reports.
- Cannot create or modify any data.

Only Admins can invite new users. Go to **Settings → Users → Add User** to create accounts.`,
  },

  // ── Contacts ──
  {
    id: 'contacts-overview',
    category: 'Contacts',
    title: 'Managing Contacts',
    summary: 'How to add, view, edit, and organize your contacts.',
    body: `Your contacts are the subscribers and recipients in your email marketing database.

**Adding contacts:**
- **Single contact** — Click "Add Contact" on the Contacts page, fill in the form.
- **Bulk import** — Go to Contacts → Import to paste data or upload a CSV file.

**Contact fields:**
- Email (required)
- First Name, Last Name
- Phone, Company, City, Country, Timezone

**Contact statuses:**
- **Active** — Eligible to receive emails.
- **Unsubscribed** — Opted out; will not receive campaigns.
- **Bounced** — Email address has hard-bounced.
- **Complained** — Reported email as spam.
- **Cleaned** — Removed by system hygiene rules.

**Viewing a contact:**
Click any contact to see their full profile, activity timeline, and engagement history.`,
  },
  {
    id: 'contacts-import',
    category: 'Contacts',
    title: 'Importing Contacts',
    summary: 'How to bulk import contacts via paste or CSV upload.',
    body: `TWMail supports two import methods:

**Paste Import**
1. Go to Contacts → Import.
2. Select the "Paste" tab.
3. Paste email addresses (one per line) or comma/tab-separated data with headers.
4. Click "Import".

Example paste format:
\`\`\`
email,first_name,last_name
john@example.com,John,Doe
jane@example.com,Jane,Smith
\`\`\`

**CSV Upload**
1. Select the "Upload CSV" tab.
2. Drag and drop a CSV file or click "Choose File".
3. Map your CSV columns to TWMail fields (email, first_name, etc.).
4. Click "Confirm Mapping" to start the import.

**Column Mapping:**
After uploading, TWMail auto-detects common column headers (email, first name, phone, etc.). You can manually adjust mappings or skip columns you don't need.

**Import Results:**
After processing, you'll see a summary: new contacts created, existing contacts updated, and any rows that were skipped with error details.`,
  },

  // ── Campaigns ──
  {
    id: 'campaigns-overview',
    category: 'Campaigns',
    title: 'Campaign Overview',
    summary: 'Understand campaign statuses and the campaign lifecycle.',
    body: `Campaigns go through several stages:

**Draft** — Initial state. Edit setup, recipients, and design.
**Scheduled** — Set to send at a future time. Can still be cancelled.
**Sending** — Currently being delivered. Progress is shown in real-time.
**Sent** — Delivery complete. View the full report.
**Paused** — Temporarily halted (e.g., for review).
**Cancelled** — Permanently stopped before completion.

**Campaign list filters:**
Use the tabs at the top of the Campaigns page to filter by status: All, Drafts, Scheduled, Sent.`,
  },
  {
    id: 'campaigns-ab-testing',
    category: 'Campaigns',
    title: 'A/B Testing',
    summary: 'How to set up and run A/B tests on your campaigns.',
    body: `A/B testing lets you compare two versions of your email to find what performs best.

**Setting up an A/B test:**
1. Open a draft campaign and go to the "A/B Testing" section.
2. Enable A/B testing.
3. Configure your variants — typically different subject lines or content.
4. Set the test split (e.g., 20% variant A, 20% variant B, 60% winner).
5. Choose the winning metric: open rate or click rate.
6. Set a wait time before the winner is selected.

**How it works:**
- TWMail sends the test variants to a small portion of your list.
- After the wait period, the winning variant is sent to the remaining recipients.
- Results for each variant are shown in the campaign report.`,
  },
  {
    id: 'campaigns-scheduling',
    category: 'Campaigns',
    title: 'Scheduling Campaigns',
    summary: 'How to schedule campaigns for future delivery.',
    body: `To schedule a campaign:

1. Open a draft campaign.
2. Go to the "Scheduling" section.
3. Select a date and time for delivery.
4. Save — the campaign status changes to "Scheduled".

**Cancelling a scheduled campaign:**
Navigate to the campaign and cancel it before the scheduled time. Once sending begins, it cannot be undone.

**Timezone:**
Scheduled times use the timezone configured in your settings.`,
  },
  {
    id: 'campaigns-resend',
    category: 'Campaigns',
    title: 'Resending to Non-Openers',
    summary: 'How to resend a campaign to contacts who didn\'t open the first time.',
    body: `Resending to non-openers can significantly improve your open rates.

**How to set up:**
1. Open a sent campaign.
2. Go to the "Resend" section.
3. Configure the resend options:
   - New subject line (recommended for better results).
   - Delay after original send (e.g., 3 days).
4. TWMail automatically targets only contacts who didn't open the original.

**Best practices:**
- Use a different subject line to catch attention.
- Wait at least 2-3 days before resending.
- Don't resend more than once — it may increase unsubscribes.`,
  },

  // ── Templates ──
  {
    id: 'templates-overview',
    category: 'Templates',
    title: 'Email Templates',
    summary: 'How to create, edit, and manage reusable email templates.',
    body: `Templates let you design reusable email layouts that can be applied to any campaign.

**Creating a template:**
1. Go to Templates → New Template.
2. Enter a name for your template.
3. Use the drag-and-drop editor to design your email.
4. Save when done.

**Using a template in a campaign:**
1. Open a campaign's Design section.
2. Click "Choose Template".
3. Select from your saved templates.
4. Customize the content for your specific campaign.

**The Editor:**
TWMail uses GrapeJS with MJML support. This means:
- Drag-and-drop blocks (text, images, buttons, columns).
- Responsive by default — emails look good on mobile.
- HTML source editing for advanced users.
- Live preview before saving.`,
  },

  // ── Segments ──
  {
    id: 'segments-overview',
    category: 'Segments',
    title: 'Understanding Segments',
    summary: 'How to create dynamic audience segments using rules.',
    body: `Segments let you target specific groups of contacts based on their attributes and behavior.

**Creating a segment:**
1. Go to Segments → New Segment.
2. Name your segment.
3. Build rules using the rule builder.
4. Save — the segment automatically updates as contacts match or unmatch.

**Rule structure:**
Segments use groups of rules connected by AND/OR logic.

Example: "Contacts in Australia who opened an email in the last 30 days"
- Rule 1: Country = Australia
- AND
- Rule 2: Last Open Date → within 30 days

**Available rule fields:**
- Contact fields: email, first_name, last_name, city, country, etc.
- Engagement: last open date, last click date, total opens/clicks.
- Status: active, unsubscribed, bounced.

**Using segments:**
Select a segment as your campaign recipient list in the Recipients section of the campaign editor.`,
  },

  // ── Reports ──
  {
    id: 'reports-overview',
    category: 'Reports',
    title: 'Reports & Analytics',
    summary: 'Overview of the reporting dashboard and available metrics.',
    body: `The Reports section provides insights into your email marketing performance.

**Overview Dashboard:**
- Total Contacts with monthly growth.
- Average Open Rate with trend.
- Average Click Rate with trend.
- Bounce Rate health indicator.
- Send Volume chart (last 7 days).

**Campaign Reports:**
Each sent campaign has a detailed report showing:
- Delivery funnel: Sent → Delivered → Opened → Clicked.
- Open and click rates.
- Bounce and complaint rates.
- Top clicked links.
- Geographic distribution (if tracked).

**Deliverability Report:**
- Bounce rates over time (hard vs. soft).
- Complaint rate trends.
- Domain reputation indicators.

**Campaign Comparison:**
Compare performance across all your campaigns in a sortable table with open rates, click rates, and more.`,
  },
  {
    id: 'reports-deliverability',
    category: 'Reports',
    title: 'Deliverability Monitoring',
    summary: 'How to monitor and improve your email deliverability.',
    body: `Good deliverability means your emails reach the inbox, not spam folders.

**Key metrics:**
- **Bounce Rate** — Should stay under 2%. High rates damage sender reputation.
- **Complaint Rate** — Should stay under 0.1%. Complaints are spam reports from recipients.
- **Delivery Rate** — Percentage of emails that reach the server (not bounced).

**Improving deliverability:**
1. **Verify your domain** — Set up SPF, DKIM, and DMARC in Settings → Domain.
2. **Clean your list** — Remove bounced/inactive contacts regularly.
3. **Send to engaged contacts** — Use segments to target active subscribers.
4. **Warm up new IPs** — Start with small sends and gradually increase volume.
5. **Monitor complaints** — Check the Deliverability report for spikes.`,
  },

  // ── Settings ──
  {
    id: 'settings-general',
    category: 'Settings',
    title: 'General Settings',
    summary: 'Configure your organization name, sender defaults, and timezone.',
    body: `Go to Settings → General to configure:

**Organization:**
- Organization name (shown in campaign footers).
- Default sender name and email address.

**Defaults:**
- Default reply-to address.
- Default timezone for scheduling.

**Branding:**
- These settings provide defaults for new campaigns.
- Individual campaigns can override these values.`,
  },
  {
    id: 'settings-webhooks',
    category: 'Settings',
    title: 'Webhooks',
    summary: 'Set up webhook endpoints to receive real-time event notifications.',
    body: `Webhooks let external services receive real-time notifications when events occur in TWMail.

**Setting up a webhook:**
1. Go to Settings → Webhooks.
2. Click "Add Webhook".
3. Enter your endpoint URL (must be HTTPS).
4. Select the events you want to receive:
   - Contact events: created, updated, deleted, unsubscribed.
   - Email events: sent, delivered, opened, clicked, bounced, complained.
   - Campaign events: scheduled, sending, completed, A/B winner.
   - Import events: completed.

**Security:**
Each webhook gets a unique signing secret. Use it to verify that incoming requests are genuinely from TWMail.

**Testing:**
Click "Test" on any webhook to send a test payload and verify your endpoint is working.

**Delivery log:**
View the delivery history for each webhook, including response codes and any failed attempts.`,
  },
  {
    id: 'settings-users',
    category: 'Settings',
    title: 'User Management',
    summary: 'How to invite users, assign roles, and manage team access.',
    body: `Admins can manage team members in Settings → Users.

**Adding a user:**
1. Click "Add User".
2. Enter their name, email, and a temporary password.
3. Select a role: Admin, Editor, or Viewer.
4. The user can log in with these credentials immediately.

**Changing a role:**
Use the role dropdown in the users table to change a user's role instantly.

**Resetting a password:**
Click the three-dot menu on a user row → "Reset Password". Set a new password for them.

**Deleting a user:**
Click the three-dot menu → "Delete User". This is permanent and cannot be undone. You cannot delete your own account.

**Role summary:**
- **Admin** — Full access, including user management and system settings.
- **Editor** — Can manage contacts, campaigns, templates, segments.
- **Viewer** — Read-only access to dashboards and reports.`,
  },
  {
    id: 'settings-domain',
    category: 'Settings',
    title: 'Domain Verification',
    summary: 'Configure SPF, DKIM, and DMARC for your sending domain.',
    body: `Verifying your sending domain improves deliverability and prevents your emails from being flagged as spam.

**Steps:**
1. Go to Settings → Domain.
2. Enter your sending domain (e.g., yourdomain.com).
3. TWMail generates the required DNS records:
   - **SPF** (TXT record) — Authorizes TWMail to send on behalf of your domain.
   - **DKIM** (TXT record) — Adds a cryptographic signature to your emails.
   - **DMARC** (TXT record) — Tells receiving servers what to do with unauthenticated emails.
   - **Return-Path** (CNAME record) — Custom bounce handling domain.
4. Add these records to your DNS provider.
5. Click "Verify Domain" — TWMail checks the records are correctly configured.

**Note:** DNS changes can take up to 48 hours to propagate.`,
  },

  // ── API ──
  {
    id: 'api-keys',
    category: 'API',
    title: 'API Keys',
    summary: 'How to create and manage API keys for programmatic access.',
    body: `API keys let external applications interact with TWMail programmatically.

**Creating a key:**
1. Go to Settings → API Keys.
2. Click "Create API Key".
3. Enter a descriptive name (e.g., "Website Signup Form").
4. Select permissions:
   - **Read** — Query contacts, campaigns, and reports.
   - **Write** — Create/update contacts and campaigns.
   - **Admin** — Full access including settings.
5. Copy the key immediately — it's only shown once.

**Using the key:**
Include the key in the \`Authorization\` header:
\`\`\`
Authorization: Bearer mk_live_abc123...
\`\`\`

**Rotating a key:**
If a key is compromised, rotate it. This generates a new key and immediately invalidates the old one.

**Revoking a key:**
Delete the key to permanently disable it. Any integrations using it will stop working.`,
  },
  {
    id: 'api-endpoints',
    category: 'API',
    title: 'API Endpoints Reference',
    summary: 'Overview of the available REST API endpoints.',
    body: `TWMail exposes a REST API at \`/api/*\`. All endpoints return JSON.

**Authentication:**
All API requests require either a JWT token (from login) or an API key in the Authorization header.

**Core endpoints:**

| Resource | Endpoints |
|----------|-----------|
| Auth | POST /api/auth/login, /refresh, /logout, GET /me |
| Contacts | GET/POST /api/contacts, GET/PATCH/DELETE /api/contacts/:id |
| Campaigns | GET/POST /api/campaigns, GET/PATCH /api/campaigns/:id |
| Templates | GET/POST /api/templates, GET/PATCH/DELETE /api/templates/:id |
| Segments | GET/POST /api/segments, GET/PATCH/DELETE /api/segments/:id |
| Reports | GET /api/reports/overview, /campaigns, /deliverability |
| Webhooks | GET/POST /api/webhooks, PATCH/DELETE /api/webhooks/:id |
| Imports | POST /api/contacts/import/paste, /csv |
| Users | GET/POST /api/users, PATCH/DELETE /api/users/:id (admin only) |
| API Keys | GET/POST /api/api-keys, PATCH/DELETE /api/api-keys/:id |

**Pagination:**
List endpoints support \`?page=1&per_page=50\`. Responses include a \`meta\` object with pagination info.

**Error format:**
\`\`\`json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [{ "field": "email", "message": "Invalid email" }]
  }
}
\`\`\``,
  },
];
