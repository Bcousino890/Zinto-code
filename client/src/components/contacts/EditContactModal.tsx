import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

interface Contact {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  avatarUrl?: string | null;
  tags?: string[] | null;
  customFields?: Record<string, any> | null;
  isActive?: boolean | null;
  identifier?: string | null;
  identifierType?: string | null;
  source?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EditContactModalProps {
  contact: Contact | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function EditContactModal({ contact, isOpen, onClose }: EditContactModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    identifierType: '',
    identifier: '',
    notes: '',
    tags: '',
    customFields: {} as Record<string, any>
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const { data: contactCustomFieldsSchema = [] } = useQuery({
    queryKey: ['/api/company/custom-fields', 'contact'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company/custom-fields?entity=contact');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  // Fetch available tags
  const { data: availableTags = [] } = useQuery({
    queryKey: ['/api/contacts/tags'],
    queryFn: async () => {
      const response = await fetch('/api/contacts/tags');
      if (!response.ok) {
        throw new Error('Failed to fetch tags');
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  useEffect(() => {
    if (contact) {
      setFormData({
        name: contact.name || '',
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || '',
        identifierType: contact.identifierType || '',
        identifier: contact.identifier || '',
        notes: contact.notes || '',
        tags: Array.isArray(contact.tags) ? contact.tags.join(', ') : '',
        customFields: contact.customFields && typeof contact.customFields === 'object' ? { ...contact.customFields } : {}
      });
    }
  }, [contact]);

  const updateContactMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!contact?.id) throw new Error(t('contacts.edit.contact_id_missing', 'Contact ID is missing'));

      const response = await apiRequest('PATCH', `/api/contacts/${contact.id}`, data);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || t('contacts.edit.update_failed', 'Failed to update contact'));
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('contacts.edit.success_title', 'Contact updated'),
        description: t('contacts.edit.success_description', 'The contact has been successfully updated.'),
      });

      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/tags'] });

      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('contacts.edit.error_title', 'Update failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    }
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const tagsArray = formData.tags
      ? formData.tags.split(',').map(tag => tag.trim()).filter(Boolean)
      : [];

    const customFieldsSanitized = Object.fromEntries(
      Object.entries(formData.customFields || {}).filter(
        ([_, v]) => v !== undefined && v !== null && v !== '' && (Array.isArray(v) ? v.length > 0 : true)
      )
    );
      
    updateContactMutation.mutate({
      ...formData,
      tags: tagsArray,
      customFields: customFieldsSanitized
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('contacts.edit.title', 'Edit Contact')}</DialogTitle>
          <DialogDescription>
            {t('contacts.edit.description', 'Make changes to the contact information below.')}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('contacts.edit.name_label', 'Name')} *</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t('contacts.edit.email_label', 'Email')}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">{t('contacts.edit.phone_label', 'Phone')}</Label>
              <Input
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company">{t('contacts.edit.company_label', 'Company')}</Label>
              <Input
                id="company"
                name="company"
                value={formData.company}
                onChange={handleInputChange}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="identifierType">{t('contacts.edit.channel_label', 'Channel')}</Label>
              <Select
                value={formData.identifierType}
                onValueChange={(value) => handleSelectChange('identifierType', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('contacts.edit.select_channel_placeholder', 'Select channel')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp_official">{t('contacts.edit.channel.whatsapp_official', 'WhatsApp Official')}</SelectItem>
                  <SelectItem value="whatsapp_unofficial">{t('contacts.edit.channel.whatsapp_unofficial', 'WhatsApp Unofficial')}</SelectItem>
                  <SelectItem value="messenger">{t('contacts.edit.channel.messenger', 'Facebook Messenger')}</SelectItem>
                  <SelectItem value="instagram">{t('contacts.edit.channel.instagram', 'Instagram')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="identifier">{t('contacts.edit.channel_identifier_label', 'Channel Identifier')}</Label>
              <Input
                id="identifier"
                name="identifier"
                value={formData.identifier}
                onChange={handleInputChange}
                placeholder={t('contacts.edit.channel_identifier_placeholder', 'Phone number or ID')}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="tags">{t('contacts.edit.tags_label', 'Tags (comma separated)')}</Label>
            <Input
              id="tags"
              name="tags"
              value={formData.tags}
              onChange={handleInputChange}
              placeholder={t('contacts.edit.tags_placeholder', 'lead, customer, etc.')}
            />
            {availableTags.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  {t('contacts.edit.available_tags', 'Available tags:')}
                </div>
                <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                  {availableTags.map((tag: string) => {
                    const currentTags = formData.tags ? formData.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t) : [];
                    const isSelected = currentTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          const currentTags = formData.tags ? formData.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t) : [];
                          if (isSelected) {
                            // Remove tag if already selected
                            const newTags = currentTags.filter((t: string) => t !== tag);
                            setFormData(prev => ({ ...prev, tags: newTags.join(', ') }));
                          } else {
                            // Add tag if not selected
                            const newTags = [...currentTags, tag];
                            setFormData(prev => ({ ...prev, tags: newTags.join(', ') }));
                          }
                        }}
                        className={`px-2 py-1 text-xs rounded border transition-colors ${
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted hover:bg-muted/80 border-border'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {contactCustomFieldsSchema.length > 0 && (
            <div className="space-y-3">
              <Label>{t('contacts.edit.custom_fields_label', 'Custom Fields')}</Label>
              <div className="space-y-3">
                {contactCustomFieldsSchema.map((field: { id: number; fieldName: string; fieldLabel: string; fieldType: string; options?: { value: string; label: string }[] }) => (
                  <div key={field.id} className="space-y-2">
                    <Label htmlFor={`edit-cf-${field.fieldName}`} className="text-sm font-medium">
                      {field.fieldLabel}
                      {field.fieldType === 'multi_select' && ' (select multiple)'}
                    </Label>
                    {field.fieldType === 'text' && (
                      <Input
                        id={`edit-cf-${field.fieldName}`}
                        value={formData.customFields[field.fieldName] ?? ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          customFields: { ...prev.customFields, [field.fieldName]: e.target.value }
                        }))}
                        placeholder={t('contacts.edit.enter_value', 'Enter value...')}
                      />
                    )}
                    {field.fieldType === 'number' && (
                      <Input
                        id={`edit-cf-${field.fieldName}`}
                        type="number"
                        value={formData.customFields[field.fieldName] ?? ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          customFields: {
                            ...prev.customFields,
                            [field.fieldName]: e.target.value === '' ? undefined : parseFloat(e.target.value)
                          }
                        }))}
                        placeholder={t('contacts.edit.enter_value', 'Enter value...')}
                      />
                    )}
                    {field.fieldType === 'select' && (
                      <Select
                        value={formData.customFields[field.fieldName] ?? ''}
                        onValueChange={(value) => setFormData(prev => ({
                          ...prev,
                          customFields: { ...prev.customFields, [field.fieldName]: value }
                        }))}
                      >
                        <SelectTrigger id={`edit-cf-${field.fieldName}`}>
                          <SelectValue placeholder={t('contacts.edit.select_option', 'Select...')} />
                        </SelectTrigger>
                        <SelectContent>
                          {(field.options && Array.isArray(field.options) ? field.options : []).map((opt: { value?: string; label?: string } | string) => {
                            const val = typeof opt === 'string' ? opt : (opt.value ?? opt.label ?? '');
                            const lab = typeof opt === 'string' ? opt : (opt.label ?? opt.value ?? '');
                            return (
                              <SelectItem key={val} value={val}>
                                {lab}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    )}
                    {field.fieldType === 'multi_select' && (
                      <div className="flex flex-wrap gap-2">
                        {(field.options && Array.isArray(field.options) ? field.options : []).map((opt: { value?: string; label?: string } | string) => {
                          const optVal = typeof opt === 'string' ? opt : (opt.value ?? opt.label ?? '');
                          const optLab = typeof opt === 'string' ? opt : (opt.label ?? opt.value ?? '');
                          const selected = Array.isArray(formData.customFields[field.fieldName])
                            ? formData.customFields[field.fieldName].includes(optVal)
                            : false;
                          return (
                            <div key={optVal} className="flex items-center space-x-2">
                              <Checkbox
                                id={`edit-cf-${field.fieldName}-${optVal}`}
                                checked={selected}
                                onCheckedChange={(checked) => {
                                  const current = Array.isArray(formData.customFields[field.fieldName])
                                    ? formData.customFields[field.fieldName]
                                    : [];
                                  const next = checked
                                    ? [...current, optVal]
                                    : current.filter((v: string) => v !== optVal);
                                  setFormData(prev => ({
                                    ...prev,
                                    customFields: { ...prev.customFields, [field.fieldName]: next }
                                  }));
                                }}
                              />
                              <label htmlFor={`edit-cf-${field.fieldName}-${optVal}`} className="text-sm cursor-pointer">
                                {optLab}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {field.fieldType === 'date' && (
                      <Input
                        id={`edit-cf-${field.fieldName}`}
                        type="date"
                        value={formData.customFields[field.fieldName] ?? ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          customFields: { ...prev.customFields, [field.fieldName]: e.target.value || undefined }
                        }))}
                      />
                    )}
                    {field.fieldType === 'boolean' && (() => {
                      const boolOpts = field.options && !Array.isArray(field.options) ? (field.options as { trueLabel?: string; falseLabel?: string }) : null;
                      const trueLabel = boolOpts?.trueLabel ?? t('common.yes', 'Yes');
                      const falseLabel = boolOpts?.falseLabel ?? t('common.no', 'No');
                      return (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`edit-cf-${field.fieldName}`}
                            checked={!!formData.customFields[field.fieldName]}
                            onCheckedChange={(checked) => setFormData(prev => ({
                              ...prev,
                              customFields: { ...prev.customFields, [field.fieldName]: !!checked }
                            }))}
                          />
                          <label htmlFor={`edit-cf-${field.fieldName}`} className="text-sm">
                            {formData.customFields[field.fieldName] ? trueLabel : falseLabel}
                          </label>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">{t('contacts.edit.notes_label', 'Notes')}</Label>
            <Textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={3}
            />
          </div>
          
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              variant="brand"
              className="btn-brand-primary"
            >
              {isSubmitting ? t('contacts.edit.saving', 'Saving...') : t('contacts.edit.save_changes', 'Save Changes')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}