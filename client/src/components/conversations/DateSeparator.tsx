import { formatMessageDate } from '@/utils/dateUtils';

interface DateSeparatorProps {
  date: Date;
}

export default function DateSeparator({ date }: DateSeparatorProps) {
  return (
    <div className="date-separator">
      <span>
        {formatMessageDate(date)}
      </span>
    </div>
  );
}
