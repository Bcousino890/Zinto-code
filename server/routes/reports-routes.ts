/**
 * Reports API Routes
 * Conversation metrics reports: agent performance, response time, channel SLA, volume heatmap, resolution, CSV export.
 */

import { Router, Request } from 'express';
import { db } from '../db';
import { conversationMetrics, users, conversations, PERMISSIONS } from '@shared/schema';
import { eq, and, gte, lte, sql, avg, min, max, count, isNotNull, isNull } from 'drizzle-orm';
import { createObjectCsvWriter } from 'csv-writer';
import { join } from 'path';
import { tmpdir } from 'os';
import { ensureAuthenticated, requireAnyPermission, requirePermission } from '../middleware';

const router = Router();

function parseDateRange(from?: string, to?: string): { fromDate: Date; toDate: Date } {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  })();
  return { fromDate, toDate };
}

function getCompanyId(req: Request): number | null {
  return (req as any).user?.companyId ?? null;
}

// --- Agent performance query (shared by GET and export)
async function queryAgentPerformance(companyId: number, fromDate: Date, toDate: Date, agentId?: number) {
  const conditions = [
    eq(conversationMetrics.companyId, companyId),
    gte(conversationMetrics.contactedAt, fromDate),
    lte(conversationMetrics.contactedAt, toDate)
  ];
  if (agentId != null) {
    conditions.push(eq(conversationMetrics.assignedToUserId, agentId));
  }
  const rows = await db
    .select({
      agentId: conversationMetrics.assignedToUserId,
      agentName: users.fullName,
      agentEmail: users.email,
      conversationsHandled: count(),
      avgFirstResponseTimeSec: avg(conversationMetrics.firstResponseTimeSec),
      avgResolutionTimeSec: avg(conversationMetrics.resolutionTimeSec),
      totalAgentMessages: sql<number>`coalesce(sum(${conversationMetrics.agentMessages}), 0)`,
      resolvedCount: sql<number>`count(*) filter (where ${conversationMetrics.resolvedAt} is not null)`
    })
    .from(conversationMetrics)
    .innerJoin(conversations, eq(conversationMetrics.conversationId, conversations.id))
    .leftJoin(users, eq(conversationMetrics.assignedToUserId, users.id))
    .where(and(...conditions))
    .groupBy(conversationMetrics.assignedToUserId, users.fullName, users.email);

  return rows.map(row => {
    const conversationsHandled = Number(row.conversationsHandled ?? 0);
    const resolvedCount = Number(row.resolvedCount ?? 0);
    const resolutionRate = conversationsHandled > 0 ? (resolvedCount / conversationsHandled) * 100 : 0;
    return {
      agentId: row.agentId,
      agentName: row.agentName ?? null,
      agentEmail: row.agentEmail ?? null,
      conversationsHandled,
      avgFirstResponseTimeSec: row.avgFirstResponseTimeSec != null ? Number(row.avgFirstResponseTimeSec) : null,
      avgResolutionTimeSec: row.avgResolutionTimeSec != null ? Number(row.avgResolutionTimeSec) : null,
      totalAgentMessages: Number(row.totalAgentMessages ?? 0),
      resolutionRate
    };
  });
}

/**
 * GET /agent-performance
 */
router.get('/agent-performance', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS]), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const { from, to, agentId } = req.query;
    const { fromDate, toDate } = parseDateRange(from as string, to as string);
    const agentIdNum = agentId != null && agentId !== '' ? parseInt(String(agentId), 10) : undefined;
    const data = await queryAgentPerformance(companyId, fromDate, toDate, isNaN(agentIdNum!) ? undefined : agentIdNum);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching agent performance:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /response-time
 */
