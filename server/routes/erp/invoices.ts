import path from 'path';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import { storage } from '../../storage';
import { insertInvoiceSchema, insertInvoiceItemSchema } from '@shared/schema';
import { ErpProductScopeError } from '../../erp-product-scoping';
import { ensureRestaurantBusinessType, getCompanyErpBusinessType } from './business-type';
import {
  ERP_INVOICE_TEMPLATE_SETTINGS_KEY,
  getInvoiceTemplateSettings,
  invoiceTemplateSettingsSchema,
} from '../../services/erp-invoice-template-service';
import {
  DEFAULT_INVOICE_PAYMENT_NOTIFICATION_MESSAGES,
  ERP_INVOICE_PAYMENT_NOTIFICATIONS_KEY,
} from '@shared/erp-invoice-notification-defaults';
import { generateInvoicePdf } from '../../services/erp-invoice-pdf-service';
import {
  getInvoicePaymentNotificationSettings,
  notifyInvoicePaymentStatusChange,
} from '../../services/erp-invoice-notification-service';
import { invoiceHeaderDiscountAmount, invoiceLineDiscountAmount } from '../../invoice-discount-math';
import { sendValidationError } from '../../utils/erp-zod-validation';
import { assertErpPaymentMethodAllowed } from '../../services/erp-invoice-payment-options-service';
import { electronicInvoicingService } from '../../services/erp/electronic-invoicing/service';
import '../../services/erp/electronic-invoicing/providers/colombia-dian';
import '../../services/erp/electronic-invoicing/providers/colombia-minsalud';
import serverI18n from '../../utils/server-i18n';
import { db } from '../../db';
import { electronicInvoices, contacts, dentalPatientProfiles, dentalTreatmentProcedures, products, dentalTreatmentPlans } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Shared payment method values - matches paymentMethodEnum in schema.ts
const PAYMENT_METHODS = [
  'cash',
  'check',
  'credit_card',
  'debit_card',
  'bank_transfer',
  'stripe',
  'paypal',
  'mercadopago',
  'moyasar',
  'mpesa',
  'paystack',
  'other',
] as const;

const router = Router();

const ERP_INVOICE_READ_PERMISSIONS = ['view_invoices', 'manage_invoices', 'record_payments'];
const ERP_INVOICE_MANAGE_PERMISSIONS = ['manage_invoices'];
const ERP_PAYMENT_PERMISSIONS = ['manage_invoices', 'record_payments'];
const ERP_INVOICE_TEMPLATE_READ_PERMISSIONS = [
  'view_invoices',
  'manage_invoices',
  'record_payments',
  'view_erp_settings',
  'manage_erp_settings',
];
const ERP_INVOICE_TEMPLATE_MANAGE_PERMISSIONS = ['manage_erp_settings'];

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['void'],
  partially_paid: ['void'],
  paid: ['void'],
  overdue: ['void'],
  cancelled: [],
  void: [],
};

function assertStatusTransition(current: string, next: string): void {
  const allowed = STATUS_TRANSITIONS[current];
  if (!allowed?.includes(next)) {
    throw new Error(`Invalid status transition from ${current} to ${next}`);
  }
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

function handleRouteError(res: Response, error: unknown, logLabel: string) {
  if (error instanceof z.ZodError) {
    return sendValidationError(res, error);
  }
  if (error instanceof ErpProductScopeError) {
    return res.status(400).json({ success: false, error: error.message });
  }
    if (error instanceof Error) {
    const m = error.message;
    if (
      /^Invalid status transition/.test(m) ||
      /^Only draft invoices/.test(m) ||
      /^Invoice not found/.test(m) ||
      /^Sales order not found/.test(m) ||
      /^Purchase order not found/.test(m) ||
      /^Line item not found/.test(m) ||
      /does not belong/.test(m) ||
      /cannot be updated/.test(m) ||
      /^Payment amount/.test(m) ||
      /^Invoice must be/.test(m) ||
      /^Invoice type .* is not supported/.test(m) ||
      /^Invoice accounting configuration is incomplete$/.test(m) ||
      /^Payment accounting configuration is incomplete$/.test(m) ||
      /^Invoices with recorded payments cannot be voided$/.test(m) ||
      /^Only draft invoices can be cancelled$/.test(m) ||
      /^Only pre-posting invoices can be cancelled$/.test(m) ||
      /^Accounts receivable record not found/.test(m) ||
      /^Accounts payable record not found/.test(m) ||
      /^Exactly one of/.test(m) ||
      /^Product does not belong/.test(m) ||
      /^Sales order does not belong/.test(m) ||
      /^Purchase order does not belong/.test(m) ||
      /^Source invoice not found/.test(m) ||
      /^Source invoice has already been split/.test(m)
    ) {
      return res.status(400).json({ success: false, error: m });
    }
  }
  console.error(logLabel, error);
  return res.status(500).json({ success: false, error: getErrorMessage(error) });
}

function optionalQueryInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? undefined : n;
}

function optionalQueryDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : raw;
}

function normalizeInvoiceDateInput(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return value === '' ? null : value;
  if (value instanceof Date) return value;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? value : parsed;
}

