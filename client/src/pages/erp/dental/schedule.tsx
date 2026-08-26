import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DentalShellPage } from './dental-shell';
import { useTranslation } from '@/hooks/use-translation';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Check, ChevronLeft, ChevronRight, ChevronsUpDown, Loader2, Plus, Settings2, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AddDentalPatientDialog } from '@/components/erp/dental/AddDentalPatientDialog';
import {
  formatProviderWithSpecialties,
  getSpecialistAssignmentViolations,
  type DentalBookingPolicy,
} from '@shared/types/dental-booking-types';

type TeamMember = { id: number; fullName?: string; username?: string };
type Chair = { id: number; code: string; name: string; sortOrder: number; isActive: boolean };
type ScheduleRow = {
  id: number;
  contactId: number;
  title: string;
  description: string | null;
  scheduledAt: string;
  durationMinutes: number | null;
  type: string;
  status: string;
  providerUserId: number | null;
  chairId: number | null;
  isRecall: boolean;
  recallDueAt: string | null;
  holdExpiresAt: string | null;
  contactName: string | null;
  providerName: string | null;
  chairName: string | null;
};

const STATUS_OPTIONS = ['scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show'] as const;

function toDateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayRange(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'cancelled' || status === 'no_show') return 'destructive';
  if (status === 'completed') return 'secondary';
  if (status === 'confirmed') return 'default';
  if (status === 'held' || status === 'pending_request') return 'secondary';
  return 'outline';
}

function isAwaitingStaff(status: string) {
  return status === 'held' || status === 'pending_request';
}

