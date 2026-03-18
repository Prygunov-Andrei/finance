import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileSpreadsheet,
  FileText,
  MessageCircle,
  Briefcase,
  ClipboardList,
} from 'lucide-react';
import { ObjectEstimatesList } from './contracts/ObjectEstimatesList';
import { ObjectContractsList } from './contracts/ObjectContractsList';
import { ObjectActsList } from './contracts/ObjectActsList';
import { ObjectReconciliation } from './contracts/ObjectReconciliation';

type ObjectCustomerTabProps = {
  objectId: number;
};

const PLACEHOLDER_TABS = [
  {
    value: 'tkp',
    label: 'ТКП',
    icon: FileText,
    title: 'Технические коммерческие предложения',
    description: 'Технические коммерческие предложения для заказчика.',
  },
  {
    value: 'correspondence',
    label: 'Переписка',
    icon: MessageCircle,
    title: 'Переписка с заказчиком',
    description: 'Переписка с заказчиком по данному объекту.',
  },
] as const;

export function ObjectCustomerTab({ objectId }: ObjectCustomerTabProps) {
  return (
    <Tabs defaultValue="estimates" className="w-full">
      <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1">
        <TabsTrigger value="estimates" className="gap-1.5">
          <FileSpreadsheet className="w-4 h-4" />
          Сметы
        </TabsTrigger>
        {PLACEHOLDER_TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </TabsTrigger>
        ))}
        <TabsTrigger value="contracts" className="gap-1.5">
          <Briefcase className="w-4 h-4" />
          Договоры и ДОП
        </TabsTrigger>
        <TabsTrigger value="acts" className="gap-1.5">
          <ClipboardList className="w-4 h-4" />
          Акты
        </TabsTrigger>
        <TabsTrigger value="reconciliations" className="gap-1.5">
          <FileText className="w-4 h-4" />
          Сверки
        </TabsTrigger>
      </TabsList>

      <TabsContent value="estimates">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <ObjectEstimatesList objectId={objectId} contractType="income" />
        </div>
      </TabsContent>

      {PLACEHOLDER_TABS.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          <div className="bg-white border border-gray-200 rounded-xl p-8">
            <div className="flex flex-col items-center justify-center text-center">
              <tab.icon className="w-12 h-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {tab.title}
              </h3>
              <p className="text-sm text-gray-500 max-w-md">
                {tab.description}
              </p>
            </div>
          </div>
        </TabsContent>
      ))}

      <TabsContent value="contracts">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <ObjectContractsList objectId={objectId} contractType="income" />
        </div>
      </TabsContent>

      <TabsContent value="acts">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <ObjectActsList objectId={objectId} contractType="income" />
        </div>
      </TabsContent>

      <TabsContent value="reconciliations">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <ObjectReconciliation objectId={objectId} contractType="income" />
        </div>
      </TabsContent>
    </Tabs>
  );
}