function normalizeInvoiceFilterDate(value: string | undefined, boundary: 'start' | 'end'): Date | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return boundary === 'start'
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function coerceNumericFieldsForInvoiceBody(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  for (const key of [
    'subtotal',
    'taxAmount',
    'discountAmount',
    'discountValue',
    'tipAmount',
    'serviceChargeAmount',
    'totalAmount',
  ] as const) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      o[key] = String(v);
    }
  }
  o.issueDate = normalizeInvoiceDateInput(o.issueDate);
  o.dueDate = normalizeInvoiceDateInput(o.dueDate);
  return o;
}

function coerceNumericFieldsForInvoiceItemBody(input: unknown): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  for (const key of ['quantity', 'unitPrice', 'discountPercent', 'discountValue', 'taxRate'] as const) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      o[key] = String(v);
    }
  }
  return o;
}

function computeInvoiceLineTotalString(body: Record<string, unknown>): string {
  const qty = Number(body.quantity ?? 1);
  const price = Number(body.unitPrice ?? 0);
  const base = qty * price;
  const discountValueExplicit = Object.prototype.hasOwnProperty.call(body, 'discountValue');
  const disc = invoiceLineDiscountAmount({
    quantity: qty,
    unitPrice: price,
    discountType: body.discountType != null ? String(body.discountType) : undefined,
    discountValue: discountValueExplicit ? Number(body.discountValue ?? 0) : undefined,
    discountPercent: Number(body.discountPercent ?? 0),
  });
  return (base - disc).toFixed(2);
}

function assertSupportedInvoiceWorkflowType(type: string, action: 'send' | 'payment'): void {
  if (type !== 'sales_invoice' && type !== 'purchase_invoice') {
    throw new Error(`Invoice type ${type} is not supported for ${action} workflow`);
  }
}

function deriveServiceChargeAmount(params: {
  subtotal: string | number | null | undefined;
  serviceChargeRate: string | number | null | undefined;
  serviceChargeAmount: string | number | null | undefined;
}): string {
  if (params.serviceChargeAmount != null && params.serviceChargeAmount !== '') {
    const parsed = Number(params.serviceChargeAmount);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : '0.00';
  }
  const rate = Number(params.serviceChargeRate ?? 0);
  if (!Number.isFinite(rate) || rate === 0) return '0.00';
  const subtotal = Number(params.subtotal ?? 0);
  if (!Number.isFinite(subtotal)) return '0.00';
  return ((subtotal * rate) / 100).toFixed(2);
}

const listInvoicesQuerySchema = z.object({
  type: z.string().optional(),
  status: z.string().optional(),
  contactId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  supplierId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  salesOrderId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  purchaseOrderId: z.preprocess(optionalQueryInt, z.number().int().optional()),
  search: z.string().optional(),
  dateFrom: z.preprocess(optionalQueryDate, z.string().optional()),
  dateTo: z.preprocess(optionalQueryDate, z.string().optional()),
  limit: z.preprocess(optionalQueryInt, z.number().int().optional()),
  offset: z.preprocess(optionalQueryInt, z.number().int().optional()),
});

const createInvoiceBodySchema = z.preprocess(
  coerceNumericFieldsForInvoiceBody,
  insertInvoiceSchema
    .omit({ companyId: true, invoiceNumber: true, createdBy: true, status: true, amountPaid: true, amountDue: true })
    .partial({
      contactId: true,
      supplierId: true,
      salesOrderId: true,
      purchaseOrderId: true,
      type: true,
      issueDate: true,
      dueDate: true,
      subtotal: true,
      taxAmount: true,
      discountAmount: true,
      discountType: true,
      discountValue: true,
      tipAmount: true,
      serviceChargeAmount: true,
      serviceChargeRate: true,
      totalAmount: true,
      splitBillGroupId: true,
      splitBillSeatLabel: true,
      currency: true,
      notes: true,
      adjustmentReason: true,
      parentInvoiceId: true,
      termsAndConditions: true,
      pdfUrl: true,
    })
    .strict()
);

const updateInvoiceBodySchema = z.preprocess(
  coerceNumericFieldsForInvoiceBody,
  insertInvoiceSchema
    .omit({ companyId: true, invoiceNumber: true, createdBy: true, status: true, amountPaid: true, amountDue: true })
    .extend({
      tipAmount: z.union([z.string(), z.number()]).transform((value) => String(value)).optional(),
      serviceChargeAmount: z.union([z.string(), z.number()]).transform((value) => String(value)).optional(),
      serviceChargeRate: z.union([z.string(), z.number()]).transform((value) => String(value)).optional(),
    })
    .partial()
    .strict()
);

const splitInvoiceBodySchema = z.object({
  sourceInvoiceId: z.number().int().positive(),
  splits: z.array(
    z.object({
      seatLabel: z.string().trim().min(1),
      itemIds: z.array(z.number().int()).min(1),
    }).strict()
  ).min(1),
}).strict();

const createInvoiceItemBodySchema = z.preprocess(
  coerceNumericFieldsForInvoiceItemBody,
  insertInvoiceItemSchema.omit({ invoiceId: true, lineTotal: true }).strict()
);

const updateInvoiceItemBodySchema = z.preprocess(
  coerceNumericFieldsForInvoiceItemBody,
  insertInvoiceItemSchema.omit({ invoiceId: true, lineTotal: true }).partial().strict()
);

