import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission, getUserPermissions } from '../../middleware';
import { storage, getErpErrorResponse, logContactAudit, DentalPhoneConflictError } from '../../storage';
import { insertDentalPatientProfileSchema, insertDentalChairSchema, PERMISSIONS } from '@shared/schema';
import { ensureDentalBusinessType, DENTAL_TOOTH_NUMBERING_SETTING_KEY, normalizeDentalToothNumberingSystem } from './business-type';
import {
  getDentalBookingPolicy,
  saveDentalBookingPolicy,
} from '../../services/dental-booking-policy-service';
import {
  approveDentalBookingRequest,
  bookDentalAppointment,
  confirmDentalBooking,
  declineDentalBooking,
  getDentalAvailableSlots,
  listPendingDentalBookings,
} from '../../services/dental-booking-service';
import {
  DENTAL_AVAILABILITY_MAX_LIMIT,
  DENTAL_BOOKING_SOURCES,
} from '@shared/types/dental-booking-types';
import {
  DENTAL_CLINICAL_NOTE_TYPES,
  DENTAL_CLINICAL_DOCUMENT_CATEGORIES,
  DENTAL_TREATMENT_PLAN_STATUSES,
  DENTAL_TREATMENT_PLAN_CLINICAL_STATUSES,
  DENTAL_TREATMENT_PROCEDURE_STATUSES,
  DENTAL_TREATMENT_PROCEDURE_CLINICAL_STATUSES,
  normalizeDentalClinicalNoteType,
  normalizeDentalTreatmentPlanClinicalStatus,
  normalizeDentalTreatmentProcedureClinicalStatus,
  isDentalClinicalDocumentCategory,
} from '@shared/dental-clinical';

const router = Router();

/** Clinical plan access or ERP billing roles that need the treatment-plan billing UI. */
const DENTAL_TREATMENT_PLAN_READ_PERMISSIONS = [
  'view_dental_treatment_plans',
  'manage_dental_treatment_plans',
  'create_quotations',
  'manage_sales_orders',
  'view_sales_orders',
  'manage_invoices',
  'view_invoices',
];

const listSchema = z.object({
  search: z.string().optional(),
  tag: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  sex: z.string().optional(),
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
});

const contactIdSchema = z.object({
  contactId: z.coerce.number().int().positive(),
});

const membershipSchema = z.object({
  contactIds: z.array(z.coerce.number().int().positive()).max(200),
});

const eligibleSchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().optional(),
});

const lookupByPhoneSchema = z.object({
  phone: z.string().trim().min(1),
});

const createWithContactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(40),
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().email().optional(),
  ),
});

const createSchema = insertDentalPatientProfileSchema
  .omit({ companyId: true })
  .extend({
    contactId: z.coerce.number().int().positive(),
    dateOfBirth: z.string().nullable().optional(),
    preferredProviderUserId: z.coerce.number().int().positive().nullable().optional(),
  });

const updateSchema = createSchema.omit({ contactId: true }).partial();

const chairIdSchema = z.object({
  chairId: z.coerce.number().int().positive(),
});

const createChairSchema = insertDentalChairSchema
  .omit({ companyId: true })
  .extend({
    code: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(120),
    sortOrder: z.coerce.number().int().optional(),
    isActive: z.boolean().optional(),
  });

const updateChairSchema = createChairSchema.partial();

const appointmentStatusSchema = z.enum([
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
  'rescheduled',
  'no_show',
]);

const scheduleListSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  providerUserId: z.coerce.number().int().positive().optional(),
  chairId: z.coerce.number().int().positive().optional(),
});

const scheduleIdSchema = z.object({
  appointmentId: z.coerce.number().int().positive(),
});

const createScheduleSchema = z.object({
  contactId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  scheduledAt: z.string().min(1),
  durationMinutes: z.coerce.number().int().positive().max(24 * 60).optional(),
  type: z.string().trim().min(1).max(64).optional(),
  status: appointmentStatusSchema.optional(),
  providerUserId: z.coerce.number().int().positive().nullable().optional(),
  chairId: z.coerce.number().int().positive().nullable().optional(),
  isRecall: z.boolean().optional(),
  recallDueAt: z.string().nullable().optional(),
});

const updateScheduleSchema = createScheduleSchema.partial().extend({
  contactId: z.coerce.number().int().positive().optional(),
});

const snapshotIdSchema = z.object({
  snapshotId: z.coerce.number().int().positive(),
});

const chartHistorySchema = z.object({
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
});

const numberingSystemSchema = z.enum(['FDI', 'UNIVERSAL', 'PALMER']);

const createChartSnapshotSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
  numberingSystem: numberingSystemSchema.optional(),
});

const chartSettingsSchema = z.object({
  numberingSystem: numberingSystemSchema,
});

async function getCompanyToothNumbering(companyId: number) {
  const setting = await storage.getCompanySetting(companyId, DENTAL_TOOTH_NUMBERING_SETTING_KEY);
  return normalizeDentalToothNumberingSystem(setting?.value);
}

