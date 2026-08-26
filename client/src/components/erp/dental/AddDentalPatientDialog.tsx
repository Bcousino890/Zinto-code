import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useTranslation } from '@/hooks/use-translation';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, Loader2, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DentalPatientRef = {
  contactId: number;
  name: string;
};

type ContactOption = {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
};

type PhoneConflict = {
  contactId: number;
  isPatient: boolean;
  name: string;
  phone: string | null;
  email: string | null;
};

type AddDentalPatientDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called after a patient is created/promoted.
   * When `navigateOnSuccess` is true (Patients page), this still fires before navigation.
   */
  onSuccess: (patient: DentalPatientRef) => void;
  /** Patients page: navigate to clinical profile after success. Default false (stay in context). */
  navigateOnSuccess?: boolean;
};

export function AddDentalPatientDialog({
  open,
  onOpenChange,
  onSuccess,
  navigateOnSuccess = false,
}: AddDentalPatientDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { PERMISSIONS, hasPermission } = usePermissions();
  const canCreateContact = hasPermission(PERMISSIONS.CREATE_CONTACTS);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [addMode, setAddMode] = useState<'existing' | 'new'>('existing');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [forcedContact, setForcedContact] = useState<ContactOption | null>(null);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [phoneConflictHint, setPhoneConflictHint] = useState<string | null>(null);
  const [existingPatientConflict, setExistingPatientConflict] = useState<DentalPatientRef | null>(
    null,
  );

  const reset = () => {
    setAddMode('existing');
    setPickerOpen(false);
    setContactSearch('');
    setSelectedContactId(null);
    setForcedContact(null);
    setNewContactName('');
    setNewContactPhone('');
    setNewContactEmail('');
    setPhoneConflictHint(null);
    setExistingPatientConflict(null);
  };

  const contactsQuery = useQuery({
    queryKey: ['/api/erp/dental/patients/eligible-contacts', contactSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20' });
      if (contactSearch.trim()) params.set('search', contactSearch.trim());
      const res = await apiRequest('GET', `/api/erp/dental/patients/eligible-contacts?${params}`);
      if (!res.ok) throw new Error('Failed to search contacts');
      const json = await res.json();
      return (json.data ?? []) as ContactOption[];
    },
    enabled: open && addMode === 'existing',
  });

  const finish = (patient: DentalPatientRef) => {
    queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/schedule/patient-options'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/treatment-plans/patient-options'] });
    toast({ title: t('erp.dental.patients.added', 'Patient added') });
    onOpenChange(false);
    reset();
    onSuccess(patient);
    if (navigateOnSuccess) {
      setLocation(`/erp/dental/patients/${patient.contactId}`);
    }
  };

  const createPatientMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const res = await apiRequest('POST', '/api/erp/dental/patients', { contactId });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to add patient');
      const name =
        (forcedContact && forcedContact.id === contactId ? forcedContact.name : null) ||
        (contactsQuery.data ?? []).find((c) => c.id === contactId)?.name ||
        `#${contactId}`;
      return { contactId: (json.data as { contactId: number }).contactId, name };
    },
    onSuccess: (data) => finish(data),
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const createNewPatientMutation = useMutation({
    mutationFn: async () => {
      const name = newContactName.trim();
      const res = await apiRequest('POST', '/api/erp/dental/patients/with-contact', {
        name,
        phone: newContactPhone.trim(),
        email: newContactEmail.trim() || undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409 && json.code === 'PHONE_EXISTS') {
        const err = new Error(json.error || 'Phone already exists') as Error & {
          phoneConflict?: PhoneConflict;
        };
        err.phoneConflict = {
          contactId: json.contactId,
          isPatient: Boolean(json.isPatient),
          name: json.name,
          phone: json.phone ?? null,
          email: json.email ?? null,
        };
        throw err;
      }
      if (!res.ok) throw new Error(json.error || 'Failed to create patient');
      return {
        contactId: (json.data as { contactId: number }).contactId,
        name,
      };
    },
    onSuccess: (data) => finish(data),
    onError: (error: Error & { phoneConflict?: PhoneConflict }) => {
      const conflict = error.phoneConflict;
      if (conflict) {
        if (conflict.isPatient) {
          setExistingPatientConflict({
            contactId: conflict.contactId,
            name: conflict.name || `#${conflict.contactId}`,
          });
          setPhoneConflictHint(
            navigateOnSuccess
              ? t(
                  'erp.dental.patients.phoneExistsPatient',
                  'A patient with this phone already exists. Open their clinical profile instead.',
                )
              : t(
                  'erp.dental.patients.phoneExistsPatientSelect',
                  'A patient with this phone already exists. Select them instead.',
                ),
          );
          toast({ title: error.message, variant: 'destructive' });
          return;
        }
        setAddMode('existing');
        setForcedContact({
          id: conflict.contactId,
          name: conflict.name,
          phone: conflict.phone,
          email: conflict.email,
        });
        setSelectedContactId(conflict.contactId);
        setContactSearch(conflict.name);
        setExistingPatientConflict(null);
        setPhoneConflictHint(
          t(
            'erp.dental.patients.phoneExistsContact',
            'A contact with this phone already exists. Confirm adding them as a patient.',
          ),
        );
        toast({ title: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const selectedContact =
    (forcedContact && forcedContact.id === selectedContactId ? forcedContact : null) ||
    (contactsQuery.data ?? []).find((c) => c.id === selectedContactId) ||
    null;
  const addPending = createPatientMutation.isPending || createNewPatientMutation.isPending;
  const canSubmitNew =
    Boolean(newContactName.trim()) && Boolean(newContactPhone.trim()) && canCreateContact;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('erp.dental.patients.addTitle', 'Add Patient')}</DialogTitle>
          <DialogDescription>
            {t(
              'erp.dental.patients.addDescription',
              'Link an existing contact or create a new patient with name and phone.',
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={addMode}
          onValueChange={(value) => {
            setAddMode(value as 'existing' | 'new');
            setPhoneConflictHint(null);
            setExistingPatientConflict(null);
          }}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="existing">
              {t('erp.dental.patients.modeExisting', 'Existing contact')}
            </TabsTrigger>
            <TabsTrigger value="new" disabled={!canCreateContact}>
              {t('erp.dental.patients.modeNew', 'New patient')}
            </TabsTrigger>
          </TabsList>

          {phoneConflictHint ? (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              <p>{phoneConflictHint}</p>
              {existingPatientConflict ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    const patient = existingPatientConflict;
                    onOpenChange(false);
                    reset();
                    if (navigateOnSuccess) {
                      setLocation(`/erp/dental/patients/${patient.contactId}`);
                    } else {
                      onSuccess(patient);
                    }
                  }}
                >
                  {navigateOnSuccess
                    ? t('erp.dental.patients.openExistingPatient', 'Open clinical profile')
                    : t('erp.dental.patients.selectExistingPatient', 'Select this patient')}
                </Button>
              ) : null}
            </div>
          ) : null}

          <TabsContent value="existing" className="space-y-3 mt-3">
            <div className="space-y-1.5">
              <Label>{t('erp.dental.patients.contactLabel', 'Contact')}</Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" role="combobox" className="w-full justify-between">
                    <span className="truncate text-left">
                      {selectedContact
                        ? `${selectedContact.name}${selectedContact.phone ? ` | ${selectedContact.phone}` : ''}`
                        : t('erp.dental.patients.pickContact', 'Search contacts')}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder={t('erp.dental.patients.pickContact', 'Search contacts')}
                      value={contactSearch}
                      onValueChange={setContactSearch}
                    />
                    <CommandList className="max-h-72">
                      <CommandEmpty>
                        {contactsQuery.isLoading
                          ? t('common.loading', 'Loading…')
                          : t('erp.dental.patients.noContacts', 'No contacts found')}
                      </CommandEmpty>
                      {(contactsQuery.data ?? []).map((contact) => (
                        <CommandItem
                          key={contact.id}
                          value={`${contact.name} ${contact.phone ?? ''} ${contact.email ?? ''}`}
                          onSelect={() => {
                            setSelectedContactId(contact.id);
                            setForcedContact(null);
                            setContactSearch(contact.name);
                            setPhoneConflictHint(null);
                            setPickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'h-4 w-4',
                              selectedContactId === contact.id ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          {contact.name}
                          {contact.phone
                            ? ` | ${contact.phone}`
                            : contact.email
                              ? ` | ${contact.email}`
                              : ''}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <DialogFooter className="sm:justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                disabled={!selectedContactId || addPending}
                onClick={() => selectedContactId && createPatientMutation.mutate(selectedContactId)}
              >
                {createPatientMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {t('erp.dental.patients.add', 'Add Patient')}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="new" className="space-y-3 mt-3">
            {!canCreateContact ? (
              <p className="text-sm text-muted-foreground">
                {t(
                  'erp.dental.patients.needCreateContacts',
                  'You need permission to create contacts to add a new patient.',
                )}
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>
                    {t('contacts.name', 'Name')}
                    <span className="text-destructive"> *</span>
                  </Label>
                  <Input
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    {t('contacts.phone', 'Phone')}
                    <span className="text-destructive"> *</span>
                  </Label>
                  <Input
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    autoComplete="tel"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('contacts.email', 'Email')}</Label>
                  <Input
                    type="email"
                    value={newContactEmail}
                    onChange={(e) => setNewContactEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <DialogFooter className="sm:justify-end gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    {t('common.cancel', 'Cancel')}
                  </Button>
                  <Button
                    disabled={!canSubmitNew || addPending}
                    onClick={() => createNewPatientMutation.mutate()}
                  >
                    {createNewPatientMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <UserPlus className="h-4 w-4 mr-2" />
                    )}
                    {t('erp.dental.patients.createAndAdd', 'Create & add patient')}
                  </Button>
                </DialogFooter>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
