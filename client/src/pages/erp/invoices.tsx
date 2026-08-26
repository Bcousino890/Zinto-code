import Header from '@/components/layout/Header';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { useTranslation } from '@/hooks/use-translation';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { useErpCurrencies } from '@/hooks/use-erp-currencies';
import { InvoicePrintTemplate } from '@/components/erp/InvoicePrintTemplate';
import { INVOICE_TEMPLATE_DEFAULTS, type InvoiceTemplateSettings } from '@/lib/erp-invoice-template-defaults';
import '@/styles/invoice-print.css';

type InvoiceRow = {
  id: number;
  companyId: number;
  invoiceNumber: string;
  contactId: number | null;
  supplierId: number | null;
  salesOrderId: number | null;
  purchaseOrderId: number | null;
  type: string;
  status: string;
  issueDate: string | null;
  dueDate: string | null;
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  discountType?: 'none' | 'percentage' | 'fixed_amount' | string | null;
  discountValue?: string | null;
  tipAmount: string | null;
  serviceChargeAmount: string | null;
  serviceChargeRate: string | null;
  totalAmount: string;
  splitBillGroupId: string | null;
  splitBillSeatLabel: string | null;
  amountPaid: string;
  amountDue: string;
  currency: string | null;
  notes: string | null;
  adjustmentReason: string | null;
  parentInvoiceId: number | null;
  termsAndConditions: string | null;
  pdfUrl: string | null;
  paymentToken: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
};

type InvoiceItemRow = {
  id: number;
  invoiceId: number;
  productId: number | null;
  description: string | null;
  quantity: string;
  unitPrice: string;
  discountPercent: string | null;
  discountType?: 'percentage' | 'fixed_amount' | string | null;
  discountValue?: string | null;
  taxRate: string | null;
  lineTotal: string;
  sortOrder: number | null;
};

type InvoicePaymentRow = {
  id: number;
  invoiceId: number;
  companyId: number;
  amount: string;
  paymentDate: string | null;
  paymentMethod: string | null;
  referenceNumber: string | null;
  notes: string | null;
  recordedBy: number | null;
  createdAt: string | null;
};

type ProductRow = { id: number; name: string; unitPrice: string | null };
type ContactRow = { id: number; name: string };
type SupplierRow = { id: number; name: string };
type OrderPickRow = { id: number; orderNumber: string };

type InvoiceDetailPayload = {
  invoice: InvoiceRow;
  items: InvoiceItemRow[];
  payments: InvoicePaymentRow[];
  relatedNotes: InvoiceRow[];
  electronicInvoice?: {
    status: string;
    cufe?: string | null;
    cuv?: string | null;
    qrCodeText?: string | null;
    errors?: unknown;
  } | null;
};

const CREATEABLE_INVOICE_TYPES = ['sales_invoice', 'purchase_invoice', 'credit_note', 'debit_note'] as const;
const FILTERABLE_INVOICE_TYPES = ['sales_invoice', 'purchase_invoice', 'credit_note', 'debit_note'] as const;

const INVOICE_STATUSES = [
  'draft',
  'sent',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
  'void',
] as const;

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  check: 'Check',
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  bank_transfer: 'Bank Transfer',
  stripe: 'Stripe',
  paypal: 'PayPal',
  mercadopago: 'Mercado Pago',
  moyasar: 'Moyasar',
  mpesa: 'M-PESA',
  paystack: 'Paystack',
  other: 'Other',
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'draft':
      return 'bg-muted text-muted-foreground';
    case 'sent':
      return 'bg-blue-500/15 text-blue-700 dark:text-blue-300';
    case 'partially_paid':
      return 'bg-amber-500/15 text-amber-800 dark:text-amber-200';
    case 'paid':
      return 'bg-green-600/15 text-green-800 dark:text-green-200';
    case 'overdue':
      return 'bg-red-500/15 text-red-800 dark:text-red-200';
    case 'cancelled':
      return 'bg-slate-500/15 text-slate-700 dark:text-slate-300';
    case 'void':
      return 'bg-destructive/15 text-destructive';
    default:
      return 'bg-secondary';
  }
}