async function ensureDentalPatient(companyId: number, contactId: number) {
  const patient = await storage.getDentalPatientByContactId(companyId, contactId);
  if (!patient) return null;
  return patient;
}

const noteIdSchema = z.object({
  noteId: z.coerce.number().int().positive(),
});

const createClinicalNoteSchema = z.object({
  noteType: z.enum(DENTAL_CLINICAL_NOTE_TYPES).optional(),
  body: z.string().trim().min(1).max(10000),
  toothRefs: z.array(z.string().trim().min(1).max(8)).max(32).nullable().optional(),
});

const updateClinicalNoteSchema = createClinicalNoteSchema.partial();

async function auditDentalClinical(
  req: Request,
  params: {
    companyId: number;
    contactId: number;
    actionType: string;
    description: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  },
) {
  await logContactAudit({
    companyId: params.companyId,
    contactId: params.contactId,
    userId: (req.user as { id?: number } | undefined)?.id,
    actionType: params.actionType,
    actionCategory: 'dental_clinical',
    description: params.description,
    oldValues: params.oldValues ?? null,
    newValues: params.newValues ?? null,
    metadata: params.metadata ?? null,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });
}

function handleRouteError(res: Response, error: unknown, logLabel: string) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: error.flatten() });
  }
  if (error instanceof DentalPhoneConflictError) {
    return res.status(409).json({
      success: false,
      error: error.message,
      code: error.code,
      contactId: error.contact.id,
      isPatient: error.isPatient,
      name: error.contact.name,
      phone: error.contact.phone,
      email: error.contact.email,
    });
  }
  const mapped = getErpErrorResponse(error);
  if (mapped) return res.status(mapped.status).json({ success: false, error: mapped.message });
  console.error(logLabel, error);
  return res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
}

async function canViewContactPhone(req: Request): Promise<boolean> {
  const user = req.user as { isSuperAdmin?: boolean } | undefined;
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const permissions = await getUserPermissions(user as any);
  return permissions[PERMISSIONS.VIEW_CONTACT_PHONE] === true;
}

function maskContactPhone<T extends { phone?: string | null; identifier?: string | null }>(
  contact: T,
  allowPhone: boolean,
): T {
  if (allowPhone) return contact;
  return { ...contact, phone: null, identifier: null };
}

function parseDayBound(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new z.ZodError([
      { code: 'custom', message: `Invalid ${label}`, path: [label] },
    ]);
  }
  return date;
}

/** Minimal dental-gated health stub so `ensureDentalBusinessType` is verifiable. */
router.get('/health', async (req, res) => {
  const companyId = await ensureDentalBusinessType(req, res);
  if (!companyId) return;
  return res.json({ success: true, mode: 'dental', companyId });
});

