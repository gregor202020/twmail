import type { FastifyPluginAsync } from 'fastify';
import { getDb, ContactStatus, CampaignStatus } from '@twmail/shared';
import { sql } from 'kysely';
import { requireAuth } from '../middleware/auth.js';

export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // GET /api/reports/overview
  app.get('/overview', async (_request, reply) => {
    const db = getDb();

    const [contactStats, recentCampaigns, dailySends] = await Promise.all([
      // Contact counts
      db
        .selectFrom('contacts')
        .select([
          db.fn.countAll<number>().as('total'),
          db.fn.count<number>('id').filterWhere('status', '=', ContactStatus.ACTIVE).as('active'),
        ])
        .executeTakeFirstOrThrow(),

      // Recent 5 campaigns
      db
        .selectFrom('campaigns')
        .selectAll()
        .where('status', 'in', [CampaignStatus.SENT, CampaignStatus.SENDING])
        .orderBy('send_started_at', 'desc')
        .limit(5)
        .execute(),

      // 7-day daily sends
      db
        .selectFrom('campaigns')
        .select([
          sql<string>`date_trunc('day', send_started_at)::date`.as('date'),
          db.fn.sum<number>('total_sent').as('sent'),
        ])
        .where('send_started_at', '>=', sql<Date>`CURRENT_DATE - INTERVAL '7 days'`)
        .where('status', 'in', [CampaignStatus.SENT, CampaignStatus.SENDING])
        .groupBy(sql`date_trunc('day', send_started_at)::date`)
        .orderBy('date', 'asc')
        .execute(),
    ]);

    // Calculate average open/click/bounce rates across recent campaigns
    const sentCampaigns = await db
      .selectFrom('campaigns')
      .select(['total_delivered', 'total_human_opens', 'total_human_clicks', 'total_bounces', 'total_sent'])
      .where('status', '=', CampaignStatus.SENT)
      .where('total_delivered', '>', 0)
      .orderBy('send_started_at', 'desc')
      .limit(50)
      .execute();

    let avgOpenRate = 0;
    let avgClickRate = 0;
    let avgBounceRate = 0;

    if (sentCampaigns.length > 0) {
      const totalHumanOpens = sentCampaigns.reduce((sum, c) => sum + Number(c.total_human_opens), 0);
      const totalHumanClicks = sentCampaigns.reduce((sum, c) => sum + Number(c.total_human_clicks), 0);
      const totalBounces = sentCampaigns.reduce((sum, c) => sum + Number(c.total_bounces), 0);
      const totalSent = sentCampaigns.reduce((sum, c) => sum + Number(c.total_sent), 0);

      avgOpenRate = totalSent > 0 ? Number(((totalHumanOpens / totalSent) * 100).toFixed(1)) : 0;
      avgClickRate = totalSent > 0 ? Number(((totalHumanClicks / totalSent) * 100).toFixed(1)) : 0;
      avgBounceRate = totalSent > 0 ? Number(((totalBounces / totalSent) * 100).toFixed(1)) : 0;
    }

    return reply.send({
      data: {
        total_contacts: Number(contactStats.total),
        active_contacts: Number(contactStats.active),
        total_sent: sentCampaigns.reduce((sum, c) => sum + Number(c.total_sent), 0),
        avg_open_rate: avgOpenRate,
        avg_click_rate: avgClickRate,
        bounce_rate: avgBounceRate,
        daily_sends: dailySends,
        recent_campaigns: recentCampaigns,
      },
    });
  });

  // GET /api/reports/campaigns
  app.get('/campaigns', async (_request, reply) => {
    const db = getDb();

    const campaigns = await db
      .selectFrom('campaigns')
      .selectAll()
      .where('status', 'in', [CampaignStatus.SENT, CampaignStatus.SENDING])
      .orderBy('send_started_at', 'desc')
      .limit(50)
      .execute();

    const data = campaigns.map((c) => {
      const sent = Number(c.total_sent) || 1;
      return {
        id: c.id,
        name: c.name,
        sent_at: c.send_started_at,
        total_sent: Number(c.total_sent),
        total_delivered: Number(c.total_delivered),
        open_rate: Number(((Number(c.total_human_opens) / sent) * 100).toFixed(1)),
        click_rate: Number(((Number(c.total_human_clicks) / sent) * 100).toFixed(1)),
        bounce_rate: Number(((Number(c.total_bounces) / sent) * 100).toFixed(1)),
        unsubscribe_rate: Number(((Number(c.total_unsubscribes) / sent) * 100).toFixed(1)),
      };
    });

    return reply.send({ data });
  });

  // GET /api/reports/growth
  app.get<{ Querystring: { days?: string } }>('/growth', async (request, reply) => {
    const db = getDb();
    const days = request.query.days ? Number(request.query.days) : 30;

    const data = await db
      .selectFrom('contacts')
      .select([
        sql<string>`date_trunc('day', created_at)::date`.as('date'),
        db.fn.countAll<number>().as('new_contacts'),
      ])
      .where('created_at', '>=', sql<Date>`CURRENT_DATE - ${sql.lit(days)} * INTERVAL '1 day'`)
      .groupBy(sql`date_trunc('day', created_at)::date`)
      .orderBy('date', 'asc')
      .execute();

    return reply.send({ data });
  });

  // GET /api/reports/engagement
  app.get('/engagement', async (_request, reply) => {
    const db = getDb();

    const tiers = await db
      .selectFrom('contacts')
      .select(['engagement_tier', db.fn.countAll<number>().as('count')])
      .where('status', '=', ContactStatus.ACTIVE)
      .groupBy('engagement_tier')
      .execute();

    return reply.send({
      data: {
        tiers: tiers.map((t) => ({
          tier: t.engagement_tier,
          count: Number(t.count),
        })),
      },
    });
  });

  // GET /api/reports/deliverability
  app.get<{ Querystring: { days?: string } }>('/deliverability', async (request, reply) => {
    const db = getDb();
    const days = request.query.days ? Number(request.query.days) : 30;

    const campaigns = await db
      .selectFrom('campaigns')
      .select([
        'id',
        'name',
        'total_sent',
        'total_delivered',
        'total_bounces',
        'total_complaints',
        'send_started_at',
      ])
      .where('status', '=', CampaignStatus.SENT)
      .where('send_started_at', '>=', sql<Date>`CURRENT_DATE - ${sql.lit(days)} * INTERVAL '1 day'`)
      .orderBy('send_started_at', 'desc')
      .execute();

    const totals = campaigns.reduce(
      (acc, c) => ({
        sent: acc.sent + c.total_sent,
        delivered: acc.delivered + c.total_delivered,
        bounces: acc.bounces + c.total_bounces,
        complaints: acc.complaints + c.total_complaints,
      }),
      { sent: 0, delivered: 0, bounces: 0, complaints: 0 },
    );

    return reply.send({
      data: {
        period_days: days,
        totals,
        bounce_rate: totals.sent > 0 ? Number(((totals.bounces / totals.sent) * 100).toFixed(2)) : 0,
        complaint_rate:
          totals.delivered > 0 ? Number(((totals.complaints / totals.delivered) * 100).toFixed(4)) : 0,
        campaigns: campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          sent_at: c.send_started_at,
          bounce_rate: c.total_sent > 0 ? Number(((c.total_bounces / c.total_sent) * 100).toFixed(2)) : 0,
          complaint_rate:
            c.total_delivered > 0
              ? Number(((c.total_complaints / c.total_delivered) * 100).toFixed(4))
              : 0,
        })),
      },
    });
  });
};
