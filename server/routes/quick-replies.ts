import { Router } from 'express';
import { db } from '../db';
import { quickReplyTemplates } from '../../shared/schema';
import { eq, and, asc } from 'drizzle-orm';
import { ensureAuthenticated } from '../middleware';

const router = Router();

router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = user.isSuperAdmin ? undefined : user.companyId;

    let templates;

    if (companyId) {
      templates = await db.select()
        .from(quickReplyTemplates)
        .where(and(
          eq(quickReplyTemplates.companyId, companyId),
          eq(quickReplyTemplates.isActive, true)
        ))
        .orderBy(asc(quickReplyTemplates.sortOrder), asc(quickReplyTemplates.name));
    } else {
      templates = await db.select()
        .from(quickReplyTemplates)
        .where(eq(quickReplyTemplates.isActive, true))
        .orderBy(asc(quickReplyTemplates.sortOrder), asc(quickReplyTemplates.name));
    }

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Error fetching quick reply templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quick reply templates'
    });
  }
});

router.get('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const templateId = parseInt(req.params.id);
    const companyId = user.isSuperAdmin ? undefined : user.companyId;

    if (isNaN(templateId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid template ID'
      });
    }

    let template;

    if (companyId) {
      template = await db.select()
        .from(quickReplyTemplates)
        .where(and(
          eq(quickReplyTemplates.id, templateId),
          eq(quickReplyTemplates.companyId, companyId)
        ))
        .limit(1);
    } else {
      template = await db.select()
        .from(quickReplyTemplates)
        .where(eq(quickReplyTemplates.id, templateId))
        .limit(1);
    }

    if (!template.length) {
      return res.status(404).json({
        success: false,
        error: 'Quick reply template not found'
      });
    }

    res.json({
      success: true,
      data: template[0]
    });
  } catch (error) {
    console.error('Error fetching quick reply template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quick reply template'
    });
  }
});

router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const { name, content, category = 'general', variables = [] } = req.body;

    if (!name || !content) {
      return res.status(400).json({
        success: false,
        error: 'Name and content are required'
      });
    }

    const maxSortOrder = await db.select({ max: quickReplyTemplates.sortOrder })
      .from(quickReplyTemplates)
      .where(eq(quickReplyTemplates.companyId, user.companyId))
      .limit(1);

    const nextSortOrder = (maxSortOrder[0]?.max || 0) + 1;

    const newTemplate = await db.insert(quickReplyTemplates).values({
      companyId: user.companyId,
      createdById: user.id,
      name: name.trim(),
      content: content.trim(),
      category: category.trim(),
      variables: variables || [],
      sortOrder: nextSortOrder,
      isActive: true
    }).returning();

    res.status(201).json({
      success: true,
      data: newTemplate[0]
    });
  } catch (error) {
    console.error('Error creating quick reply template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create quick reply template'
    });
  }
});

router.put('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const templateId = parseInt(req.params.id);
    const { name, content, category, variables, isActive, sortOrder } = req.body;

    if (isNaN(templateId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid template ID'
      });
    }

    const existingTemplate = await db.select()
      .from(quickReplyTemplates)
      .where(and(
        eq(quickReplyTemplates.id, templateId),
        eq(quickReplyTemplates.companyId, user.companyId)
      ))
      .limit(1);

    if (!existingTemplate.length) {
      return res.status(404).json({
        success: false,
        error: 'Quick reply template not found'
      });
    }

    const updateData: any = {
      updatedAt: new Date()
    };

    if (name !== undefined) updateData.name = name.trim();
    if (content !== undefined) updateData.content = content.trim();
    if (category !== undefined) updateData.category = category.trim();
    if (variables !== undefined) updateData.variables = variables;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

    const updatedTemplate = await db.update(quickReplyTemplates)
      .set(updateData)
      .where(eq(quickReplyTemplates.id, templateId))
      .returning();

    res.json({
      success: true,
      data: updatedTemplate[0]
    });
  } catch (error) {
    console.error('Error updating quick reply template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update quick reply template'
    });
  }
});

router.delete('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const templateId = parseInt(req.params.id);

    if (isNaN(templateId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid template ID'
      });
    }

    const existingTemplate = await db.select()
      .from(quickReplyTemplates)
      .where(and(
        eq(quickReplyTemplates.id, templateId),
        eq(quickReplyTemplates.companyId, user.companyId)
      ))
      .limit(1);

    if (!existingTemplate.length) {
      return res.status(404).json({
        success: false,
        error: 'Quick reply template not found'
      });
    }

    await db.update(quickReplyTemplates)
      .set({ 
        isActive: false,
        updatedAt: new Date()
      })
      .where(eq(quickReplyTemplates.id, templateId));

    res.json({
      success: true,
      message: 'Quick reply template deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting quick reply template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete quick reply template'
    });
  }
});



export default router;
