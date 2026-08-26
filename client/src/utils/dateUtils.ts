import * as date from 'date-and-time';

export const formatMessageDate = (inputDate: Date | string): string => {
  const messageDate = new Date(inputDate);
  const today = new Date();
  

  const messageDateOnly = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  const diffTime = todayOnly.getTime() - messageDateOnly.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.format(messageDate, 'dddd'); // Day name (e.g., Monday)
  } else if (diffDays < 365) {
    return date.format(messageDate, 'MMM DD'); // Month and day (e.g., Jan 15)
  } else {
    return date.format(messageDate, 'MMM DD, YYYY'); // Full date (e.g., Jan 15, 2023)
  }
};

export const formatMessageTime = (inputDate: Date | string): string => {
  const messageDate = new Date(inputDate);
  return date.format(messageDate, 'h:mm A');
};

export const formatMessageDateTime = (inputDate: Date | string): string => {
  const messageDate = new Date(inputDate);
  const today = new Date();
  

  if (isNaN(messageDate.getTime())) {
    return `Invalid Date, ${formatMessageTime(inputDate)}`;
  }
  
  const timeStr = formatMessageTime(messageDate);
  

  const messageDateOnly = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  const diffTime = todayOnly.getTime() - messageDateOnly.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  

  
  if (diffDays === 0) {
    return `Today, ${timeStr}`;
  } else if (diffDays === 1) {
    return `Yesterday, ${timeStr}`;
  } else if (diffDays < 7) {
    return `${date.format(messageDate, 'ddd')}, ${timeStr}`;
  } else if (diffDays < 365) {
    return `${date.format(messageDate, 'MMM DD')}, ${timeStr}`;
  } else {
    return `${date.format(messageDate, 'MMM DD, YYYY')}, ${timeStr}`;
  }
};

export const shouldShowDateSeparator = (currentMessage: any, previousMessage: any): boolean => {
  const currentDate = new Date(currentMessage.sentAt || currentMessage.createdAt);
  
  if (!previousMessage) {

    const today = new Date();
    const currentDateOnly = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return currentDateOnly.getTime() !== todayOnly.getTime();
  }
  
  const previousDate = new Date(previousMessage.sentAt || previousMessage.createdAt);
  

  const currentDateOnly = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
  const previousDateOnly = new Date(previousDate.getFullYear(), previousDate.getMonth(), previousDate.getDate());
  
  return currentDateOnly.getTime() !== previousDateOnly.getTime();
};

export const getConversationStartDate = (messages: any[]): Date | null => {
  if (!messages || messages.length === 0) return null;
  
  const sortedMessages = [...messages].sort((a, b) => {
    const dateA = new Date(a.sentAt || a.createdAt);
    const dateB = new Date(b.sentAt || b.createdAt);
    return dateA.getTime() - dateB.getTime();
  });
  
  return new Date(sortedMessages[0].sentAt || sortedMessages[0].createdAt);
};

export const groupMessagesByDate = (messages: any[]) => {
  const grouped: { [key: string]: any[] } = {};
  
  messages.forEach(message => {
    const messageDate = new Date(message.sentAt || message.createdAt);
    const dateKey = date.format(messageDate, 'YYYY-MM-DD');
    
    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(message);
  });
  
  return grouped;
};

/**
 * Format follow-up scheduled time for display (relative or absolute)
 */
export function formatFollowUpTime(scheduledFor: Date | string): string {
  const d = new Date(scheduledFor);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffMs < 0) {
    const absHours = Math.abs(diffHours);
    if (absHours < 1) return 'Overdue';
    if (absHours < 24) return `${Math.floor(absHours)} hour(s) ago`;
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  }

  if (diffHours < 1) {
    const mins = Math.floor((diffMs / (1000 * 60)));
    return mins <= 1 ? 'in 1 minute' : `in ${mins} minutes`;
  }
  if (diffHours < 24) {
    const h = Math.floor(diffHours);
    return h === 1 ? 'in 1 hour' : `in ${h} hours`;
  }
  if (diffDays < 7) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.getDate() === tomorrow.getDate() && d.getMonth() === tomorrow.getMonth() && d.getFullYear() === tomorrow.getFullYear();
    const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (isTomorrow) return `Tomorrow at ${timeStr}`;
    return `${date.format(d, 'dddd')} at ${timeStr}`;
  }
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Return Tailwind color classes for follow-up scheduled time (overdue, soon, or normal)
 */
export function getFollowUpStatusColor(scheduledFor: Date | string): string {
  const d = new Date(scheduledFor);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMs < 0) return 'text-red-600 dark:text-red-400';
  if (diffHours < 1) return 'text-orange-600 dark:text-orange-400';
  return 'text-blue-600 dark:text-blue-400';
}

