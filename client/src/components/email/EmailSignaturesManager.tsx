import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Plus, Edit, Trash2, Star, FileSignature } from 'lucide-react';

interface EmailSignature {
  id: number;
  name: string;
  htmlContent?: string;
  plainTextContent?: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface EmailSignatureFormData {
  name: string;
  htmlContent: string;
  plainTextContent: string;
  isDefault: boolean;
  isActive: boolean;
}

export function EmailSignaturesManager() {
  const { t } = useTranslation();
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSignature, setEditingSignature] = useState<EmailSignature | null>(null);
  const [formData, setFormData] = useState<EmailSignatureFormData>({
    name: '',
    htmlContent: '',
    plainTextContent: '',
    isDefault: false,
    isActive: true
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchSignatures();
  }, []);

  const fetchSignatures = async () => {
    try {
      const response = await fetch('/api/email-signatures');
      const result = await response.json();

      if (result.success) {
        setSignatures(result.data);
      } else {
        toast({
          title: t('common.error', 'Error'),
          description: t('email.signatures_manager.fetch_error', 'Failed to fetch email signatures'),
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error fetching signatures:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('email.signatures_manager.fetch_error', 'Failed to fetch email signatures'),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('email.signatures_manager.name_required', 'Signature name is required'),
        variant: "destructive"
      });
      return;
    }

    if (!formData.htmlContent.trim() && !formData.plainTextContent.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('email.signatures_manager.content_required', 'Either HTML content or plain text content is required'),
        variant: "destructive"
      });
      return;
    }