router.get('/response-time', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS, PERMISSIONS.VIEW_RESPONSE_TIME_REPORTS]), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const { from, to, channelType } = req.query;
    const { fromDate, toDate } = parseDateRange(from as string, to as string);
    const conditions = [
      eq(conversationMetrics.companyId, companyId),
      isNotNull(conversationMetrics.firstResponseTimeSec),
      gte(conversationMetrics.contactedAt, fromDate),
      lte(conversationMetrics.contactedAt, toDate)
    ];
    if (channelType != null && channelType !== '') {
      conditions.push(eq(conversationMetrics.channelType, String(channelType)));
    }
    const rows = await db
      .select({
        day: sql`date_trunc('day', ${conversationMetrics.contactedAt})`,
        channelType: conversationMetrics.channelType,
        avgSec: avg(conversationMetrics.firstResponseTimeSec),
        minSec: min(conversationMetrics.firstResponseTimeSec),
        maxSec: max(conversationMetrics.firstResponseTimeSec),
        p95Sec: sql<number>`percentile_cont(0.95) within group (order by ${conversationMetrics.firstResponseTimeSec})`,
        sampleCount: count()
      })
      .from(conversationMetrics)
      .innerJoin(conversations, eq(conversationMetrics.conversationId, conversations.id))
      .where(and(...conditions))
      .groupBy(sql`date_trunc('day', ${conversationMetrics.contactedAt})`, conversationMetrics.channelType);

    const data = rows.map(row => ({
      day: row.day,
      channelType: row.channelType,
      avgSec: row.avgSec != null ? Number(row.avgSec) : null,
      minSec: row.minSec != null ? Number(row.minSec) : null,
      maxSec: row.maxSec != null ? Number(row.maxSec) : null,
      p95Sec: row.p95Sec != null ? Number(row.p95Sec) : null,
      sampleCount: Number(row.sampleCount ?? 0)
    }));
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching response time:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /channel-sla
 */
router.get('/channel-sla', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS]), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const { from, to, slaThresholdSec } = req.query;
    const { fromDate, toDate } = parseDateRange(from as string, to as string);
    const threshold = slaThresholdSec != null && slaThresholdSec !== '' ? parseInt(String(slaThresholdSec), 10) : 300;
    const rows = await db
      .select({
        channelType: conversationMetrics.channelType,
        total: count(),
        withinSla: sql<number>`count(*) filter (where ${conversationMetrics.firstResponseTimeSec} <= ${threshold})`,
        avgFirstResponseTimeSec: avg(conversationMetrics.firstResponseTimeSec)
      })
      .from(conversationMetrics)
      .innerJoin(conversations, eq(conversationMetrics.conversationId, conversations.id))
      .where(and(
        eq(conversationMetrics.companyId, companyId),
        isNotNull(conversationMetrics.firstResponseTimeSec),
        gte(conversationMetrics.contactedAt, fromDate),
        lte(conversationMetrics.contactedAt, toDate)
      ))
      .groupBy(conversationMetrics.channelType);

    const data = rows.map(row => {
      const total = Number(row.total ?? 0);
      const withinSla = Number(row.withinSla ?? 0);
      const slaComplianceRate = total > 0 ? (withinSla / total) * 100 : 0;
      return {
        channelType: row.channelType,
        total,
        withinSla,
        slaComplianceRate,
        avgFirstResponseTimeSec: row.avgFirstResponseTimeSec != null ? Number(row.avgFirstResponseTimeSec) : null
      };
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching channel SLA:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /volume-heatmap
 */
router.get('/volume-heatmap', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS]), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const { from, to } = req.query;
    const { fromDate, toDate } = parseDateRange(from as string, to as string);
    const rows = await db
      .select({
        dayOfWeek: sql<number>`extract(dow from ${conversationMetrics.contactedAt})`,
        hourOfDay: sql<number>`extract(hour from ${conversationMetrics.contactedAt})`,
        conversationCount: count()
      })
      .from(conversationMetrics)
      .innerJoin(conversations, eq(conversationMetrics.conversationId, conversations.id))
      .where(and(
        eq(conversationMetrics.companyId, companyId),
        gte(conversationMetrics.contactedAt, fromDate),
        lte(conversationMetrics.contactedAt, toDate)
      ))
      .groupBy(sql`extract(dow from ${conversationMetrics.contactedAt})`, sql`extract(hour from ${conversationMetrics.contactedAt})`);

    const data = rows.map(row => ({
      dayOfWeek: Number(row.dayOfWeek ?? 0),
      hourOfDay: Number(row.hourOfDay ?? 0),
      conversationCount: Number(row.conversationCount ?? 0)
    }));
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching volume heatmap:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /resolution
 */
router.get('/resolution', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS]), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const { from, to } = req.query;
    const { fromDate, toDate } = parseDateRange(from as string, to as string);
    const [row] = await db
      .select({
        total: count(),
        resolved: sql<number>`count(*) filter (where ${conversationMetrics.resolvedAt} is not null)`,
        open: sql<number>`count(*) filter (where ${conversationMetrics.resolvedAt} is null)`,
        avgResolutionTimeSec: avg(conversationMetrics.resolutionTimeSec)
      })
      .from(conversationMetrics)
      .innerJoin(conversations, eq(conversationMetrics.conversationId, conversations.id))
      .where(and(
        eq(conversationMetrics.companyId, companyId),
        gte(conversationMetrics.contactedAt, fromDate),
        lte(conversationMetrics.contactedAt, toDate)
      ));

    const total = Number(row?.total ?? 0);
    const resolved = Number(row?.resolved ?? 0);
    const open = Number(row?.open ?? 0);
    const resolutionRate = total > 0 ? (resolved / total) * 100 : 0;
    const data = {
      total,
      resolved,
      open,
      resolutionRate,
      avgResolutionTimeSec: row?.avgResolutionTimeSec != null ? Number(row.avgResolutionTimeSec) : null
    };
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching resolution:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /csat
 * Customer satisfaction metrics for the Resolution & CSAT tab. Returns stub when no CSAT source exists.
 */
