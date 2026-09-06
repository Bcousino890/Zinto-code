import { useTranslation } from '@/hooks/use-translation';
import { formatMessageDate } from '@/utils/dateUtils';

interface DateSeparatorProps {
  date: Date;
}

export default function DateSeparator({ date }: DateSeparatorProps) {
  const { t } = useTranslation();
  return (
    <div className="date-separator">
      <span>
        {formatMessageDate(date, t)}
      </span>
    </div>
  );
}
