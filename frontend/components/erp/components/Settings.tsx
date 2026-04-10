import { useSearchParams } from '@/hooks/erp-router';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, CreditCard, FolderTree, ScrollText, ShieldCheck, Sparkles, Landmark, FileStack } from 'lucide-react';
import { TaxSystemsTab } from './TaxSystemsTab';
import { LLMSettings } from './LLMSettings';
import { BankConnectionsTab } from './BankConnectionsTab';
import { LegalEntitiesTab } from './settings/LegalEntitiesTab';
import { AccountsTab } from './settings/AccountsTab';
import { ExpenseCategoriesTab } from './settings/ExpenseCategoriesTab';
import { FNSIntegrationTab } from './settings/FNSIntegrationTab';
import { ProjectFileTypesTab } from './settings/ProjectFileTypesTab';

const SETTINGS_TABS = ['tax-systems', 'entities', 'accounts', 'categories', 'file-types', 'fns', 'llm', 'banking'] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];
const DEFAULT_SETTINGS_TAB: SettingsTab = 'entities';

const getSafeSettingsTab = (value: string | null): SettingsTab => {
  if (value && SETTINGS_TABS.includes(value as SettingsTab)) {
    return value as SettingsTab;
  }
  return DEFAULT_SETTINGS_TAB;
};

export function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = getSafeSettingsTab(searchParams.get('tab'));

  const handleTabChange = (nextTab: string) => {
    const safeTab = getSafeSettingsTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', safeTab);
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-semibold mb-6">Настройки</h1>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <div className="mb-6 overflow-x-auto pb-1">
            <TabsList className="flex w-max min-w-full flex-nowrap justify-start">
            <TabsTrigger value="tax-systems" className="flex shrink-0 items-center gap-2">
              <ScrollText className="w-4 h-4" />
              Налоговые системы
            </TabsTrigger>
            <TabsTrigger value="entities" className="flex shrink-0 items-center gap-2">
              <Building2 className="w-4 h-4" />
              Мои компании
            </TabsTrigger>
            <TabsTrigger value="accounts" className="flex shrink-0 items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Счета
            </TabsTrigger>
            <TabsTrigger value="categories" className="flex shrink-0 items-center gap-2">
              <FolderTree className="w-4 h-4" />
              Категории расходов
            </TabsTrigger>
            <TabsTrigger value="file-types" className="flex shrink-0 items-center gap-2">
              <FileStack className="w-4 h-4" />
              Типы файлов проектов
            </TabsTrigger>
            <TabsTrigger value="fns" className="flex shrink-0 items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Интеграция ФНС
            </TabsTrigger>
            <TabsTrigger value="llm" className="flex shrink-0 items-center gap-2">
              <Sparkles className="w-4 h-4" />
              LLM-провайдеры
            </TabsTrigger>
            <TabsTrigger value="banking" className="flex shrink-0 items-center gap-2">
              <Landmark className="w-4 h-4" />
              Банковские подключения
            </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="tax-systems">
            <TaxSystemsTab />
          </TabsContent>

          <TabsContent value="entities">
            <LegalEntitiesTab />
          </TabsContent>

          <TabsContent value="accounts">
            <AccountsTab />
          </TabsContent>

          <TabsContent value="categories">
            <ExpenseCategoriesTab />
          </TabsContent>

          <TabsContent value="file-types">
            <ProjectFileTypesTab />
          </TabsContent>

          <TabsContent value="fns">
            <FNSIntegrationTab />
          </TabsContent>

          <TabsContent value="llm">
            <LLMSettings />
          </TabsContent>

          <TabsContent value="banking">
            <BankConnectionsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