router.get(
  '/patients/eligible-contacts',
  requireAnyPermission(['manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = eligibleSchema.parse(req.query);
      const allowPhone = await canViewContactPhone(req);
      const rows = await storage.listEligibleDentalContacts(companyId, query);
      return res.json({
        success: true,
        data: rows.map((row) => maskContactPhone(row, allowPhone)),
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing eligible dental contacts:');
    }
  },
);

router.get(
  '/patients/lookup-by-phone',
  requireAnyPermission(['manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = lookupByPhoneSchema.parse(req.query);
      const allowPhone = await canViewContactPhone(req);
      const result = await storage.lookupDentalContactByPhone(companyId, query.phone);
      return res.json({
        success: true,
        data: {
          contact: result.contact ? maskContactPhone(result.contact, allowPhone) : null,
          isPatient: result.isPatient,
        },
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error looking up dental contact by phone:');
    }
  },
);

router.post(
  '/patients/with-contact',
  requireAnyPermission(['manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;

      const user = req.user as { id?: number; isSuperAdmin?: boolean } | undefined;
      if (!user?.isSuperAdmin) {
        const permissions = await getUserPermissions(user as any);
        if (permissions[PERMISSIONS.CREATE_CONTACTS] !== true) {
          return res.status(403).json({
            success: false,
            error: 'Creating a new patient requires create contacts permission',
          });
        }
      }

      const body = createWithContactSchema.parse(req.body);
      const data = await storage.createDentalPatientWithNewContact(
        companyId,
        { name: body.name, phone: body.phone, email: body.email },
        { createdBy: user?.id ?? null },
      );

      await logContactAudit({
        companyId,
        contactId: data.contact.id,
        userId: user?.id,
        actionType: 'created',
        actionCategory: 'contact',
        description: `Dental patient contact created: ${data.contact.name}`,
        newValues: {
          name: data.contact.name,
          email: data.contact.email,
          phone: data.contact.phone,
          source: 'dental',
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      const allowPhone = await canViewContactPhone(req);
      return res.status(201).json({
        success: true,
        data: {
          ...data.profile,
          contact: maskContactPhone(data.contact, allowPhone),
        },
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating dental patient with contact:');
    }
  },
);

router.post(
  '/patients/membership',
  requireAnyPermission(['view_dental_patients', 'manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const body = membershipSchema.parse(req.body);
      const data = await storage.listDentalPatientMembership(companyId, body.contactIds);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error checking dental patient membership:');
    }
  },
);

router.get(
  '/patients',
  requireAnyPermission(['view_dental_patients', 'manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = listSchema.parse(req.query);
      const allowPhone = await canViewContactPhone(req);
      const result = await storage.listDentalPatients(companyId, {
        search: query.search,
        tag: query.tag,
        sex: query.sex,
        isActive: query.status === 'active' ? true : query.status === 'inactive' ? false : undefined,
        limit: query.limit,
        offset: query.offset,
      });
      return res.json({
        success: true,
        data: {
          ...result,
          data: result.data.map((row) => ({
            ...row,
            contact: maskContactPhone(row.contact, allowPhone),
          })),
        },
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing dental patients:');
    }
  },
);

router.get(
  '/patients/stats',
  requireAnyPermission(['view_dental_patients', 'manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const data = await storage.getDentalPatientListStats(companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error getting dental patient stats:');
    }
  },
);

router.get(
  '/patients/:contactId',
  requireAnyPermission(['view_dental_patients', 'manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const data = await storage.getDentalPatientByContactId(companyId, contactId);
      if (!data) return res.status(404).json({ success: false, error: 'Patient not found' });
      const allowPhone = await canViewContactPhone(req);
      return res.json({
        success: true,
        data: {
          ...data,
          contact: maskContactPhone(data.contact, allowPhone),
        },
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error getting dental patient:');
    }
  },
);

router.post(
  '/patients',
  requireAnyPermission(['manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const body = createSchema.parse(req.body);
      const data = await storage.createDentalPatientProfile({ ...body, companyId });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating dental patient:');
    }
  },
);

router.patch(
  '/patients/:contactId',
  requireAnyPermission(['manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const existing = await storage.getDentalPatientByContactId(companyId, contactId);
      if (!existing) return res.status(404).json({ success: false, error: 'Patient not found' });
      const updates = updateSchema.parse(req.body);
      const data = await storage.updateDentalPatientProfile(companyId, contactId, updates);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating dental patient:');
    }
  },
);

router.delete(
  '/patients/:contactId',
  requireAnyPermission(['manage_dental_patients']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const deleted = await storage.deleteDentalPatientProfile(companyId, contactId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Patient not found' });
      return res.json({ success: true });
    } catch (error) {
      return handleRouteError(res, error, 'Error deleting dental patient:');
    }
  },
);

// --- Chairs ---

router.get(
  '/chairs',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const activeOnly = req.query.activeOnly === 'true' || req.query.activeOnly === '1';
      const data = await storage.listDentalChairs(companyId, { activeOnly });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing dental chairs:');
    }
  },
);

router.post(
  '/chairs',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const body = createChairSchema.parse(req.body);
      const data = await storage.createDentalChair({ ...body, companyId });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating dental chair:');
    }
  },
);

router.patch(
  '/chairs/:chairId',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { chairId } = chairIdSchema.parse(req.params);
      const updates = updateChairSchema.parse(req.body);
      const data = await storage.updateDentalChair(companyId, chairId, updates);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating dental chair:');
    }
  },
);

router.delete(
  '/chairs/:chairId',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { chairId } = chairIdSchema.parse(req.params);
      const deleted = await storage.deleteDentalChair(companyId, chairId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Chair not found' });
      return res.json({ success: true });
    } catch (error) {
      return handleRouteError(res, error, 'Error deleting dental chair:');
    }
  },
);

// --- Schedule ---

router.get(
  '/schedule/patient-options',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = listSchema.parse(req.query);
      const result = await storage.listDentalPatients(companyId, {
        search: query.search,
        limit: Math.min(query.limit ?? 50, 100),
        offset: query.offset ?? 0,
      });
      return res.json({
        success: true,
        data: result.data.map((row) => ({
          contactId: row.contactId,
          name: row.contact.name,
        })),
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing schedule patient options:');
    }
  },
);

router.get(
  '/schedule',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = scheduleListSchema.parse(req.query);
      const from = parseDayBound(query.from, 'from');
      const to = parseDayBound(query.to, 'to');
      if (to <= from) {
        return res.status(400).json({ success: false, error: '`to` must be after `from`' });
      }
      const data = await storage.listDentalSchedule(companyId, {
        from,
        to,
        providerUserId: query.providerUserId,
        chairId: query.chairId,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing dental schedule:');
    }
  },
);

router.post(
  '/schedule',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const body = createScheduleSchema.parse(req.body);
      const scheduledAt = parseDayBound(body.scheduledAt, 'scheduledAt');
      const policy = await getDentalBookingPolicy(companyId);
      const data = await storage.createDentalScheduleAppointment({
        companyId,
        contactId: body.contactId,
        title: body.title,
        description: body.description ?? null,
        location: body.location ?? null,
        scheduledAt,
        durationMinutes: body.durationMinutes ?? 60,
        type: body.type ?? 'consultation',
        status: body.status ?? 'scheduled',
        providerUserId: body.providerUserId ?? null,
        chairId: body.chairId ?? null,
        isRecall: body.isRecall ?? false,
        recallDueAt: body.recallDueAt ? parseDayBound(body.recallDueAt, 'recallDueAt') : null,
        createdBy: (req.user as { id?: number } | undefined)?.id ?? null,
      }, { capacityMode: policy.capacityMode });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating dental appointment:');
    }
  },
);

router.patch(
  '/schedule/:appointmentId',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { appointmentId } = scheduleIdSchema.parse(req.params);
      const body = updateScheduleSchema.parse(req.body);
      const updates: Record<string, unknown> = { ...body };
      if (body.scheduledAt != null) updates.scheduledAt = parseDayBound(body.scheduledAt, 'scheduledAt');
      if (body.recallDueAt !== undefined) {
        updates.recallDueAt = body.recallDueAt ? parseDayBound(body.recallDueAt, 'recallDueAt') : null;
      }
      const policy = await getDentalBookingPolicy(companyId);
      const data = await storage.updateDentalScheduleAppointment(
        companyId,
        appointmentId,
        updates as any,
        { capacityMode: policy.capacityMode },
      );
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating dental appointment:');
    }
  },
);

router.delete(
  '/schedule/:appointmentId',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { appointmentId } = scheduleIdSchema.parse(req.params);
      const deleted = await storage.deleteDentalScheduleAppointment(companyId, appointmentId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Appointment not found' });
      return res.json({ success: true });
    } catch (error) {
      return handleRouteError(res, error, 'Error deleting dental appointment:');
    }
  },
);

