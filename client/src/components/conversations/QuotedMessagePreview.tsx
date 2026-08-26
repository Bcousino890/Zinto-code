import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { stripAgentSignature } from '@/utils/messageUtils';
import { stripFormatting } from '@/utils/textFormatter';
import messageCacheService from '@/services/message-cache';

interface QuotedMessagePreviewProps {
  quotedMessageId: string;
  isInbound: boolean;
  /** 1:1 thread contact display name; used when the quoted inbound sender is the customer */
  conversationContactName?: string | null;
  onQuotedMessageClick?: (quotedMessageId: string) => void;
}

interface QuotedMessage {
  id: number;
  content: string;
  type: string;
  senderType: 'user' | 'contact';
  senderId: number;
  direction: 'inbound' | 'outbound';
  mediaUrl?: string;
  metadata?: any;
  groupParticipantName?: string | null;
}

const QuotedMessagePreview = ({
  quotedMessageId,
  isInbound,
  conversationContactName,
  onQuotedMessageClick
}: QuotedMessagePreviewProps) => {
  const [quotedMessage, setQuotedMessage] = useState<QuotedMessage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const loadQuotedMessage = async () => {
      if (!quotedMessageId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        await messageCacheService.init();
        const cached = await messageCacheService.getMessageByExternalId(quotedMessageId);
        if (cached) {
          setQuotedMessage(cached as QuotedMessage);
          setIsLoading(false);
          return;
        }

        const response = await fetch(`/api/messages/${quotedMessageId}`, {
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error('Failed to fetch quoted message');
        }

        const message = await response.json();
        setQuotedMessage(message);
        await messageCacheService.addMessage(message);
      } catch (err: any) {
        console.error('Error fetching quoted message:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadQuotedMessage();
  }, [quotedMessageId]);

  const getQuotedMessageSender = () => {
    if (!quotedMessage) return t('quoted_message.unknown_sender', 'Unknown');

    if (quotedMessage.direction === 'outbound') {
      if (quotedMessage.senderType === 'user') {
        return t('quoted_message.you', 'You');
      } else {
        return t('quoted_message.assistant', 'Assistant');
      }
    } else if (quotedMessage.senderType === 'contact') {
      const fromGroup =
        typeof quotedMessage.groupParticipantName === 'string'
          ? quotedMessage.groupParticipantName.trim()
          : '';
      const fromConversation =
        typeof conversationContactName === 'string' ? conversationContactName.trim() : '';
      const displayName = fromGroup || fromConversation;
      return displayName || t('quoted_message.contact', 'Contact');
    } else {
      return t('quoted_message.unknown_sender', 'Unknown');
    }
  };

  const getQuotedMessageContent = () => {
    if (!quotedMessage) return '';

    const { type, content } = quotedMessage;

    switch (type) {
      case 'image':
        return t('quoted_message.image', '📷 Image');
      case 'video':
        return t('quoted_message.video', '🎥 Video');
      case 'audio':
        return t('quoted_message.audio', '🎵 Audio');
      case 'document':
        return t('quoted_message.document', '📄 Document');
      case 'text':
      default:
        if (content && typeof content === 'string' && content.trim().length > 0) {
          const cleanContent = stripAgentSignature(content);
          const displayContent = stripFormatting(cleanContent);
          if (displayContent.length > 50) {
            return displayContent.substring(0, 50) + '...';
          }
          return displayContent;
        }
        return t('quoted_message.message', 'Message');
    }
  };

  const handleClick = () => {
    if (onQuotedMessageClick) {
      onQuotedMessageClick(quotedMessageId);
    }
  };

  if (isLoading) {
    return (
      <div className={`quoted-message-preview ${isInbound ? 'inbound' : 'outbound'} loading`}>
        <div className="quoted-border"></div>
        <div className="quoted-content">
          <div className="quoted-sender">
            <div className="loading-shimmer h-3 w-16 rounded"></div>
          </div>
          <div className="quoted-text">
            <div className="loading-shimmer h-4 w-32 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !quotedMessage) {
    return (
      <div className={`quoted-message-preview ${isInbound ? 'inbound' : 'outbound'} error`}>
        <div className="quoted-border"></div>
        <div className="quoted-content">
          <div className="quoted-sender text-gray-500">
            {t('quoted_message.deleted_sender', 'Unknown')}
          </div>
          <div className="quoted-text text-gray-500 italic">
            {t('quoted_message.deleted_message', 'This message was deleted')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`quoted-message-preview ${isInbound ? 'inbound' : 'outbound'} ${onQuotedMessageClick ? 'clickable' : ''}`}
      onClick={handleClick}
    >
      <div className="quoted-border"></div>
      <div className="quoted-content">
        <div className="quoted-sender">
          {getQuotedMessageSender()}
        </div>
        <div className="quoted-text">
          {getQuotedMessageContent()}
        </div>
      </div>
    </div>
  );
};

export default QuotedMessagePreview;
