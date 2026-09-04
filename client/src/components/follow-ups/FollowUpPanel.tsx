import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Clock, Plus, Calendar, MessageSquare, X, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { format } from 'date-fns';

interface FollowUpSchedule {
  id: number;
  scheduleId: string;
  conversationId: number;
  contactId: number;
  messageType: 'text' | 'image' | 'video' | 'audio' | 'document';
  messageContent: string;
  mediaUrl?: string;
  caption?: string;
  scheduledFor: string;
  status: 'scheduled' | 'sent' | 'failed' | 'cancelled' | 'expired';
  sentAt?: string;
  failedReason?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
}

interface FollowUpPanelProps {
  conversationId: number;
  contactId: number;
}

const FollowUpPanel: React.FC<FollowUpPanelProps> = ({ conversationId, contactId }) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newFollowUp, setNewFollowUp] = useState({
    messageType: 'text' as const,
    messageContent: '',
    mediaUrl: '',
    caption: '',
    delayAmount: 24,
    delayUnit: 'hours' as const,
    specificDatetime: ''
  });


  const { data: followUps = [], isLoading } = useQuery<FollowUpSchedule[]>({
    queryKey: ['followUps', conversationId],
    queryFn: () =>
      apiRequest('GET', `/api/follow-ups/conversation/${conversationId}`).then((res) => res.json())
  });


  const createFollowUpMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/follow-ups', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followUps', conversationId] });
      setIsCreateDialogOpen(false);
      setNewFollowUp({
        messageType: 'text',
        messageContent: '',
        mediaUrl: '',
        caption: '',
        delayAmount: 24,
        delayUnit: 'hours',
        specificDatetime: ''
      });
      toast({
        title: t('follow_ups.panel.scheduled_title', 'Follow-up Scheduled'),
        description: t('follow_ups.panel.scheduled_description', 'Your follow-up message has been scheduled successfully.'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message || t('follow_ups.panel.schedule_error', 'Failed to schedule follow-up'),
        variant: 'destructive',
      });
    }
  });


  const cancelFollowUpMutation = useMutation({
    mutationFn: (scheduleId: string) => apiRequest('DELETE', `/api/follow-ups/${scheduleId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followUps', conversationId] });
      toast({
        title: t('follow_ups.panel.cancelled_title', 'Follow-up Cancelled'),
        description: t('follow_ups.panel.cancelled_description', 'The follow-up message has been cancelled.'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message || t('follow_ups.panel.cancel_error', 'Failed to cancel follow-up'),
        variant: 'destructive',
      });
    }
  });

  const handleCreateFollowUp = () => {
    const scheduledFor = newFollowUp.specificDatetime
      ? new Date(newFollowUp.specificDatetime)
      : new Date(Date.now() + (newFollowUp.delayAmount * getDelayMultiplier(newFollowUp.delayUnit)));

    const data = {
      conversationId,
      contactId,
      messageType: newFollowUp.messageType,
      messageContent: newFollowUp.messageContent,
      mediaUrl: newFollowUp.mediaUrl || null,
      caption: newFollowUp.caption || null,
      scheduledFor: scheduledFor.toISOString(),
      triggerEvent: 'manual',
      channelType: 'whatsapp'
    };

    createFollowUpMutation.mutate(data);
  };

  const getDelayMultiplier = (unit: string) => {
    switch (unit) {
      case 'minutes': return 60 * 1000;
      case 'hours': return 60 * 60 * 1000;
      case 'days': return 24 * 60 * 60 * 1000;
      case 'weeks': return 7 * 24 * 60 * 60 * 1000;
      default: return 60 * 60 * 1000;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'scheduled': return <Clock className="w-4 h-4 text-blue-500" />;
      case 'sent': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'cancelled': return <X className="w-4 h-4 text-gray-500" />;
      case 'expired': return <AlertCircle className="w-4 h-4 text-orange-500" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'sent': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      case 'expired': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            {t('follow_ups.panel.title', 'Follow-up Messages')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            {t('follow_ups.panel.title', 'Follow-up Messages')}
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                {t('follow_ups.panel.schedule_button', 'Schedule Follow-up')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t('follow_ups.panel.dialog_title', 'Schedule Follow-up Message')}</DialogTitle>
              </DialogHeader>

              <Tabs defaultValue="message" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="message">{t('follow_ups.panel.tab_message', 'Message')}</TabsTrigger>
                  <TabsTrigger value="timing">{t('follow_ups.panel.tab_timing', 'Timing')}</TabsTrigger>
                </TabsList>

                <TabsContent value="message" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="messageType">{t('follow_ups.panel.message_type_label', 'Message Type')}</Label>
                    <Select
                      value={newFollowUp.messageType}
                      onValueChange={(value: any) => setNewFollowUp(prev => ({ ...prev, messageType: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">{t('messenger.text_message', 'Text Message')}</SelectItem>
                        <SelectItem value="image">{t('flow_builder.image_upload_image_label', 'Image')}</SelectItem>
                        <SelectItem value="video">{t('flow_builder.video_upload_video_label', 'Video')}</SelectItem>
                        <SelectItem value="audio">{t('flow_builder.media_audio', 'Audio')}</SelectItem>
                        <SelectItem value="document">{t('message_bubble.document', 'Document')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {newFollowUp.messageType === 'text' ? (
                    <div className="space-y-2">
                      <Label htmlFor="messageContent">{t('follow_ups.panel.message_content_label', 'Message Content')}</Label>
                      <Textarea
                        id="messageContent"
                        placeholder={t('follow_ups.panel.message_content_placeholder', 'Enter your follow-up message...')}
                        value={newFollowUp.messageContent}
                        onChange={(e) => setNewFollowUp(prev => ({ ...prev, messageContent: e.target.value }))}
                        rows={4}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="mediaUrl">{t('follow_ups.panel.media_url_label', 'Media URL')}</Label>
                        <Input
                          id="mediaUrl"
                          placeholder={t('follow_ups.panel.media_url_placeholder', 'Enter media URL...')}
                          value={newFollowUp.mediaUrl}
                          onChange={(e) => setNewFollowUp(prev => ({ ...prev, mediaUrl: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="caption">{t('follow_ups.panel.caption_label', 'Caption (Optional)')}</Label>
                        <Textarea
                          id="caption"
                          placeholder={t('follow_ups.panel.caption_placeholder', 'Enter caption for media...')}
                          value={newFollowUp.caption}
                          onChange={(e) => setNewFollowUp(prev => ({ ...prev, caption: e.target.value }))}
                          rows={3}
                        />
                      </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="timing" className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('follow_ups.panel.scheduling_method_label', 'Scheduling Method')}</Label>
                    <Select
                      value={newFollowUp.specificDatetime ? 'specific' : 'relative'}
                      onValueChange={(value) => {
                        if (value === 'specific') {
                          setNewFollowUp(prev => ({ ...prev, specificDatetime: new Date().toISOString().slice(0, 16) }));
                        } else {
                          setNewFollowUp(prev => ({ ...prev, specificDatetime: '' }));
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="relative">{t('follow_ups.panel.relative_delay', 'Relative Delay')}</SelectItem>
                        <SelectItem value="specific">{t('follow_ups.panel.specific_datetime', 'Specific Date/Time')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {newFollowUp.specificDatetime ? (
                    <div className="space-y-2">
                      <Label htmlFor="specificDatetime">{t('follow_ups.panel.date_time_label', 'Date and Time')}</Label>
                      <Input
                        id="specificDatetime"
                        type="datetime-local"
                        value={newFollowUp.specificDatetime}
                        onChange={(e) => setNewFollowUp(prev => ({ ...prev, specificDatetime: e.target.value }))}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="delayAmount">{t('follow_ups.panel.delay_amount_label', 'Delay Amount')}</Label>
                        <Input
                          id="delayAmount"
                          type="number"
                          min="1"
                          value={newFollowUp.delayAmount}
                          onChange={(e) => setNewFollowUp(prev => ({ ...prev, delayAmount: parseInt(e.target.value) || 1 }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="delayUnit">{t('follow_ups.panel.delay_unit_label', 'Delay Unit')}</Label>
                        <Select
                          value={newFollowUp.delayUnit}
                          onValueChange={(value: any) => setNewFollowUp(prev => ({ ...prev, delayUnit: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minutes">{t('flow_builder.wait_minutes', 'Minutes')}</SelectItem>
                            <SelectItem value="hours">{t('flow_builder.wait_hours', 'Hours')}</SelectItem>
                            <SelectItem value="days">{t('flow_builder.wait_days', 'Days')}</SelectItem>
                            <SelectItem value="weeks">{t('follow_ups.panel.weeks', 'Weeks')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button
                  onClick={handleCreateFollowUp}
                  disabled={createFollowUpMutation.isPending || !newFollowUp.messageContent}
                >
                  {createFollowUpMutation.isPending ? t('follow_ups.panel.scheduling', 'Scheduling...') : t('follow_ups.panel.schedule_button', 'Schedule Follow-up')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {followUps.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>{t('follow_ups.panel.empty_title', 'No follow-up messages scheduled')}</p>
            <p className="text-sm">{t('follow_ups.panel.empty_description', 'Schedule a follow-up to automatically send messages later')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {followUps.map((followUp: FollowUpSchedule) => (
              <div key={followUp.scheduleId} className="border rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusIcon(followUp.status)}
                      <Badge className={getStatusColor(followUp.status)}>
                        {followUp.status.charAt(0).toUpperCase() + followUp.status.slice(1)}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {followUp.messageType.charAt(0).toUpperCase() + followUp.messageType.slice(1)}
                      </span>
                    </div>

                    <div className="text-sm mb-2">
                      {followUp.messageContent && (
                        <p className="text-foreground">
                          {followUp.messageContent.length > 100
                            ? `${followUp.messageContent.substring(0, 100)}...`
                            : followUp.messageContent}
                        </p>
                      )}
                      {followUp.caption && (
                        <p className="text-muted-foreground mt-1">{t('follow_ups.panel.caption_prefix', 'Caption: {{caption}}', { caption: followUp.caption })}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>
                          {followUp.status === 'sent' && followUp.sentAt
                            ? t('follow_ups.panel.sent_prefix', 'Sent: {{date}}', { date: format(new Date(followUp.sentAt), 'MMM d, yyyy HH:mm') })
                            : t('follow_ups.panel.scheduled_prefix', 'Scheduled: {{date}}', { date: format(new Date(followUp.scheduledFor), 'MMM d, yyyy HH:mm') })
                          }
                        </span>
                      </div>
                      {followUp.retryCount > 0 && (
                        <span>{t('follow_ups.panel.retries', 'Retries: {{count}}/{{max}}', { count: followUp.retryCount, max: followUp.maxRetries })}</span>
                      )}
                    </div>

                    {followUp.failedReason && (
                      <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                        <strong>{t('follow_ups.panel.error_prefix', 'Error:')}</strong> {followUp.failedReason}
                      </div>
                    )}
                  </div>

                  {followUp.status === 'scheduled' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelFollowUpMutation.mutate(followUp.scheduleId)}
                      disabled={cancelFollowUpMutation.isPending}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FollowUpPanel;