// --- Booking policy settings ---

router.get(
  '/booking/settings',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const policy = await getDentalBookingPolicy(companyId);
      return res.json({ success: true, data: policy });
    } catch (error) {
      return handleRouteError(res, error, 'Error getting dental booking settings:');
    }
  },
);

router.patch(
  '/booking/settings',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: [] });
      }
      // Merge over the stored policy so a partial PATCH cannot silently reset untouched
      // sections back to their schema defaults.
      const current = await getDentalBookingPolicy(companyId);
      const merged = { ...current, ...req.body } as {
        bookableCatalog?: Array<{ productId?: number | null }>;
      };
      const catalogProductIds = [
        ...new Set(
          (merged.bookableCatalog ?? [])
            .map((item) => item.productId)
            .filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0),
        ),
      ];
      if (catalogProductIds.length > 0) {
        const products = await storage.getProductsByIds(companyId, catalogProductIds);
        const byId = new Map(products.map((product) => [product.id, product]));
        const productErrors: Array<{ path: string; message: string }> = [];
        for (const [index, item] of (merged.bookableCatalog ?? []).entries()) {
          if (item.productId == null) continue;
          const product = byId.get(item.productId);
          if (!product) {
            productErrors.push({
              path: `bookableCatalog.${index}.productId`,
              message: `Product ${item.productId} was not found`,
            });
            continue;
          }
          if (product.type !== 'service') {
            productErrors.push({
              path: `bookableCatalog.${index}.productId`,
              message: `Product ${item.productId} must be type service`,
            });
          }
        }
        if (productErrors.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: productErrors,
          });
        }
      }

      const result = await saveDentalBookingPolicy(companyId, { ...current, ...req.body });
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: result.errors,
        });
      }

      const { applyDentalAutoAddPolicyChange } = await import('../../services/dental-auto-add-service');
      const autoAdd = await applyDentalAutoAddPolicyChange(
        companyId,
        current.autoAddPatients,
        result.policy.autoAddPatients,
      );

      return res.json({ success: true, data: result.policy, autoAdd });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating dental booking settings:');
    }
  },
);

router.get(
  '/booking/product-options',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = listSchema.parse(req.query);
      const result = await storage.getProducts(companyId, {
        search: query.search,
        status: 'active',
        type: 'service',
        limit: Math.min(query.limit ?? 50, 100),
        offset: query.offset ?? 0,
      });
      return res.json({
        success: true,
        data: result.data.map((product) => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          estimatedDurationMinutes: product.estimatedDurationMinutes ?? null,
        })),
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing dental booking product options:');
    }
  },
);

router.get(
  '/booking/settings/auto-add-preview',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const data = await storage.countDentalAutoAddCandidates(companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error getting dental auto-add preview:');
    }
  },
);

const availabilityQuerySchema = z.object({
  providerUserId: z.coerce.number().int().positive(),
  catalogItemId: z.string().trim().min(1).max(64),
  from: z.string().min(1),
  to: z.string().min(1),
  limit: z.coerce.number().int().positive().max(DENTAL_AVAILABILITY_MAX_LIMIT).optional(),
});

