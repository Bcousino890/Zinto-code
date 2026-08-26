import Header from '@/components/layout/Header';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { useTranslation } from '@/hooks/use-translation';
import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'wouter';

type DentalShellPageProps = {
  title: string;
  description: string;
  actions?: ReactNode;
  children?: ReactNode;
};

export function DentalShellPage({ title, description, actions, children }: DentalShellPageProps) {
  const { t } = useTranslation();
  const { isDental, isLoading } = useErpBusinessType();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isDental) setLocation('/erp/dashboard');
  }, [isLoading, isDental, setLocation]);

  if (isLoading || !isDental) {
    return (
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 p-6 text-muted-foreground">{t('erp.common.loading', 'Loading...')}</main>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <Header />
      <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>
          {actions ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">{actions}</div>
          ) : null}
        </div>
        {children}
      </main>
    </div>
  );
}