const recordPaymentBodySchema = z
  .object({
    amount: z.union([z.string(), z.number()]).transform((v) => String(v)),
    paymentDate: z.coerce.date().optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional().nullable(),
    referenceNumber: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  })
  .strict();

const generateFromOrderBodySchema = z
  .object({
    salesOrderId: z.number().int().optional(),
    purchaseOrderId: z.number().int().optional(),
  })
  .strict()
  .refine(
    (b) =>
      (b.salesOrderId != null && b.purchaseOrderId == null) ||
      (b.purchaseOrderId != null && b.salesOrderId == null),
    { message: 'Exactly one of salesOrderId or purchaseOrderId is required' }
  );

const invoicePaymentNotificationSettingsSchema = z
  .object({
    enabled: z.boolean(),
    messages: z
      .object({
        paid: z.string(),
        placed: z.string().optional(),
      })
      .strict(),
  })
  .strict();

async function loadInvoiceForCompany(id: number, companyId: number) {
  const invoice = await storage.getInvoice(id);
  if (!invoice || invoice.companyId !== companyId) return undefined;
  return invoice;
}

function assertInvoiceEditable(invoice: { status: string }): void {
  if (invoice.status !== 'draft' && invoice.status !== 'sent') {
    throw new Error('Invoice cannot be updated in the current status');
  }
}

function assertInvoiceLinesEditable(invoice: { status: string }): void {
  if (invoice.status !== 'draft' && invoice.status !== 'sent') {
    throw new Error('Invoice line items cannot be updated in the current status');
  }
}

router.get('/', requireAnyPermission(ERP_INVOICE_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    // Refresh overdue statuses before listing
    await storage.refreshOverdueForCompany(companyId);
    const parsed = listInvoicesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const result = await storage.getInvoices(companyId, {
      ...parsed.data,
      dateFrom: normalizeInvoiceFilterDate(parsed.data.dateFrom, 'start'),
      dateTo: normalizeInvoiceFilterDate(parsed.data.dateTo, 'end'),
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing invoices:');
  }
});

router.post('/', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = createInvoiceBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const data = parsed.data;
    if (data.contactId != null) {
      const contact = await storage.getContact(data.contactId);
      if (!contact || contact.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Contact does not belong to this company' });
      }
    }
    if (data.supplierId != null) {
      const supplier = await storage.getSupplier(data.supplierId);
      if (!supplier || supplier.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Supplier does not belong to this company' });
      }
    }
    if (data.salesOrderId != null) {
      const order = await storage.getSalesOrder(data.salesOrderId);
      if (!order || order.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Sales order does not belong to this company' });
      }
    }
    if (data.purchaseOrderId != null) {
      const order = await storage.getPurchaseOrder(data.purchaseOrderId);
      if (!order || order.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Purchase order does not belong to this company' });
      }
    }
    const subtotal = Number(data.subtotal ?? 0);
    const taxAmount = Number(data.taxAmount ?? 0);
    const typeSentCreate = data.discountType !== undefined;
    const valueSentCreate = data.discountValue !== undefined;
    const amountSentCreate = data.discountAmount !== undefined;
    let effCreateDiscType = 'fixed_amount';
    let effCreateDiscValueNum = 0;
    if (typeSentCreate || valueSentCreate) {
      effCreateDiscType = String(data.discountType ?? 'fixed_amount').trim();
      effCreateDiscValueNum = Number(data.discountValue ?? 0);
    } else if (amountSentCreate) {
      effCreateDiscType = 'fixed_amount';
      effCreateDiscValueNum = Number(data.discountAmount ?? 0);
    }
    if (!['none', 'percentage', 'fixed_amount'].includes(effCreateDiscType)) effCreateDiscType = 'fixed_amount';
    if (!Number.isFinite(effCreateDiscValueNum)) effCreateDiscValueNum = 0;
    const computedCreateDiscountAmt = invoiceHeaderDiscountAmount(subtotal, effCreateDiscType, effCreateDiscValueNum);
    const tipAmount = Number(data.tipAmount ?? 0);
    const normalizedServiceChargeAmount = deriveServiceChargeAmount({
      subtotal: data.subtotal,
      serviceChargeRate: data.serviceChargeRate,
      serviceChargeAmount: data.serviceChargeAmount,
    });
    const serviceChargeAmount = Number(normalizedServiceChargeAmount);
    const totalAmount = (subtotal + taxAmount - computedCreateDiscountAmt + tipAmount + serviceChargeAmount).toFixed(2);
    
    if (data.parentInvoiceId != null) {
      const parent = await storage.getInvoice(data.parentInvoiceId);
      if (!parent || parent.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Parent invoice not found' });
      }
      if (data.type === 'credit_note') {
        const remaining = Number(parent.amountDue ?? 0);
        const currentTotal = Number(totalAmount);
        // Basic validation: credit note shouldn't exceed remaining balance if we want to be strict,
        // but for now we allow it (could be a full refund of a paid invoice).
        // We just ensure the currency matches.
        if (parent.currency !== (data.currency ?? 'USD')) {
          return res.status(400).json({ success: false, error: 'Credit note currency must match parent invoice' });
        }
      }
    }

    const created = await storage.createInvoice({
      ...data,
      companyId,
      invoiceNumber: '',
      createdBy: req.user?.id ?? null,
      type: data.type ?? 'sales_invoice',
      status: 'draft',
      contactId: data.contactId ?? null,
      supplierId: data.supplierId ?? null,
      salesOrderId: data.salesOrderId ?? null,
      purchaseOrderId: data.purchaseOrderId ?? null,
      issueDate: data.issueDate ?? new Date(),
      dueDate: data.dueDate ?? null,
      subtotal: data.subtotal ?? '0',
      taxAmount: data.taxAmount ?? '0',
      discountType: effCreateDiscType as 'none' | 'percentage' | 'fixed_amount',
      discountValue: effCreateDiscValueNum.toFixed(2),
      discountAmount: computedCreateDiscountAmt.toFixed(2),
      tipAmount: data.tipAmount ?? null,
      serviceChargeAmount: normalizedServiceChargeAmount,
      serviceChargeRate: data.serviceChargeRate ?? null,
      totalAmount,
      splitBillGroupId: data.splitBillGroupId ?? null,
      splitBillSeatLabel: data.splitBillSeatLabel ?? null,
      parentInvoiceId: data.parentInvoiceId ?? null,
      adjustmentReason: data.adjustmentReason ?? null,
      amountPaid: '0',
      amountDue: totalAmount,
      currency: data.currency ?? 'USD',
      notes: data.notes ?? null,
      termsAndConditions: data.termsAndConditions ?? null,
      pdfUrl: data.pdfUrl ?? null,
    });
    return res.json({ success: true, data: created });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating invoice:');
  }
});

