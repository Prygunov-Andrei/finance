import { useSearchParams } from 'react-router';
import { Receipt, CreditCard, TrendingUp } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { InvoicesTab } from './InvoicesTab';
import { PaymentRegistryTab } from './PaymentRegistryTab';
import { IncomingPaymentsTab } from './IncomingPaymentsTab';

const TAB_OPTIONS = [
  { value: 'invoices', label: 'Счета на оплату', icon: Receipt },
  { value: 'registry', label: 'Реестр оплат', icon: CreditCard },
  { value: 'income', label: 'Входящие платежи', icon: TrendingUp },
] as const;

type TabValue = (typeof TAB_OPTIONS)[number]['value'];

export const PaymentsTabPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = (searchParams.get('tab') as TabValue) || 'invoices';

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Платежи</h1>
        <p className="text-sm text-gray-500 mt-1">
          Управление счетами, реестром оплат и входящими платежами
        </p>
      </div>

      <Tabs value={currentTab} onValueChange={handleTabChange}>
        <TabsList>
          {TAB_OPTIONS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="gap-1.5" aria-label={label}>
              <Icon className="h-4 w-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="invoices">
          <InvoicesTab />
        </TabsContent>
        <TabsContent value="registry">
          <PaymentRegistryTab />
        </TabsContent>
        <TabsContent value="income">
          <IncomingPaymentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};