router.get('/csat', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS]), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const { from, to } = req.query;
    const { fromDate, toDate } = parseDateRange(from as string, to as string);
    // No CSAT table in schema yet; return contract-compliant stub so client can render section
    const data = {
      avgScore: null as number | null,
      responseCount: 0,
      distribution: [] as { score: number; count: number }[]
    };
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching CSAT:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * GET /export/agent-performance
 */
router.get('/export/agent-performance', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AGENT_REPORTS]), requirePermission(PERMISSIONS.EXPORT_REPORTS), async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId == null) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const { from, to } = req.query;
    const { fromDate, toDate } = parseDateRange(from as string, to as string);
    const rows = await queryAgentPerformance(companyId, fromDate, toDate);

    const csvPath = join(tmpdir(), `agent-performance-${Date.now()}.csv`);
    const csvWriter = createObjectCsvWriter({
      path: csvPath,
      header: [
        { id: 'agentId', title: 'Agent ID' },
        { id: 'agentName', title: 'Agent Name' },
        { id: 'agentEmail', title: 'Agent Email' },
        { id: 'conversationsHandled', title: 'Conversations Handled' },
        { id: 'avgFirstResponseTimeSec', title: 'Avg First Response (sec)' },
        { id: 'avgResolutionTimeSec', title: 'Avg Resolution Time (sec)' },
        { id: 'totalAgentMessages', title: 'Total Agent Messages' },
        { id: 'resolutionRate', title: 'Resolution Rate (%)' }
      ]
    });

    await csvWriter.writeRecords(rows.map(r => ({
      agentId: r.agentId ?? '',
      agentName: r.agentName ?? '',
      agentEmail: r.agentEmail ?? '',
      conversationsHandled: r.conversationsHandled,
      avgFirstResponseTimeSec: r.avgFirstResponseTimeSec ?? '',
      avgResolutionTimeSec: r.avgResolutionTimeSec ?? '',
      totalAgentMessages: r.totalAgentMessages,
      resolutionRate: r.resolutionRate
    })));

    const timestamp = Date.now();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="agent-performance-${timestamp}.csv"`);
    res.sendFile(csvPath);
  } catch (error) {
    console.error('Error exporting agent performance:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

export default router;