router.post('/generate-from-order', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const parsed = generateFromOrderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const { salesOrderId, purchaseOrderId } = parsed.data;
    if (salesOrderId != null) {
      const order = await storage.getSalesOrder(salesOrderId);
      if (!order || order.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Sales order not found' });
      }
      const invoice = await storage.generateInvoiceFromSalesOrder(
        salesOrderId,
        companyId,
        req.user?.id ?? null
      );
      return res.json({ success: true, data: invoice });
    }
    if (purchaseOrderId != null) {
      const order = await storage.getPurchaseOrder(purchaseOrderId);
      if (!order || order.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Purchase order not found' });
      }
      const invoice = await storage.generateInvoiceFromPurchaseOrder(
        purchaseOrderId,
        companyId,
        req.user?.id ?? null
      );
      return res.json({ success: true, data: invoice });
    }
    return res.status(400).json({ success: false, error: 'Exactly one of salesOrderId or purchaseOrderId is required' });
  } catch (error) {
    return handleRouteError(res, error, 'Error generating invoice from order:');
  }
});

router.get(
  '/template-settings',
  requireAnyPermission(ERP_INVOICE_TEMPLATE_READ_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      const data = await getInvoiceTemplateSettings(companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error loading invoice template settings:');
    }
  }
);

router.put(
  '/template-settings',
  requireAnyPermission(ERP_INVOICE_TEMPLATE_MANAGE_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      const parsed = invoiceTemplateSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(res, parsed.error);
      }

      const businessType = await getCompanyErpBusinessType(companyId);
      await storage.saveCompanySetting(companyId, ERP_INVOICE_TEMPLATE_SETTINGS_KEY, parsed.data);
      const data = await getInvoiceTemplateSettings(companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error saving invoice template settings:');
    }
  }
);

router.get(
  '/payment-notification-settings',
  requireAnyPermission(ERP_INVOICE_TEMPLATE_READ_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      const data = await getInvoicePaymentNotificationSettings(companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error loading invoice payment notification settings:');
    }
  }
);

router.put(
  '/payment-notification-settings',
  requireAnyPermission(ERP_INVOICE_TEMPLATE_MANAGE_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      const parsed = invoicePaymentNotificationSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(res, parsed.error);
      }
      const normalizedPaymentNotificationSettings = {
        enabled: parsed.data.enabled,
        messages: {
          paid: parsed.data.messages.paid,
          placed:
            parsed.data.messages.placed ?? DEFAULT_INVOICE_PAYMENT_NOTIFICATION_MESSAGES.placed,
        },
      };
      await storage.saveCompanySetting(companyId, ERP_INVOICE_PAYMENT_NOTIFICATIONS_KEY, normalizedPaymentNotificationSettings);
      const data = await getInvoicePaymentNotificationSettings(companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error saving invoice payment notification settings:');
    }
  }
);

const electronicInvoicingSettingsSchema = z.object({
  enabled: z.boolean(),
  country: z.string().default('CO'),
  credentials: z.object({
    apiUrl: z.string().optional(),
    apiKey: z.string().optional(),
    softwareId: z.string().optional(),
    technicalKey: z.string().optional(),
    environment: z.enum(['sandbox', 'production']).default('sandbox'),
    certificatePem: z.string().optional(),
  }).default({}),
  healthEnabled: z.boolean().default(false),
  healthCredentials: z.object({
    apiUrl: z.string().optional(),
    apiKey: z.string().optional(),
  }).default({}),
});

async function electronicInvoiceMessage(
  req: any,
  key: string,
  fallback: string,
  variables?: Record<string, unknown>
): Promise<string> {
  return serverI18n.t(key, req.user?.languagePreference ?? 'en', fallback, variables);
}

