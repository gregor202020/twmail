import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, ContactStatus, EventType, MessageStatus } from '@twmail/shared';
import type { Kysely } from 'kysely';
import type { Database } from '@twmail/shared';

// 1x1 transparent PNG pixel
const TRACKING_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

// Apple proxy IP ranges for machine open detection
const APPLE_PROXY_PREFIXES = ['17.'];

// Known mail proxy user-agents for machine open detection
const MACHINE_UA_PATTERNS: RegExp[] = [/YahooMailProxy/i, /Googleimageproxy/i];

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function detectMachineOpen(ip: string, userAgent: string): boolean {
  for (const prefix of APPLE_PROXY_PREFIXES) {
    if (ip.startsWith(prefix)) return true;
  }
  for (const pattern of MACHINE_UA_PATTERNS) {
    if (pattern.test(userAgent)) return true;
  }
  return false;
}

const CLICK_FALLBACK_URL = 'https://thirdwavebbq.com.au';

/**
 * Resolves a redirect URL from a SENT event's metadata link_map.
 */
export function resolveClickUrl(sentMetadata: unknown, linkHash: string): string {
  let targetUrl = CLICK_FALLBACK_URL;

  if (
    sentMetadata != null &&
    typeof sentMetadata === 'object' &&
    'link_map' in sentMetadata
  ) {
    const map = (sentMetadata as Record<string, unknown>)['link_map'];
    if (map != null && typeof map === 'object' && linkHash in map) {
      const candidate = (map as Record<string, unknown>)[linkHash];
      if (typeof candidate === 'string') {
        targetUrl = candidate;
      }
    }
  }

  // Validate protocol to prevent open redirect
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return CLICK_FALLBACK_URL;
    }
  } catch {
    return CLICK_FALLBACK_URL;
  }

  return targetUrl;
}

export const trackingRoutes: FastifyPluginAsync = async (app) => {
  // GET /t/o/:messageId.png — Open tracking pixel
  app.get<{ Params: { messageId: string } }>(
    '/t/o/:messageId.png',
    { config: { rateLimit: false } },
    async (request, reply) => {
      const messageId = request.params.messageId;
      const db = getDb();

      // Return pixel immediately
      reply.header('Content-Type', 'image/png');
      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');

      // Record open event async (fire and forget)
      recordOpen(db, messageId, request).catch((err) => {
        request.log.error({ err, messageId }, 'recordOpen failed');
      });

      return reply.send(TRACKING_PIXEL);
    },
  );

  // GET /t/c/:messageId/:linkHash — Click tracking redirect
  app.get<{ Params: { messageId: string; linkHash: string } }>(
    '/t/c/:messageId/:linkHash',
    { config: { rateLimit: false } },
    async (request, reply) => {
      const { messageId, linkHash } = request.params;
      const db = getDb();

      // Query SENT event link_map
      const sentEvent = await db
        .selectFrom('events')
        .select('metadata')
        .where('message_id', '=', messageId)
        .where('event_type', '=', EventType.SENT)
        .executeTakeFirst();

      const targetUrl = resolveClickUrl(sentEvent?.metadata, linkHash);

      // Record click event async (fire and forget)
      recordClick(db, messageId, linkHash, targetUrl, request).catch((err) => {
        request.log.error({ err, messageId, linkHash }, 'recordClick failed');
      });

      return reply.redirect(targetUrl);
    },
  );

  // POST /t/u/:messageId — One-click unsubscribe (RFC 8058)
  app.post<{ Params: { messageId: string } }>(
    '/t/u/:messageId',
    { config: { rateLimit: false } },
    async (request, reply) => {
      const messageId = request.params.messageId;
      const db = getDb();

      const message = await db
        .selectFrom('messages')
        .select(['contact_id', 'campaign_id'])
        .where('id', '=', messageId)
        .executeTakeFirst();

      if (!message) {
        return reply.status(200).send(); // Return 200 even if not found (RFC compliance)
      }

      // Update contact status
      await db
        .updateTable('contacts')
        .set({
          status: ContactStatus.UNSUBSCRIBED,
          unsubscribed_at: new Date(),
        })
        .where('id', '=', message.contact_id)
        .execute();

      // Record unsubscribe event
      await db
        .insertInto('events')
        .values({
          event_type: EventType.UNSUBSCRIBE,
          contact_id: message.contact_id,
          campaign_id: message.campaign_id,
          message_id: messageId,
          event_time: new Date(),
        })
        .execute();

      // Update message status
      await db
        .updateTable('messages')
        .set({ status: MessageStatus.UNSUBSCRIBED })
        .where('id', '=', messageId)
        .execute();

      return reply.status(200).send();
    },
  );

  // GET /t/u/:messageId — Unsubscribe confirmation page
  app.get<{ Params: { messageId: string } }>(
    '/t/u/:messageId',
    { config: { rateLimit: false } },
    async (request, reply) => {
      reply.header('Content-Type', 'text/html');
      return reply.send(`<!DOCTYPE html>
<html><head><title>Unsubscribe</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:-apple-system,sans-serif;max-width:500px;margin:80px auto;padding:20px;text-align:center}
.btn{display:inline-block;padding:12px 32px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px;border:none;cursor:pointer;font-size:16px}
.btn:hover{background:#b91c1c}</style></head>
<body>
<h2>Unsubscribe</h2>
<p>Click the button below to unsubscribe from our emails.</p>
<form method="POST" action="/t/u/${escapeHtml(request.params.messageId)}">
<button type="submit" class="btn">Unsubscribe</button>
</form>
<p style="margin-top:24px;color:#666;font-size:14px">You can also manage your email preferences in your account settings.</p>
</body></html>`);
    },
  );
};

