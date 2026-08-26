import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';

type ContactRow = {
  id: number;
  name: string;
};

type CreateContactModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (contact: ContactRow) => void;
  initialName?: string;
  compact?: boolean;
};

function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  let normalized = phone.replace(/[^\d+]/g, '');
  if (normalized && !normalized.startsWith('+')) {
    normalized = normalized.replace(/^0+/, '');
    if (normalized.length > 10) normalized = `+${normalized}`;
  }
  return normalized;
}

export default function CreateContactModal({ isOpen, onClose, onCreated, initialName = '', compact = false }: CreateContactModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [identifierType, setIdentifierType] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});

  const { data: contactCustomFieldsSchema = [] } = useQuery({
    queryKey: ['/api/company/custom-fields', 'contact'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company/custom-fields?entity=contact');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: isOpen,
  });

  const tagsArray = useMemo(
    () => tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    [tags]
  );

  const reset = (nextInitialName = '') => {
    setName(nextInitialName);
    setEmail('');
    setPhone('');
    setCompany('');
    setIdentifierType('');
    setIdentifier('');
    setNotes('');
    setTags('');
    setCustomFields({});
  };

  useEffect(() => {
    if (!isOpen) return;
    reset(compact ? initialName : '');
    // Reinitialize when a new open flow starts (especially POS compact flow).
  }, [isOpen, initialName, compact]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const customFieldsSanitized = Object.fromEntries(
        Object.entries(customFields).filter(
          ([, value]) =>
            value !== undefined &&
            value !== null &&
            value !== '' &&
            (!Array.isArray(value) || value.length > 0)
        )
      );
      const response = await apiRequest('POST', '/api/contacts', {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: normalizePhoneNumber(phone),
        company: company.trim() || undefined,
        identifierType: identifierType || undefined,
        identifier: identifier.trim() || undefined,
        notes: notes.trim() || undefined,
        tags: tagsArray,
        customFields: customFieldsSanitized,
      });
      const json = await response.json();
      const contact = (json?.contact ?? json) as ContactRow;
      if (!contact?.id) {
        throw new Error(t('contacts.create.failed', 'Failed to create contact'));
      }
      return contact;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      toast({
        title: t('contacts.create.success', 'Contact created'),
      });
      onCreated?.(created);
      reset();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('ui.common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t('contacts.create.title', 'Create customer')}</DialogTitle>
          <DialogDescription>
            {t('contacts.create.description', 'Add a contact and continue your workflow.')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('contacts.create.name', 'Name')} *</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('contacts.create.email', 'Email')}</Label>
              <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('contacts.create.phone', 'Phone')}</Label>
              <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('contacts.create.company', 'Company')}</Label>
              <Input value={company} onChange={(event) => setCompany(event.target.value)} />
            </div>
          </div>
          {!compact ? <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('contacts.create.channel', 'Channel')}</Label>
              <Select value={identifierType} onValueChange={setIdentifierType}>
                <SelectTrigger>
                  <SelectValue placeholder={t('contacts.create.channelPlaceholder', 'Select channel')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp_official">WhatsApp Official</SelectItem>
                  <SelectItem value="whatsapp_unofficial">WhatsApp Unofficial</SelectItem>
                  <SelectItem value="messenger">Facebook Messenger</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('contacts.create.channelIdentifier', 'Channel identifier')}</Label>
              <Input value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
            </div>
          </div> : null}
          <div className="space-y-2">
            <Label>{t('contacts.create.tags', 'Tags')}</Label>
            <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="vip, walk-in" />
          </div>
          {contactCustomFieldsSchema.length > 0 && (
            <div className="space-y-3">
              <Label>{t('contacts.create.customFields', 'Custom fields')}</Label>
              {contactCustomFieldsSchema.map((field: { id: number; fieldName: string; fieldLabel: string; fieldType: string; options?: { value: string; label: string }[] }) => (
                <div key={field.id} className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{field.fieldLabel}</Label>
                  {field.fieldType === 'select' ? (
                    <Select
                      value={(customFields[field.fieldName] as string) ?? ''}
                      onValueChange={(value) => setCustomFields((prev) => ({ ...prev, [field.fieldName]: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('ui.common.select', 'Select')} />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options ?? []).map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.fieldType === 'boolean' ? (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={Boolean(customFields[field.fieldName])}
                        onCheckedChange={(checked) =>
                          setCustomFields((prev) => ({ ...prev, [field.fieldName]: checked === true }))
                        }
                      />
                      <span className="text-sm">{t('ui.common.enabled', 'Enabled')}</span>
                    </div>
                  ) : (
                    <Input
                      type={field.fieldType === 'number' ? 'number' : field.fieldType === 'date' ? 'date' : 'text'}
                      value={(customFields[field.fieldName] as string) ?? ''}
                      onChange={(event) => setCustomFields((prev) => ({ ...prev, [field.fieldName]: event.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <Label>{t('contacts.create.notes', 'Notes')}</Label>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            {t('ui.common.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {t('contacts.create.submit', 'Create contact')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