router.get(
  '/electronic-invoicing-settings',
  requireAnyPermission(['view_erp_settings', 'manage_erp_settings']),
  async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      const data = await electronicInvoicingService.getConfiguration(companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error loading electronic invoicing settings:');
    }
  }
);

router.put(
  '/electronic-invoicing-settings',
  requireAnyPermission(['manage_erp_settings']),
  async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      const parsed = electronicInvoicingSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(res, parsed.error);
      }
      const businessType = await getCompanyErpBusinessType(companyId);
      
      // Save individual settings keys
      await storage.saveCompanySetting(companyId, 'electronic_invoicing.enabled', parsed.data.enabled);
      await storage.saveCompanySetting(companyId, 'electronic_invoicing.country', parsed.data.country);
      await storage.saveCompanySetting(companyId, 'electronic_invoicing.credentials', parsed.data.credentials);
      await storage.saveCompanySetting(companyId, 'health_integration.enabled', businessType === 'dental' && parsed.data.healthEnabled);
      await storage.saveCompanySetting(companyId, 'health_integration.credentials', businessType === 'dental' ? parsed.data.healthCredentials : {});
      
      const data = await electronicInvoicingService.getConfiguration(companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return handleRouteError(res, error, 'Error saving electronic invoicing settings:');
    }
  }
);

router.get(
  '/:id/pdf',
  requireAnyPermission(ERP_INVOICE_READ_PERMISSIONS),
  async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, error: 'Company ID required' });
      }
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid id' });
      }
      const invoice = await loadInvoiceForCompany(id, companyId);
      if (!invoice) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }
      const typeRaw = String(req.query.type ?? 'a4').toLowerCase();
      const templateType = typeRaw === 'thermal' ? 'thermal' : 'a4';
      const download =
        req.query.download === '1' ||
        req.query.download === 'true' ||
        String(req.query.download).toLowerCase() === 'yes';
      const accept = String(req.headers.accept ?? '');
      const wantsJson =
        accept.includes('application/json') ||
        String(req.query.format ?? '').toLowerCase() === 'json';

      const result = await generateInvoicePdf(id, companyId, templateType, {
        language: req.user?.languagePreference ?? 'en',
      });

      if (wantsJson) {
        return res.json({
          success: true,
          data: {
            pdfUrl: result.pdfUrl,
            fileName: result.fileName,
            templateType: result.templateType,
          },
        });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${download ? 'attachment' : 'inline'}; filename="${result.fileName.replace(/"/g, '')}"`
      );
      return res.sendFile(path.resolve(result.absolutePath));
    } catch (error) {
      return handleRouteError(res, error, 'Error generating invoice PDF:');
    }
  }
);

router.get('/:id/items', requireAnyPermission(ERP_INVOICE_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadInvoiceForCompany(id, companyId);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    const items = await storage.getInvoiceItems(id);
    return res.json({ success: true, data: items });
  } catch (error) {
    return handleRouteError(res, error, 'Error loading invoice items:');
  }
});

router.post('/:id/items', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadInvoiceForCompany(id, companyId);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    try {
      assertInvoiceLinesEditable(invoice);
    } catch (e) {
      return handleRouteError(res, e, 'Error creating line item:');
    }
    const parsed = createInvoiceItemBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    if (parsed.data.productId != null) {
      const product = await storage.getProduct(parsed.data.productId);
      if (!product || product.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Product does not belong to this company' });
      }
    }
    const item = await storage.createInvoiceItem({
      ...parsed.data,
      invoiceId: id,
      lineTotal: computeInvoiceLineTotalString(parsed.data as Record<string, unknown>),
    });
    return res.json({ success: true, data: item });
  } catch (error) {
    return handleRouteError(res, error, 'Error creating line item:');
  }
});

router.put('/:id/items/:itemId', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    const itemId = parseInt(req.params.itemId, 10);
    if (Number.isNaN(id) || Number.isNaN(itemId)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadInvoiceForCompany(id, companyId);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    try {
      assertInvoiceLinesEditable(invoice);
    } catch (e) {
      return handleRouteError(res, e, 'Error updating line item:');
    }
    const existingItem = (await storage.getInvoiceItems(id)).find((i) => i.id === itemId);
    if (!existingItem) {
      return res.status(404).json({ success: false, error: 'Line item not found' });
    }
    const parsed = updateInvoiceItemBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    if (parsed.data.productId != null) {
      const product = await storage.getProduct(parsed.data.productId);
      if (!product || product.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Product does not belong to this company' });
      }
    }
    const item = await storage.updateInvoiceItem(itemId, parsed.data);
    return res.json({ success: true, data: item });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating line item:');
  }
});

router.delete('/:id/items/:itemId', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    const itemId = parseInt(req.params.itemId, 10);
    if (Number.isNaN(id) || Number.isNaN(itemId)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadInvoiceForCompany(id, companyId);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    try {
      assertInvoiceLinesEditable(invoice);
    } catch (e) {
      return handleRouteError(res, e, 'Error deleting line item:');
    }
    const existingItem = (await storage.getInvoiceItems(id)).find((i) => i.id === itemId);
    if (!existingItem) {
      return res.status(404).json({ success: false, error: 'Line item not found' });
    }
    const ok = await storage.deleteInvoiceItem(itemId);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Line item not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting line item:');
  }
});