router.get(
  '/booking/availability',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = availabilityQuerySchema.parse(req.query);
      const data = await getDentalAvailableSlots(companyId, query);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error getting dental booking availability:');
    }
  },
);

const bookAppointmentSchema = z.object({
  contactId: z.coerce.number().int().positive(),
  providerUserId: z.coerce.number().int().positive(),
  scheduledAt: z.string().min(1),
  catalogItemId: z.string().trim().min(1).max(64),
  bookingSource: z.enum(DENTAL_BOOKING_SOURCES).default('staff'),
  chairId: z.coerce.number().int().positive().nullable().optional(),
});

router.post(
  '/booking',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const body = bookAppointmentSchema.parse(req.body);
      const userId = (req.user as { id?: number } | undefined)?.id;
      const data = await bookDentalAppointment(companyId, body, userId);
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error booking dental appointment:');
    }
  },
);

const bookingAppointmentIdSchema = z.object({
  appointmentId: z.coerce.number().int().positive(),
});

const pendingBookingsQuerySchema = z.object({
  providerUserId: z.coerce.number().int().positive().optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  status: z.enum(['held', 'pending_request', 'all']).optional(),
});

router.get(
  '/booking/pending',
  requireAnyPermission(['view_dental_schedule', 'manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = pendingBookingsQuerySchema.parse(req.query);
      const data = await listPendingDentalBookings(companyId, query);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing pending dental bookings:');
    }
  },
);

router.post(
  '/booking/:appointmentId/confirm',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { appointmentId } = bookingAppointmentIdSchema.parse(req.params);
      const data = await confirmDentalBooking(companyId, appointmentId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error confirming dental booking:');
    }
  },
);

router.post(
  '/booking/:appointmentId/approve',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { appointmentId } = bookingAppointmentIdSchema.parse(req.params);
      const data = await approveDentalBookingRequest(companyId, appointmentId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error approving dental booking request:');
    }
  },
);

router.post(
  '/booking/:appointmentId/decline',
  requireAnyPermission(['manage_dental_schedule']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { appointmentId } = bookingAppointmentIdSchema.parse(req.params);
      const data = await declineDentalBooking(companyId, appointmentId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error declining dental booking:');
    }
  },
);

// --- Chart snapshots ---

router.get(
  '/chart/settings',
  requireAnyPermission(['view_dental_chart', 'edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const numberingSystem = await getCompanyToothNumbering(companyId);
      return res.json({ success: true, data: { numberingSystem } });
    } catch (error) {
      return handleRouteError(res, error, 'Error getting dental chart settings:');
    }
  },
);

router.patch(
  '/chart/settings',
  requireAnyPermission(['edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const body = chartSettingsSchema.parse(req.body);
      await storage.saveCompanySetting(companyId, DENTAL_TOOTH_NUMBERING_SETTING_KEY, body.numberingSystem);
      return res.json({ success: true, data: { numberingSystem: body.numberingSystem } });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating dental chart settings:');
    }
  },
);

