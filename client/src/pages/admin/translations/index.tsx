import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useQueryClient, QueryKey } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import AdminLayout from '@/components/admin/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { LanguagesTab, NamespacesTab, TranslationsTab } from './tabs';
import { AddLanguageDialog, AddNamespaceDialog, ImportTranslationsDialog, ExportTranslationsButton } from './components';

interface Language {
  id: number;
  code: string;
  name: string;
  nativeName: string;
  flagIcon?: string | null;
  isActive: boolean | null;
  isDefault: boolean | null;
  direction: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Namespace {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

interface TranslationKey {
  id: number;
  namespaceId: number;
  key: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

interface Translation {
  id: number;
  keyId: number;
  languageId: number;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export default function TranslationsPage() {
  const { user, isLoading: isLoadingAuth } = useAuth();
  const [_, navigate] = useLocation();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('languages');
  const [selectedLanguage, setSelectedLanguage] = useState<number | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<number | null>(null);

  useEffect(() => {
    if (!isLoadingAuth && user && !user.isSuperAdmin) {
      navigate('/');
    }
  }, [user, isLoadingAuth, navigate]);

  const languagesQueryKey: QueryKey = ['languages'];
  const {
    data: languages,
    isLoading: isLoadingLanguages,
  } = useQuery<Language[], Error>({
    queryKey: languagesQueryKey,
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/languages');
      if (!res.ok) throw new Error('Failed to fetch languages');
      return res.json() as Promise<Language[]>;
    },
    enabled: !!user?.isSuperAdmin,
  });

  const namespacesQueryKey: QueryKey = ['namespaces'];
  const {
    data: namespaces,
    isLoading: isLoadingNamespaces,
  } = useQuery<Namespace[], Error>({
    queryKey: namespacesQueryKey,
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/namespaces');
      if (!res.ok) throw new Error('Failed to fetch namespaces');
      return res.json() as Promise<Namespace[]>;
    },
    enabled: !!user?.isSuperAdmin,
  });

  const keysQueryKey: QueryKey = ['keys', selectedNamespace];
  const {
    data: keys,
    isLoading: isLoadingKeys,
  } = useQuery<TranslationKey[], Error>({
    queryKey: keysQueryKey,
    queryFn: async () => {
      if (!selectedNamespace) throw new Error("Namespace not selected");
      const res = await apiRequest('GET', `/api/keys?namespaceId=${selectedNamespace}`);
      if (!res.ok) throw new Error('Failed to fetch keys');
      return res.json() as Promise<TranslationKey[]>;
    },
    enabled: !!selectedNamespace && !!user?.isSuperAdmin,
  });

  const translationsQueryKey: QueryKey = ['translations', selectedLanguage, selectedNamespace];
  const {
    data: translations,
    isLoading: isLoadingTranslations,
  } = useQuery<Translation[], Error>({
    queryKey: translationsQueryKey,
    queryFn: async () => {
      if (!selectedLanguage || !selectedNamespace) throw new Error("Language or Namespace not selected");
      const res = await apiRequest('GET', `/api/translations?languageId=${selectedLanguage}&namespaceId=${selectedNamespace}`);
      if (!res.ok) throw new Error('Failed to fetch translations');
      return res.json() as Promise<Translation[]>;
    },
    enabled: !!selectedLanguage && !!selectedNamespace && !!user?.isSuperAdmin,
  });

  const refreshLanguages = () => queryClient.invalidateQueries({ queryKey: languagesQueryKey });
  const refreshNamespaces = () => queryClient.invalidateQueries({ queryKey: namespacesQueryKey });
  const refreshTranslations = () => {
    queryClient.invalidateQueries({ queryKey: translationsQueryKey });
    queryClient.invalidateQueries({ queryKey: keysQueryKey });
  };

  if (isLoadingAuth || (user && !user.isSuperAdmin)) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  const selectedLanguageCode = languages?.find(l => l.id === selectedLanguage)?.code;

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
          <h1 className="text-2xl">{t('admin.translations.page_title', 'Languages & Translations')}</h1>
          <div className="flex gap-2">
            {activeTab === 'languages' && (
              <AddLanguageDialog onSuccess={refreshLanguages} />
            )}
            {activeTab === 'namespaces' && (
              <AddNamespaceDialog onSuccess={refreshNamespaces} />
            )}
            {activeTab === 'translations' && (
              <>
                <ImportTranslationsDialog languages={languages || []} onSuccess={refreshTranslations} />
                {selectedLanguageCode && (
                  <ExportTranslationsButton languageCode={selectedLanguageCode} />
                )}
              </>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="languages">{t('admin.languages_tab', 'Languages')}</TabsTrigger>
            <TabsTrigger value="namespaces">{t('admin.namespaces_tab', 'Namespaces')}</TabsTrigger>
            <TabsTrigger value="translations">{t('admin.translations_tab', 'Translations')}</TabsTrigger>
          </TabsList>

          <TabsContent value="languages">
            <LanguagesTab
              languages={languages || []}
              isLoading={isLoadingLanguages}
              onRefresh={refreshLanguages}
            />
          </TabsContent>

          <TabsContent value="namespaces">
            <NamespacesTab
              namespaces={namespaces || []}
              isLoading={isLoadingNamespaces}
              onRefresh={refreshNamespaces}
            />
          </TabsContent>

          <TabsContent value="translations">
            <TranslationsTab
              languages={languages || []}
              namespaces={namespaces || []}
              keys={keys || []}
              translations={translations || []}
              isLoadingLanguages={isLoadingLanguages}
              isLoadingNamespaces={isLoadingNamespaces}
              isLoadingKeys={isLoadingKeys}
              isLoadingTranslations={isLoadingTranslations}
              selectedLanguage={selectedLanguage}
              selectedNamespace={selectedNamespace}
              onSelectLanguage={setSelectedLanguage}
              onSelectNamespace={setSelectedNamespace}
              onRefresh={refreshTranslations}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
