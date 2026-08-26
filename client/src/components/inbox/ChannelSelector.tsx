import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { useChannelConnections } from '@/hooks/useChannelConnections';
import { getEffectiveChannelStatus, isChannelAvailable } from '@shared/channel-utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Wifi,
  AlertCircle
} from 'lucide-react';
import { TwilioIcon } from '@/components/icons/TwilioIcon';

interface ChannelConnection {
  id: number;
  channelType: string;
  accountName?: string;
  accountId?: string;
  status: string | null;
  lastConnectedAt?: string;
  metadata?: any;
}

interface ChannelSelectorProps {
  activeChannelId?: number | null;
  onChannelChange: (channelId: number | null) => void;
  className?: string;
}

export function ChannelSelector({ activeChannelId, onChannelChange, className }: ChannelSelectorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedChannelId, setSelectedChannelId] = useState<number | null | undefined>(
    activeChannelId !== undefined ? activeChannelId : null
  );


  const { data: channels = [], isLoading, error } = useChannelConnections();

  // Normalize status: map non-Baileys channels to 'active', and normalize raw status for Baileys
  const normalizeStatus = (channel: ChannelConnection): 'active' | 'inactive' | 'error' | 'reconnecting' => {
    return getEffectiveChannelStatus(channel);
  };

  const activeChannels = channels.filter(channel => isChannelAvailable(channel));


  useEffect(() => {
    if (activeChannels.length === 0 && selectedChannelId) {
      // All channels unavailable - keep selection and wait for reconnection (no toast)
      const selectedStillExists = channels.some(c => c.id === selectedChannelId);
      if (!selectedStillExists) {
        setSelectedChannelId(undefined);
      }
    }
  }, [activeChannels, selectedChannelId, channels]);


  useEffect(() => {
    const parentVal = activeChannelId ?? null;
    const localVal = selectedChannelId === undefined ? null : selectedChannelId;
    if (parentVal !== localVal) {
      setSelectedChannelId(parentVal);
    }
  }, [activeChannelId]);

  const handleChannelChange = (channelId: string) => {
    if (channelId === 'all') {
      setSelectedChannelId(null);
      onChannelChange(null);
      toast({
        title: t('inbox.showing_all_channels', 'Showing all channels'),
        description: t('inbox.showing_all_channels_desc', 'Conversations from every connected channel are shown.'),
      });
      return;
    }
    const numericChannelId = parseInt(channelId, 10);
    setSelectedChannelId(numericChannelId);
    onChannelChange(numericChannelId);

    const selectedChannel = activeChannels.find(c => c.id === numericChannelId);
    if (selectedChannel) {
      toast({
        title: t('inbox.channel_switched', 'Channel switched'),
        description: t('inbox.channel_switched_desc', 'Now using {{channelName}} for messages.', {
          channelName: getChannelDisplayName(selectedChannel)
        }),
      });
    }
  };

  const getChannelDisplayName = (channel: ChannelConnection): string => {
    const typeDisplay = getChannelTypeDisplay(channel.channelType);
    if (channel.accountName) {
      return `${typeDisplay} (${channel.accountName})`;
    }
    return typeDisplay;
  };

  const getChannelTypeDisplay = (channelType: string): string => {
    switch (channelType) {
      case 'whatsapp_official':
        return t('contacts.whatsapp_official', 'WhatsApp Official');
      case 'whatsapp_unofficial':
      case 'whatsapp':
        return t('conversations.item.channel.whatsapp', 'WhatsApp');
      case 'messenger':
        return t('conversations.item.channel.messenger', 'Messenger');
      case 'instagram':
        return t('conversations.item.channel.instagram', 'Instagram');
      case 'tiktok':
        return t('conversations.item.channel.tiktok', 'TikTok Business');
      case 'telegram':
        return t('conversations.item.channel.telegram', 'Telegram');
      case 'email':
        return t('conversations.item.channel.email', 'Email');
      case 'twilio_sms':
        return t('conversations.item.channel.twilio_sms', 'Twilio SMS');
      case 'twilio_voice':
        return t('conversations.item.channel.twilio_voice', 'Voice calls');
      case 'webchat':
        return t('conversations.item.channel.webchat', 'WebChat');
      default:
        return channelType;
    }
  };

  const getChannelIcon = (channelType: string) => {
    switch (channelType) {
      case 'whatsapp_official':
        return <i className="ri-whatsapp-line" style={{ color: '#25D366' }} />;
      case 'whatsapp_unofficial':
      case 'whatsapp':
        return <i className="ri-whatsapp-line" style={{ color: '#25D366' }} />;
      case 'messenger':
        return <i className="ri-messenger-line" style={{ color: '#1877F2' }} />;
      case 'instagram':
        return <i className="ri-instagram-line" style={{ color: '#E4405F' }} />;
      case 'tiktok':
        return <i className="ri-tiktok-line text-black dark:text-white" />;
      case 'telegram':
        return <i className="ri-telegram-line" style={{ color: '#0088CC' }} />;
      case 'email':
        return <i className="ri-mail-line" style={{ color: '#6B7280' }} />;
      case 'twilio_sms':
      case 'twilio_voice':
        return <TwilioIcon className="w-4 h-4" />;
      case 'webchat':
        return (
          <img
            src="https://cdn-icons-png.flaticon.com/128/16921/16921613.png"
            alt={t('conversations.item.channel.webchat', 'WebChat')}
            className="h-4 w-4 rounded object-contain"
          />
        );
      default:
        return <i className="ri-message-3-line" style={{ color: '#333235' }} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'reconnecting':
        return 'bg-amber-100 text-amber-800';
      case 'inactive':
        return 'bg-muted text-muted-foreground';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="animate-pulse flex items-center gap-2">
          <div className="w-4 h-4 bg-muted rounded"></div>
          <div className="w-32 h-6 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <AlertCircle className="h-4 w-4 text-red-500" />
        <span className="text-sm text-red-600">
          {t('inbox.no_active_channels', 'No active channels available')}
        </span>
      </div>
    );
  }

  const selectedChannel = activeChannels.find(c => c.id === selectedChannelId)
    ?? channels.find(c => c.id === selectedChannelId);

  const channelsToShow = activeChannels.length > 0 ? activeChannels : channels;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      
      <Select
        value={selectedChannelId === null ? 'all' : selectedChannelId?.toString()}
        onValueChange={handleChannelChange}
      >
        <SelectTrigger className="w-auto min-w-[200px] h-8 text-sm border-border focus:border-primary-300">
          <SelectValue>
            {selectedChannelId === null ? (
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  <i className="ri-inbox-line text-muted-foreground" />
                </span>
                <span className="truncate">{t('inbox.all_channels', 'All Channels')}</span>
              </div>
            ) : selectedChannel ? (
              <div className="flex items-center gap-2">
                <span className="text-sm">{getChannelIcon(selectedChannel.channelType)}</span>
                <span className="truncate">{getChannelDisplayName(selectedChannel)}</span>
                <Badge
                  variant="secondary"
                  className={`text-xs ${getStatusColor(normalizeStatus(selectedChannel))}`}
                >
                  <Wifi className="h-2 w-2 mr-1" />
                  {t(`inbox.channel_status.${normalizeStatus(selectedChannel)}`, normalizeStatus(selectedChannel))}
                </Badge>
              </div>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        
        <SelectContent>
          <SelectItem value="all">
            <div className="flex items-center gap-2 w-full">
              <span>
                <i className="ri-inbox-line text-muted-foreground" />
              </span>
              <span className="truncate">{t('inbox.all_channels', 'All Channels')}</span>
            </div>
          </SelectItem>
          {channelsToShow.map((channel) => (
            <SelectItem key={channel.id} value={channel.id.toString()}>
              <div className="flex items-center gap-2 w-full">
                <span>{getChannelIcon(channel.channelType)}</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{getChannelDisplayName(channel)}</div>
                  {channel.accountId && (
                    <div className="text-xs text-muted-foreground truncate">
                      {channel.accountId}
                    </div>
                  )}
                </div>
                <Badge
                  variant="secondary"
                  className={`text-xs ${getStatusColor(normalizeStatus(channel))}`}
                >
                  <Wifi className="h-2 w-2 mr-1" />
                  {t(`inbox.channel_status.${normalizeStatus(channel)}`, normalizeStatus(channel))}
                </Badge>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
