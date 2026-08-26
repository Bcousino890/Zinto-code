import { useState, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { isChannelAvailable } from '@shared/channel-utils';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, AlertCircle, Info, Upload, X, Image as ImageIcon, Video, FileText } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CreateTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateTemplateModal({ isOpen, onClose }: CreateTemplateModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'marketing' | 'utility' | 'authentication'>('utility');
  const [language, setLanguage] = useState('en');
  const [content, setContent] = useState('');
  const [headerType, setHeaderType] = useState<'none' | 'text' | 'image' | 'video' | 'document'>('none');
  const [headerText, setHeaderText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [headerMediaFile, setHeaderMediaFile] = useState<File | null>(null);
  const [headerMediaPreview, setHeaderMediaPreview] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null);


  const { data: channels = [] } = useQuery({
    queryKey: ['/api/channel-connections'],
    select: (data: any[]) => data.filter(ch => ch.channelType === 'whatsapp_official' && isChannelAvailable(ch)),
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/whatsapp-templates', data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || t('templates.create_failed', 'Failed to create template'));
      }
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t('templates.created', 'Template Created'),
        description: t('templates.created_success', 'Template has been created and submitted for approval'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp-templates'] });
      resetForm();
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

  const resetForm = () => {
    setName('');
    setDescription('');
    setCategory('utility');
    setLanguage('en');
    setContent('');
    setHeaderType('none');
    setHeaderText('');
    setFooterText('');
    setHeaderMediaFile(null);
    setHeaderMediaPreview(null);
    setSelectedConnectionId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleMediaFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;


    const validTypes: Record<string, string[]> = {
      image: ['image/jpeg', 'image/png'],
      video: ['video/mp4'],
      document: ['application/pdf']
    };

    if (headerType !== 'none' && headerType !== 'text') {
      const allowed = validTypes[headerType];
      if (!allowed.includes(file.type)) {
        toast({
          title: t('common.error', 'Error'),
          description: t('templates.invalid_file_type', 'Invalid file type for selected header format'),
          variant: 'destructive',
        });
        return;
      }
    }


    const maxSizes: Record<string, number> = {
      image: 5 * 1024 * 1024,
      video: 16 * 1024 * 1024,
      document: 100 * 1024 * 1024
    };

    const maxSize = maxSizes[headerType as keyof typeof maxSizes] || 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.file_too_large', 'File size exceeds the maximum allowed'),
        variant: 'destructive',
      });
      return;
    }

    setHeaderMediaFile(file);
    setHeaderMediaPreview(URL.createObjectURL(file));
  };

  const removeMediaFile = () => {
    if (headerMediaPreview) {
      URL.revokeObjectURL(headerMediaPreview);
    }
    setHeaderMediaFile(null);
    setHeaderMediaPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();


    if (!name.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.name_required', 'Template name is required'),
        variant: 'destructive',
      });
      return;
    }


    if (!/^[a-z0-9_]+$/.test(name)) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.name_format_error', 'Template name must contain only lowercase letters, numbers, and underscores'),
        variant: 'destructive',
      });
      return;
    }

    if (!content.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.content_required', 'Template content is required'),
        variant: 'destructive',
      });
      return;
    }


    if (['image', 'video', 'document'].includes(headerType) && !headerMediaFile) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.media_required', 'Please upload a media file for the header'),
        variant: 'destructive',
      });
      return;
    }

    if (channels.length === 0) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.no_channels', 'Please connect a WhatsApp Business API channel first'),
        variant: 'destructive',
      });
      return;
    }

    if (!selectedConnectionId) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.select_connection', 'Please select a WhatsApp connection'),
        variant: 'destructive',
      });
      return;
    }


    const variablePattern = /\{\{(\d+)\}\}/g;
    const variables: string[] = [];
    let match;
    while ((match = variablePattern.exec(content)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }


    let headerMediaUrl: string | undefined;
    if (headerMediaFile && ['image', 'video', 'document'].includes(headerType)) {
      try {
        setUploadingMedia(true);
        const formData = new FormData();
        formData.append('media', headerMediaFile);

        const uploadResponse = await fetch('/api/templates/upload-media', {
          method: 'POST',
          body: formData
        });

        if (!uploadResponse.ok) {
          throw new Error(t('templates.media_upload_failed', 'Media upload failed'));
        }

        const uploadData = await uploadResponse.json();
        headerMediaUrl = uploadData.data.url;
      } catch (error) {
        toast({
          title: t('common.error', 'Error'),
          description: t('templates.media_upload_failed', 'Failed to upload media file'),
          variant: 'destructive',
        });
        setUploadingMedia(false);
        return;
      } finally {
        setUploadingMedia(false);
      }
    }


    const templateData = {
      name: name.trim(),
      description: description.trim() || undefined,
      whatsappTemplateCategory: category,
      whatsappTemplateLanguage: language,
      content: content.trim(),
      variables,
      whatsappChannelType: 'official',
      connectionId: selectedConnectionId,
      headerType: headerType !== 'none' ? headerType : undefined,
      headerText: headerType === 'text' ? headerText.trim() : undefined,
      headerMediaUrl: headerMediaUrl,
      footerText: footerText.trim() || undefined,
    };

    createTemplateMutation.mutate(templateData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('templates.create_title', 'Create WhatsApp Template')}</DialogTitle>
          <DialogDescription>
            {t('templates.create_description', 'Create a new message template for WhatsApp Business API. Templates must be approved by Meta before use.')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {channels.length === 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {t('templates.no_connections_alert', 'No active WhatsApp Business API connections found. Please connect a WhatsApp channel first.')}
              </AlertDescription>
            </Alert>
          )}

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {t('templates.approval_notice', 'Templates are submitted to Meta for approval. This process typically takes 24-48 hours.')}
            </AlertDescription>
          </Alert>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                {t('templates.name', 'Template Name')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                placeholder={t('templates.name_example', 'welcome_message')}
                required
              />
              <p className="text-xs text-gray-500">
                {t('templates.name_help', 'Use lowercase letters, numbers, and underscores only')}
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
              <Label htmlFor="connection">
                {t('templates.whatsapp_connection', 'WhatsApp Connection')} <span className="text-red-500">*</span>
              </Label>
              <Select
                value={selectedConnectionId?.toString() || ''}
                onValueChange={(value) => setSelectedConnectionId(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('templates.select_connection_placeholder', 'Select a WhatsApp connection')} />
                </SelectTrigger>
                <SelectContent>
                  {channels.length === 0 ? (
                    <div className="p-2 text-sm text-gray-500">
                      {t('templates.no_connections', 'No active WhatsApp connections found')}
                    </div>
                  ) : (
                    channels.map((channel: any) => {
                      const phoneNumber = channel.connectionData?.phoneNumber ||
                                         channel.connectionData?.phone_number ||
                                         channel.accountName;
                      const displayName = phoneNumber || channel.accountName || t('templates.connection_fallback', 'Connection {{id}}', { id: channel.id });
                      return (
                        <SelectItem key={channel.id} value={channel.id.toString()}>
                          {displayName}
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                {t('templates.connection_help', 'Select the WhatsApp Business API connection to submit this template')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="category">
                  {t('templates.category', 'Category')} <span className="text-red-500">*</span>
                </Label>
                <Select value={category} onValueChange={(value: any) => setCategory(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utility">{t('templates.category.utility', 'Utility')}</SelectItem>
                    <SelectItem value="marketing">{t('templates.category.marketing', 'Marketing')}</SelectItem>
                    <SelectItem value="authentication">{t('templates.category.authentication', 'Authentication')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {category === 'marketing' && t('templates.category_help.marketing', 'Promotional content, requires opt-in')}
                  {category === 'utility' && t('templates.category_help.utility', 'Transactional updates, confirmations')}
                  {category === 'authentication' && t('templates.category_help.authentication', 'OTP and verification codes')}
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="language">
                  {t('templates.language', 'Language')} <span className="text-red-500">*</span>
                </Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">{t('templates.language.en', 'English')}</SelectItem>
                    <SelectItem value="en_US">{t('templates.language.en_US', 'English (US)')}</SelectItem>
                    <SelectItem value="es">{t('templates.language.es', 'Spanish')}</SelectItem>
                    <SelectItem value="pt_BR">{t('templates.language.pt_BR', 'Portuguese (Brazil)')}</SelectItem>
                    <SelectItem value="fr">{t('templates.language.fr', 'French')}</SelectItem>
                    <SelectItem value="de">{t('templates.language.de', 'German')}</SelectItem>
                    <SelectItem value="it">{t('templates.language.it', 'Italian')}</SelectItem>
                    <SelectItem value="ar">{t('templates.language.ar', 'Arabic')}</SelectItem>
                    <SelectItem value="hi">{t('templates.language.hi', 'Hindi')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="headerType">{t('templates.header', 'Header (Optional)')}</Label>
              <Select value={headerType} onValueChange={(value: any) => {
                setHeaderType(value);

                if (!['image', 'video', 'document'].includes(value)) {
                  removeMediaFile();
                }
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('templates.header.none', 'No Header')}</SelectItem>
                  <SelectItem value="text">{t('templates.header.text', 'Text Header')}</SelectItem>
                  <SelectItem value="image">{t('templates.header.image', 'Image Header')}</SelectItem>
                  <SelectItem value="video">{t('templates.header.video', 'Video Header')}</SelectItem>
                  <SelectItem value="document">{t('templates.header.document', 'Document Header')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                {headerType === 'image' && t('templates.header_help.image', 'JPEG or PNG, max 5MB')}
                {headerType === 'video' && t('templates.header_help.video', 'MP4, max 16MB')}
                {headerType === 'document' && t('templates.header_help.document', 'PDF, max 100MB')}
              </p>
            </div>

            {headerType === 'text' && (
              <div className="grid gap-2">
                <Label htmlFor="headerText">{t('templates.header_text', 'Header Text')}</Label>
                <Input
                  id="headerText"
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  placeholder={t('templates.header_text_placeholder', 'Enter header text')}
                  maxLength={60}
                />
                <p className="text-xs text-gray-500">{headerText.length}/60</p>
              </div>
            )}

            {['image', 'video', 'document'].includes(headerType) && (
              <div className="grid gap-2">
                <Label htmlFor="headerMedia">
                  {t('templates.header_media', 'Header Media')} <span className="text-red-500">*</span>
                </Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  id="headerMedia"
                  onChange={handleMediaFileSelect}
                  accept={
                    headerType === 'image' ? 'image/jpeg,image/png' :
                    headerType === 'video' ? 'video/mp4' :
                    'application/pdf'
                  }
                  className="hidden"
                />
                {!headerMediaPreview ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {t('templates.upload_media', 'Upload Media')}
                  </Button>
                ) : (
                  <div className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {headerType === 'image' && <ImageIcon className="h-5 w-5 text-blue-500" />}
                        {headerType === 'video' && <Video className="h-5 w-5 text-purple-500" />}
                        {headerType === 'document' && <FileText className="h-5 w-5 text-red-500" />}
                        <span className="text-sm font-medium">{headerMediaFile?.name}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={removeMediaFile}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    {headerType === 'image' && headerMediaPreview && (
                      <img
                        src={headerMediaPreview}
                        alt={t('templates.image_preview', 'Preview')}
                        className="w-full h-48 object-cover rounded"
                      />
                    )}
                    {headerType === 'video' && headerMediaPreview && (
                      <video
                        src={headerMediaPreview}
                        controls
                        className="w-full h-48 rounded"
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="content">
                {t('templates.body', 'Body Content')} <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t('templates.body_placeholder', 'Hello {{1}}, your order {{2}} has been confirmed.')}
                rows={6}
                required
                maxLength={1024}
              />
              <p className="text-xs text-gray-500">
                {t('templates.variables_help', 'Use {{1}}, {{2}}, etc. for dynamic variables')} • {content.length}/1024
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="footerText">{t('templates.footer', 'Footer (Optional)')}</Label>
              <Input
                id="footerText"
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                placeholder={t('templates.footer_placeholder', 'Reply STOP to unsubscribe')}
                maxLength={60}
              />
              <p className="text-xs text-gray-500">{footerText.length}/60</p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={uploadingMedia || createTemplateMutation.isPending}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={uploadingMedia || createTemplateMutation.isPending} className="btn-brand-primary">
              {(uploadingMedia || createTemplateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {uploadingMedia ? t('templates.uploading', 'Uploading...') : t('templates.submit_for_approval', 'Submit for Approval')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