    try {
      const url = editingSignature
        ? `/api/email-signatures/${editingSignature.id}`
        : '/api/email-signatures';

      const method = editingSignature ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: t('common.success', 'Success'),
          description: editingSignature ? t('email.signatures_manager.update_success', 'Signature updated successfully') : t('email.signatures_manager.create_success', 'Signature created successfully')
        });
        setIsDialogOpen(false);
        resetForm();
        fetchSignatures();
      } else {
        toast({
          title: t('common.error', 'Error'),
          description: result.error || t('email.signatures_manager.save_error', 'Failed to save signature'),
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error saving signature:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('email.signatures_manager.save_error', 'Failed to save signature'),
        variant: "destructive"
      });
    }
  };

  const handleEdit = (signature: EmailSignature) => {
    setEditingSignature(signature);
    setFormData({
      name: signature.name,
      htmlContent: signature.htmlContent || '',
      plainTextContent: signature.plainTextContent || '',
      isDefault: signature.isDefault,
      isActive: signature.isActive
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (signatureId: number) => {
    if (!confirm(t('email.signatures_manager.delete_confirm', 'Are you sure you want to delete this signature?'))) {
      return;
    }

    try {
      const response = await fetch(`/api/email-signatures/${signatureId}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: t('common.success', 'Success'),
          description: t('email.signatures_manager.delete_success', 'Signature deleted successfully')
        });
        fetchSignatures();
      } else {
        toast({
          title: t('common.error', 'Error'),
          description: result.error || t('email.signatures_manager.delete_error', 'Failed to delete signature'),
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error deleting signature:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('email.signatures_manager.delete_error', 'Failed to delete signature'),
        variant: "destructive"
      });
    }
  };

  const handleSetDefault = async (signatureId: number) => {
    try {
      const response = await fetch(`/api/email-signatures/${signatureId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isDefault: true })
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: t('common.success', 'Success'),
          description: t('email.signatures_manager.set_default_success', 'Default signature updated')
        });
        fetchSignatures();
      } else {
        toast({
          title: t('common.error', 'Error'),
          description: result.error || t('email.signatures_manager.set_default_error', 'Failed to set default signature'),
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error setting default signature:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('email.signatures_manager.set_default_error', 'Failed to set default signature'),
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setEditingSignature(null);
    setFormData({
      name: '',
      htmlContent: '',
      plainTextContent: '',
      isDefault: false,
      isActive: true
    });
  };

  if (loading) {
    return <div className="flex justify-center p-8">{t('email.signatures_manager.loading', 'Loading signatures...')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">{t('email.signatures_manager.title', 'Email Signatures')}</h2>
          <p className="text-muted-foreground">{t('email.signatures_manager.subtitle', 'Manage your email signatures for professional communication')}</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              {t('email.signatures_manager.new_signature', 'New Signature')}
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingSignature ? t('email.signatures_manager.edit_title', 'Edit Signature') : t('email.signatures_manager.create_title', 'Create New Signature')}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">{t('email.signatures_manager.name_label', 'Signature Name *')}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={t('email.signatures_manager.name_placeholder', 'Enter signature name (e.g., Professional, Casual)')}
                  required
                />
              </div>

              <Tabs defaultValue="html" className="w-full">
                <TabsList>
                  <TabsTrigger value="html">{t('email.signatures_manager.tab_html', 'HTML Signature')}</TabsTrigger>
                  <TabsTrigger value="plain">{t('email.signatures_manager.tab_plain', 'Plain Text')}</TabsTrigger>
                </TabsList>

                <TabsContent value="html" className="space-y-2">
                  <Label>{t('email.signatures_manager.tab_html', 'HTML Signature')}</Label>
                  <Textarea
                    value={formData.htmlContent}
                    onChange={(e) => setFormData(prev => ({ ...prev, htmlContent: e.target.value }))}
                    placeholder={t('email.signatures_manager.html_placeholder', 'HTML signature with formatting (e.g., <br>Best regards,<br><strong>Your Name</strong>)')}
                    rows={8}
                    className="font-mono text-sm"
                  />
                  <p className="text-sm text-muted-foreground">
                    {t('email.signatures_manager.html_hint', 'Use HTML tags for formatting. Example: &lt;br&gt; for line breaks, &lt;strong&gt; for bold text')}
                  </p>
                </TabsContent>

                <TabsContent value="plain" className="space-y-2">
                  <Label>{t('email.signatures_manager.plain_label', 'Plain Text Signature')}</Label>
                  <Textarea
                    value={formData.plainTextContent}
                    onChange={(e) => setFormData(prev => ({ ...prev, plainTextContent: e.target.value }))}
                    placeholder={t('email.signatures_manager.plain_placeholder', 'Plain text version of your signature')}
                    rows={8}
                  />
                  <p className="text-sm text-muted-foreground">
                    {t('email.signatures_manager.plain_hint', "Plain text version for email clients that don't support HTML")}
                  </p>
                </TabsContent>
              </Tabs>

              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isDefault"
                    checked={formData.isDefault}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isDefault: checked }))}
                  />
                  <Label htmlFor="isDefault">{t('email.signatures_manager.set_default_label', 'Set as Default Signature')}</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                  />
                  <Label htmlFor="isActive">{t('common.active', 'Active')}</Label>
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button type="submit">
                  {editingSignature ? t('email.signatures_manager.update_button', 'Update Signature') : t('email.signatures_manager.create_button', 'Create Signature')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {signatures.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileSignature className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('email.signatures_manager.empty_title', 'No Email Signatures')}</h3>
              <p className="text-muted-foreground text-center mb-4">
                {t('email.signatures_manager.empty_description', 'Create your first email signature for professional communication')}
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {t('email.signatures_manager.create_button', 'Create Signature')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          signatures.map((signature) => (
            <Card key={signature.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {signature.name}
                      {signature.isDefault && (
                        <Badge variant="default" className="flex items-center gap-1">
                          <Star className="w-3 h-3" />
                          {t('pipeline.default', 'Default')}
                        </Badge>
                      )}
                      <Badge variant={signature.isActive ? "default" : "secondary"}>
                        {signature.isActive ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      {t('email.signatures_manager.created_on', 'Created {{date}}', { date: new Date(signature.createdAt).toLocaleDateString() })}
                    </CardDescription>
                  </div>

                  <div className="flex space-x-2">
                    {!signature.isDefault && signature.isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetDefault(signature.id)}
                        title={t('pipeline.set_as_default', 'Set as default')}
                      >
                        <Star className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(signature)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(signature.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-4">
                  {signature.htmlContent && (
                    <div>
                      <strong className="text-sm">{t('email.signatures_manager.html_preview_label', 'HTML Preview:')}</strong>
                      <div
                        className="mt-1 p-3 border rounded-md bg-muted/50 text-sm"
                        dangerouslySetInnerHTML={{ __html: signature.htmlContent }}
                      />
                    </div>
                  )}

                  {signature.plainTextContent && (
                    <div>
                      <strong className="text-sm">{t('email.signatures_manager.plain_text_label', 'Plain Text:')}</strong>
                      <div className="mt-1 p-3 border rounded-md bg-muted/50 text-sm whitespace-pre-wrap font-mono">
                        {signature.plainTextContent}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