router.get('/:id/payments', requireAnyPermission(ERP_INVOICE_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadInvoiceForCompany(id, companyId);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    const payments = await storage.getInvoicePayments(id);
    return res.json({ success: true, data: payments });
  } catch (error) {
    return handleRouteError(res, error, 'Error listing payments:');
  }
});

router.post('/:id/payments', requireAnyPermission(ERP_PAYMENT_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadInvoiceForCompany(id, companyId);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    if (!['sent', 'partially_paid', 'overdue'].includes(invoice.status)) {
      return res.status(400).json({
        success: false,
        error: 'Invoice must be in sent, partially_paid, or overdue status to record payments',
      });
    }
    const parsed = recordPaymentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    try {
      assertSupportedInvoiceWorkflowType(invoice.type, 'payment');
    } catch (e) {
      return handleRouteError(res, e, 'Error recording payment:');
    }
    const amt = Number(parsed.data.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ success: false, error: 'Payment amount must be positive' });
    }
    const remainingBalance = Number(invoice.amountDue ?? 0);
    if (amt - remainingBalance > 0.0001) {
      return res.status(400).json({ success: false, error: 'Payment amount cannot exceed remaining balance' });
    }
    await assertErpPaymentMethodAllowed(companyId, parsed.data.paymentMethod);
    const prevStatus = invoice.status;
    const payment = await storage.recordInvoicePayment({
      invoiceId: id,
      companyId,
      amount: amt.toFixed(2),
      paymentDate: parsed.data.paymentDate ?? new Date(),
      paymentMethod: parsed.data.paymentMethod ?? null,
      referenceNumber: parsed.data.referenceNumber ?? null,
      notes: parsed.data.notes ?? null,
      recordedBy: req.user?.id ?? null,
    });
    const refreshed = await storage.getInvoice(id);
    if (refreshed?.status === 'paid' && prevStatus !== 'paid') {
      void notifyInvoicePaymentStatusChange(id);
    }
    return res.json({ success: true, data: payment });
  } catch (error) {
    return handleRouteError(res, error, 'Error recording payment:');
  }
});

router.put('/:id/payments/:paymentId', requireAnyPermission(ERP_PAYMENT_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    const paymentId = parseInt(req.params.paymentId, 10);
    if (Number.isNaN(id) || Number.isNaN(paymentId)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadInvoiceForCompany(id, companyId);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    if (!['sent', 'partially_paid', 'paid', 'overdue'].includes(invoice.status)) {
      return res.status(400).json({
        success: false,
        error: 'Invoice must be in sent, partially_paid, paid, or overdue status to edit payments',
      });
    }
    const parsed = recordPaymentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    try {
      assertSupportedInvoiceWorkflowType(invoice.type, 'payment');
    } catch (e) {
      return handleRouteError(res, e, 'Error updating payment:');
    }
    await assertErpPaymentMethodAllowed(companyId, parsed.data.paymentMethod);
    const prevStatus = invoice.status;
    const payment = await storage.updateInvoicePayment(paymentId, companyId, {
      amount: String(parsed.data.amount),
      paymentDate: parsed.data.paymentDate ?? undefined,
      paymentMethod: parsed.data.paymentMethod ?? null,
      referenceNumber: parsed.data.referenceNumber ?? null,
      notes: parsed.data.notes ?? null,
    });
    const refreshed = await storage.getInvoice(id);
    if (refreshed?.status === 'paid' && prevStatus !== 'paid') {
      void notifyInvoicePaymentStatusChange(id);
    }
    return res.json({ success: true, data: payment });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating payment:');
  }
});

