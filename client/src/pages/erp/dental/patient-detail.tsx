import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'wouter';
import { DentalShellPage } from './dental-shell';
import { useTranslation } from '@/hooks/use-translation';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { DENTAL_CLINICAL_DOCUMENT_CATEGORIES, DENTAL_CLINICAL_NOTE_TYPES } from '@shared/dental-clinical';
import { cn } from '@/lib/utils';
import { ClinicalTimelineList } from '@/components/erp/dental/ClinicalTimelineList';
import { RecentDocumentsList } from '@/components/erp/dental/RecentDocumentsList';
import {
  AllergiesSelector,
  normalizeAllergiesField,
  parseAllergyPartsForAlerts,
} from '@/components/erp/dental/AllergiesSelector';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { ToothIcon } from '@/components/erp/dental/ToothIcon';
import {
  Activity,
  AlertTriangle,
  AlignLeft,
  ArrowLeft,
  Cake,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Contact,
  DollarSign,
  Droplets,
  ExternalLink,
  FileText,
  FolderOpen,
  HeartPulse,
  History,
  Hourglass,
  Loader2,
  Mail,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Phone,
  Pill,
  Plus,
  Receipt,
  Save,
  Smile,
  StickyNote,
  Tag,
  Trash2,
  Upload,
  UserMinus,
  UserRound,
  Users,
} from 'lucide-react';

const SEX_OPTIONS = ['Male', 'Female', 'Other'] as const;
type SexOption = (typeof SEX_OPTIONS)[number];

const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

type PatientDetail = {
  id: number;
  contactId: number;
  dateOfBirth: string | null;
  sex: string | null;
  allergies: string | null;
  bloodGroup: string | null;
  medicalHistorySummary: string | null;
  currentMedications: string | null;
  dentalHistorySummary: string | null;
  previousDentalTreatments: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  preferredProviderUserId: number | null;
  contact: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    tags: string[] | null;
    avatarUrl?: string | null;
  };
};

type ClinicalNote = {
  id: number;
  noteType: string;
  body: string;
  toothRefs: string[] | null;
  createdAt: string;
  updatedAt: string;
};

type TimelineEntry =
  | {
      kind: 'clinical_note';
      id: number;
      noteType: string;
      body: string;
      toothRefs: string[] | null;
      createdAt: string;
      updatedAt: string;
    }
  | {
      kind: 'chart_snapshot';
      id: number;
      version: number;
      numberingSystem: string;
      createdAt: string;
    };

type ClinicalDocument = {
  id: number;
  originalName: string;
  category: string;
  description: string | null;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  createdAt: string;
};

type ChartHistoryEntry = {
  id: number;
  version: number;
  numberingSystem: string;
  createdBy: number | null;
  createdAt: string;
};

type ScheduleAppointment = {
  id: number;
  contactId: number;
  title: string;
  scheduledAt: string;
  durationMinutes: number | null;
  type: string;
  status: string;
  providerName: string | null;
  chairName: string | null;
};

type TreatmentPlanSummary = {
  id: number;
  title: string;
  status: string;
  currency: string;
  estimatedTotal: string;
  procedureCount: number;
  updatedAt: string;
};

type TreatmentProcedure = {
  id: number;
  status: string;
};

type TreatmentPlanDetail = TreatmentPlanSummary & {
  procedures: TreatmentProcedure[];
};

type InvoiceSummary = {
  id: number;
  invoiceNumber: string;
  status: string;
  type: string;
  currency: string | null;
  amountDue: string;
  totalAmount: string;
};