export default function DentalSchedulePage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { PERMISSIONS, hasPermission } = usePermissions();
  const canManage = hasPermission(PERMISSIONS.MANAGE_DENTAL_SCHEDULE);
  const canManagePatients = hasPermission(PERMISSIONS.MANAGE_DENTAL_PATIENTS);
  const queryClient = useQueryClient();

  const [day, setDay] = useState(() => toDateInputValue(new Date()));
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [chairFilter, setChairFilter] = useState<string>('all');
  const [chairsOpen, setChairsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [patientPickerOpen, setPatientPickerOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [debouncedPatientSearch, setDebouncedPatientSearch] = useState('');
  const [addPatientOpen, setAddPatientOpen] = useState(false);

  const [selectedPatientName, setSelectedPatientName] = useState('');

  const [formContactId, setFormContactId] = useState<string>('');
  const [formDate, setFormDate] = useState(() => toDateInputValue(new Date()));
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState('consultation');
  const [formTime, setFormTime] = useState('09:00');
  const [formDuration, setFormDuration] = useState('60');
  const [formProviderId, setFormProviderId] = useState<string>('none');
  const [formChairId, setFormChairId] = useState<string>('none');
  const [formStatus, setFormStatus] = useState<string>('scheduled');
  const [formIsRecall, setFormIsRecall] = useState(false);
  const [formNotes, setFormNotes] = useState('');

  const [chairCode, setChairCode] = useState('');
  const [chairName, setChairName] = useState('');
  const [assignmentOverrideOpen, setAssignmentOverrideOpen] = useState(false);
  const [pendingViolations, setPendingViolations] = useState<string[]>([]);

  const range = useMemo(() => dayRange(day), [day]);

  const chairsQuery = useQuery({
    queryKey: ['/api/erp/dental/chairs'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/dental/chairs');
      if (!res.ok) throw new Error('Failed to load offices');
      const json = await res.json();
      return (json.data ?? []) as Chair[];
    },
  });

  const policyQuery = useQuery({
    queryKey: ['/api/erp/dental/booking/settings', 'schedule'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/dental/booking/settings');
      if (!res.ok) throw new Error('Failed to load booking settings');
      const json = await res.json();
      return json.data as DentalBookingPolicy;
    },
  });

  const scheduleQuery = useQuery({
    queryKey: ['/api/erp/dental/schedule', day, providerFilter, chairFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      if (providerFilter !== 'all') params.set('providerUserId', providerFilter);
      if (chairFilter !== 'all') params.set('chairId', chairFilter);
      const res = await apiRequest('GET', `/api/erp/dental/schedule?${params}`);
      if (!res.ok) throw new Error('Failed to load schedule');
      const json = await res.json();
      return (json.data ?? []) as ScheduleRow[];
    },
  });

  const teamQuery = useQuery({
    queryKey: ['/api/team-members', 'dental-schedule'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/team-members');
      if (!res.ok) throw new Error('Failed to load team');
      return (await res.json()) as TeamMember[];
    },
  });

  const patientsQuery = useQuery({
    queryKey: ['/api/erp/dental/schedule/patient-options', debouncedPatientSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (debouncedPatientSearch.trim()) params.set('search', debouncedPatientSearch.trim());
      const res = await apiRequest('GET', `/api/erp/dental/schedule/patient-options?${params}`);
      if (!res.ok) throw new Error('Failed to load patients');
      const json = await res.json();
      return (json.data ?? []) as Array<{ contactId: number; name: string }>;
    },
    enabled: editorOpen,
  });

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedPatientSearch(patientSearch.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [patientSearch]);

  const activeChairs = useMemo(
    () => (chairsQuery.data ?? []).filter((c) => c.isActive),
    [chairsQuery.data],
  );

  const selectedPatient = useMemo(() => {
    if (formContactId && selectedPatientName) {
      return { contactId: Number(formContactId), name: selectedPatientName };
    }
    const fromList = (patientsQuery.data ?? []).find((p) => String(p.contactId) === formContactId);
    if (fromList) return fromList;
    if (editing && String(editing.contactId) === formContactId) {
      return { contactId: editing.contactId, name: editing.contactName || `#${editing.contactId}` };
    }
    return undefined;
  }, [patientsQuery.data, formContactId, selectedPatientName, editing]);

  function handlePatientSearchChange(value: string) {
    setPatientSearch(value);
    if (formContactId && value.trim() !== selectedPatientName.trim()) {
      setFormContactId('');
      setSelectedPatientName('');
    }
  }

  function resetForm(row?: ScheduleRow | null) {
    if (row) {
      const d = new Date(row.scheduledAt);
      setFormContactId(String(row.contactId));
      setFormDate(toDateInputValue(d));
      setFormTitle(row.title);
      setFormType(row.type || 'consultation');
      setFormTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      setFormDuration(String(row.durationMinutes ?? 60));
      setFormProviderId(row.providerUserId != null ? String(row.providerUserId) : 'none');
      setFormChairId(row.chairId != null ? String(row.chairId) : 'none');
      setFormStatus(row.status || 'scheduled');
      setFormIsRecall(Boolean(row.isRecall));
      setFormNotes(row.description ?? '');
    } else {
      setFormContactId('');
      setSelectedPatientName('');
      setFormDate(day);
      setFormTitle('');
      setFormType('consultation');
      setFormTime('09:00');
      setFormDuration('60');
      setFormProviderId(providerFilter !== 'all' ? providerFilter : 'none');
      setFormChairId(chairFilter !== 'all' ? chairFilter : 'none');
      setFormStatus('scheduled');
      setFormIsRecall(false);
      setFormNotes('');
    }
  }

  function openCreate() {
    setEditing(null);
    resetForm(null);
    setPatientSearch('');
    setSelectedPatientName('');
    setPatientPickerOpen(false);
    setEditorOpen(true);
  }

  function openEdit(row: ScheduleRow) {
    setEditing(row);
    resetForm(row);
    setPatientSearch(row.contactName || '');
    setPatientPickerOpen(false);
    setEditorOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing && isAwaitingStaff(editing.status)) {
        throw new Error('Use Confirm/Approve or Decline on the schedule board for this booking.');
      }
      const scheduledAt = new Date(`${formDate}T${formTime}:00`).toISOString();
      const body = {
        contactId: Number(formContactId),
        title: formTitle.trim() || formType,
        description: formNotes.trim() || null,
        scheduledAt,
        durationMinutes: Number(formDuration) || 60,
        type: formType,
        status: formStatus,
        providerUserId: formProviderId === 'none' ? null : Number(formProviderId),
        chairId: formChairId === 'none' ? null : Number(formChairId),
        isRecall: formIsRecall,
      };
      if (!body.contactId) throw new Error('Select a patient');
      if (!formDate) throw new Error('Select a date');
      if (editing) {
        const res = await apiRequest('PATCH', `/api/erp/dental/schedule/${editing.id}`, body);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Failed to update appointment');
        return json.data;
      }
      const res = await apiRequest('POST', '/api/erp/dental/schedule', body);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to create appointment');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/schedule'] });
      setDay(formDate);
      setAssignmentOverrideOpen(false);
      setPendingViolations([]);
      toast({
        title: editing
          ? t('erp.dental.schedule.updated', 'Appointment updated')
          : t('erp.dental.schedule.created', 'Appointment created'),
      });
      setEditorOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' });
    },
  });

  function collectAssignmentViolations(): string[] {
    const policy = policyQuery.data;
    if (!policy) return [];
    const providerUserId = formProviderId === 'none' ? null : Number(formProviderId);
    const chairId = formChairId === 'none' ? null : Number(formChairId);
    const catalogMatch = policy.bookableCatalog.find(
      (item) =>
        item.isActive &&
        (item.label.trim().toLowerCase() === formType.trim().toLowerCase() ||
          item.visitType?.trim().toLowerCase() === formType.trim().toLowerCase()),
    );
    return getSpecialistAssignmentViolations(policy, {
      providerUserId,
      specialtyId: catalogMatch?.specialtyId ?? null,
      chairId,
    });
  }

  function requestSave() {
    const violations = collectAssignmentViolations();
    if (violations.length > 0) {
      setPendingViolations(violations);
      setAssignmentOverrideOpen(true);
      return;
    }
    saveMutation.mutate();
  }

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest('PATCH', `/api/erp/dental/schedule/${id}`, { status });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to update status');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/schedule'] });
    },
    onError: (error: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' });
    },
  });

  const bookingActionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'confirm' | 'approve' | 'decline' }) => {
      const res = await apiRequest('POST', `/api/erp/dental/booking/${id}/${action}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to update booking');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/schedule'] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/booking/pending'] });
      toast({ title: t('erp.dental.schedule.bookingUpdated', 'Booking updated') });
    },
    onError: (error: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/erp/dental/schedule/${id}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to delete');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/schedule'] });
      toast({ title: t('erp.dental.schedule.deleted', 'Appointment deleted') });
      setEditorOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' });
    },
  });

  const createChairMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/erp/dental/chairs', {
        code: chairCode.trim(),
        name: chairName.trim(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to create chair');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/chairs'] });
      setChairCode('');
      setChairName('');
      toast({ title: t('erp.dental.chairs.created', 'Office created') });
    },
    onError: (error: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' });
    },
  });

  const toggleChairMutation = useMutation({
    mutationFn: async (chair: Chair) => {
      const res = await apiRequest('PATCH', `/api/erp/dental/chairs/${chair.id}`, {
        isActive: !chair.isActive,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to update chair');
      return json.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/chairs'] }),
    onError: (error: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' });
    },
  });

  const shiftDay = (delta: number) => {
    const d = new Date(`${day}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setDay(toDateInputValue(d));
  };

  const rows = scheduleQuery.data ?? [];
  const team = teamQuery.data ?? [];

  function providerLabel(name: string, userId: number | null | undefined) {
    return formatProviderWithSpecialties(name, userId, policyQuery.data, {
      resolveLabel: (specialtyId, fallbackLabel) =>
        t(`erp.dental.specialties.${specialtyId}`, fallbackLabel),
      formatOne: (providerName, specialty) =>
        t('erp.dental.schedule.providerWithSpecialty', '{{name}} — {{specialty}}', {
          name: providerName,
          specialty,
        }),
      formatMore: (providerName, specialty, extraCount) =>
        t('erp.dental.schedule.providerWithSpecialtyMore', '{{name}} — {{specialty}} +{{count}}', {
          name: providerName,
          specialty,
          count: extraCount,
        }),
    });
  }

  return (
    <DentalShellPage
      title={t('erp.dental.schedule.title', 'Schedule')}
      description={t(
        'erp.dental.schedule.description',
        'Day board for providers and offices. Create, update, cancel, or mark no-show.',
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" onClick={() => shiftDay(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="w-[160px]"
            />
            <Button type="button" variant="outline" size="icon" onClick={() => shiftDay(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDay(toDateInputValue(new Date()))}>
              {t('erp.dental.schedule.today', 'Today')}
            </Button>
          </div>

          <div className="space-y-1">
            <Label>{t('erp.dental.schedule.provider', 'Provider')}</Label>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('erp.dental.schedule.allProviders', 'All providers')}</SelectItem>
                {team.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {providerLabel(m.fullName || m.username || String(m.id), m.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>{t('erp.dental.schedule.chair', 'Office')}</Label>
            <Select value={chairFilter} onValueChange={setChairFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('erp.dental.schedule.allChairs', 'All offices')}</SelectItem>
                {activeChairs.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex gap-2">
            {canManage && (
              <Button type="button" variant="outline" onClick={() => setChairsOpen(true)}>
                <Settings2 className="h-4 w-4 mr-2" />
                {t('erp.dental.chairs.manage', 'Offices')}
              </Button>
            )}
            {canManage && (
              <Button type="button" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                {t('erp.dental.schedule.new', 'New appointment')}
              </Button>
            )}
          </div>
        </div>

        {scheduleQuery.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('erp.common.loading', 'Loading...')}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8">
            {t('erp.dental.schedule.empty', 'No appointments for this day.')}
          </p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('erp.dental.schedule.time', 'Time')}</TableHead>
                  <TableHead>{t('erp.dental.schedule.patient', 'Patient')}</TableHead>
                  <TableHead>{t('erp.dental.schedule.titleCol', 'Title')}</TableHead>
                  <TableHead>{t('erp.dental.schedule.provider', 'Provider')}</TableHead>
                  <TableHead>{t('erp.dental.schedule.chair', 'Office')}</TableHead>
                  <TableHead>{t('erp.dental.schedule.status', 'Status')}</TableHead>
                  {canManage && <TableHead className="text-right">{t('ui.common.actions', 'Actions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => canManage && openEdit(row)}>
                    <TableCell className="whitespace-nowrap">
                      {formatTime(row.scheduledAt)}
                      <span className="text-muted-foreground text-xs ml-1">
                        ({row.durationMinutes ?? 60}m)
                      </span>
                    </TableCell>
                    <TableCell>{row.contactName || `#${row.contactId}`}</TableCell>
                    <TableCell>
                      <div className="font-medium">{row.title}</div>
                      <div className="text-xs text-muted-foreground">{row.type}</div>
                    </TableCell>
                    <TableCell>
                      {row.providerUserId != null
                        ? providerLabel(row.providerName || '—', row.providerUserId)
                        : '—'}
                    </TableCell>
                    <TableCell>{row.chairName || '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                        {row.holdExpiresAt && isAwaitingStaff(row.status) && (
                          <span className="text-xs text-muted-foreground">
                            {t('erp.dental.schedule.expires', 'Expires')}{' '}
                            {formatTime(row.holdExpiresAt)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1 flex-wrap">
                          {row.status === 'held' && (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="default"
                                disabled={bookingActionMutation.isPending}
                                onClick={() => bookingActionMutation.mutate({ id: row.id, action: 'confirm' })}
                              >
                                {t('erp.dental.schedule.confirm', 'Confirm')}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={bookingActionMutation.isPending}
                                onClick={() => bookingActionMutation.mutate({ id: row.id, action: 'decline' })}
                              >
                                {t('erp.dental.schedule.decline', 'Decline')}
                              </Button>
                            </>
                          )}
                          {row.status === 'pending_request' && (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="default"
                                disabled={bookingActionMutation.isPending}
                                onClick={() => bookingActionMutation.mutate({ id: row.id, action: 'approve' })}
                              >
                                {t('erp.dental.schedule.approve', 'Approve')}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={bookingActionMutation.isPending}
                                onClick={() => bookingActionMutation.mutate({ id: row.id, action: 'decline' })}
                              >
                                {t('erp.dental.schedule.decline', 'Decline')}
                              </Button>
                            </>
                          )}
                          {!isAwaitingStaff(row.status) && row.status !== 'no_show' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={statusMutation.isPending}
                              onClick={() => statusMutation.mutate({ id: row.id, status: 'no_show' })}
                            >
                              {t('erp.dental.schedule.noShow', 'No-show')}
                            </Button>
                          )}
                          {!isAwaitingStaff(row.status) && row.status !== 'cancelled' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={statusMutation.isPending}
                              onClick={() => statusMutation.mutate({ id: row.id, status: 'cancelled' })}
                            >
                              {t('erp.dental.schedule.cancel', 'Cancel')}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('erp.dental.schedule.edit', 'Edit appointment')
                : t('erp.dental.schedule.new', 'New appointment')}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label>{t('erp.dental.schedule.patient', 'Patient')}</Label>
              {editing ? (
                <Input value={editing.contactName || `#${editing.contactId}`} disabled />
              ) : (
                <div className="space-y-1.5">
                  <Popover open={patientPickerOpen} onOpenChange={setPatientPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" role="combobox" className="w-full justify-between">
                        <span className="truncate text-left">
                          {selectedPatient?.name || t('erp.dental.schedule.selectPatient', 'Search patients')}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder={t('erp.dental.schedule.searchPatient', 'Search patients by name')}
                          value={patientSearch}
                          onValueChange={handlePatientSearchChange}
                        />
                        <CommandList className="max-h-72">
                          {patientsQuery.isLoading ? (
                            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              {t('erp.common.loading', 'Loading...')}
                            </div>
                          ) : (
                            <>
                              <CommandEmpty>
                                {t('erp.dental.schedule.noPatients', 'No patients found')}
                              </CommandEmpty>
                              {(patientsQuery.data ?? []).map((p) => (
                                <CommandItem
                                  key={p.contactId}
                                  value={`${p.name} ${p.contactId}`}
                                  onSelect={() => {
                                    setFormContactId(String(p.contactId));
                                    setSelectedPatientName(p.name);
                                    setPatientSearch(p.name);
                                    setPatientPickerOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      'h-4 w-4',
                                      formContactId === String(p.contactId) ? 'opacity-100' : 'opacity-0',
                                    )}
                                  />
                                  {p.name}
                                </CommandItem>
                              ))}
                            </>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {canManagePatients ? (
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-sm"
                      onClick={() => setAddPatientOpen(true)}
                    >
                      <UserPlus className="h-3.5 w-3.5 mr-1" />
                      {t('erp.dental.patients.add', 'Add Patient')}
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t('erp.dental.schedule.date', 'Date')}</Label>
                <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t('erp.dental.schedule.time', 'Time')}</Label>
                <Input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t('erp.dental.schedule.duration', 'Duration (min)')}</Label>
              <Input value={formDuration} onChange={(e) => setFormDuration(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t('erp.dental.schedule.titleCol', 'Title')}</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Consultation" />
            </div>
            <div className="space-y-1">
              <Label>{t('erp.dental.schedule.type', 'Type')}</Label>
              <Input value={formType} onChange={(e) => setFormType(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t('erp.dental.schedule.provider', 'Provider')}</Label>
                <Select value={formProviderId} onValueChange={setFormProviderId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {team.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {providerLabel(m.fullName || m.username || String(m.id), m.id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('erp.dental.schedule.chair', 'Office')}</Label>
                <Select value={formChairId} onValueChange={setFormChairId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {activeChairs.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t('erp.dental.schedule.status', 'Status')}</Label>
              <Select
                value={formStatus}
                onValueChange={setFormStatus}
                disabled={Boolean(editing && isAwaitingStaff(editing.status))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editing && isAwaitingStaff(editing.status) && (
                <p className="text-xs text-muted-foreground">
                  {t(
                    'erp.dental.schedule.awaitingStaffStatusHelp',
                    'Use Confirm/Approve or Decline on the schedule board to resolve this booking.',
                  )}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="isRecall"
                checked={formIsRecall}
                onCheckedChange={(v) => setFormIsRecall(v === true)}
              />
              <Label htmlFor="isRecall">{t('erp.dental.schedule.recall', 'Recall visit')}</Label>
            </div>
            <div className="space-y-1">
              <Label>{t('erp.dental.schedule.notes', 'Notes')}</Label>
              <Input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {editing && (
              <Button
                type="button"
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(editing.id)}
              >
                {t('ui.common.delete', 'Delete')}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
              {t('ui.common.cancel', 'Cancel')}
            </Button>
            <Button type="button" disabled={saveMutation.isPending} onClick={requestSave}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('ui.common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={assignmentOverrideOpen} onOpenChange={setAssignmentOverrideOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('erp.dental.schedule.assignmentOverrideTitle', 'Override specialist assignment?')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {t(
                    'erp.dental.schedule.assignmentOverrideBody',
                    'This assignment does not match the specialist rules. You can still save if needed.',
                  )}
                </p>
                <ul className="list-disc pl-5">
                  {pendingViolations.map((violation) => (
                    <li key={violation}>{violation}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('ui.common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => saveMutation.mutate()}>
              {t('erp.dental.schedule.assignmentOverrideConfirm', 'Save anyway')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={chairsOpen} onOpenChange={setChairsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('erp.dental.chairs.manage', 'Offices')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder={t('erp.dental.chairs.code', 'Code')}
                value={chairCode}
                onChange={(e) => setChairCode(e.target.value)}
              />
              <Input
                placeholder={t('erp.dental.chairs.name', 'Name')}
                value={chairName}
                onChange={(e) => setChairName(e.target.value)}
              />
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={!chairCode.trim() || !chairName.trim() || createChairMutation.isPending}
              onClick={() => createChairMutation.mutate()}
            >
              {t('erp.dental.chairs.add', 'Add office')}
            </Button>
            <div className="rounded-md border max-h-64 overflow-y-auto">
              <Table>
                <TableBody>
                  {(chairsQuery.data ?? []).map((chair) => (
                    <TableRow key={chair.id}>
                      <TableCell>
                        <div className="font-medium">{chair.name}</div>
                        <div className="text-xs text-muted-foreground">{chair.code}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => toggleChairMutation.mutate(chair)}
                        >
                          {chair.isActive
                            ? t('erp.dental.chairs.deactivate', 'Deactivate')
                            : t('erp.dental.chairs.activate', 'Activate')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AddDentalPatientDialog
        open={addPatientOpen}
        onOpenChange={setAddPatientOpen}
        onSuccess={(patient) => {
          setFormContactId(String(patient.contactId));
          setSelectedPatientName(patient.name);
          setPatientSearch(patient.name);
          queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/schedule/patient-options'] });
        }}
      />
    </DentalShellPage>
  );
}