router.post('/:id/send', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadInvoiceForCompany(id, companyId);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    const invoiceStatus = String(invoice.status ?? '').trim().toLowerCase();
    if (invoiceStatus !== 'draft') {
      return res.status(400).json({ success: false, error: 'Only draft invoices can be sent' });
    }
    try {
      assertSupportedInvoiceWorkflowType(invoice.type, 'send');
    } catch (e) {
      return handleRouteError(res, e, 'Error sending invoice:');
    }

    const config = await electronicInvoicingService.getConfiguration(companyId);
    const businessType = await getCompanyErpBusinessType(companyId);
    if (config.enabled) {
      const invProvider = await electronicInvoicingService.getInvoiceProvider(companyId);
      if (invProvider) {
        const items = await storage.getInvoiceItems(id);
        const dianCtx = {
          ...config.credentials,
          environment: (config.credentials as any).environment || 'sandbox',
          cufe: '',
          forceFailure: req.body.forceFailure || false,
          failureType: req.body.failureType || null,
        };
        
        // Generate XML and CUFE
        const cufe = invProvider.calculateIdentifier(invoice, items, dianCtx);
        dianCtx.cufe = cufe;
        
        const unsignedXml = invProvider.generateXml(invoice, items, dianCtx);
        const signedXml = invProvider.signXml(unsignedXml, dianCtx);
        
        let valResult: any;
        
        if (businessType === 'dental' && config.healthEnabled && invoice.contactId) {
          const healthProvider = await electronicInvoicingService.getHealthProvider(companyId);
          if (healthProvider) {
            // Load clinical patient data and procedures
            let patientProfile: any = null;
            let patientContact: any = null;
            let dentalProcs: any[] = [];
            
            if (invoice.contactId) {
              [patientContact] = await db.select().from(contacts).where(eq(contacts.id, invoice.contactId)).limit(1);
              [patientProfile] = await db.select().from(dentalPatientProfiles).where(eq(dentalPatientProfiles.contactId, invoice.contactId)).limit(1);
            }
            
            if (invoice.salesOrderId) {
              const plans = await db.select().from(dentalTreatmentPlans).where(eq(dentalTreatmentPlans.salesOrderId, invoice.salesOrderId));
              if (plans.length > 0) {
                const planIds = plans.map(p => p.id);
                for (const pId of planIds) {
                  const procs = await db.select().from(dentalTreatmentProcedures).where(eq(dentalTreatmentProcedures.planId, pId));
                  for (const pr of procs as any[]) {
                    if (pr.productId) {
                      const [prod] = await db.select().from(products).where(eq(products.id, pr.productId)).limit(1);
                      pr.product = prod;
                    }
                  }
                  dentalProcs.push(...procs);
                }
              }
            }
            
            const ripsData = {
              invoice,
              items,
              patientProfile,
              patientContact,
              procedures: dentalProcs,
            };
            
             const ripsJson = await healthProvider.buildRipsJson(ripsData, { companyId, ...config.healthCredentials, ...dianCtx });
            
            // Simultaneously submit XML + RIPS JSON
             valResult = await healthProvider.transmitSimultaneously(signedXml, ripsJson, { companyId, ...config.healthCredentials, ...dianCtx });
          }
        }
        
        if (!valResult) {
          // Standard non-healthcare validation
          valResult = await invProvider.transmit(signedXml, dianCtx);
        }
        
        // Save the validation outcome
        await db.insert(electronicInvoices).values({
          invoiceId: id,
          companyId,
          country: config.country,
          provider: config.country === 'CO' ? 'colombia_dian' : 'generic',
          status: valResult.status,
          cufe: cufe,
          cuv: valResult.cuv || null,
          xmlUrl: valResult.xmlUrl || null,
          qrCodeText: valResult.qrCodeText || `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cufe}`,
          ripsJsonUrl: valResult.ripsJsonUrl || null,
          errors: valResult.errors || [],
          metadata: valResult.metadata || {},
        }).onConflictDoUpdate({
          target: electronicInvoices.invoiceId,
          set: {
            status: valResult.status,
            cufe: cufe,
            cuv: valResult.cuv || null,
            xmlUrl: valResult.xmlUrl || null,
            qrCodeText: valResult.qrCodeText || `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cufe}`,
            ripsJsonUrl: valResult.ripsJsonUrl || null,
            errors: valResult.errors || [],
            metadata: valResult.metadata || {},
            updatedAt: new Date(),
          }
        });
        
        if (valResult.status === 'validated') {
          // Proceed to send the core invoice
          assertStatusTransition(invoice.status, 'sent');
          const updated = await storage.sendInvoice(id, companyId, req.user?.id ?? null);
          return res.json({ success: true, data: updated });
          } else if (valResult.status === 'rejected') {
            return res.status(400).json({
              success: false,
              error: await electronicInvoiceMessage(req, 'erp.electronicInvoicing.errors.validationRejected', 'Electronic invoice validation was rejected by the authority.'),
              errors: valResult.errors,
            });
          } else {
            return res.status(500).json({
              success: false,
              error: await electronicInvoiceMessage(req, 'erp.electronicInvoicing.errors.validationFailed', 'Electronic invoice validation failed due to a connection error.'),
              errors: valResult.errors,
            });
        }
      }
    }

    assertStatusTransition(invoice.status, 'sent');
    const updated = await storage.sendInvoice(id, companyId, req.user?.id ?? null);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error sending invoice:');
  }
});

router.post('/:id/void', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadInvoiceForCompany(id, companyId);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    assertStatusTransition(invoice.status, 'void');
    const updated = await storage.voidInvoice(id, companyId, req.user?.id ?? null);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error voiding invoice:');
  }
});

router.post('/:id/cancel', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadInvoiceForCompany(id, companyId);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    assertStatusTransition(invoice.status, 'cancelled');
    const updated = await storage.cancelInvoice(id, companyId, req.user?.id ?? null);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error cancelling invoice:');
  }
});

router.get('/:id', requireAnyPermission(ERP_INVOICE_READ_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadInvoiceForCompany(id, companyId);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    const refreshedInvoice = await storage.refreshInvoiceOverdueStatus(id, companyId);
    const [items, payments, relatedNotes, electronicInvoice] = await Promise.all([
      storage.getInvoiceItems(id),
      storage.getInvoicePayments(id),
      storage.getInvoices(companyId, { parentInvoiceId: id }),
      db.select().from(electronicInvoices).where(eq(electronicInvoices.invoiceId, id)).limit(1).then((rows) => rows[0] ?? null),
    ]);
    return res.json({
      success: true,
      data: { invoice: refreshedInvoice ?? invoice, items, payments, relatedNotes: relatedNotes.data, electronicInvoice },
    });
  } catch (error) {
    return handleRouteError(res, error, 'Error loading invoice:');
  }
});