router.get(
  '/patients/:contactId/chart/latest',
  requireAnyPermission(['view_dental_chart', 'edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const snapshot = await storage.getLatestDentalChartSnapshot(companyId, contactId);
      const numberingSystem = await getCompanyToothNumbering(companyId);
      return res.json({
        success: true,
        data: {
          snapshot: snapshot ?? null,
          numberingSystem,
          patient: { contactId: patient.contactId, name: patient.contact.name },
        },
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error getting latest dental chart:');
    }
  },
);

router.get(
  '/patients/:contactId/chart/history',
  requireAnyPermission(['view_dental_chart', 'edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const query = chartHistorySchema.parse(req.query);
      const data = await storage.listDentalChartSnapshotHistory(companyId, contactId, query);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing dental chart history:');
    }
  },
);

router.get(
  '/patients/:contactId/chart/snapshots/:snapshotId',
  requireAnyPermission(['view_dental_chart', 'edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const { snapshotId } = snapshotIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const snapshot = await storage.getDentalChartSnapshot(companyId, snapshotId);
      if (!snapshot || snapshot.contactId !== contactId) {
        return res.status(404).json({ success: false, error: 'Snapshot not found' });
      }
      return res.json({ success: true, data: snapshot });
    } catch (error) {
      return handleRouteError(res, error, 'Error getting dental chart snapshot:');
    }
  },
);

router.post(
  '/patients/:contactId/chart/snapshots',
  requireAnyPermission(['edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const body = createChartSnapshotSchema.parse(req.body);
      const numberingSystem = body.numberingSystem ?? (await getCompanyToothNumbering(companyId));
      const data = await storage.createDentalChartSnapshot({
        companyId,
        contactId,
        numberingSystem,
        payload: body.payload,
        createdBy: (req.user as { id?: number } | undefined)?.id ?? null,
      });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating dental chart snapshot:');
    }
  },
);

// --- Clinical notes, timeline, documents ---

router.get(
  '/clinical-document-categories',
  requireAnyPermission(['view_dental_imaging', 'manage_dental_imaging']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      return res.json({ success: true, data: DENTAL_CLINICAL_DOCUMENT_CATEGORIES });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing clinical document categories:');
    }
  },
);

router.get(
  '/patients/:contactId/timeline',
  requireAnyPermission(['view_dental_chart', 'edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const query = listSchema.parse(req.query);
      const data = await storage.listDentalPatientTimeline(companyId, contactId, query);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing dental patient timeline:');
    }
  },
);

router.get(
  '/patients/:contactId/clinical-notes',
  requireAnyPermission(['view_dental_chart', 'edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const query = listSchema.parse(req.query);
      const data = await storage.listDentalClinicalNotes(companyId, contactId, query);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing dental clinical notes:');
    }
  },
);

router.post(
  '/patients/:contactId/clinical-notes',
  requireAnyPermission(['edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const body = createClinicalNoteSchema.parse(req.body);
      const data = await storage.createDentalClinicalNote({
        companyId,
        contactId,
        noteType: normalizeDentalClinicalNoteType(body.noteType),
        body: body.body,
        toothRefs: body.toothRefs ?? null,
        createdBy: (req.user as { id?: number } | undefined)?.id ?? null,
        updatedBy: (req.user as { id?: number } | undefined)?.id ?? null,
      });
      await auditDentalClinical(req, {
        companyId,
        contactId,
        actionType: 'dental_clinical_note_created',
        description: `Clinical note created (${data.noteType})`,
        newValues: {
          noteId: data.id,
          noteType: data.noteType,
          body: data.body,
          toothRefs: data.toothRefs,
        },
      });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating dental clinical note:');
    }
  },
);

router.patch(
  '/patients/:contactId/clinical-notes/:noteId',
  requireAnyPermission(['edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const { noteId } = noteIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const existing = await storage.getDentalClinicalNote(companyId, noteId);
      if (!existing || existing.contactId !== contactId) {
        return res.status(404).json({ success: false, error: 'Clinical note not found' });
      }
      const body = updateClinicalNoteSchema.parse(req.body);
      const updates: Record<string, unknown> = { ...body };
      if (body.noteType != null) updates.noteType = normalizeDentalClinicalNoteType(body.noteType);
      updates.updatedBy = (req.user as { id?: number } | undefined)?.id ?? null;
      const data = await storage.updateDentalClinicalNote(companyId, noteId, updates as any);
      await auditDentalClinical(req, {
        companyId,
        contactId,
        actionType: 'dental_clinical_note_updated',
        description: `Clinical note updated (${data.noteType})`,
        oldValues: {
          noteType: existing.noteType,
          body: existing.body,
          toothRefs: existing.toothRefs,
        },
        newValues: {
          noteType: data.noteType,
          body: data.body,
          toothRefs: data.toothRefs,
        },
        metadata: { noteId: data.id },
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating dental clinical note:');
    }
  },
);

router.delete(
  '/patients/:contactId/clinical-notes/:noteId',
  requireAnyPermission(['edit_dental_chart']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const { noteId } = noteIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const existing = await storage.getDentalClinicalNote(companyId, noteId);
      if (!existing || existing.contactId !== contactId) {
        return res.status(404).json({ success: false, error: 'Clinical note not found' });
      }
      const deleted = await storage.deleteDentalClinicalNote(companyId, noteId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Clinical note not found' });
      await auditDentalClinical(req, {
        companyId,
        contactId,
        actionType: 'dental_clinical_note_deleted',
        description: `Clinical note deleted (${existing.noteType})`,
        oldValues: {
          noteId: existing.id,
          noteType: existing.noteType,
          body: existing.body,
          toothRefs: existing.toothRefs,
        },
      });
      return res.json({ success: true });
    } catch (error) {
      return handleRouteError(res, error, 'Error deleting dental clinical note:');
    }
  },
);

router.get(
  '/patients/:contactId/clinical-documents',
  requireAnyPermission(['view_dental_imaging', 'manage_dental_imaging']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { contactId } = contactIdSchema.parse(req.params);
      const patient = await ensureDentalPatient(companyId, contactId);
      if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
      const documents = await storage.getContactDocuments(contactId);
      const data = documents.filter((doc) => isDentalClinicalDocumentCategory(doc.category));
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing clinical documents:');
    }
  },
);

// --- Treatment plans ---

const planIdSchema = z.object({
  planId: z.coerce.number().int().positive(),
});

const procedureIdSchema = z.object({
  procedureId: z.coerce.number().int().positive(),
});

const treatmentPlanListSchema = z.object({
  contactId: z.coerce.number().int().positive().optional(),
  status: z.enum(DENTAL_TREATMENT_PLAN_STATUSES).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
});

const procedureInputSchema = z.object({
  productId: z.coerce.number().int().positive().nullable().optional(),
  description: z.string().trim().min(1).max(500),
  toothRefs: z.array(z.string().trim().min(1).max(8)).max(32).nullable().optional(),
  surfaces: z.string().trim().max(64).nullable().optional(),
  phase: z.coerce.number().int().positive().max(20).optional(),
  status: z.enum(DENTAL_TREATMENT_PROCEDURE_CLINICAL_STATUSES).optional(),
  quantity: z.coerce.number().positive().max(1000).optional(),
  unitPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  estimatedAmount: z.coerce.number().min(0).max(10_000_000).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const createTreatmentPlanSchema = z.object({
  contactId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(DENTAL_TREATMENT_PLAN_CLINICAL_STATUSES).optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  procedures: z.array(procedureInputSchema).max(100).optional(),
});

const updateTreatmentPlanSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(DENTAL_TREATMENT_PLAN_CLINICAL_STATUSES).optional(),
  currency: z.string().trim().min(1).max(8).optional(),
});

const updateProcedureSchema = procedureInputSchema.partial();

function mapProcedureInput(body: z.infer<typeof procedureInputSchema>) {
  const quantity = body.quantity ?? 1;
  const unitPrice = body.unitPrice ?? 0;
  return {
    productId: body.productId ?? null,
    description: body.description,
    toothRefs: body.toothRefs ?? null,
    surfaces: body.surfaces ?? null,
    phase: body.phase ?? 1,
    status: normalizeDentalTreatmentProcedureClinicalStatus(body.status),
    quantity: String(quantity),
    unitPrice: String(unitPrice),
    estimatedAmount: String(body.estimatedAmount ?? quantity * unitPrice),
    sortOrder: body.sortOrder,
    notes: body.notes ?? null,
  };
}

router.get(
  '/treatment-plans/product-options',
  requireAnyPermission(DENTAL_TREATMENT_PLAN_READ_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = listSchema.parse(req.query);
      const result = await storage.getProducts(companyId, {
        search: query.search,
        status: 'active',
        type: 'service',
        limit: Math.min(query.limit ?? 50, 100),
        offset: query.offset ?? 0,
      });
      return res.json({
        success: true,
        data: result.data.map((product) => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          unitPrice: product.unitPrice,
          currency: product.currency,
          type: product.type,
          estimatedDurationMinutes: product.estimatedDurationMinutes ?? null,
        })),
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing treatment plan product options:');
    }
  },
);

router.get(
  '/treatment-plans/patient-options',
  requireAnyPermission(DENTAL_TREATMENT_PLAN_READ_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = listSchema.parse(req.query);
      const result = await storage.listDentalPatients(companyId, {
        search: query.search,
        limit: Math.min(query.limit ?? 50, 100),
        offset: query.offset ?? 0,
      });
      return res.json({
        success: true,
        data: result.data.map((row) => ({
          contactId: row.contactId,
          name: row.contact.name,
        })),
      });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing treatment plan patient options:');
    }
  },
);

