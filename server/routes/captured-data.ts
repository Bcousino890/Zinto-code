import { Router } from 'express';
import { storage } from '../storage';
import { ensureAuthenticated, requireAnyPermission } from '../middleware';
import { PERMISSIONS } from '@shared/schema';
import { logger } from '../utils/logger';

const router = Router();

router.get('/', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_CAPTURED_DATA, PERMISSIONS.MANAGE_CAPTURED_DATA]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const flowId = req.query.flowId ? parseInt(req.query.flowId as string, 10) : undefined;
    const contactId = req.query.contactId ? parseInt(req.query.contactId as string, 10) : undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = Math.min(req.query.limit ? parseInt(req.query.limit as string, 10) : 50, 100);

    const startDateStr = req.query.startDate as string | undefined;
    const endDateStr = req.query.endDate as string | undefined;

    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (startDateStr) {
      const parsed = new Date(startDateStr);
      if (!Number.isNaN(parsed.getTime())) {
        startDate = new Date(parsed);
        startDate.setHours(0, 0, 0, 0);
      }
    }

    if (endDateStr) {
      const parsed = new Date(endDateStr);
      if (!Number.isNaN(parsed.getTime())) {
        endDate = new Date(parsed);
        endDate.setHours(23, 59, 59, 999);
      }
    }

    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({ success: false, error: 'Start date must be on or before end date' });
    }

    const result = await storage.getCapturedFormSubmissions(companyId, {
      flowId: Number.isNaN(flowId as number) ? undefined : flowId,
      contactId: Number.isNaN(contactId as number) ? undefined : contactId,
      startDate,
      endDate,
      page: Number.isNaN(page) || page < 1 ? 1 : page,
      limit: Number.isNaN(limit) || limit < 1 ? 50 : limit
    });

    res.json({
      success: true,
      data: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    logger.error('captured-data-routes', 'Error fetching captured form submissions', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/:id', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_CAPTURED_DATA, PERMISSIONS.MANAGE_CAPTURED_DATA]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid submission ID' });
    }

    const submission = await storage.getCapturedFormSubmissionById(companyId, id);
    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    res.json({ success: true, data: submission });
  } catch (error) {
    logger.error('captured-data-routes', 'Error fetching captured form submission', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.delete('/:id', ensureAuthenticated, requireAnyPermission([PERMISSIONS.MANAGE_CAPTURED_DATA]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid submission ID' });
    }

    const deleted = await storage.deleteCapturedFormSubmission(companyId, id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('captured-data-routes', 'Error deleting captured form submission', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