async function recordOpen(
  db: Kysely<Database>,
  messageId: string,
  request: FastifyRequest,
): Promise<void> {
  const message = await db
    .selectFrom('messages')
    .select(['contact_id', 'campaign_id', 'variant_id'])
    .where('id', '=', messageId)
    .executeTakeFirst();

  if (!message) return;

  const ip = request.ip ?? '';
  const userAgent = String(request.headers['user-agent'] ?? '');
  const isMachine = detectMachineOpen(ip, userAgent);

  const eventType = isMachine ? EventType.MACHINE_OPEN : EventType.OPEN;

  await db
    .insertInto('events')
    .values({
      event_type: eventType,
      contact_id: message.contact_id,
      campaign_id: message.campaign_id,
      variant_id: message.variant_id,
      message_id: messageId,
      event_time: new Date(),
      metadata: { user_agent: userAgent, ip, is_machine: isMachine },
    })
    .execute();

  if (!isMachine) {
    // Update message first_open_at if not already set
    await db
      .updateTable('messages')
      .set({ first_open_at: new Date(), status: MessageStatus.OPENED })
      .where('id', '=', messageId)
      .where('first_open_at', 'is', null)
      .execute();

    // Update campaign counters
    await db
      .updateTable('campaigns')
      .set((eb) => ({
        total_opens: eb('total_opens', '+', 1),
        total_human_opens: eb('total_human_opens', '+', 1),
      }))
      .where('id', '=', message.campaign_id)
      .execute();

    // Update variant counters for A/B test
    if (message.variant_id) {
      await db
        .updateTable('campaign_variants')
        .set((eb) => ({
          total_opens: eb('total_opens', '+', 1),
          total_human_opens: eb('total_human_opens', '+', 1),
        }))
        .where('id', '=', message.variant_id)
        .execute();
    }

    // Update contact last_open_at
    await db
      .updateTable('contacts')
      .set({ last_open_at: new Date(), last_activity_at: new Date() })
      .where('id', '=', message.contact_id)
      .execute();
  } else {
    await db
      .updateTable('campaigns')
      .set((eb) => ({ total_opens: eb('total_opens', '+', 1) }))
      .where('id', '=', message.campaign_id)
      .execute();

    // Update variant counters for A/B test (machine open)
    if (message.variant_id) {
      await db
        .updateTable('campaign_variants')
        .set((eb) => ({
          total_opens: eb('total_opens', '+', 1),
        }))
        .where('id', '=', message.variant_id)
        .execute();
    }

    await db
      .updateTable('messages')
      .set({ is_machine_open: true })
      .where('id', '=', messageId)
      .execute();
  }
}

async function recordClick(
  db: Kysely<Database>,
  messageId: string,
  linkHash: string,
  url: string,
  request: FastifyRequest,
): Promise<void> {
  const message = await db
    .selectFrom('messages')
    .select(['contact_id', 'campaign_id', 'variant_id'])
    .where('id', '=', messageId)
    .executeTakeFirst();

  if (!message) return;

  const userAgent = String(request.headers['user-agent'] ?? '');

  await db
    .insertInto('events')
    .values({
      event_type: EventType.CLICK,
      contact_id: message.contact_id,
      campaign_id: message.campaign_id,
      variant_id: message.variant_id,
      message_id: messageId,
      event_time: new Date(),
      metadata: { url, link_hash: linkHash, user_agent: userAgent },
    })
    .execute();

  // Update message first_click_at
  await db
    .updateTable('messages')
    .set({ first_click_at: new Date(), status: MessageStatus.CLICKED })
    .where('id', '=', messageId)
    .where('first_click_at', 'is', null)
    .execute();

  // Update campaign counters
  await db
    .updateTable('campaigns')
    .set((eb) => ({
      total_clicks: eb('total_clicks', '+', 1),
      total_human_clicks: eb('total_human_clicks', '+', 1),
    }))
    .where('id', '=', message.campaign_id)
    .execute();

  // Update variant counters for A/B test
  if (message.variant_id) {
    await db
      .updateTable('campaign_variants')
      .set((eb) => ({
        total_clicks: eb('total_clicks', '+', 1),
        total_human_clicks: eb('total_human_clicks', '+', 1),
      }))
      .where('id', '=', message.variant_id)
      .execute();
  }

  // Update contact
  await db
    .updateTable('contacts')
    .set({ last_click_at: new Date(), last_activity_at: new Date() })
    .where('id', '=', message.contact_id)
    .execute();
}