router.get(
  '/treatment-plans',
  requireAnyPermission(DENTAL_TREATMENT_PLAN_READ_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const query = treatmentPlanListSchema.parse(req.query);
      const data = await storage.listDentalTreatmentPlans(companyId, query);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing dental treatment plans:');
    }
  },
);

router.get(
  '/treatment-plans/:planId',
  requireAnyPermission(DENTAL_TREATMENT_PLAN_READ_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const data = await storage.getDentalTreatmentPlan(companyId, planId);
      if (!data) return res.status(404).json({ success: false, error: 'Treatment plan not found' });
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error getting dental treatment plan:');
    }
  },
);

router.post(
  '/treatment-plans',
  requireAnyPermission(['manage_dental_treatment_plans']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const body = createTreatmentPlanSchema.parse(req.body);
      const userId = (req.user as { id?: number } | undefined)?.id ?? null;
      const data = await storage.createDentalTreatmentPlan(
        {
          companyId,
          contactId: body.contactId,
          title: body.title,
          description: body.description ?? null,
          status: normalizeDentalTreatmentPlanClinicalStatus(body.status),
          currency: body.currency ?? 'USD',
          estimatedTotal: '0',
          salesOrderId: null,
          createdBy: userId,
          updatedBy: userId,
        },
        (body.procedures ?? []).map(mapProcedureInput),
      );
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating dental treatment plan:');
    }
  },
);

router.patch(
  '/treatment-plans/:planId',
  requireAnyPermission(['manage_dental_treatment_plans']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const body = updateTreatmentPlanSchema.parse(req.body);
      const updates: Record<string, unknown> = { ...body };
      if (body.status != null) updates.status = normalizeDentalTreatmentPlanClinicalStatus(body.status);
      updates.updatedBy = (req.user as { id?: number } | undefined)?.id ?? null;
      const data = await storage.updateDentalTreatmentPlan(companyId, planId, updates as any);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating dental treatment plan:');
    }
  },
);