type ProfileForm = {
  dateOfBirth: string;
  sexOption: SexOption | '';
  sexOtherDetail: string;
  bloodGroup: string;
  allergies: string;
  medicalHistorySummary: string;
  currentMedications: string;
  dentalHistorySummary: string;
  previousDentalTreatments: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

type NoteForm = {
  noteType: (typeof DENTAL_CLINICAL_NOTE_TYPES)[number];
  body: string;
  toothRefs: string;
};

type TabKey = 'profile' | 'notes' | 'documents' | 'timeline' | 'history';

function emptyForm(): ProfileForm {
  return {
    dateOfBirth: '',
    sexOption: '',
    sexOtherDetail: '',
    bloodGroup: '',
    allergies: '',
    medicalHistorySummary: '',
    currentMedications: '',
    dentalHistorySummary: '',
    previousDentalTreatments: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
  };
}

function parseSex(stored: string | null | undefined): Pick<ProfileForm, 'sexOption' | 'sexOtherDetail'> {
  const value = (stored ?? '').trim();
  if (!value) return { sexOption: '', sexOtherDetail: '' };
  if (value === 'Male' || value === 'Female') return { sexOption: value, sexOtherDetail: '' };
  if (value === 'Other') return { sexOption: 'Other', sexOtherDetail: '' };
  const emDash = value.match(/^Other\s*[—–-]\s*(.+)$/i);
  if (emDash) return { sexOption: 'Other', sexOtherDetail: emDash[1].trim() };
  // Legacy free-text values land under Other + specify
  return { sexOption: 'Other', sexOtherDetail: value };
}

function composeSex(sexOption: SexOption | '', sexOtherDetail: string): string | null {
  if (!sexOption) return null;
  if (sexOption !== 'Other') return sexOption;
  const detail = sexOtherDetail.trim();
  return detail ? `Other — ${detail}` : 'Other';
}

function emptyNoteForm(): NoteForm {
  return { noteType: 'note', body: '', toothRefs: '' };
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatDateShort(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTimeShort(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatTimelineDateHeader(
  value: string,
  t: (key: string, fallback: string) => string,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return t('erp.dental.clinical.timeline.today', 'Today');
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function parseLocalDateInput(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = parseLocalDateInput(dob);
  if (!birth) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 && age < 200 ? age : null;
}

function dobFromAge(age: number): string {
  const now = new Date();
  const birth = new Date(now.getFullYear() - age, now.getMonth(), now.getDate());
  const yyyy = birth.getFullYear();
  const mm = String(birth.getMonth() + 1).padStart(2, '0');
  const dd = String(birth.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatPatientId(id: number): string {
  return `P-${String(id).padStart(5, '0')}`;
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function parseToothRefs(value: string): string[] | null {
  const refs = value
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return refs.length > 0 ? refs : null;
}

function clinicalCategoryLabel(category: string, t: (key: string, fallback: string) => string) {
  const labels: Record<string, string> = {
    xray: t('erp.dental.clinical.category.xray', 'X-ray'),
    cbct: t('erp.dental.clinical.category.cbct', 'CBCT'),
    intraoral: t('erp.dental.clinical.category.intraoral', 'Intraoral photo'),
    consent: t('erp.dental.clinical.category.consent', 'Consent'),
    clinical_report: t('erp.dental.clinical.category.clinicalReport', 'Clinical report'),
    before_after: t('erp.dental.clinical.category.beforeAfter', 'Before / after'),
  };
  return labels[category] ?? category;
}

function clinicalCategoryTagLabel(category: string, t: (key: string, fallback: string) => string) {
  const labels: Record<string, string> = {
    xray: t('erp.dental.clinical.categoryTag.xray', 'X-Ray'),
    cbct: t('erp.dental.clinical.categoryTag.cbct', 'CBCT'),
    intraoral: t('erp.dental.clinical.categoryTag.intraoral', 'Photo'),
    consent: t('erp.dental.clinical.categoryTag.consent', 'Form'),
    clinical_report: t('erp.dental.clinical.categoryTag.clinicalReport', 'Report'),
    before_after: t('erp.dental.clinical.categoryTag.beforeAfter', 'Photo'),
  };
  return labels[category] ?? clinicalCategoryLabel(category, t);
}

function formatDocumentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function noteTypeLabel(noteType: string, t: (key: string, fallback: string) => string) {
  const labels: Record<string, string> = {
    note: t('erp.dental.clinical.noteType.note', 'Note'),
    diagnosis: t('erp.dental.clinical.noteType.diagnosis', 'Diagnosis'),
    observation: t('erp.dental.clinical.noteType.observation', 'Observation'),
  };
  return labels[noteType] ?? noteType;
}

function planStatusLabel(status: string, t: (key: string, fallback: string) => string) {
  const labels: Record<string, string> = {
    planned: t('erp.dental.treatmentPlans.status.planned', 'Planned'),
    in_progress: t('erp.dental.treatmentPlans.status.inProgress', 'In progress'),
    quoted: t('erp.dental.treatmentPlans.status.quoted', 'Quoted'),
    approved: t('erp.dental.treatmentPlans.status.approved', 'Approved'),
    invoiced: t('erp.dental.treatmentPlans.status.invoiced', 'Invoiced'),
    completed: t('erp.dental.treatmentPlans.status.completed', 'Completed'),
    cancelled: t('erp.dental.treatmentPlans.status.cancelled', 'Cancelled'),
  };
  return labels[status] ?? status;
}

/** Pick the most relevant plan for the summary card: in-progress first, else most recently updated non-cancelled. */
function pickActivePlan(plans: TreatmentPlanSummary[]): TreatmentPlanSummary | null {
  if (plans.length === 0) return null;
  const active = [...plans]
    .filter((p) => p.status !== 'cancelled')
    .sort((a, b) => {
      const aInProgress = a.status === 'in_progress' ? 1 : 0;
      const bInProgress = b.status === 'in_progress' ? 1 : 0;
      if (aInProgress !== bInProgress) return bInProgress - aInProgress;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  return active[0] ?? null;
}

export default function DentalPatientDetailPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { PERMISSIONS, hasPermission } = usePermissions();
  const canManage = hasPermission(PERMISSIONS.MANAGE_DENTAL_PATIENTS);
  const canEditNotes = hasPermission(PERMISSIONS.EDIT_DENTAL_CHART);
  const canViewImaging = hasPermission(PERMISSIONS.VIEW_DENTAL_IMAGING) || hasPermission(PERMISSIONS.MANAGE_DENTAL_IMAGING);
  const canManageImaging = hasPermission(PERMISSIONS.MANAGE_DENTAL_IMAGING);
  const canViewChart = hasPermission(PERMISSIONS.VIEW_DENTAL_CHART) || canEditNotes;
  const canViewSchedule =
    hasPermission(PERMISSIONS.VIEW_DENTAL_SCHEDULE) || hasPermission(PERMISSIONS.MANAGE_DENTAL_SCHEDULE);
  const canViewTreatmentPlans =
    hasPermission(PERMISSIONS.VIEW_DENTAL_TREATMENT_PLANS) ||
    hasPermission(PERMISSIONS.MANAGE_DENTAL_TREATMENT_PLANS);
  const canViewInvoices =
    hasPermission(PERMISSIONS.VIEW_INVOICES) || hasPermission(PERMISSIONS.MANAGE_INVOICES);

  const queryClient = useQueryClient();
  const params = useParams<{ contactId: string }>();
  const [, setLocation] = useLocation();
  const contactId = Number(params.contactId);
  const contactIdValid = Number.isFinite(contactId) && contactId > 0;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('profile');
  const [form, setForm] = useState<ProfileForm>(emptyForm());
  const [noteForm, setNoteForm] = useState<NoteForm>(emptyNoteForm());
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [docCategory, setDocCategory] = useState<string>(DENTAL_CLINICAL_DOCUMENT_CATEGORIES[0]);
  const [docDescription, setDocDescription] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);

  const patientQuery = useQuery({
    queryKey: ['/api/erp/dental/patients', contactId],
    enabled: contactIdValid,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dental/patients/${contactId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Patient not found');
      return json.data as PatientDetail;
    },
  });

  const timelineQuery = useQuery({
    queryKey: ['/api/erp/dental/patients', contactId, 'timeline'],
    enabled: contactIdValid && canViewChart,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dental/patients/${contactId}/timeline`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load timeline');
      return json.data as TimelineEntry[];
    },
  });

  const documentsQuery = useQuery({
    queryKey: ['/api/erp/dental/patients', contactId, 'clinical-documents'],
    enabled: contactIdValid && canViewImaging,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dental/patients/${contactId}/clinical-documents`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load clinical documents');
      return json.data as ClinicalDocument[];
    },
  });

  const chartHistoryQuery = useQuery({
    queryKey: ['/api/erp/dental/patients', contactId, 'chart-history'],
    enabled: contactIdValid && canViewChart,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dental/patients/${contactId}/chart/history`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load chart history');
      return json.data as ChartHistoryEntry[];
    },
  });

  const scheduleQuery = useQuery({
    queryKey: ['/api/erp/dental/schedule', 'patient', contactId],
    enabled: contactIdValid && canViewSchedule,
    queryFn: async () => {
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setFullYear(to.getFullYear() + 2);
      const fromStr = from.toISOString().slice(0, 10);
      const toStr = to.toISOString().slice(0, 10);
      const res = await apiRequest('GET', `/api/erp/dental/schedule?from=${fromStr}&to=${toStr}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load schedule');
      return json.data as ScheduleAppointment[];
    },
  });

  const treatmentPlansQuery = useQuery({
    queryKey: ['/api/erp/dental/treatment-plans', 'patient', contactId],
    enabled: contactIdValid && canViewTreatmentPlans,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dental/treatment-plans?contactId=${contactId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load treatment plans');
      return (json.data?.data ?? []) as TreatmentPlanSummary[];
    },
  });

  const activePlan = useMemo(
    () => pickActivePlan(treatmentPlansQuery.data ?? []),
    [treatmentPlansQuery.data],
  );

  const activePlanDetailQuery = useQuery({
    queryKey: ['/api/erp/dental/treatment-plans', 'detail', activePlan?.id],
    enabled: contactIdValid && canViewTreatmentPlans && !!activePlan,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dental/treatment-plans/${activePlan!.id}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load treatment plan');
      return json.data as TreatmentPlanDetail;
    },
  });

  const invoicesQuery = useQuery({
    queryKey: ['/api/erp/invoices', 'patient', contactId],
    enabled: contactIdValid && canViewInvoices,
    queryFn: async () => {
      const res = await apiRequest(
        'GET',
        `/api/erp/invoices?contactId=${contactId}&type=sales_invoice`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load invoices');
      return (json.data?.data ?? []) as InvoiceSummary[];
    },
  });

  useEffect(() => {
    const patient = patientQuery.data;
    if (!patient) return;
    const sex = parseSex(patient.sex);
    setForm({
      dateOfBirth: patient.dateOfBirth ?? '',
      sexOption: sex.sexOption,
      sexOtherDetail: sex.sexOtherDetail,
      bloodGroup: patient.bloodGroup ?? '',
      allergies: normalizeAllergiesField(patient.allergies),
      medicalHistorySummary: patient.medicalHistorySummary ?? '',
      currentMedications: patient.currentMedications ?? '',
      dentalHistorySummary: patient.dentalHistorySummary ?? '',
      previousDentalTreatments: patient.previousDentalTreatments ?? '',
      emergencyContactName: patient.emergencyContactName ?? '',
      emergencyContactPhone: patient.emergencyContactPhone ?? '',
    });
  }, [patientQuery.data]);

  const invalidateClinical = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients', contactId, 'timeline'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients', contactId, 'clinical-notes'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients', contactId, 'clinical-documents'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.sexOption) {
        throw new Error(t('erp.dental.patients.fields.sexRequired', 'Sex is required'));
      }
      const res = await apiRequest('PATCH', `/api/erp/dental/patients/${contactId}`, {
        dateOfBirth: form.dateOfBirth || null,
        sex: composeSex(form.sexOption, form.sexOtherDetail),
        bloodGroup: form.bloodGroup || null,
        allergies: form.allergies || null,
        medicalHistorySummary: form.medicalHistorySummary || null,
        currentMedications: form.currentMedications || null,
        dentalHistorySummary: form.dentalHistorySummary || null,
        previousDentalTreatments: form.previousDentalTreatments || null,
        emergencyContactName: form.emergencyContactName || null,
        emergencyContactPhone: form.emergencyContactPhone || null,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to save profile');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients', contactId] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients'] });
      toast({ title: t('erp.dental.patients.saved', 'Patient profile saved') });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const saveNoteMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        noteType: noteForm.noteType,
        body: noteForm.body,
        toothRefs: parseToothRefs(noteForm.toothRefs),
      };
      const url = editingNoteId
        ? `/api/erp/dental/patients/${contactId}/clinical-notes/${editingNoteId}`
        : `/api/erp/dental/patients/${contactId}/clinical-notes`;
      const res = await apiRequest(editingNoteId ? 'PATCH' : 'POST', url, payload);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to save clinical note');
      return json.data as ClinicalNote;
    },
    onSuccess: () => {
      setNoteForm(emptyNoteForm());
      setEditingNoteId(null);
      invalidateClinical();
      toast({ title: t('erp.dental.clinical.noteSaved', 'Clinical note saved') });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: number) => {
      const res = await apiRequest('DELETE', `/api/erp/dental/patients/${contactId}/clinical-notes/${noteId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to delete clinical note');
    },
    onSuccess: () => {
      invalidateClinical();
      toast({ title: t('erp.dental.clinical.noteDeleted', 'Clinical note deleted') });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const uploadDocMutation = useMutation({
    mutationFn: async () => {
      if (!docFile) throw new Error('No file selected');
      const formData = new FormData();
      formData.append('document', docFile);
      formData.append('category', docCategory);
      if (docDescription.trim()) formData.append('description', docDescription.trim());
      const res = await apiRequest('POST', `/api/contacts/${contactId}/documents`, formData);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to upload document');
      return json;
    },
    onSuccess: () => {
      setDocFile(null);
      setDocDescription('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      invalidateClinical();
      toast({ title: t('erp.dental.clinical.documentUploaded', 'Clinical document uploaded') });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const res = await apiRequest('DELETE', `/api/contacts/${contactId}/documents/${documentId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to delete document');
    },
    onSuccess: () => {
      invalidateClinical();
      toast({ title: t('erp.dental.clinical.documentDeleted', 'Clinical document deleted') });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const removePatientMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', `/api/erp/dental/patients/${contactId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to remove patient');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients'] });
      toast({ title: t('erp.dental.patients.removed', 'Patient removed') });
      setLocation('/erp/dental/patients');
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const patient = patientQuery.data;
  const timeline = timelineQuery.data ?? [];

  const clinicalTimelineItems = useMemo(() => {
    type RawEvent = {
      key: string;
      when: string;
      description: string;
      subDescription?: string | null;
    };
    const events: RawEvent[] = [];

    for (const entry of timeline) {
      if (entry.kind === 'clinical_note') {
        events.push({
          key: `note-${entry.id}`,
          when: entry.createdAt,
          description: t('erp.dental.clinical.timeline.noteAdded', 'Clinical note added'),
        });
      } else {
        events.push({
          key: `chart-${entry.id}`,
          when: entry.createdAt,
          description: t('erp.dental.clinical.timeline.chartSaved', 'Chart snapshot saved'),
          subDescription: t('erp.dental.clinical.timeline.versionLabel', 'Version {{version}}', {
            version: entry.version,
          }),
        });
      }
    }

    if (canViewTreatmentPlans) {
      for (const plan of treatmentPlansQuery.data ?? []) {
        events.push({
          key: `plan-${plan.id}-${plan.updatedAt}`,
          when: plan.updatedAt,
          description: t('erp.dental.clinical.timeline.planUpdated', 'Treatment plan updated'),
        });
      }
    }

    if (canViewSchedule) {
      for (const appt of scheduleQuery.data ?? []) {
        if (appt.contactId === contactId && appt.status === 'completed') {
          events.push({
            key: `appt-${appt.id}`,
            when: appt.scheduledAt,
            description: t('erp.dental.clinical.timeline.appointmentCompleted', 'Appointment completed'),
          });
        }
      }
    }

    return events
      .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
      .map((event) => ({
        key: event.key,
        dateLabel: formatTimelineDateHeader(event.when, t),
        timeLabel: formatTimeShort(event.when),
        description: event.description,
        subDescription: event.subDescription ?? null,
      }));
  }, [
    timeline,
    t,
    canViewTreatmentPlans,
    treatmentPlansQuery.data,
    canViewSchedule,
    scheduleQuery.data,
    contactId,
  ]);

  const latestNote = useMemo(() => {
    const notes = timeline.filter(
      (e): e is Extract<TimelineEntry, { kind: 'clinical_note' }> => e.kind === 'clinical_note',
    );
    if (notes.length === 0) return null;
    return [...notes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }, [timeline]);

  const alerts = useMemo(() => parseAllergyPartsForAlerts(patient?.allergies), [patient?.allergies]);

  const recentDocuments = useMemo(() => (documentsQuery.data ?? []).slice(0, 3), [documentsQuery.data]);

  const recentDocumentItems = useMemo(
    () =>
      recentDocuments.map((doc) => ({
        key: String(doc.id),
        href: doc.fileUrl,
        title: `${clinicalCategoryLabel(doc.category, t)} (${formatDocumentDate(doc.createdAt)})`,
        tag: clinicalCategoryTagLabel(doc.category, t),
      })),
    [recentDocuments, t],
  );

  const nextAppointment = useMemo(() => {
    const list = scheduleQuery.data ?? [];
    const now = Date.now();
    return (
      list
        .filter(
          (appt) =>
            appt.contactId === contactId &&
            appt.status !== 'cancelled' &&
            new Date(appt.scheduledAt).getTime() >= now,
        )
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0] ?? null
    );
  }, [scheduleQuery.data, contactId]);

  const planProgress = useMemo(() => {
    const detail = activePlanDetailQuery.data;
    if (!detail || detail.procedures.length === 0) return null;
    const total = detail.procedures.length;
    const completed = detail.procedures.filter((p) => p.status === 'completed').length;
    return { total, completed, percent: Math.round((completed / total) * 100) };
  }, [activePlanDetailQuery.data]);

  const outstandingBalance = useMemo(() => {
    const list = invoicesQuery.data ?? [];
    const relevant = list.filter((inv) => inv.status !== 'cancelled' && inv.status !== 'void');
    if (relevant.length === 0) return null;
    const total = relevant.reduce((sum, inv) => sum + Number(inv.amountDue || 0), 0);
    const currency = relevant.find((inv) => inv.currency)?.currency ?? 'USD';
    return { total, currency, count: relevant.length };
  }, [invoicesQuery.data]);

  const startEditNote = (note: ClinicalNote) => {
    setEditingNoteId(note.id);
    setActiveTab('notes');
    setNoteForm({
      noteType: (DENTAL_CLINICAL_NOTE_TYPES.includes(note.noteType as NoteForm['noteType'])
        ? note.noteType
        : 'note') as NoteForm['noteType'],
      body: note.body,
      toothRefs: note.toothRefs?.join(', ') ?? '',
    });
  };

  const clinicalNotes = useMemo(
    () =>
      timeline.filter(
        (e): e is Extract<TimelineEntry, { kind: 'clinical_note' }> => e.kind === 'clinical_note',
      ),
    [timeline],
  );

  const age = calcAge(patient?.dateOfBirth);
  const formAge = useMemo(() => calcAge(form.dateOfBirth), [form.dateOfBirth]);
  const sexLabel = patient?.sex ? parseSexLabel(patient.sex, t) : null;

  return (
    <DentalShellPage
      title={patient?.contact.name ?? t('erp.dental.patients.detailTitle', 'Patient')}
      description={t(
        'erp.dental.patients.detailDescription',
        'Clinical profile, timeline, and documents for this patient.',
      )}
    >
      {patientQuery.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('erp.common.loading', 'Loading...')}
        </div>
      ) : patientQuery.isError ? (
        <p className="text-sm text-destructive">{(patientQuery.error as Error).message}</p>
      ) : patient ? (
        <div className="space-y-4">
          {/* ---- Header ---- */}
          <Card>
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4 min-w-0">
                <ContactAvatar
                  contact={patient.contact}
                  size="lg"
                  showRefreshButton={false}
                  className="shrink-0"
                />
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold break-words">{patient.contact.name}</h2>
                    <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/10">
                      {t('erp.dental.patients.activePatient', 'Active Patient')}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">{formatPatientId(patient.id)}</span>
                    {sexLabel ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>{sexLabel}</span>
                      </>
                    ) : null}
                    {age != null ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>{t('erp.dental.patients.ageYears', '{{age}} yrs', { age })}</span>
                      </>
                    ) : null}
                    {formatDateShort(patient.dateOfBirth) ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          {t('erp.dental.patients.fields.dob', 'Date of birth')}:{' '}
                          {formatDateShort(patient.dateOfBirth)}
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {patient.contact.phone || t('erp.common.notSpecified', 'Not specified')}
                    </span>
                    <span className="inline-flex items-center gap-1 break-all">
                      <Mail className="h-3 w-3" /> {patient.contact.email || t('erp.common.notSpecified', 'Not specified')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 sm:justify-end">
                {canViewChart && (
                  <Button asChild size="sm">
                    <Link href={`/erp/dental/chart?contactId=${contactId}`} className="inline-flex items-center gap-1.5">
                      <ToothIcon className="h-4 w-4" />
                      {t('erp.dental.patients.openChart', 'Open chart')}
                    </Link>
                  </Button>
                )}
                {canViewTreatmentPlans && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/erp/dental/treatment-plans?contactId=${contactId}`} className="inline-flex items-center gap-1.5">
                      <ClipboardList className="h-4 w-4" />
                      {t('erp.dental.patients.openTreatmentPlans', 'Treatment plans')}
                    </Link>
                  </Button>
                )}
                {canViewSchedule && (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/erp/dental/schedule" className="inline-flex items-center gap-1.5">
                      <CalendarClock className="h-4 w-4" />
                      {t('erp.dental.patients.schedule', 'Schedule')}
                    </Link>
                  </Button>
                )}
                {canViewInvoices && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/erp/invoices?contactId=${contactId}`} className="inline-flex items-center gap-1.5">
                      <Receipt className="h-4 w-4" />
                      {t('erp.dental.patients.invoice', 'Invoice')}
                    </Link>
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="outline" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setLocation('/erp/dental/patients')}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      {t('erp.dental.patients.backToList', 'Back to patients')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation('/contacts')}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      {t('erp.dental.patients.openInContacts', 'Open in contacts')}
                    </DropdownMenuItem>
                    {canManage && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={removePatientMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                t(
                                  'erp.dental.patients.removeConfirm',
                                  'Remove this patient profile? The contact record is kept.',
                                ),
                              )
                            ) {
                              removePatientMutation.mutate();
                            }
                          }}
                        >
                          <UserMinus className="h-4 w-4 mr-2" />
                          {t('erp.dental.patients.removePatient', 'Remove patient')}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>

          {/* ---- 3-column body ---- */}
          <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_280px]">
            {/* Left rail */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t('erp.dental.patients.summary', 'Patient Summary')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <Phone className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <span className="break-all">{patient.contact.phone || t('erp.common.notSpecified', 'Not specified')}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Mail className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <span className="break-all">{patient.contact.email || t('erp.common.notSpecified', 'Not specified')}</span>
                  </div>
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <span className="mt-0.5 text-[11px] uppercase tracking-wide shrink-0">
                      {t('erp.dental.patients.address', 'Address')}
                    </span>
                    <span>{t('erp.common.notSpecified', 'Not specified')}</span>
                  </div>
                  {canManage && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-1 gap-1.5"
                      onClick={() => setActiveTab('profile')}
                    >
                      <Pencil className="h-4 w-4" />
                      {t('common.edit', 'Edit')}
                    </Button>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    {t('erp.dental.patients.alerts', 'Patient Alerts')}
                    {alerts.length > 0 && (
                      <Badge variant="destructive" className="ml-auto">{alerts.length}</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {alerts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t('erp.dental.patients.alertsEmpty', 'No active alerts.')}
                    </p>
                  ) : (
                    alerts.map((alert) => (
                      <div
                        key={alert}
                        className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                      >
                        {t('erp.dental.patients.allergyAlert', '{{name}} Allergy', { name: alert })}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {canViewChart && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      {t('erp.dental.clinical.timelineTitle', 'Clinical Timeline')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {timelineQuery.isLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('erp.common.loading', 'Loading...')}
                      </div>
                    ) : clinicalTimelineItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t('erp.dental.clinical.timelineEmptyShort', 'No recent events.')}
                      </p>
                    ) : (
                      <ClinicalTimelineList items={clinicalTimelineItems.slice(0, 4)} />
                    )}
                    {clinicalTimelineItems.length > 0 && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-4 w-full px-6 py-2.5 text-muted-foreground"
                        onClick={() => setActiveTab('timeline')}
                      >
                        {t('erp.dental.patients.viewFullTimeline', 'View full timeline')}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              {canViewImaging && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {t('erp.dental.patients.recentDocuments', 'Recent Documents')}
                    </CardTitle>
                    {(documentsQuery.data?.length ?? 0) > 0 && (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-sm text-primary"
                        onClick={() => setActiveTab('documents')}
                      >
                        {t('erp.dental.patients.viewAllDocuments', 'View all')}
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    {documentsQuery.isLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('erp.common.loading', 'Loading...')}
                      </div>
                    ) : recentDocumentItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t('erp.dental.clinical.documentsEmpty', 'No clinical documents uploaded yet.')}
                      </p>
                    ) : (
                      <RecentDocumentsList items={recentDocumentItems} />
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Center tabs */}
            <Card className="min-w-0">
              <CardContent className="p-4">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
                  <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
                    <TabsTrigger value="profile" className="gap-1.5 data-[state=active]:bg-muted">
                      <UserRound className="h-3.5 w-3.5" />
                      {t('erp.dental.patients.clinicalProfile', 'Clinical profile')}
                    </TabsTrigger>
                    {canViewChart && (
                      <TabsTrigger value="notes" className="gap-1.5 data-[state=active]:bg-muted">
                        <StickyNote className="h-3.5 w-3.5" />
                        {t('erp.dental.clinical.notesTab', 'Clinical Notes')}
                      </TabsTrigger>
                    )}
                    {canViewImaging && (
                      <TabsTrigger value="documents" className="gap-1.5 data-[state=active]:bg-muted">
                        <FileText className="h-3.5 w-3.5" />
                        {t('erp.dental.clinical.documentsTitle', 'Clinical documents')}
                      </TabsTrigger>
                    )}
                    {canViewChart && (
                      <TabsTrigger value="timeline" className="gap-1.5 data-[state=active]:bg-muted">
                        <Activity className="h-3.5 w-3.5" />
                        {t('erp.dental.clinical.timelineTitle', 'Clinical timeline')}
                      </TabsTrigger>
                    )}
                    {canViewChart && (
                      <TabsTrigger value="history" className="gap-1.5 data-[state=active]:bg-muted">
                        <History className="h-3.5 w-3.5" />
                        {t('erp.dental.patients.historyTab', 'History')}
                      </TabsTrigger>
                    )}
                  </TabsList>

                  {/* Clinical Profile */}
                  <TabsContent value="profile" className="mt-4 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Cake className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.dob', 'Date of birth')}
                        </Label>
                        <Input
                          type="date"
                          value={form.dateOfBirth}
                          disabled={!canManage}
                          onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Hourglass className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.age', 'Age')}
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          max={199}
                          inputMode="numeric"
                          value={formAge ?? ''}
                          disabled={!canManage}
                          placeholder="—"
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              setForm((f) => ({ ...f, dateOfBirth: '' }));
                              return;
                            }
                            const parsed = Number.parseInt(raw, 10);
                            if (Number.isNaN(parsed) || parsed < 0 || parsed > 199) return;
                            setForm((f) => ({ ...f, dateOfBirth: dobFromAge(parsed) }));
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.sex', 'Sex')}
                        </Label>
                        <Select
                          value={form.sexOption || undefined}
                          disabled={!canManage}
                          onValueChange={(value) =>
                            setForm((f) => ({
                              ...f,
                              sexOption: value as SexOption,
                              sexOtherDetail: value === 'Other' ? f.sexOtherDetail : '',
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('erp.dental.patients.fields.sexPlaceholder', 'Select…')} />
                          </SelectTrigger>
                          <SelectContent>
                            {SEX_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {t(`erp.dental.patients.fields.sex.${option.toLowerCase()}`, option)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {form.sexOption === 'Other' && (
                          <Input
                            value={form.sexOtherDetail}
                            disabled={!canManage}
                            onChange={(e) => setForm((f) => ({ ...f, sexOtherDetail: e.target.value }))}
                            placeholder={t('erp.dental.patients.fields.sexOtherPlaceholder', 'Please specify (optional)')}
                          />
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Droplets className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.bloodGroup', 'Blood group')}
                        </Label>
                        <Select
                          value={form.bloodGroup || undefined}
                          disabled={!canManage}
                          onValueChange={(value) => setForm((f) => ({ ...f, bloodGroup: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('erp.dental.patients.fields.bloodGroupPlaceholder', 'Select…')} />
                          </SelectTrigger>
                          <SelectContent>
                            {BLOOD_GROUP_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <AllergiesSelector
                      value={form.allergies}
                      disabled={!canManage}
                      t={t}
                      onChange={(allergies) => setForm((f) => ({ ...f, allergies }))}
                    />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <HeartPulse className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.medicalHistory', 'Medical history summary')}
                        </Label>
                        <Textarea
                          value={form.medicalHistorySummary}
                          disabled={!canManage}
                          onChange={(e) => setForm((f) => ({ ...f, medicalHistorySummary: e.target.value }))}
                          rows={3}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Pill className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.currentMedications', 'Current medications')}
                        </Label>
                        <Textarea
                          value={form.currentMedications}
                          disabled={!canManage}
                          onChange={(e) => setForm((f) => ({ ...f, currentMedications: e.target.value }))}
                          rows={3}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Smile className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.dentalHistory', 'Dental history summary')}
                        </Label>
                        <Textarea
                          value={form.dentalHistorySummary}
                          disabled={!canManage}
                          onChange={(e) => setForm((f) => ({ ...f, dentalHistorySummary: e.target.value }))}
                          rows={3}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.previousDentalTreatments', 'Previous dental treatments')}
                        </Label>
                        <Textarea
                          value={form.previousDentalTreatments}
                          disabled={!canManage}
                          onChange={(e) => setForm((f) => ({ ...f, previousDentalTreatments: e.target.value }))}
                          rows={3}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Contact className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.emergencyName', 'Emergency contact name')}
                        </Label>
                        <Input
                          value={form.emergencyContactName}
                          disabled={!canManage}
                          onChange={(e) => setForm((f) => ({ ...f, emergencyContactName: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.emergencyPhone', 'Emergency contact phone')}
                        </Label>
                        <Input
                          value={form.emergencyContactPhone}
                          disabled={!canManage}
                          onChange={(e) => setForm((f) => ({ ...f, emergencyContactPhone: e.target.value }))}
                        />
                      </div>
                    </div>

                    {canManage && (
                      <Button
                        onClick={() => saveMutation.mutate()}
                        disabled={saveMutation.isPending || !form.sexOption}
                        className="gap-1.5"
                      >
                        {saveMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        {t('erp.dental.patients.saveChanges', 'Save changes')}
                      </Button>
                    )}
                  </TabsContent>

                  {/* Clinical Notes */}
                  {canViewChart && (
                    <TabsContent value="notes" className="mt-4 space-y-4">
                      {canEditNotes && (
                        <div className="rounded-md border p-3 space-y-3">
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            {editingNoteId ? (
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            {editingNoteId
                              ? t('erp.dental.clinical.editNote', 'Edit clinical note')
                              : t('erp.dental.clinical.addNote', 'Add clinical note')}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label className="flex items-center gap-1.5">
                                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                                {t('erp.dental.clinical.noteTypeLabel', 'Type')}
                              </Label>
                              <Select
                                value={noteForm.noteType}
                                onValueChange={(value) =>
                                  setNoteForm((f) => ({ ...f, noteType: value as NoteForm['noteType'] }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {DENTAL_CLINICAL_NOTE_TYPES.map((type) => (
                                    <SelectItem key={type} value={type}>
                                      {noteTypeLabel(type, t)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="flex items-center gap-1.5">
                                <ToothIcon className="h-3.5 w-3.5" />
                                {t('erp.dental.clinical.toothRefs', 'Tooth refs (optional)')}
                              </Label>
                              <Input
                                value={noteForm.toothRefs}
                                onChange={(e) => setNoteForm((f) => ({ ...f, toothRefs: e.target.value }))}
                                placeholder={t('erp.dental.clinical.toothRefsPlaceholder', 'e.g. 11, 21, 36')}
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="flex items-center gap-1.5">
                              <AlignLeft className="h-3.5 w-3.5 text-muted-foreground" />
                              {t('erp.dental.clinical.noteBody', 'Note')}
                            </Label>
                            <Textarea
                              value={noteForm.body}
                              onChange={(e) => setNoteForm((f) => ({ ...f, body: e.target.value }))}
                              rows={4}
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              onClick={() => saveNoteMutation.mutate()}
                              disabled={!noteForm.body.trim() || saveNoteMutation.isPending}
                              className="gap-1.5"
                            >
                              {saveNoteMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : editingNoteId ? (
                                <Save className="h-4 w-4" />
                              ) : (
                                <Plus className="h-4 w-4" />
                              )}
                              {editingNoteId
                                ? t('common.save', 'Save')
                                : t('erp.dental.clinical.addNote', 'Add clinical note')}
                            </Button>
                            {editingNoteId && (
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setEditingNoteId(null);
                                  setNoteForm(emptyNoteForm());
                                }}
                              >
                                {t('common.cancel', 'Cancel')}
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {timelineQuery.isLoading ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('erp.common.loading', 'Loading...')}
                        </div>
                      ) : clinicalNotes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {t('erp.dental.clinical.notesEmpty', 'No clinical notes yet.')}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {clinicalNotes.map((note) => (
                            <div
                              key={note.id}
                              className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3 text-sm"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline">{noteTypeLabel(note.noteType, t)}</Badge>
                                  <span className="text-xs text-muted-foreground">{formatWhen(note.createdAt)}</span>
                                </div>
                                <p className="whitespace-pre-wrap break-words">{note.body}</p>
                                {note.toothRefs?.length ? (
                                  <p className="text-xs text-muted-foreground mt-1">{note.toothRefs.join(', ')}</p>
                                ) : null}
                              </div>
                              {canEditNotes && (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1.5"
                                    onClick={() => startEditNote(note as ClinicalNote)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    {t('common.edit', 'Edit')}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => deleteNoteMutation.mutate(note.id)}
                                    disabled={deleteNoteMutation.isPending}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  )}

                  {/* Documents */}
                  {canViewImaging && (
                    <TabsContent value="documents" className="mt-4 space-y-4">
                      {canManageImaging && (
                        <div className="rounded-md border p-3 space-y-3">
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                            {t('erp.dental.clinical.uploadDocument', 'Upload document')}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label className="flex items-center gap-1.5">
                                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                                {t('erp.dental.clinical.documentCategory', 'Category')}
                              </Label>
                              <Select value={docCategory} onValueChange={setDocCategory}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {DENTAL_CLINICAL_DOCUMENT_CATEGORIES.map((category) => (
                                    <SelectItem key={category} value={category}>
                                      {clinicalCategoryLabel(category, t)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="flex items-center gap-1.5">
                                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                                {t('erp.dental.clinical.documentFile', 'File')}
                              </Label>
                              <Input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,image/*,.doc,.docx,.txt"
                                onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="flex items-center gap-1.5">
                              <AlignLeft className="h-3.5 w-3.5 text-muted-foreground" />
                              {t('erp.dental.clinical.documentDescription', 'Description (optional)')}
                            </Label>
                            <Input
                              value={docDescription}
                              onChange={(e) => setDocDescription(e.target.value)}
                            />
                          </div>
                          <Button
                            onClick={() => uploadDocMutation.mutate()}
                            disabled={!docFile || uploadDocMutation.isPending}
                            className="gap-1.5"
                          >
                            {uploadDocMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4" />
                            )}
                            {t('erp.dental.clinical.uploadDocument', 'Upload document')}
                          </Button>
                        </div>
                      )}

                      {documentsQuery.isLoading ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('erp.common.loading', 'Loading...')}
                        </div>
                      ) : (documentsQuery.data?.length ?? 0) === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {t('erp.dental.clinical.documentsEmpty', 'No clinical documents uploaded yet.')}
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('erp.dental.clinical.colName', 'Name')}</TableHead>
                              <TableHead>{t('erp.dental.clinical.colCategory', 'Category')}</TableHead>
                              <TableHead>{t('erp.dental.clinical.colUploaded', 'Uploaded')}</TableHead>
                              <TableHead className="w-[100px]" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {documentsQuery.data?.map((doc) => (
                              <TableRow key={doc.id}>
                                <TableCell>
                                  <a
                                    href={doc.fileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-primary hover:underline"
                                  >
                                    <FileText className="h-4 w-4 shrink-0" />
                                    <span className="truncate max-w-[200px]">{doc.originalName}</span>
                                  </a>
                                </TableCell>
                                <TableCell>{clinicalCategoryLabel(doc.category, t)}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {formatWhen(doc.createdAt)}
                                </TableCell>
                                <TableCell>
                                  {canManageImaging && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => deleteDocMutation.mutate(doc.id)}
                                      disabled={deleteDocMutation.isPending}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </TabsContent>
                  )}

                  {/* Timeline */}
                  {canViewChart && (
                    <TabsContent value="timeline" className="mt-4 space-y-3">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                        {t('erp.dental.clinical.timelineTitle', 'Clinical timeline')}
                      </div>
                      {timelineQuery.isLoading ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('erp.common.loading', 'Loading...')}
                        </div>
                      ) : clinicalTimelineItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {t('erp.dental.clinical.timelineEmpty', 'No clinical notes or chart snapshots yet.')}
                        </p>
                      ) : (
                        <div className="custom-scrollbar max-h-[32rem] overflow-y-auto pr-1">
                          <ClinicalTimelineList items={clinicalTimelineItems} />
                        </div>
                      )}
                    </TabsContent>
                  )}

                  {/* History (chart snapshots) */}
                  {canViewChart && (
                    <TabsContent value="history" className="mt-4 space-y-3">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <History className="h-3.5 w-3.5 text-muted-foreground" />
                        {t('erp.dental.patients.historyTab', 'History')}
                      </div>
                      {chartHistoryQuery.isLoading ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('erp.common.loading', 'Loading...')}
                        </div>
                      ) : (chartHistoryQuery.data?.length ?? 0) === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {t('erp.dental.patients.historyEmpty', 'No chart snapshots saved yet.')}
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('erp.dental.patients.historyVersion', 'Version')}</TableHead>
                              <TableHead>{t('erp.dental.patients.historyNumbering', 'Numbering')}</TableHead>
                              <TableHead>{t('erp.dental.clinical.colUploaded', 'Uploaded')}</TableHead>
                              <TableHead className="w-[120px]" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {chartHistoryQuery.data?.map((entry) => (
                              <TableRow key={entry.id}>
                                <TableCell>
                                  <Badge variant="outline">v{entry.version}</Badge>
                                </TableCell>
                                <TableCell>{entry.numberingSystem}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {formatWhen(entry.createdAt)}
                                </TableCell>
                                <TableCell>
                                  <Button asChild size="sm" variant="link" className="h-auto p-0">
                                    <Link
                                      href={`/erp/dental/chart?contactId=${contactId}`}
                                      className="inline-flex items-center gap-1.5"
                                    >
                                      <ToothIcon className="h-3.5 w-3.5" />
                                      {t('erp.dental.patients.openChart', 'Open chart')}
                                    </Link>
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </TabsContent>
                  )}
                </Tabs>
              </CardContent>
            </Card>

            {/* Right rail */}
            <div className="space-y-4">
              {/* Next appointment */}
              {canViewSchedule && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <CalendarClock className="h-4 w-4 text-muted-foreground" />
                      {t('erp.dental.patients.nextAppointment', 'Next Appointment')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {scheduleQuery.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : nextAppointment ? (
                      <div className="space-y-0.5">
                        <div className="text-lg font-semibold">
                          {formatDateShort(nextAppointment.scheduledAt)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatTimeShort(nextAppointment.scheduledAt)} · {nextAppointment.title}
                        </div>
                        {nextAppointment.providerName ? (
                          <div className="text-xs text-muted-foreground">{nextAppointment.providerName}</div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t('erp.dental.patients.noUpcomingAppointment', 'No upcoming appointments.')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Treatment plan */}
              {canViewTreatmentPlans && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <ClipboardList className="h-4 w-4 text-muted-foreground" />
                      {t('erp.dental.patients.treatmentPlanCard', 'Treatment Plan')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {treatmentPlansQuery.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : activePlan ? (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{activePlan.title}</span>
                          <Badge variant="secondary" className="shrink-0">
                            {planStatusLabel(activePlan.status, t)}
                          </Badge>
                        </div>
                        {activePlanDetailQuery.isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : planProgress ? (
                          <div className="space-y-1">
                            <Progress value={planProgress.percent} className="h-2 bg-muted" />
                            <div className="text-xs text-muted-foreground">
                              {t('erp.dental.patients.planProgress', '{{done}} of {{total}} procedures completed', {
                                done: planProgress.completed,
                                total: planProgress.total,
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            {t('erp.dental.patients.planNoProcedures', 'No procedures on this plan yet.')}
                          </div>
                        )}
                        <Button asChild size="sm" variant="link" className="h-auto p-0 text-xs">
                          <Link href={`/erp/dental/treatment-plans?contactId=${contactId}`}>
                            {t('erp.dental.patients.viewPlan', 'View treatment plan')}
                          </Link>
                        </Button>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t('erp.dental.patients.noTreatmentPlan', 'No treatment plan yet.')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Outstanding balance */}
              {canViewInvoices && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      {t('erp.dental.patients.outstandingBalance', 'Outstanding Balance')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {invoicesQuery.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : outstandingBalance == null ? (
                      <p className="text-sm text-muted-foreground">
                        {t('erp.dental.patients.noInvoices', 'No invoices yet.')}
                      </p>
                    ) : (
                      <div className="space-y-0.5">
                        <div
                          className={cn(
                            'text-2xl font-bold',
                            outstandingBalance.total > 0 ? 'text-destructive' : 'text-emerald-500',
                          )}
                        >
                          {formatMoney(outstandingBalance.total, outstandingBalance.currency)}
                        </div>
                        <Button asChild size="sm" variant="link" className="h-auto p-0 text-xs">
                          <Link href={`/erp/invoices?contactId=${contactId}`}>
                            <Receipt className="h-3 w-3 mr-1" />
                            {t('erp.dental.patients.viewInvoices', 'View invoices')}
                          </Link>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Latest clinical note */}
              {canViewChart && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <StickyNote className="h-4 w-4 text-muted-foreground" />
                      {t('erp.dental.patients.latestNote', 'Latest Clinical Note')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {timelineQuery.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : latestNote ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{noteTypeLabel(latestNote.noteType, t)}</Badge>
                          <span className="text-[11px] text-muted-foreground">{formatWhen(latestNote.createdAt)}</span>
                        </div>
                        <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                          {latestNote.body}
                        </p>
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs"
                          onClick={() => setActiveTab('notes')}
                        >
                          {t('erp.dental.patients.viewAllNotes', 'View all notes')}
                        </Button>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t('erp.dental.clinical.notesEmpty', 'No clinical notes yet.')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </DentalShellPage>
  );
}

function parseSexLabel(stored: string, t: (key: string, fallback: string) => string): string {
  const parsed = parseSex(stored);
  if (!parsed.sexOption) return stored;
  if (parsed.sexOption === 'Other') {
    const base = t('erp.dental.patients.fields.sex.other', 'Other');
    return parsed.sexOtherDetail ? `${base} — ${parsed.sexOtherDetail}` : base;
  }
  return t(`erp.dental.patients.fields.sex.${parsed.sexOption.toLowerCase()}`, parsed.sexOption);
}