router.put('/:id', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadInvoiceForCompany(id, companyId);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    try {
      assertInvoiceEditable(invoice);
    } catch (e) {
      return handleRouteError(res, e, 'Error updating invoice:');
    }
    const parsed = updateInvoiceBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }
    const data = parsed.data;
    if (data.contactId !== undefined && data.contactId != null) {
      const contact = await storage.getContact(data.contactId);
      if (!contact || contact.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Contact does not belong to this company' });
      }
    }
    if (data.supplierId !== undefined && data.supplierId != null) {
      const supplier = await storage.getSupplier(data.supplierId);
      if (!supplier || supplier.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Supplier does not belong to this company' });
      }
    }
    if (data.salesOrderId !== undefined && data.salesOrderId != null) {
      const order = await storage.getSalesOrder(data.salesOrderId);
      if (!order || order.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Sales order does not belong to this company' });
      }
    }
    if (data.purchaseOrderId !== undefined && data.purchaseOrderId != null) {
      const order = await storage.getPurchaseOrder(data.purchaseOrderId);
      if (!order || order.companyId !== companyId) {
        return res.status(400).json({ success: false, error: 'Purchase order does not belong to this company' });
      }
    }
    const subtotal = Number(data.subtotal ?? invoice.subtotal ?? 0);
    const taxAmount = Number(data.taxAmount ?? invoice.taxAmount ?? 0);
    const typeSentUpd = data.discountType !== undefined;
    const valueSentUpd = data.discountValue !== undefined;
    const amountSentUpd = data.discountAmount !== undefined;
    let effUpdDiscType: string;
    let effUpdDiscValueNum: number;
    if (typeSentUpd || valueSentUpd) {
      effUpdDiscType = String(data.discountType ?? invoice.discountType ?? 'fixed_amount').trim();
      effUpdDiscValueNum = Number(data.discountValue ?? invoice.discountValue ?? 0);
    } else if (amountSentUpd) {
      effUpdDiscType = 'fixed_amount';
      effUpdDiscValueNum = Number(data.discountAmount ?? 0);
    } else {
      effUpdDiscType = String(invoice.discountType ?? 'fixed_amount').trim();
      effUpdDiscValueNum = Number(invoice.discountValue ?? 0);
    }
    if (!['none', 'percentage', 'fixed_amount'].includes(effUpdDiscType)) effUpdDiscType = 'fixed_amount';
    if (!Number.isFinite(effUpdDiscValueNum)) effUpdDiscValueNum = 0;
    const computedUpdDiscountAmt = invoiceHeaderDiscountAmount(subtotal, effUpdDiscType, effUpdDiscValueNum);
    const tipAmount = Number(data.tipAmount ?? invoice.tipAmount ?? 0);
    const normalizedServiceChargeAmount = deriveServiceChargeAmount({
      subtotal: data.subtotal ?? invoice.subtotal,
      serviceChargeRate: data.serviceChargeRate ?? invoice.serviceChargeRate,
      serviceChargeAmount: data.serviceChargeAmount,
    });
    const serviceChargeAmount = Number(normalizedServiceChargeAmount);
    const totalAmount = (subtotal + taxAmount - computedUpdDiscountAmt + tipAmount + serviceChargeAmount).toFixed(2);
    const updated = await storage.updateInvoice(id, {
      ...data,
      discountType: effUpdDiscType as 'none' | 'percentage' | 'fixed_amount',
      discountValue: effUpdDiscValueNum.toFixed(2),
      discountAmount: computedUpdDiscountAmt.toFixed(2),
      serviceChargeAmount: normalizedServiceChargeAmount,
      totalAmount,
    });
    await storage.recalculateInvoiceTotals(id);
    const finalInv = await storage.getInvoice(id);
    return res.json({ success: true, data: finalInv ?? updated });
  } catch (error) {
    return handleRouteError(res, error, 'Error updating invoice:');
  }
});

router.post('/split', requireAnyPermission(['manage_invoices']), async (req, res) => {
  try {
    const companyId = await ensureRestaurantBusinessType(req, res);
    if (!companyId) return;

    const parsed = splitInvoiceBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendValidationError(res, parsed.error);
    }

    const sourceInvoice = await storage.getInvoice(parsed.data.sourceInvoiceId);
    if (!sourceInvoice) {
      return res.status(404).json({ success: false, error: 'Source invoice not found' });
    }
    if (sourceInvoice.companyId !== companyId) {
      return res.status(404).json({ success: false, error: 'Source invoice not found' });
    }
    const createdInvoices = await storage.splitDraftInvoice(
      companyId,
      sourceInvoice.id,
      parsed.data.splits,
      req.user?.id ?? null
    );

    return res.json({ success: true, data: createdInvoices });
  } catch (error) {
    return handleRouteError(res, error, 'Error splitting invoice:');
  }
});

router.delete('/:id', requireAnyPermission(ERP_INVOICE_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const invoice = await loadInvoiceForCompany(id, companyId);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    try {
      const ok = await storage.deleteInvoice(id);
      if (!ok) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }
      return res.json({ success: true });
    } catch (e) {
      return handleRouteError(res, e, 'Error deleting invoice:');
    }
  } catch (error) {
    return handleRouteError(res, error, 'Error deleting invoice:');
  }
});

export default router;
