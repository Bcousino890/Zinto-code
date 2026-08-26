import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, AlertCircle, Image as ImageIcon, Video, FileText } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface EditTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: any;
}

export function EditTemplateModal({ isOpen, onClose, template }: EditTemplateModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (template && isOpen) {
      setDescription(template.description || '');
      setIsActive(template.isActive ?? true);
    }
  }, [template, isOpen]);

  const updateTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('PATCH', `/api/whatsapp-templates/${template.id}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || t('templates.update_failed', 'Failed to update template'));
      }
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t('templates.updated', 'Template Updated'),
        description: t('templates.updated_success', 'Template has been updated successfully'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp-templates'] });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    updateTemplateMutation.mutate({
      description: description.trim() || undefined,
      isActive,
    });
  };

  if (!template) return null;

  const isApproved = template.whatsappTemplateStatus === 'approved';
  const isPending = template.whatsappTemplateStatus === 'pending';
  const isRejected = template.whatsappTemplateStatus === 'rejected';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('templates.edit_title', 'Edit Template')}</DialogTitle>
          <DialogDescription>
            {t('templates.edit_description', 'Update template settings. Note: Template content cannot be modified after submission.')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRejected && template.rejectionReason && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>{t('templates.rejected', 'Rejected by Meta:')}</strong> {template.rejectionReason}
              </AlertDescription>
            </Alert>
          )}

          {isPending && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t('templates.pending_notice', 'This template is pending approval from Meta. Changes are limited until approved.')}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>{t('templates.name', 'Template Name')}</Label>
              <Input value={template.name} disabled />
              <p className="text-xs text-gray-500">
                {t('templates.name_readonly', 'Template name cannot be changed')}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">{t('templates.description_label', 'Description')}</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('templates.description_placeholder', 'Brief description of this template')}
              />
            </div>

            <div className="grid gap-2">
              <Label>{t('templates.category', 'Category')}</Label>
              <Input 
                value={template.whatsappTemplateCategory || t('common.na', 'N/A')} 
                disabled 
                className="capitalize"
              />
            </div>

            <div className="grid gap-2">
              <Label>{t('templates.status', 'Status')}</Label>
              <Input 
                value={template.whatsappTemplateStatus || 'draft'} 
                disabled 
                className="capitalize"
              />
            </div>

            <div className="grid gap-2">
              <Label>{t('templates.language', 'Language')}</Label>
              <Input
                value={template.whatsappTemplateLanguage || 'en'}
                disabled
                className="uppercase"
              />
            </div>

            {template.connection && (
              <div className="grid gap-2">
                <Label>{t('templates.whatsapp_connection', 'WhatsApp Connection')}</Label>
                <Input
                  value={template.connection.phoneNumber || template.connection.accountName || t('templates.connection_fallback', 'Connection {{id}}', { id: template.connection.id })}
                  disabled
                />
                <p className="text-xs text-gray-500">
                  {t('templates.connection_readonly', 'Connection used to submit this template')}
                </p>
              </div>
            )}

            {/* Media Header Display */}
            {template.mediaUrls && template.mediaUrls.length > 0 && (
              <div className="grid gap-2">
                <Label>{t('templates.header_media', 'Header Media')}</Label>
                <div className="border rounded-lg p-4 bg-gray-50">
                  {template.mediaUrls[0].match(/\.(jpg|jpeg|png|webp)$/i) && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <ImageIcon className="h-4 w-4" />
                        <span>{t('templates.media_type.image', 'Image Header')}</span>
                      </div>
                      <img
                        src={template.mediaUrls[0]}
                        alt="Template header"
                        className="w-full max-h-48 object-cover rounded"
                      />
                    </div>
                  )}
                  {template.mediaUrls[0].match(/\.(mp4|3gpp)$/i) && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Video className="h-4 w-4" />
                        <span>{t('templates.media_type.video', 'Video Header')}</span>
                      </div>
                      <video
                        src={template.mediaUrls[0]}
                        controls
                        className="w-full max-h-48 rounded"
                      />
                    </div>
                  )}
                  {template.mediaUrls[0].match(/\.pdf$/i) && (
                    <div className="flex items-center gap-2 p-3 bg-white rounded border">
                      <FileText className="h-5 w-5 text-red-500" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{t('templates.media_type.document', 'Document Header')}</p>
                        <a
                          href={template.mediaUrls[0]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {t('templates.view_document', 'View Document')}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {t('templates.media_readonly', 'Media cannot be changed after submission')}
                </p>
              </div>
            )}

            <div className="grid gap-2">
              <Label>{t('templates.body', 'Body Content')}</Label>
              <Textarea
                value={template.content}
                disabled
                rows={6}
              />
              <p className="text-xs text-gray-500">
                {t('templates.content_readonly', 'Template content cannot be changed after submission')}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isActive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                {t('templates.active_for_campaigns', 'Active (available for use in campaigns)')}
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={updateTemplateMutation.isPending} className="btn-brand-primary">
              {updateTemplateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.save', 'Save Changes')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