router.delete(
  '/treatment-plans/:planId',
  requireAnyPermission(['manage_dental_treatment_plans']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const deleted = await storage.deleteDentalTreatmentPlan(companyId, planId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Treatment plan not found' });
      return res.json({ success: true });
    } catch (error) {
      return handleRouteError(res, error, 'Error deleting dental treatment plan:');
    }
  },
);

router.post(
  '/treatment-plans/:planId/procedures',
  requireAnyPermission(['manage_dental_treatment_plans']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const body = procedureInputSchema.parse(req.body);
      const data = await storage.createDentalTreatmentProcedure(companyId, planId, mapProcedureInput(body));
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating dental treatment procedure:');
    }
  },
);

router.patch(
  '/treatment-plans/:planId/procedures/:procedureId',
  requireAnyPermission(['manage_dental_treatment_plans']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const { procedureId } = procedureIdSchema.parse(req.params);
      const plan = await storage.getDentalTreatmentPlan(companyId, planId);
      if (!plan) return res.status(404).json({ success: false, error: 'Treatment plan not found' });
      if (!plan.procedures.some((p) => p.id === procedureId)) {
        return res.status(404).json({ success: false, error: 'Procedure not found' });
      }
      const body = updateProcedureSchema.parse(req.body);
      const updates: Record<string, unknown> = { ...body };
      if (body.status != null) updates.status = normalizeDentalTreatmentProcedureClinicalStatus(body.status);
      if (body.quantity != null) updates.quantity = String(body.quantity);
      if (body.unitPrice != null) updates.unitPrice = String(body.unitPrice);
      if (body.estimatedAmount != null) updates.estimatedAmount = String(body.estimatedAmount);
      if (body.toothRefs !== undefined) updates.toothRefs = body.toothRefs;
      if (body.surfaces !== undefined) updates.surfaces = body.surfaces;
      if (body.notes !== undefined) updates.notes = body.notes;
      if (body.productId !== undefined) updates.productId = body.productId;
      const data = await storage.updateDentalTreatmentProcedure(companyId, procedureId, updates as any);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error updating dental treatment procedure:');
    }
  },
);

router.delete(
  '/treatment-plans/:planId/procedures/:procedureId',
  requireAnyPermission(['manage_dental_treatment_plans']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const { procedureId } = procedureIdSchema.parse(req.params);
      const plan = await storage.getDentalTreatmentPlan(companyId, planId);
      if (!plan) return res.status(404).json({ success: false, error: 'Treatment plan not found' });
      if (!plan.procedures.some((p) => p.id === procedureId)) {
        return res.status(404).json({ success: false, error: 'Procedure not found' });
      }
      const deleted = await storage.deleteDentalTreatmentProcedure(companyId, procedureId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Procedure not found' });
      return res.json({ success: true });
    } catch (error) {
      return handleRouteError(res, error, 'Error deleting dental treatment procedure:');
    }
  },
);

const approvalBodySchema = z.object({
  decision: z.enum(['approved', 'rejected']).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

router.get(
  '/treatment-plans/:planId/approvals',
  requireAnyPermission(DENTAL_TREATMENT_PLAN_READ_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const plan = await storage.getDentalTreatmentPlan(companyId, planId);
      if (!plan) return res.status(404).json({ success: false, error: 'Treatment plan not found' });
      const data = await storage.listDentalPlanApprovals(companyId, planId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error listing dental plan approvals:');
    }
  },
);

router.post(
  '/treatment-plans/:planId/create-quotation',
  requireAnyPermission(['create_quotations', 'manage_sales_orders']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const userId = (req.user as { id?: number } | undefined)?.id ?? null;
      const data = await storage.createDentalTreatmentPlanQuotation(companyId, planId, userId);
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating quotation from treatment plan:');
    }
  },
);

router.post(
  '/treatment-plans/:planId/approvals',
  requireAnyPermission(['manage_dental_treatment_plans']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const body = approvalBodySchema.parse(req.body ?? {});
      const userId = (req.user as { id?: number } | undefined)?.id ?? null;
      const data = await storage.createDentalPlanApproval(companyId, planId, {
        decision: body.decision,
        notes: body.notes,
        approvedBy: userId,
      });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error recording dental plan approval:');
    }
  },
);

router.post(
  '/treatment-plans/:planId/create-invoice',
  requireAnyPermission(['manage_invoices']),
  async (req, res) => {
    try {
      const companyId = await ensureDentalBusinessType(req, res);
      if (!companyId) return;
      const { planId } = planIdSchema.parse(req.params);
      const userId = (req.user as { id?: number } | undefined)?.id ?? null;
      const data = await storage.createDentalTreatmentPlanInvoice(companyId, planId, userId);
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error creating invoice from treatment plan:');
    }
  },
);

export default router;
