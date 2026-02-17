import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  FileSpreadsheet,
  FileText,
  MessageCircle,
  Briefcase,
  ClipboardList,
} from 'lucide-react';

type ObjectCustomerTabProps = {
  objectId: number;
};

const customerSubTabs = [
  {
    value: 'estimates',
    label: 'Сметы',
    icon: FileSpreadsheet,
    title: 'Сметы заказчика',
    description: 'Здесь будут отображаться сметы, связанные с данным объектом.',
  },
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
  {
    value: 'contracts',
    label: 'Договоры и ДОП',
    icon: Briefcase,
    title: 'Договоры и дополнительные соглашения',
    description: 'Договоры и дополнительные соглашения с заказчиком.',
  },
  {
    value: 'acts',
    label: 'Акты',
    icon: ClipboardList,
    title: 'Акты выполненных работ',
    description: 'Акты выполненных работ для заказчика.',
  },
  {
    value: 'reconciliations',
    label: 'Сверки',
    icon: FileText,
    title: 'Акты сверки',
    description: 'Акты сверки с заказчиком.',
  },
] as const;

export function ObjectCustomerTab({ objectId }: ObjectCustomerTabProps) {
  return (
    <Tabs defaultValue="estimates" className="w-full">
      <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1">
        {customerSubTabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {customerSubTabs.map((tab) => (
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
    </Tabs>
  );
}
