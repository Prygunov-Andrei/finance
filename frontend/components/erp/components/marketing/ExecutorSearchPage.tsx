'use client';

import { useSearchParams } from '@/hooks/erp-router';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Globe, Send, MessageSquare, Settings } from 'lucide-react';
import { ExecutorDatabaseTab } from './executors/ExecutorDatabaseTab';
import { AvitoTab } from './avito/AvitoTab';
import { CampaignsTab } from './campaigns/CampaignsTab';
import { ContactHistoryTab } from './ContactHistoryTab';
import { ExecutorSettingsTab } from './settings/ExecutorSettingsTab';

const EXECUTOR_TABS = ['executors', 'avito', 'campaigns', 'contacts', 'settings'] as const;
type ExecutorTab = (typeof EXECUTOR_TABS)[number];
const DEFAULT_TAB: ExecutorTab = 'executors';

const getSafeTab = (value: string | null): ExecutorTab => {
  if (value && EXECUTOR_TABS.includes(value as ExecutorTab)) {
    return value as ExecutorTab;
  }
  return DEFAULT_TAB;
};

export function ExecutorSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = getSafeTab(searchParams.get('tab'));

  const handleTabChange = (nextTab: string) => {
    const safeTab = getSafeTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', safeTab);
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-semibold mb-6">Поиск Исполнителей</h1>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <div className="mb-6 overflow-x-auto pb-1">
            <TabsList className="flex w-max min-w-full flex-nowrap justify-start">
              <TabsTrigger value="executors" className="flex shrink-0 items-center gap-2">
                <Users className="w-4 h-4" />
                База монтажников
              </TabsTrigger>
              <TabsTrigger value="avito" className="flex shrink-0 items-center gap-2">
                <Globe className="w-4 h-4" />
                Авито
              </TabsTrigger>
              <TabsTrigger value="campaigns" className="flex shrink-0 items-center gap-2">
                <Send className="w-4 h-4" />
                Рассылки
              </TabsTrigger>
              <TabsTrigger value="contacts" className="flex shrink-0 items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                История контактов
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex shrink-0 items-center gap-2">
                <Settings className="w-4 h-4" />
                Настройки
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="executors">
            <ExecutorDatabaseTab />
          </TabsContent>
          <TabsContent value="avito">
            <AvitoTab />
          </TabsContent>
          <TabsContent value="campaigns">
            <CampaignsTab />
          </TabsContent>
          <TabsContent value="contacts">
            <ContactHistoryTab />
          </TabsContent>
          <TabsContent value="settings">
            <ExecutorSettingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