function typeBadgeClass(type: string): string {
  switch (type) {
    case 'sales_invoice':
    case 'purchase_invoice':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    case 'credit_note':
      return 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300';
    case 'debit_note':
      return 'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

function typeLabel(t_type: string, t: any): string {
  return t(`erp.invoices.types.${t_type}`, t_type.replace(/_/g, ' '));
}

function supportsInvoiceWorkflow(type: string): boolean {
  return type === 'sales_invoice' || type === 'purchase_invoice' || type === 'credit_note' || type === 'debit_note';
}

function formatBusinessDate(value: string | null, locale?: string): string {
  if (!value) return '—';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString(locale);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(locale);
}

function canEditLines(status: string): boolean {
  return status === 'draft' || status === 'sent';
}

function formatCurrencyColumnTotals(
  rows: InvoiceRow[],
  amountKey: 'totalAmount' | 'amountPaid' | 'amountDue',
  fallbackCurrencyCode: string,
  locale?: string,
): string {
  const totalsByCurrency = new Map<string, number>();
  for (const row of rows) {
    const currency = (row.currency ?? fallbackCurrencyCode).toUpperCase();
    const amount = Number(row[amountKey] ?? 0);
    if (!Number.isFinite(amount)) continue;
    totalsByCurrency.set(currency, (totalsByCurrency.get(currency) ?? 0) + amount);
  }

  if (totalsByCurrency.size === 0) return '—';

  return Array.from(totalsByCurrency.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => `${currency} ${amount.toLocaleString(locale, { minimumFractionDigits: 2 })}`)
    .join(' | ');
}

export default function ERPInvoicesPage() {
  const { user, company } = useAuth();
  const companyId = user?.companyId;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const { t, currentLanguage } = useTranslation();
  const { isRestaurant } = useErpBusinessType();
  const {
    currencies,
    availableCurrencyCodes,
    baseCurrencyCode,
    isLoading: currenciesLoading,
  } = useErpCurrencies();
  const { data: enabledPaymentMethods = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['/api/erp/payment-methods'],
    enabled: !!companyId,
  });
  const canManage = hasPermission(PERMISSIONS.MANAGE_INVOICES);
  const canPay = canManage || hasPermission(PERMISSIONS.RECORD_PAYMENTS);
  const [location] = useLocation();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const [createOpen, setCreateOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [printTemplateType, setPrintTemplateType] = useState<'a4' | 'thermal' | null>(null);
  const [printDetailOverride, setPrintDetailOverride] = useState<InvoiceDetailPayload | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [generateTab, setGenerateTab] = useState<'so' | 'po'>('so');
  const [pickSalesOrderId, setPickSalesOrderId] = useState('');
  const [pickPurchaseOrderId, setPickPurchaseOrderId] = useState('');

  const [formType, setFormType] = useState<string>('sales_invoice');
  const [formContactId, setFormContactId] = useState('');
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formParentInvoiceId, setFormParentInvoiceId] = useState<string>('');
  const [formAdjustmentReason, setFormAdjustmentReason] = useState<string>('');
  const [formIssueDate, setFormIssueDate] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formCurrency, setFormCurrency] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formTerms, setFormTerms] = useState('');
  const [formCreateDiscType, setFormCreateDiscType] = useState<'none' | 'percentage' | 'fixed_amount'>('none');
  const [formCreateDiscValue, setFormCreateDiscValue] = useState('');
  const [formTipAmount, setFormTipAmount] = useState('');
  const [formServiceChargeRate, setFormServiceChargeRate] = useState('');
  const serviceChargePreviewAmount = useMemo(() => {
    const rate = Number(formServiceChargeRate);
    if (!Number.isFinite(rate) || rate <= 0) return '';
    const subtotal = 0;
    return ((subtotal * rate) / 100).toFixed(2);
  }, [formServiceChargeRate]);

  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [paymentRefUploading, setPaymentRefUploading] = useState(false);
  const [previewReferenceImageUrl, setPreviewReferenceImageUrl] = useState<string | null>(null);

  const [lineProductId, setLineProductId] = useState('');
  const [lineQty, setLineQty] = useState('1');
  const [lineUnitPrice, setLineUnitPrice] = useState('');
  const [lineDisc, setLineDisc] = useState('0');
  const [lineDiscType, setLineDiscType] = useState<'percentage' | 'fixed_amount'>('percentage');
  const [lineTax, setLineTax] = useState('0');
  const [lineDescription, setLineDescription] = useState('');
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [headerDiscType, setHeaderDiscType] = useState<'none' | 'percentage' | 'fixed_amount'>('fixed_amount');
  const [headerDiscValue, setHeaderDiscValue] = useState('0');
  const [splitBillOpen, setSplitBillOpen] = useState(false);
  const [splitMap, setSplitMap] = useState<Record<number, string>>({});
  const previousCompanyIdRef = useRef<number | null | undefined>(undefined);
  const suppressPaymentMutationUiRef = useRef(false);

  useEffect(() => {
    if (currenciesLoading || formCurrency) return;
    setFormCurrency(baseCurrencyCode);
  }, [currenciesLoading, baseCurrencyCode, formCurrency]);

  const filtersKey = useMemo(
    () => ({ searchTerm, statusFilter, typeFilter, dateFrom, dateTo, page, limit }),
    [searchTerm, statusFilter, typeFilter, dateFrom, dateTo, page, limit]
  );

  const invalidateLists = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/erp/invoices'] });
  };

  const invalidateDetail = () => {
    if (!companyId || detailId == null) return;
    queryClient.invalidateQueries({ queryKey: ['/api/erp/invoices', companyId, 'detail', detailId] });
  };

  const { data: listResult, isLoading } = useQuery({
    queryKey: ['/api/erp/invoices', companyId, filtersKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      params.set('limit', String(limit));
      params.set('offset', String((page - 1) * limit));
      const res = await apiRequest('GET', `/api/erp/invoices?${params.toString()}`);
      const json = await res.json();
      return json.data as { data: InvoiceRow[]; total: number };
    },
    enabled: !!companyId,
  });

  const rows = listResult?.data ?? [];
  const total = listResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const locale = currentLanguage?.code?.replace('_', '-') || undefined;
  const rangeStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = Math.min(page * limit, total);
  const totalAmountSummary = useMemo(
    () => formatCurrencyColumnTotals(rows, 'totalAmount', baseCurrencyCode, locale),
    [rows, baseCurrencyCode, locale],
  );
  const paidAmountSummary = useMemo(
    () => formatCurrencyColumnTotals(rows, 'amountPaid', baseCurrencyCode, locale),
    [rows, baseCurrencyCode, locale],
  );
  const dueAmountSummary = useMemo(
    () => formatCurrencyColumnTotals(rows, 'amountDue', baseCurrencyCode, locale),
    [rows, baseCurrencyCode, locale],
  );

  const { data: contactsRes } = useQuery({
    queryKey: ['/api/contacts', companyId, 'invoices-picker'],
    queryFn: async () => {
      const res = await fetch('/api/contacts?page=1&limit=500');
      if (!res.ok) throw new Error(t('erp.invoices.errors.failedLoadContacts', 'Failed to load contacts'));
      return res.json() as Promise<{ contacts: ContactRow[] }>;
    },
    enabled: !!companyId,
  });
  const contacts = contactsRes?.contacts ?? [];

  const { data: suppliersList } = useQuery({
    queryKey: ['/api/erp/suppliers', companyId, 'invoices'],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '500', offset: '0' });
      const res = await apiRequest('GET', `/api/erp/suppliers?${params}`);
      const json = await res.json();
      return json.data as { data: SupplierRow[]; total: number };
    },
    enabled: !!companyId,
  });
  const suppliers = suppliersList?.data ?? [];

  const { data: productsList } = useQuery({
    queryKey: ['/api/erp/products', companyId, 'invoices'],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', '500');
      params.set('offset', '0');
      const res = await apiRequest('GET', `/api/erp/products?${params.toString()}`);
      const json = await res.json();
      return json.data as { data: ProductRow[]; total: number };
    },
    enabled: !!companyId,
  });
  const products = productsList?.data ?? [];

  const { data: salesOrdersPick } = useQuery({
    queryKey: ['/api/erp/sales-orders', companyId, 'invoice-gen'],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '200', offset: '0' });
      const res = await apiRequest('GET', `/api/erp/sales-orders?${params}`);
      const json = await res.json();
      return json.data as { data: OrderPickRow[]; total: number };
    },
    enabled: !!companyId && generateOpen && generateTab === 'so',
  });

  const { data: purchaseOrdersPick } = useQuery({
    queryKey: ['/api/erp/purchase-orders', companyId, 'invoice-gen'],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '200', offset: '0' });
      const res = await apiRequest('GET', `/api/erp/purchase-orders?${params}`);
      const json = await res.json();
      return json.data as { data: OrderPickRow[]; total: number };
    },
    enabled: !!companyId && generateOpen && generateTab === 'po',
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['/api/erp/invoices', companyId, 'detail', detailId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/invoices/${detailId}`);
      const json = await res.json();
      return json.data as InvoiceDetailPayload;
    },
    enabled: detailId != null && !!companyId,
  });

  useEffect(() => {
    if (!detailData?.invoice) return;
    const inv = detailData.invoice;
    const dt = inv.discountType;
    if (dt === 'percentage' || dt === 'none' || dt === 'fixed_amount') {
      setHeaderDiscType(dt);
    } else {
      setHeaderDiscType('fixed_amount');
    }
    setHeaderDiscValue(
      inv.discountValue != null && String(inv.discountValue).trim() !== ''
        ? String(inv.discountValue)
        : String(inv.discountAmount ?? '0')
    );
  }, [
    detailData?.invoice?.id,
    detailData?.invoice?.discountType,
    detailData?.invoice?.discountValue,
    detailData?.invoice?.discountAmount,
  ]);

  const invoiceTemplateSettingsQuery = useQuery({
    queryKey: ['/api/erp/invoices/template-settings', companyId],
    queryFn: async (): Promise<InvoiceTemplateSettings> => {
      const res = await apiRequest('GET', '/api/erp/invoices/template-settings');
      if (!res.ok) {
        let message =
          res.statusText ||
          t(
            'erp.invoices.errors.loadInvoiceTemplateSettings',
            'Failed to load invoice template settings'
          );
        try {
          const errJson = (await res.json()) as { error?: string };
          if (errJson?.error) message = errJson.error;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      const json = await res.json();
      return (json.data ?? INVOICE_TEMPLATE_DEFAULTS) as InvoiceTemplateSettings;
    },
    enabled: !!companyId && (paymentOpen || detailId != null),
  });

  useEffect(() => {
    if (previousCompanyIdRef.current === undefined) {
      previousCompanyIdRef.current = companyId;
      return;
    }
    if (previousCompanyIdRef.current === companyId) return;
    previousCompanyIdRef.current = companyId;
    setDetailId(null);
    setPaymentOpen(false);
    setEditingItemId(null);
    queryClient.removeQueries({ queryKey: ['/api/erp/invoices'] });
  }, [companyId, queryClient]);

  useEffect(() => {
    if (detailId == null) return;
    setLineProductId('');
    setLineQty('1');
    setLineUnitPrice('');
    setLineDisc('0');
    setLineDiscType('percentage');
    setLineTax('0');
    setLineDescription('');
    setEditingItemId(null);
  }, [detailId]);

  // Read detail query param on mount/navigation to open invoice detail sheet
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const detailParam = params.get('detail');
    if (detailParam) {
      const id = parseInt(detailParam, 10);
      if (!isNaN(id)) {
        setDetailId(id);
      }
    }
  }, [location]);

  const contactNameById = useMemo(() => {
    const m = new Map<number, string>();
    contacts.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [contacts]);

  const supplierNameById = useMemo(() => {
    const m = new Map<number, string>();
    suppliers.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [suppliers]);

  const productNameById = useMemo(() => {
    const m = new Map<number, string>();
    products.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [products]);

  const resetCreateForm = () => {
    setFormType('sales_invoice');
    setFormContactId('');
    setFormSupplierId('');
    setFormParentInvoiceId('');
    setFormAdjustmentReason('');
    setFormIssueDate('');
    setFormDueDate('');
    setFormCurrency(baseCurrencyCode);
    setFormNotes('');
    setFormTerms('');
    setFormCreateDiscType('none');
    setFormCreateDiscValue('');
    setFormTipAmount('');
    setFormServiceChargeRate('');
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        type: formType,
        currency: formCurrency || baseCurrencyCode || 'USD',
        notes: formNotes || undefined,
        termsAndConditions: formTerms || undefined,
        issueDate: formIssueDate || undefined,
        dueDate: formDueDate || null,
        tipAmount: isRestaurant && formTipAmount ? formTipAmount : undefined,
        serviceChargeRate: isRestaurant && formServiceChargeRate ? formServiceChargeRate : undefined,
        serviceChargeAmount: isRestaurant && formServiceChargeRate ? serviceChargePreviewAmount : undefined,
        parentInvoiceId: formParentInvoiceId ? parseInt(formParentInvoiceId, 10) : undefined,
        adjustmentReason: formAdjustmentReason || undefined,
        contactId:
          formType === 'sales_invoice' || formType === 'credit_note' || formType === 'debit_note'
            ? formContactId
              ? parseInt(formContactId, 10)
              : null
            : null,
        supplierId:
          formType === 'purchase_invoice' || (formType === 'credit_note' && !formContactId) || (formType === 'debit_note' && !formContactId)
            ? formSupplierId
              ? parseInt(formSupplierId, 10)
              : null
            : null,
        discountType: formCreateDiscType,
        discountValue: formCreateDiscType === 'none' ? '0' : formCreateDiscValue || '0',
      };
      const res = await apiRequest('POST', '/api/erp/invoices', body);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.invoices.errors.createFailed', 'Create failed'));
      return json.data as InvoiceRow;
    },
    onSuccess: (inv) => {
      toast({ title: t('erp.invoices.toast.created', 'Invoice created') });
      setCreateOpen(false);
      resetCreateForm();
      invalidateLists();
      setDetailId(inv.id);
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const body =
        generateTab === 'so'
          ? { salesOrderId: parseInt(pickSalesOrderId, 10) }
          : { purchaseOrderId: parseInt(pickPurchaseOrderId, 10) };
      const res = await apiRequest('POST', '/api/erp/invoices/generate-from-order', body);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.invoices.errors.generateFailed', 'Generate failed'));
      return json.data as InvoiceRow;
    },
    onSuccess: (inv) => {
      toast({ title: t('erp.invoices.toast.generated', 'Invoice generated') });
      setGenerateOpen(false);
      setPickSalesOrderId('');
      setPickPurchaseOrderId('');
      invalidateLists();
      setDetailId(inv.id);
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const sendMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/erp/invoices/${id}/send`, {});
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.invoices.errors.sendFailed', 'Send failed'));
    },
    onSuccess: () => {
      toast({ title: t('erp.invoices.toast.markedSent', 'Invoice marked as sent') });
      invalidateDetail();
      invalidateLists();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const voidMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/erp/invoices/${id}/void`, {});
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.invoices.errors.voidFailed', 'Void failed'));
    },
    onSuccess: () => {
      toast({ title: t('erp.invoices.toast.voided', 'Invoice voided') });
      invalidateDetail();
      invalidateLists();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/erp/invoices/${id}/cancel`, {});
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.invoices.errors.cancelFailed', 'Cancel failed'));
    },
    onSuccess: () => {
      toast({ title: t('erp.invoices.toast.cancelled', 'Invoice cancelled') });
      invalidateDetail();
      invalidateLists();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/erp/invoices/${id}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.invoices.errors.deleteFailed', 'Delete failed'));
    },
    onSuccess: () => {
      toast({ title: t('erp.invoices.toast.deleted', 'Invoice deleted') });
      setDetailId(null);
      invalidateLists();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const updateInvoiceDiscountMutation = useMutation({
    mutationFn: async () => {
      if (detailId == null) throw new Error(t('erp.invoices.errors.noInvoiceSelected', 'No invoice selected'));
      const sub = Number(detailData?.invoice.subtotal ?? 0);
      if (headerDiscType === 'fixed_amount' && Number(headerDiscValue) > sub + 1e-6) {
        throw new Error(
          t('erp.invoices.errors.discountExceedsSubtotal', 'Discount cannot exceed the subtotal')
        );
      }
      const res = await apiRequest('PUT', `/api/erp/invoices/${detailId}`, {
        discountType: headerDiscType,
        discountValue: headerDiscType === 'none' ? '0' : headerDiscValue || '0',
      });
      const json = await res.json();
      if (!json.success)
        throw new Error(json.error || t('erp.invoices.errors.discountUpdateFailed', 'Update failed'));
    },
    onSuccess: () => {
      toast({ title: t('erp.invoices.toast.discountUpdated', 'Invoice discount updated') });
      invalidateDetail();
      invalidateLists();
    },
    onError: (e: Error) =>
      toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const addLineMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const res = await apiRequest('POST', `/api/erp/invoices/${invoiceId}/items`, {
        productId: lineProductId ? parseInt(lineProductId, 10) : null,
        description: lineDescription || null,
        quantity: lineQty,
        unitPrice: lineUnitPrice || '0',
        discountType: lineDiscType,
        discountValue: lineDisc,
        discountPercent: lineDiscType === 'percentage' ? lineDisc : '0',
        taxRate: lineTax,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.invoices.errors.addLineFailed', 'Failed to add line'));
    },
    onSuccess: () => {
      toast({ title: t('erp.invoices.toast.lineAdded', 'Line added') });
      setLineProductId('');
      setLineQty('1');
      setLineUnitPrice('');
      setLineDisc('0');
      setLineDiscType('percentage');
      setLineTax('0');
      setLineDescription('');
      invalidateDetail();
      invalidateLists();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const updateLineMutation = useMutation({
    mutationFn: async ({ invoiceId, itemId }: { invoiceId: number; itemId: number }) => {
      const res = await apiRequest('PUT', `/api/erp/invoices/${invoiceId}/items/${itemId}`, {
        productId: lineProductId ? parseInt(lineProductId, 10) : null,
        description: lineDescription || null,
        quantity: lineQty,
        unitPrice: lineUnitPrice || '0',
        discountType: lineDiscType,
        discountValue: lineDisc,
        discountPercent: lineDiscType === 'percentage' ? lineDisc : '0',
        taxRate: lineTax,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.invoices.errors.updateLineFailed', 'Failed to update line'));
    },
    onSuccess: () => {
      toast({ title: t('erp.invoices.toast.lineUpdated', 'Line updated') });
      setEditingItemId(null);
      setLineProductId('');
      setLineQty('1');
      setLineUnitPrice('');
      setLineDisc('0');
      setLineDiscType('percentage');
      setLineTax('0');
      setLineDescription('');
      invalidateDetail();
      invalidateLists();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const deleteLineMutation = useMutation({
    mutationFn: async ({ invoiceId, itemId }: { invoiceId: number; itemId: number }) => {
      const res = await apiRequest('DELETE', `/api/erp/invoices/${invoiceId}/items/${itemId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.invoices.errors.removeLineFailed', 'Failed to remove line'));
    },
    onSuccess: () => {
      toast({ title: t('erp.invoices.toast.lineRemoved', 'Line removed') });
      invalidateDetail();
      invalidateLists();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const resetPaymentForm = () => {
    setEditingPaymentId(null);
    setPayAmount('');
    setPayDate('');
    setPayMethod('');
    setPayRef('');
    setPayNotes('');
  };

  const payMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const res = await apiRequest('POST', `/api/erp/invoices/${invoiceId}/payments`, {
        amount: payAmount,
        paymentDate: payDate ? new Date(payDate).toISOString() : undefined,
        paymentMethod: payMethod || null,
        referenceNumber: payRef || null,
        notes: payNotes || null,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.invoices.errors.paymentFailed', 'Payment failed'));
    },
    onSuccess: () => {
      if (suppressPaymentMutationUiRef.current) return;
      toast({ title: t('erp.invoices.toast.paymentRecorded', 'Payment recorded') });
      setPaymentOpen(false);
      resetPaymentForm();
      invalidateDetail();
      invalidateLists();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const updatePaymentMutation = useMutation({
    mutationFn: async ({ invoiceId, paymentId }: { invoiceId: number; paymentId: number }) => {
      const res = await apiRequest('PUT', `/api/erp/invoices/${invoiceId}/payments/${paymentId}`, {
        amount: payAmount,
        paymentDate: payDate ? new Date(payDate).toISOString() : undefined,
        paymentMethod: payMethod || null,
        referenceNumber: payRef || null,
        notes: payNotes || null,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.invoices.errors.paymentUpdateFailed', 'Payment update failed'));
    },
    onSuccess: () => {
      if (suppressPaymentMutationUiRef.current) return;
      toast({ title: t('erp.invoices.toast.paymentUpdated', 'Payment updated') });
      setPaymentOpen(false);
      resetPaymentForm();
      invalidateDetail();
      invalidateLists();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const fetchInvoiceDetail = async (id: number) => {
    const res = await apiRequest('GET', `/api/erp/invoices/${id}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || t('erp.invoices.errors.loadDetailFailed', 'Failed to load invoice'));
    return json.data as InvoiceDetailPayload;
  };

  const handleSavePaymentAndPrint = async () => {
    if (detailId == null || !companyId || !payAmount.trim()) return;
    const paymentIdBeingEdited = editingPaymentId;
    if (invoiceTemplateSettingsQuery.isError) {
      const msg =
        invoiceTemplateSettingsQuery.error instanceof Error
          ? invoiceTemplateSettingsQuery.error.message
          : String(invoiceTemplateSettingsQuery.error ?? '');
      toast({
        title: t('ui.common.error', 'Error'),
        description:
          msg ||
          t(
            'erp.invoices.errors.templateSettingsFailed',
            'Could not load invoice template settings. Try again after settings load.'
          ),
        variant: 'destructive',
      });
      return;
    }
    if (!invoiceTemplateSettingsQuery.data) {
      toast({
        title: t('erp.invoices.templateSettingsLoading', 'Loading template settings'),
        description: t(
          'erp.invoices.templateSettingsLoadingHint',
          'Wait for invoice layout settings to finish loading, then try again.'
        ),
      });
      return;
    }
    suppressPaymentMutationUiRef.current = true;
    try {
      if (paymentIdBeingEdited != null) {
        await updatePaymentMutation.mutateAsync({
          invoiceId: detailId,
          paymentId: paymentIdBeingEdited,
        });
      } else {
        await payMutation.mutateAsync(detailId);
      }
    } catch {
      return;
    } finally {
      suppressPaymentMutationUiRef.current = false;
    }

    let refreshed: InvoiceDetailPayload;
    try {
      refreshed = await fetchInvoiceDetail(detailId);
      queryClient.setQueryData<InvoiceDetailPayload>(
        ['/api/erp/invoices', companyId, 'detail', detailId],
        refreshed
      );
    } catch (e) {
      toast({
        title: t('ui.common.error', 'Error'),
        description:
          e instanceof Error
            ? e.message
            : t('erp.invoices.errors.refreshAfterPaymentFailed', 'Payment saved but invoice details could not be refreshed.'),
        variant: 'destructive',
      });
      return;
    }

    handlePrintInvoice(undefined, refreshed);
    toast({
      title:
        paymentIdBeingEdited != null
          ? t('erp.invoices.toast.paymentUpdated', 'Payment updated')
          : t('erp.invoices.toast.paymentRecorded', 'Payment recorded'),
    });
    setPaymentOpen(false);
    resetPaymentForm();
    invalidateDetail();
    invalidateLists();
  };

  const onPickProduct = (id: string) => {
    setLineProductId(id);
    if (!id) {
      setLineUnitPrice('');
      return;
    }
    const p = products.find((x) => String(x.id) === id);
    if (p && p.unitPrice != null) {
      setLineUnitPrice(p.unitPrice);
      return;
    }
    setLineUnitPrice('');
  };

  const splitInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!detailData?.invoice?.id) throw new Error('Missing source invoice');
      const grouped = Object.entries(splitMap).reduce<Record<string, number[]>>((acc, [itemId, seat]) => {
        if (!seat.trim()) return acc;
        const key = seat.trim();
        if (!acc[key]) acc[key] = [];
        acc[key].push(Number(itemId));
        return acc;
      }, {});
      const splits = Object.entries(grouped).map(([seatLabel, itemIds]) => ({ seatLabel, itemIds }));
      const res = await apiRequest('POST', '/api/erp/invoices/split', {
        sourceInvoiceId: detailData.invoice.id,
        splits,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Split failed');
    },
    onSuccess: () => {
      toast({ title: t('erp.invoices.splitCreated', 'Split invoices created') });
      setSplitBillOpen(false);
      setSplitMap({});
      invalidateLists();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const startEditLine = (item: InvoiceItemRow) => {
    setEditingItemId(item.id);
    setLineProductId(item.productId != null ? String(item.productId) : '');
    setLineQty(item.quantity);
    setLineUnitPrice(item.unitPrice);
    const dType =
      item.discountType === 'fixed_amount'
        ? 'fixed_amount'
        : 'percentage';
    setLineDiscType(dType);
    setLineDisc(item.discountValue ?? item.discountPercent ?? '0');
    setLineTax(item.taxRate ?? '0');
    setLineDescription(item.description ?? '');
  };

  const inv = detailData?.invoice;
  const canRecordPayment =
    canPay &&
    inv &&
    supportsInvoiceWorkflow(inv.type) &&
    ['sent', 'partially_paid', 'overdue'].includes(inv.status);
  const hasRecordedPayments =
    !!detailData && (Number(detailData.invoice.amountPaid ?? 0) > 0 || detailData.payments.length > 0);
  const canVoidInvoice =
    !!inv && ['sent', 'partially_paid', 'paid', 'overdue'].includes(inv.status) && !hasRecordedPayments;
  const canCancelInvoice = inv?.status === 'draft';
  const isLikelyImageReference = (value: string): boolean => {
    const lower = value.toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].some((ext) => lower.endsWith(ext));
  };
  const isLikelyMediaReference = (value: string): boolean =>
    value.startsWith('/media/') || value.startsWith('/uploads/') || value.startsWith('http://') || value.startsWith('https://');
  const handlePaymentReferenceFileUpload = async (file: File) => {
    if (!file) return;
    const allowed = file.type.startsWith('image/');
    if (!allowed) {
      toast({
        title: t('ui.common.error', 'Error'),
        description: t('erp.invoices.payment.invalidReferenceFile', 'Only image files are allowed.'),
        variant: 'destructive',
      });
      return;
    }

    try {
      setPaymentRefUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || !data?.url) {
        throw new Error(data?.error || t('erp.invoices.payment.referenceUploadFailed', 'Failed to upload reference file'));
      }
      setPayRef(data.url);
      toast({
        title: t('erp.invoices.payment.referenceUploaded', 'Reference uploaded'),
      });
    } catch (error) {
      toast({
        title: t('ui.common.error', 'Error'),
        description: error instanceof Error ? error.message : t('erp.invoices.payment.referenceUploadFailed', 'Failed to upload reference file'),
        variant: 'destructive',
      });
    } finally {
      setPaymentRefUploading(false);
    }
  };
  const openRecordPaymentDialog = () => {
    const dueAmount = Number(inv?.amountDue ?? 0);
    setEditingPaymentId(null);
    setPayAmount(Number.isFinite(dueAmount) && dueAmount > 0 ? dueAmount.toFixed(2) : '0.00');
    setPayDate('');
    setPayMethod('');
    setPayRef('');
    setPayNotes('');
    setPaymentOpen(true);
  };

  const handlePrintInvoice = (type?: 'a4' | 'thermal', detailOverride?: InvoiceDetailPayload | null) => {
    const detail = detailOverride ?? detailData;
    if (!detail) {
      toast({
        title: t('ui.common.error', 'Error'),
        description: t('erp.invoices.errors.noInvoiceToPrint', 'No invoice loaded to print.'),
        variant: 'destructive',
      });
      return;
    }
    if (invoiceTemplateSettingsQuery.isError) {
      const msg =
        invoiceTemplateSettingsQuery.error instanceof Error
          ? invoiceTemplateSettingsQuery.error.message
          : String(invoiceTemplateSettingsQuery.error ?? '');
      toast({
        title: t('ui.common.error', 'Error'),
        description:
          msg ||
          t(
            'erp.invoices.errors.templateSettingsFailed',
            'Could not load invoice template settings. Try again after settings load.'
          ),
        variant: 'destructive',
      });
      return;
    }
    const settings = invoiceTemplateSettingsQuery.data;
    if (!settings) {
      toast({
        title: t('erp.invoices.templateSettingsLoading', 'Loading template settings'),
        description: t(
          'erp.invoices.templateSettingsLoadingHint',
          'Wait for invoice layout settings to finish loading, then try again.'
        ),
      });
      return;
    }
    setPrintDetailOverride(detailOverride ?? null);
    const resolved = type ?? settings.defaultTemplateType;
    setPrintTemplateType(resolved);
    setTimeout(() => {
      window.print();
      setPrintTemplateType(null);
      setPrintDetailOverride(null);
    }, 50);
  };

  const handleDownloadInvoicePdf = async () => {
    const detail = detailData;
    if (!detail) {
      toast({
        title: t('ui.common.error', 'Error'),
        description: t('erp.invoices.errors.noInvoiceToPrint', 'No invoice loaded to print.'),
        variant: 'destructive',
      });
      return;
    }
    const inv = detail.invoice;
    try {
      const res = await fetch(`/api/erp/invoices/${inv.id}/pdf?type=a4&download=1`, {
        credentials: 'include',
      });
      if (!res.ok) {
        let msg = t('erp.invoices.errors.pdfGenerationFailed', 'Could not generate PDF.');
        try {
          const j = (await res.json()) as { error?: string };
          if (j?.error) msg = j.error;
        } catch {
          /* ignore */
        }
        toast({ title: t('ui.common.error', 'Error'), description: msg, variant: 'destructive' });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${inv.invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({
        title: t('ui.common.error', 'Error'),
        description: t('erp.invoices.errors.pdfGenerationFailed', 'Could not generate PDF.'),
        variant: 'destructive',
      });
    }
  };

  const handleIssueCreditNote = () => {
    if (!detailData?.invoice) return;
    const inv = detailData.invoice;
    resetCreateForm();
    setFormType('credit_note');
    setFormParentInvoiceId(String(inv.id));
    if (inv.contactId) setFormContactId(String(inv.contactId));
    if (inv.supplierId) setFormSupplierId(String(inv.supplierId));
    setFormCurrency(inv.currency || baseCurrencyCode);
    setFormAdjustmentReason(t('erp.invoices.adjustment.defaultCreditReason', 'Credit note for invoice {{invoiceNumber}}', { invoiceNumber: inv.invoiceNumber }));
    setCreateOpen(true);
  };

  const handleIssueDebitNote = () => {
    if (!detailData?.invoice) return;
    const inv = detailData.invoice;
    resetCreateForm();
    setFormType('debit_note');
    setFormParentInvoiceId(String(inv.id));
    if (inv.contactId) setFormContactId(String(inv.contactId));
    if (inv.supplierId) setFormSupplierId(String(inv.supplierId));
    setFormCurrency(inv.currency || baseCurrencyCode);
    setFormAdjustmentReason(t('erp.invoices.adjustment.defaultDebitReason', 'Debit note for invoice {{invoiceNumber}}', { invoiceNumber: inv.invoiceNumber }));
    setCreateOpen(true);
  };

  const detailForPrint = printDetailOverride ?? detailData;
  const invoiceTemplateSettingsForPrint =
    invoiceTemplateSettingsQuery.data ?? INVOICE_TEMPLATE_DEFAULTS;

  return (
    <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden font-sans text-foreground">
      <Header />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] space-y-4 px-4 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">{t('erp.invoices.title', 'Invoices')}</h1>
                <p className="text-sm text-muted-foreground">
                  {t('erp.invoices.subtitle', 'Billing, credits, and payment collection.')}
                </p>
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 shadow-sm"
                    onClick={() => {
                      resetCreateForm();
                      setCreateOpen(true);
                    }}
                  >
                    <Plus className="me-1.5 h-4 w-4" />
                    {t('erp.invoices.actions.createInvoice', 'Create Invoice')}
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => setGenerateOpen(true)}>
                    {t('erp.invoices.actions.generateFromOrder', 'Generate from Order')}
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-card p-3 shadow-sm sm:p-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_190px_190px_170px_170px]">
                <div className="relative sm:col-span-2 xl:col-span-1">
                  <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-10 ps-9"
                    placeholder={t('erp.invoices.searchPlaceholder', 'Search invoice #...')}
                    aria-label={t('erp.invoices.searchLabel', 'Search invoices')}
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => {
                    setStatusFilter(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-10 w-full" aria-label={t('erp.invoices.filter.status', 'Filter by status')}>
                    <SelectValue placeholder={t('erp.common.status', 'Status')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('erp.common.allStatuses', 'All statuses')}</SelectItem>
                    {INVOICE_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {t(`erp.invoices.statuses.${status}`, status.replace(/_/g, ' '))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={typeFilter}
                  onValueChange={(value) => {
                    setTypeFilter(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-10 w-full" aria-label={t('erp.invoices.filter.type', 'Filter by type')}>
                    <SelectValue placeholder={t('erp.common.type', 'Type')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('erp.common.allTypes', 'All types')}</SelectItem>
                    {FILTERABLE_INVOICE_TYPES.map((typeKey) => (
                      <SelectItem key={typeKey} value={typeKey}>
                        {typeLabel(typeKey, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div>
                  <Input
                    type="date"
                    className="h-10"
                    aria-label={t('erp.invoices.filter.dateFrom', 'Issue date from')}
                    value={dateFrom}
                    onChange={(e) => {
                      setDateFrom(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <div>
                  <Input
                    type="date"
                    className="h-10"
                    aria-label={t('erp.invoices.filter.dateTo', 'Issue date to')}
                    value={dateTo}
                    onChange={(e) => {
                      setDateTo(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
              {isLoading ? (
                <div className="flex min-h-72 items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                  <span className="sr-only">{t('erp.invoices.loading', 'Loading invoices')}</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[1080px]">
                    <TableHeader>
                      <TableRow className="bg-muted/35 hover:bg-muted/35">
                        <TableHead className="h-11 min-w-[170px] text-xs font-semibold uppercase tracking-wide">
                          {t('erp.invoices.table.invoiceNumber', 'Invoice #')}
                        </TableHead>
                        <TableHead className="min-w-[145px] text-xs font-semibold uppercase tracking-wide">
                          {t('erp.common.type', 'Type')}
                        </TableHead>
                        <TableHead className="min-w-[180px] text-xs font-semibold uppercase tracking-wide">
                          {t('erp.invoices.table.contactSupplier', 'Contact / Supplier')}
                        </TableHead>
                        <TableHead className="min-w-[115px] text-xs font-semibold uppercase tracking-wide">
                          {t('erp.invoices.table.issue', 'Issue')}
                        </TableHead>
                        <TableHead className="min-w-[115px] text-xs font-semibold uppercase tracking-wide">
                          {t('erp.common.due', 'Due')}
                        </TableHead>
                        <TableHead className="min-w-[125px] text-right text-xs font-semibold uppercase tracking-wide">
                          {t('erp.common.total', 'Total')}
                        </TableHead>
                        <TableHead className="min-w-[110px] text-right text-xs font-semibold uppercase tracking-wide">
                          {t('erp.common.paid', 'Paid')}
                        </TableHead>
                        <TableHead className="min-w-[110px] text-right text-xs font-semibold uppercase tracking-wide">
                          {t('erp.common.due', 'Due')}
                        </TableHead>
                        <TableHead className="min-w-[120px] text-xs font-semibold uppercase tracking-wide">
                          {t('erp.common.status', 'Status')}
                        </TableHead>
                        <TableHead className="w-[100px] text-end text-xs font-semibold uppercase tracking-wide">
                          {t('erp.common.actions', 'Actions')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="h-64 text-center text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              <div className="rounded-full border bg-muted/40 p-3">
                                <FileText className="h-5 w-5" />
                              </div>
                              <span>{t('erp.invoices.empty', 'No invoices found.')}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        rows.map((invoice) => (
                          <TableRow
                            key={invoice.id}
                            className="h-[54px] cursor-pointer transition-colors"
                            onClick={() => setDetailId(invoice.id)}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2.5">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                                  <FileText className="h-3.5 w-3.5" />
                                </span>
                                <span className="whitespace-nowrap">{invoice.invoiceNumber}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${typeBadgeClass(invoice.type)}`}
                              >
                                {typeLabel(invoice.type, t)}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[220px] truncate text-sm">
                              {invoice.contactId != null
                                ? contactNameById.get(invoice.contactId) ?? `#${invoice.contactId}`
                                : invoice.supplierId != null
                                  ? supplierNameById.get(invoice.supplierId) ?? `#${invoice.supplierId}`
                                  : '—'}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {formatBusinessDate(invoice.issueDate, locale)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {formatBusinessDate(invoice.dueDate, locale)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right text-sm font-medium">
                              {invoice.currency ?? baseCurrencyCode}{' '}
                              {Number(invoice.totalAmount).toLocaleString(locale, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right text-sm">
                              {Number(invoice.amountPaid).toLocaleString(locale, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right text-sm">
                              {Number(invoice.amountDue).toLocaleString(locale, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(invoice.status)}`}
                                variant="secondary"
                              >
                                {t(`erp.invoices.statuses.${invoice.status}`, invoice.status.replace(/_/g, ' '))}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-end" onClick={(event) => event.stopPropagation()}>
                              <div className="flex justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  aria-label={t('erp.invoices.actions.editLabel', 'Open invoice {{invoiceNumber}}', {
                                    invoiceNumber: invoice.invoiceNumber,
                                  })}
                                  onClick={() => setDetailId(invoice.id)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                {canManage && invoice.status === 'draft' && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    aria-label={t('erp.invoices.actions.deleteLabel', 'Delete invoice {{invoiceNumber}}', {
                                      invoiceNumber: invoice.invoiceNumber,
                                    })}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      const confirmed = window.confirm(
                                        t(
                                          'erp.invoices.confirm.deleteInvoice',
                                          'Delete invoice {{invoiceNumber}}? This action cannot be undone.',
                                          { invoiceNumber: invoice.invoiceNumber }
                                        )
                                      );
                                      if (!confirmed) return;
                                      deleteMutation.mutate(invoice.id);
                                    }}
                                    disabled={deleteMutation.isPending}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                      {rows.length > 0 && (
                        <TableRow className="h-12 border-t-2 bg-muted/30 font-medium hover:bg-muted/30">
                          <TableCell colSpan={5}>{t('erp.common.total', 'Total')}</TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm text-emerald-600 dark:text-emerald-300">
                            {totalAmountSummary}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm">{paidAmountSummary}</TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm text-emerald-600 dark:text-emerald-300">
                            {dueAmountSummary}
                          </TableCell>
                          <TableCell colSpan={2}>—</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 rounded-lg border bg-card px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <p className="text-xs text-muted-foreground">
                {t('erp.invoices.pagination.showing', 'Showing {{start}} to {{end}} of {{total}} results', {
                  start: rangeStart,
                  end: rangeEnd,
                  total,
                })}
              </p>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page <= 1}
                    aria-label={t('erp.invoices.pagination.firstPage', 'First page')}
                    onClick={() => setPage(1)}
                  >
                    <ChevronFirst className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page <= 1}
                    aria-label={t('erp.common.previous', 'Previous')}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" className="h-8 w-8 text-xs" aria-current="page">
                    {page}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page >= totalPages}
                    aria-label={t('erp.common.next', 'Next')}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page >= totalPages}
                    aria-label={t('erp.invoices.pagination.lastPage', 'Last page')}
                    onClick={() => setPage(totalPages)}
                  >
                    <ChevronLast className="h-4 w-4" />
                  </Button>
                </div>
                <Select
                  value={String(limit)}
                  onValueChange={(value) => {
                    setLimit(Number(value));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-[132px] text-xs" aria-label={t('erp.invoices.pagination.rowsPerPage', 'Rows per page')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {[25, 50, 100].map((pageSize) => (
                      <SelectItem key={pageSize} value={String(pageSize)}>
                        {t('erp.invoices.pagination.perPage', '{{count}} per page', { count: pageSize })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('erp.invoices.dialog.newTitle', 'New invoice')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('erp.common.type', 'Type')}</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREATEABLE_INVOICE_TYPES.map((typeKey) => (
                    <SelectItem key={typeKey} value={typeKey}>
                      {typeLabel(typeKey, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formParentInvoiceId && (
              <div className="space-y-2">
                <Label>{t('erp.invoices.form.parentInvoice', 'Parent invoice ID')}</Label>
                <Input value={formParentInvoiceId} readOnly disabled className="bg-muted" />
              </div>
            )}
            {(formType === 'credit_note' || formType === 'debit_note') && (
              <div className="space-y-2">
                <Label>{t('erp.invoices.form.adjustmentReason', 'Reason for adjustment')}</Label>
                <Textarea
                  value={formAdjustmentReason}
                  onChange={(e) => setFormAdjustmentReason(e.target.value)}
                  placeholder={t('erp.invoices.form.adjustmentReasonPlaceholder', 'Enter reason...')}
                  rows={2}
                />
              </div>
            )}
            {formType === 'sales_invoice' && (
              <div className="space-y-2">
                <Label>{t('erp.salesOrders.form.contact', 'Contact')}</Label>
                <Select value={formContactId || '__none__'} onValueChange={(v) => setFormContactId(v === '__none__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('erp.salesOrders.form.selectContact', 'Select contact')} />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="__none__">{t('erp.common.none', 'None')}</SelectItem>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {formType === 'purchase_invoice' && (
              <div className="space-y-2">
                <Label>{t('erp.purchaseOrders.filters.supplier', 'Supplier')}</Label>
                <Select value={formSupplierId || '__none__'} onValueChange={(v) => setFormSupplierId(v === '__none__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('erp.invoices.form.selectSupplier', 'Select supplier')} />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="__none__">{t('erp.common.none', 'None')}</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('erp.invoices.form.issueDate', 'Issue date')}</Label>
                <Input type="date" value={formIssueDate} onChange={(e) => setFormIssueDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('erp.invoices.form.dueDate', 'Due date')}</Label>
                <Input type="date" value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('erp.common.currency', 'Currency')}</Label>
              <Select value={formCurrency} onValueChange={setFormCurrency}>
                <SelectTrigger disabled={currenciesLoading && currencies.length === 0}>
                  <SelectValue
                    placeholder={
                      currenciesLoading && currencies.length === 0
                        ? t('erp.common.loading', 'Loading…')
                        : undefined
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {formCurrency &&
                    !availableCurrencyCodes.includes(formCurrency) && (
                      <SelectItem key="__legacy__" value={formCurrency}>
                        {formCurrency}
                      </SelectItem>
                    )}
                  {currencies
                    .filter((c) => c.isActive !== false)
                    .map((c) => {
                      if (!c.code?.trim()) return null;
                      const code = c.code.trim().toUpperCase();
                      return (
                        <SelectItem key={c.id} value={code}>
                          {c.code} — {c.name}
                          {c.symbol ? ` (${c.symbol})` : ''}
                        </SelectItem>
                      );
                    })}
                  {!currenciesLoading &&
                    currencies.filter((c) => c.isActive !== false).length === 0 &&
                    availableCurrencyCodes.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('erp.common.discountType', 'Discount type')}</Label>
                <Select
                  value={formCreateDiscType}
                  onValueChange={(v) =>
                    setFormCreateDiscType(v as 'none' | 'percentage' | 'fixed_amount')
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('erp.common.discountTypeNone', 'No discount')}</SelectItem>
                    <SelectItem value="percentage">
                      {t('erp.common.discountTypePercentage', 'Percentage (%)')}
                    </SelectItem>
                    <SelectItem value="fixed_amount">
                      {t('erp.common.discountTypeFixed', 'Fixed amount')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('erp.common.discountValue', 'Discount value')}</Label>
                <Input
                  disabled={formCreateDiscType === 'none'}
                  value={formCreateDiscType === 'none' ? '' : formCreateDiscValue}
                  onChange={(e) => setFormCreateDiscValue(e.target.value)}
                  placeholder={
                    formCreateDiscType === 'percentage'
                      ? t('erp.common.discountPercent', 'Discount %')
                      : formCreateDiscType === 'fixed_amount'
                        ? t('erp.common.discountAmountLabel', 'Discount amount')
                        : ''
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('erp.common.notes', 'Notes')}</Label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>{t('erp.invoices.form.termsConditions', 'Terms & conditions')}</Label>
              <Textarea value={formTerms} onChange={(e) => setFormTerms(e.target.value)} rows={2} />
            </div>
            {isRestaurant && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>{t('erp.invoices.tipAmount', 'Tip amount')}</Label>
                  <Input value={formTipAmount} onChange={(e) => setFormTipAmount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t('erp.invoices.serviceChargeRate', 'Service charge %')}</Label>
                  <Input value={formServiceChargeRate} onChange={(e) => setFormServiceChargeRate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t('erp.invoices.serviceChargeAmountPreview', 'Service charge amount')}</Label>
                  <Input
                    value={serviceChargePreviewAmount || '0.00'}
                    readOnly
                    disabled
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {t('ui.common.cancel', 'Cancel')}
            </Button>
            <Button type="button" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('erp.common.create', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('erp.invoices.dialog.generateFromOrder', 'Generate from order')}</DialogTitle>
          </DialogHeader>
          <Tabs value={generateTab} onValueChange={(v) => setGenerateTab(v as 'so' | 'po')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="so">{t('erp.invoices.dialog.salesOrder', 'Sales order')}</TabsTrigger>
              <TabsTrigger value="po">{t('erp.invoices.dialog.purchaseOrder', 'Purchase order')}</TabsTrigger>
            </TabsList>
            <TabsContent value="so" className="space-y-3 mt-4">
              <Label>{t('erp.invoices.dialog.selectSalesOrder', 'Select sales order')}</Label>
              <Select value={pickSalesOrderId || '__none__'} onValueChange={(v) => setPickSalesOrderId(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('erp.common.choose', 'Choose...')} />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="__none__">{t('erp.common.choose', 'Choose...')}</SelectItem>
                  {(salesOrdersPick?.data ?? []).map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.orderNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TabsContent>
            <TabsContent value="po" className="space-y-3 mt-4">
              <Label>{t('erp.invoices.dialog.selectPurchaseOrder', 'Select purchase order')}</Label>
              <Select
                value={pickPurchaseOrderId || '__none__'}
                onValueChange={(v) => setPickPurchaseOrderId(v === '__none__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('erp.common.choose', 'Choose...')} />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="__none__">{t('erp.common.choose', 'Choose...')}</SelectItem>
                  {(purchaseOrdersPick?.data ?? []).map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.orderNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGenerateOpen(false)}>
              {t('ui.common.cancel', 'Cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => generateMutation.mutate()}
              disabled={
                generateMutation.isPending ||
                (generateTab === 'so' ? !pickSalesOrderId : !pickPurchaseOrderId)
              }
            >
              {generateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('erp.invoices.actions.generate', 'Generate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={paymentOpen}
        onOpenChange={(open) => {
          setPaymentOpen(open);
          if (!open) {
            setEditingPaymentId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPaymentId
                ? t('erp.invoices.payment.editTitle', 'Edit payment')
                : t('erp.invoices.payment.title', 'Record payment')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>{t('erp.invoices.payment.amount', 'Amount')}</Label>
              <Input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder={t('erp.invoices.payment.amountPlaceholder', '0.00')} />
            </div>
            <div className="space-y-2">
              <Label>{t('erp.invoices.payment.paymentDate', 'Payment date')}</Label>
              <Input type="datetime-local" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('erp.invoices.payment.method', 'Method')}</Label>
              <Select value={payMethod || '__none__'} onValueChange={(v) => setPayMethod(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('erp.invoices.payment.selectMethod', 'Select payment method')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('erp.common.none', 'None')}</SelectItem>
                  {enabledPaymentMethods.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {t(`erp.invoices.paymentMethod.${m.id}`, m.name || PAYMENT_METHOD_LABELS[m.id] || m.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('erp.invoices.payment.referenceNumber', 'Reference #')}</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paymentRefUploading}
                  onClick={() => {
                    const input = document.getElementById('payment-reference-upload-input') as HTMLInputElement | null;
                    input?.click();
                  }}
                >
                  {paymentRefUploading ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-1" />
                  )}
                  {t('erp.invoices.payment.uploadReference', 'Upload image')}
                </Button>
                <input
                  id="payment-reference-upload-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void handlePaymentReferenceFileUpload(file);
                    }
                    e.currentTarget.value = '';
                  }}
                />
              </div>
              <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('erp.common.notes', 'Notes')}</Label>
              <Textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setPaymentOpen(false)}>
              {t('ui.common.cancel', 'Cancel')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleSavePaymentAndPrint()}
              disabled={
                payMutation.isPending ||
                updatePaymentMutation.isPending ||
                !payAmount.trim() ||
                !detailData ||
                invoiceTemplateSettingsQuery.isError ||
                !invoiceTemplateSettingsQuery.data
              }
            >
              {payMutation.isPending || updatePaymentMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {t('erp.invoices.actions.saveAndPrintInvoice', 'Save & print invoice')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (detailId == null) return;
                if (editingPaymentId) {
                  updatePaymentMutation.mutate({ invoiceId: detailId, paymentId: editingPaymentId });
                } else {
                  payMutation.mutate(detailId);
                }
              }}
              disabled={
                payMutation.isPending ||
                updatePaymentMutation.isPending ||
                !payAmount.trim()
              }
            >
              {payMutation.isPending || updatePaymentMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {editingPaymentId ? t('erp.common.update', 'Update') : t('erp.common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={detailId != null} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent className="w-full sm:max-w-3xl xl:max-w-4xl overflow-y-auto">
          {detailLoading || !detailData ? (
            <>
              <SheetHeader>
                <SheetTitle>{t('erp.invoices.detail.loadingTitle', 'Invoice details')}</SheetTitle>
                <SheetDescription>
                  {t('erp.invoices.detail.loadingDescription', 'Loading invoice details...')}
                </SheetDescription>
              </SheetHeader>
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            </>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle>{detailData.invoice.invoiceNumber}</SheetTitle>
                <SheetDescription>
                  {t('erp.invoices.detail.description', 'Invoice details, line items, payments, and available actions.')}
                </SheetDescription>
                <div className="flex flex-wrap gap-2 items-center text-sm text-muted-foreground">
                  <Badge className={statusBadgeClass(detailData.invoice.status)} variant="secondary">
                    {detailData.invoice.status.replace(/_/g, ' ')}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {typeLabel(detailData.invoice.type, t)}
                  </Badge>
                </div>
              </SheetHeader>

              <div className="mt-4 rounded-md border p-3 space-y-2 text-sm bg-muted/20">
                {detailData.invoice.parentInvoiceId && (
                  <div className="pb-2 border-b mb-2">
                    <div className="text-muted-foreground text-xs">{t('erp.invoices.table.parentInvoice', 'Adjusting invoice')}</div>
                    <Button
                      variant="link"
                      className="p-0 h-auto text-blue-600 dark:text-blue-400 font-medium"
                      onClick={() => setDetailId(detailData.invoice.parentInvoiceId)}
                    >
                      #{detailData.invoice.parentInvoiceId}
                    </Button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-muted-foreground text-xs">{t('erp.salesOrders.form.contact', 'Contact')}</div>
                    <div>
                      {detailData.invoice.contactId != null
                        ? contactNameById.get(detailData.invoice.contactId) ?? `#${detailData.invoice.contactId}`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">{t('erp.purchaseOrders.filters.supplier', 'Supplier')}</div>
                    <div>
                      {detailData.invoice.supplierId != null
                        ? supplierNameById.get(detailData.invoice.supplierId) ?? `#${detailData.invoice.supplierId}`
                        : '—'}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-muted-foreground text-xs">{t('erp.invoices.table.issue', 'Issue')}</div>
                    <div>
                      {detailData.invoice.issueDate
                        ? formatBusinessDate(detailData.invoice.issueDate)
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">{t('erp.common.due', 'Due')}</div>
                    <div>
                      {detailData.invoice.dueDate
                        ? formatBusinessDate(detailData.invoice.dueDate)
                        : '—'}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">{t('erp.common.currency', 'Currency')}</div>
                  <div>{detailData.invoice.currency ?? baseCurrencyCode}</div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-2 border-t">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('erp.common.subtotal', 'Subtotal')}</span>
                    <span>{Number(detailData.invoice.subtotal).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('erp.common.tax', 'Tax')}</span>
                    <span>{Number(detailData.invoice.taxAmount).toFixed(2)}</span>
                  </div>
                  {canManage && canEditLines(detailData.invoice.status) ? (
                    <div className="col-span-2 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('erp.common.discount', 'Discount')}</span>
                        <span className="text-muted-foreground text-xs whitespace-nowrap pl-2">
                          {t('erp.common.amount', 'Amount')}:{' '}
                          <span className="text-foreground font-medium tabular-nums">
                            {Number(detailData.invoice.discountAmount).toFixed(2)}
                          </span>
                        </span>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="space-y-1 min-w-[140px] flex-1">
                          <Label className="text-xs text-muted-foreground">
                            {t('erp.common.discountType', 'Discount type')}
                          </Label>
                          <Select
                            value={headerDiscType}
                            onValueChange={(v) =>
                              setHeaderDiscType(v as 'none' | 'percentage' | 'fixed_amount')
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">
                                {t('erp.common.discountTypeNone', 'No discount')}
                              </SelectItem>
                              <SelectItem value="percentage">
                                {t('erp.common.discountTypePercentage', 'Percentage (%)')}
                              </SelectItem>
                              <SelectItem value="fixed_amount">
                                {t('erp.common.discountTypeFixed', 'Fixed amount')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1 min-w-[100px] flex-1">
                          <Label className="text-xs text-muted-foreground">
                            {t('erp.common.discountValue', 'Discount value')}
                          </Label>
                          <Input
                            className="h-9"
                            disabled={headerDiscType === 'none'}
                            placeholder={
                              headerDiscType === 'percentage'
                                ? t('erp.common.discountPercent', 'Discount %')
                                : t('erp.common.discountAmountLabel', 'Discount amount')
                            }
                            value={headerDiscType === 'none' ? '' : headerDiscValue}
                            onChange={(e) => setHeaderDiscValue(e.target.value)}
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="mb-0.5"
                          disabled={updateInvoiceDiscountMutation.isPending}
                          onClick={() => updateInvoiceDiscountMutation.mutate()}
                        >
                          {t('erp.invoices.actions.applyDiscount', 'Apply discount')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('erp.common.discount', 'Discount')}</span>
                      <span>{Number(detailData.invoice.discountAmount).toFixed(2)}</span>
                    </div>
                  )}
                  {isRestaurant && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('erp.invoices.serviceCharge', 'Service charge')}</span>
                        <span>
                          {Number(detailData.invoice.serviceChargeAmount ?? 0).toFixed(2)}
                          {detailData.invoice.serviceChargeRate ? ` (${detailData.invoice.serviceChargeRate}%)` : ''}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('erp.invoices.tip', 'Tip')}</span>
                        <span>{Number(detailData.invoice.tipAmount ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('erp.invoices.split', 'Split')}</span>
                        <span>{detailData.invoice.splitBillSeatLabel ?? detailData.invoice.splitBillGroupId ?? '—'}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between font-medium">
                    <span>{t('erp.common.total', 'Total')}</span>
                    <span>{Number(detailData.invoice.totalAmount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-green-700 dark:text-green-400">
                    <span>{t('erp.common.paid', 'Paid')}</span>
                    <span>{Number(detailData.invoice.amountPaid).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-amber-700 dark:text-amber-300">
                    <span>{t('erp.common.due', 'Due')}</span>
                    <span>{Number(detailData.invoice.amountDue).toFixed(2)}</span>
                  </div>
                </div>
                {detailData.invoice.notes && (
                  <div>
                    <div className="text-muted-foreground text-xs">{t('erp.common.notes', 'Notes')}</div>
                    <div className="whitespace-pre-wrap">{detailData.invoice.notes}</div>
                  </div>
                )}
               {detailData.invoice.adjustmentReason && (
                  <div>
                    <div className="text-muted-foreground text-xs">{t('erp.invoices.table.adjustmentReason', 'Adjustment reason')}</div>
                    <div className="whitespace-pre-wrap">{detailData.invoice.adjustmentReason}</div>
                  </div>
                 )}
               </div>
               {detailData.electronicInvoice && (
                 <div className="mt-4 rounded-md border bg-muted/20 p-3 text-sm space-y-2">
                   <div className="font-medium">{t('erp.electronicInvoicing.title', 'Electronic invoicing')}</div>
                   <div className="flex flex-wrap gap-x-5 gap-y-1">
                     <span>{t('erp.common.status', 'Status')}: {detailData.electronicInvoice.status}</span>
                     {detailData.electronicInvoice.cufe && <span>{t('erp.electronicInvoicing.identifiers.cufe', 'CUFE')}: <code>{detailData.electronicInvoice.cufe}</code></span>}
                     {detailData.electronicInvoice.cuv && <span>{t('erp.electronicInvoicing.identifiers.cuv', 'CUV')}: <code>{detailData.electronicInvoice.cuv}</code></span>}
                     {detailData.electronicInvoice.qrCodeText && <a className="text-primary underline" href={detailData.electronicInvoice.qrCodeText} target="_blank" rel="noreferrer">{t('erp.electronicInvoicing.verify', 'Verify')}</a>}
                   </div>
                   {Array.isArray(detailData.electronicInvoice.errors) && detailData.electronicInvoice.errors.length > 0 && <ul className="list-disc pl-5 text-destructive">{detailData.electronicInvoice.errors.map((error, index) => <li key={index}>{String(error)}</li>)}</ul>}
                 </div>
               )}

               <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handlePrintInvoice()}
                  disabled={
                    invoiceTemplateSettingsQuery.isError || !invoiceTemplateSettingsQuery.data
                  }
                >
                  {t('erp.invoices.actions.printInvoice', 'Print invoice')}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void handleDownloadInvoicePdf()}>
                  <Download className="h-4 w-4 mr-1" />
                  {t('erp.invoices.actions.downloadPdf', 'Download PDF')}
                </Button>
              </div>

              {detailData.invoice.paymentToken &&
              ['sent', 'partially_paid', 'overdue'].includes(detailData.invoice.status) &&
              Number(detailData.invoice.amountDue) > 0 ? (
                <div className="mt-4 rounded-md border p-3 space-y-2">
                  <div className="text-sm font-medium">
                    {t('erp.invoices.paymentLinks.title', 'Customer payment links')}
                  </div>
                  <div className="space-y-1">
                    {enabledPaymentMethods
                      .filter((m) => !['cash', 'check', 'credit_card', 'debit_card', 'other'].includes(m.id))
                      .map((m) => {
                        const slug = m.id === 'bank_transfer' ? 'bank-transfer' : m.id;
                        const url = `${window.location.origin}/api/erp/public/invoices/${detailData.invoice.paymentToken}/checkout/${slug}`;
                        return (
                          <div key={m.id} className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-medium">{m.name}:</span>
                            <code className="break-all text-muted-foreground">{url}</code>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => {
                                void navigator.clipboard.writeText(url);
                                toast({ title: t('erp.invoices.paymentLinks.copied', 'Payment link copied') });
                              }}
                            >
                              {t('ui.common.copy', 'Copy')}
                            </Button>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : null}

              {canManage && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {detailData.invoice.status === 'draft' && supportsInvoiceWorkflow(detailData.invoice.type) && (
                    <Button type="button" size="sm" onClick={() => sendMutation.mutate(detailData.invoice.id)} disabled={sendMutation.isPending}>
                      {t('erp.invoices.actions.send', 'Send')}
                    </Button>
                  )}
                  {canVoidInvoice && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => voidMutation.mutate(detailData.invoice.id)}
                      disabled={voidMutation.isPending}
                    >
                      {t('erp.invoices.actions.void', 'Void')}
                    </Button>
                  )}
                  {canCancelInvoice && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => cancelMutation.mutate(detailData.invoice.id)}
                      disabled={cancelMutation.isPending}
                    >
                      {t('ui.common.cancel', 'Cancel')}
                    </Button>
                  )}
                  {detailData.invoice.status === 'draft' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteMutation.mutate(detailData.invoice.id)}
                      disabled={deleteMutation.isPending}
                    >
                      {t('erp.common.delete', 'Delete')}
                    </Button>
                  )}
                  {canRecordPayment && (
                    <Button type="button" size="sm" variant="secondary" onClick={openRecordPaymentDialog}>
                      {t('erp.invoices.actions.recordPayment', 'Record payment')}
                    </Button>
                  )}
                  {canManage && supportsInvoiceWorkflow(detailData.invoice.type) && detailData.invoice.status !== 'draft' && (
                    <>
                      <Button type="button" size="sm" variant="outline" onClick={handleIssueCreditNote}>
                        {t('erp.invoices.actions.issueCreditNote', 'Issue credit note')}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={handleIssueDebitNote}>
                        {t('erp.invoices.actions.issueDebitNote', 'Issue debit note')}
                      </Button>
                    </>
                  )}
                  {isRestaurant && detailData.invoice.status === 'draft' && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setSplitBillOpen(true)}>
                      {t('erp.invoices.splitBill', 'Split bill')}
                    </Button>
                  )}
                </div>
              )}

              {!supportsInvoiceWorkflow(detailData.invoice.type) && (
                <div className="mt-4 text-sm text-muted-foreground">
                  {t('erp.invoices.unsupportedWorkflow', '{{type}} invoices are not yet supported for send and payment workflows.', { type: typeLabel(detailData.invoice.type, t) })}
                </div>
              )}

              {!canManage && canRecordPayment && (
                <div className="mt-4">
                  <Button type="button" size="sm" onClick={openRecordPaymentDialog}>
                    {t('erp.invoices.actions.recordPayment', 'Record payment')}
                  </Button>
                </div>
              )}

              <Tabs defaultValue="lines" className="mt-6">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="lines">{t('erp.invoices.tabs.lineItems', 'Line items')}</TabsTrigger>
                  <TabsTrigger value="payments">{t('erp.invoices.tabs.payments', 'Payments')}</TabsTrigger>
                  <TabsTrigger value="related">{t('erp.invoices.tabs.related', 'Related')}</TabsTrigger>
                </TabsList>
                <TabsContent value="lines" className="space-y-4 mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('erp.common.product', 'Product')}</TableHead>
                        <TableHead className="text-right">{t('erp.common.qty', 'Qty')}</TableHead>
                        <TableHead className="text-right">{t('erp.common.price', 'Price')}</TableHead>
                        <TableHead className="text-right">{t('erp.purchaseOrders.lineItems.line', 'Line')}</TableHead>
                        {canManage && <TableHead className="w-[100px]" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailData.items.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={canManage ? 5 : 4} className="text-muted-foreground text-center py-6">
                            {t('erp.purchaseOrders.lineItems.empty', 'No lines')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        detailData.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div className="text-sm">
                                {item.productId != null
                                  ? products.find((p) => p.id === item.productId)?.name ?? `#${item.productId}`
                                  : item.description || '—'}
                              </div>
                              {item.description && item.productId != null && (
                                <div className="text-xs text-muted-foreground">{item.description}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{item.quantity}</TableCell>
                            <TableCell className="text-right">{item.unitPrice}</TableCell>
                            <TableCell className="text-right">{item.lineTotal}</TableCell>
                            {canManage && canEditLines(detailData.invoice.status) && (
                              <TableCell className="text-right space-x-1">
                                <Button type="button" variant="ghost" size="icon" onClick={() => startEditLine(item)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    deleteLineMutation.mutate({ invoiceId: detailData.invoice.id, itemId: item.id })
                                  }
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>

                  {canManage && canEditLines(detailData.invoice.status) && (
                    <div className="rounded-md border p-3 space-y-2 bg-muted/20">
                      <div className="text-sm font-medium">{editingItemId ? t('erp.invoices.lineItems.editLine', 'Edit line') : t('erp.invoices.lineItems.addLine', 'Add line')}</div>
                      <Select value={lineProductId || '__none__'} onValueChange={(v) => onPickProduct(v === '__none__' ? '' : v)}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('erp.common.product', 'Product')} />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          <SelectItem value="__none__">{t('erp.common.none', 'None')}</SelectItem>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder={t('erp.common.qty', 'Qty')} value={lineQty} onChange={(e) => setLineQty(e.target.value)} />
                        <Input placeholder={t('erp.common.unitPrice', 'Unit price')} value={lineUnitPrice} onChange={(e) => setLineUnitPrice(e.target.value)} />
                      </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex gap-2 items-end min-w-0">
                <Select
                  value={lineDiscType}
                  onValueChange={(v) => setLineDiscType(v as 'percentage' | 'fixed_amount')}
                >
                  <SelectTrigger className="w-[130px] shrink-0 h-9">
                    <SelectValue placeholder={t('erp.common.discountType', 'Discount type')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">
                      {t('erp.common.discountTypePercentage', 'Percentage (%)')}
                    </SelectItem>
                    <SelectItem value="fixed_amount">
                      {t('erp.common.discountTypeFixed', 'Fixed amount')}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="min-w-0 h-9"
                  placeholder={
                    lineDiscType === 'percentage'
                      ? t('erp.common.discountPercent', 'Discount %')
                      : t('erp.common.discountAmountLabel', 'Discount amount')
                  }
                  value={lineDisc}
                  onChange={(e) => setLineDisc(e.target.value)}
                />
              </div>
              <Input placeholder={t('erp.common.taxPercent', 'Tax %')} value={lineTax} onChange={(e) => setLineTax(e.target.value)} />
            </div>
                      <Input placeholder={t('erp.common.description', 'Description')} value={lineDescription} onChange={(e) => setLineDescription(e.target.value)} />
                      <div className="flex gap-2">
                        {editingItemId ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                updateLineMutation.mutate({ invoiceId: detailData.invoice.id, itemId: editingItemId })
                              }
                              disabled={updateLineMutation.isPending}
                            >
                              {t('erp.invoices.lineItems.saveLine', 'Save line')}
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => setEditingItemId(null)}>
                              {t('ui.common.cancel', 'Cancel')}
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => addLineMutation.mutate(detailData.invoice.id)}
                            disabled={addLineMutation.isPending}
                          >
                            {t('erp.invoices.lineItems.addLine', 'Add line')}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="payments" className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('erp.common.date', 'Date')}</TableHead>
                        <TableHead className="text-right">{t('erp.invoices.payment.amount', 'Amount')}</TableHead>
                        <TableHead>{t('erp.invoices.payment.method', 'Method')}</TableHead>
                        <TableHead>{t('erp.invoices.payment.reference', 'Reference')}</TableHead>
                        {canPay && <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailData.payments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={canPay ? 5 : 4} className="text-center text-muted-foreground py-6">
                            {t('erp.invoices.payment.empty', 'No payments recorded')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        detailData.payments.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>
                              {p.paymentDate ? new Date(p.paymentDate).toLocaleString() : '—'}
                            </TableCell>
                            <TableCell className="text-right">{p.amount}</TableCell>
                            <TableCell>{p.paymentMethod ?? '—'}</TableCell>
                            <TableCell>
                              {p.referenceNumber ? (
                                isLikelyMediaReference(p.referenceNumber) && isLikelyImageReference(p.referenceNumber) ? (
                                  <button
                                    type="button"
                                    className="inline-flex items-center rounded border border-border p-0.5 hover:bg-muted"
                                    onClick={() => setPreviewReferenceImageUrl(p.referenceNumber!)}
                                    title={t('erp.invoices.payment.previewReference', 'Preview reference image')}
                                  >
                                    <img
                                      src={resolveMediaUrl(p.referenceNumber)}
                                      alt={t('erp.invoices.payment.referenceImageAlt', 'Payment reference')}
                                      className="h-10 w-10 rounded object-cover"
                                    />
                                  </button>
                                ) : (
                                  p.referenceNumber
                                )
                              ) : '—'}
                            </TableCell>
                            {canPay && (
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setEditingPaymentId(p.id);
                                    setPayAmount(String(p.amount ?? ''));
                                    setPayDate(
                                      p.paymentDate
                                        ? new Date(p.paymentDate).toISOString().slice(0, 16)
                                        : ''
                                    );
                                    setPayMethod(p.paymentMethod ?? '');
                                    setPayRef(p.referenceNumber ?? '');
                                    setPayNotes(p.notes ?? '');
                                    setPaymentOpen(true);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>
                <TabsContent value="related" className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('erp.invoices.table.invoiceNumber', 'Invoice #')}</TableHead>
                        <TableHead>{t('erp.common.type', 'Type')}</TableHead>
                        <TableHead>{t('erp.invoices.table.issue', 'Issue')}</TableHead>
                        <TableHead className="text-right">{t('erp.common.total', 'Total')}</TableHead>
                        <TableHead>{t('erp.common.status', 'Status')}</TableHead>
                        <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailData.relatedNotes?.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                            {t('erp.invoices.related.empty', 'No related documents')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        detailData.relatedNotes?.map((n) => (
                          <TableRow key={n.id}>
                            <TableCell className="font-medium">{n.invoiceNumber}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {typeLabel(n.type, t)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{formatBusinessDate(n.issueDate)}</TableCell>
                            <TableCell className="text-right">
                              {n.currency || baseCurrencyCode}{' '}
                              {Number(n.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell>
                              <Badge className={statusBadgeClass(n.status)} variant="secondary">
                                {n.status.replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setDetailId(n.id)}
                              >
                                {t('erp.common.view', 'View')}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!previewReferenceImageUrl} onOpenChange={(open) => !open && setPreviewReferenceImageUrl(null)}>
        <DialogContent className="max-w-3xl">
          {previewReferenceImageUrl && (
            <div className="max-h-[75vh] overflow-auto">
              <img
                src={resolveMediaUrl(previewReferenceImageUrl)}
                alt={t('erp.invoices.payment.referenceImagePreviewAlt', 'Payment reference preview')}
                className="w-full h-auto object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={splitBillOpen} onOpenChange={setSplitBillOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('erp.invoices.splitBill', 'Split bill')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-auto">
            {(detailData?.items ?? []).map((item) => (
              <div key={item.id} className="grid grid-cols-2 gap-2 items-center">
                <div className="text-sm">{item.description || `Item #${item.id}`}</div>
                <Input
                  placeholder={t('erp.invoices.seatLabel', 'Seat label')}
                  value={splitMap[item.id] ?? ''}
                  onChange={(e) => setSplitMap((prev) => ({ ...prev, [item.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplitBillOpen(false)}>{t('erp.common.cancel', 'Cancel')}</Button>
            <Button onClick={() => splitInvoiceMutation.mutate()} disabled={splitInvoiceMutation.isPending}>
              {t('erp.invoices.createSplitInvoices', 'Create split invoices')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {printTemplateType && detailForPrint ? (
        <div className="invoice-print-root no-screen" aria-hidden>
          <InvoicePrintTemplate
            templateType={printTemplateType}
            settings={invoiceTemplateSettingsForPrint}
            invoice={detailForPrint.invoice}
            items={detailForPrint.items}
            payments={detailForPrint.payments}
            contactName={
              detailForPrint.invoice.contactId != null
                ? contactNameById.get(detailForPrint.invoice.contactId) ??
                  t('erp.invoices.fallback.contactById', 'Contact #{{id}}', {
                    id: String(detailForPrint.invoice.contactId),
                  })
                : t('erp.invoicePrint.placeholder.dash', '—')
            }
            supplierName={
              detailForPrint.invoice.supplierId != null
                ? supplierNameById.get(detailForPrint.invoice.supplierId) ??
                  t('erp.invoices.fallback.supplierById', 'Supplier #{{id}}', {
                    id: String(detailForPrint.invoice.supplierId),
                  })
                : t('erp.invoicePrint.placeholder.dash', '—')
            }
            companyName={company?.name ?? ''}
            productNameById={productNameById}
            language={currentLanguage?.code ?? 'en'}
            t={t}
          />
        </div>
      ) : null}
    </div>
  );
}
