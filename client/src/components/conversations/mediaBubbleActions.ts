export type MediaBubbleAction = {
  kind: 'open';
  href: string;
  labelKey: 'message_bubble.open';
  labelFallback: 'Open';
};

export function getMediaBubbleAction(type: string | undefined, mediaUrl?: string): MediaBubbleAction | null {
  if (type === 'document' && mediaUrl) {
    return {
      kind: 'open',
      href: mediaUrl,
      labelKey: 'message_bubble.open',
      labelFallback: 'Open'
    };
  }

  return null;
}