import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Kanban,
  FolderOpen,
  PackageSearch,
  FileCheck,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ClipboardList,
  BarChart3,
  ScrollText,
} from 'lucide-react';
import { WorkJournalTab } from './WorkJournalTab';
import { CashFlowTab } from './CashFlowTab';

type ObjectMainTabProps = {
  objectId: number;
};

function StubCard({ icon: Icon, title, description }: {
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
  description: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-8 flex flex-col items-center justify-center text-center min-h-[200px]">
      {Icon && (
        <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
          <Icon className="w-6 h-6 text-gray-400" />
        </div>
      )}
      {title && <h3 className="text-base font-semibold text-gray-900 mb-2">{title}</h3>}
      <p className="text-sm text-gray-500 max-w-md">{description}</p>
    </div>
  );
}

export function ObjectMainTab({ objectId }: ObjectMainTabProps) {
  return (
    <Tabs defaultValue="work-log" className="w-full">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="kanban-tasks" className="gap-1.5">
          <Kanban className="w-4 h-4" />
          Канбан задач
        </TabsTrigger>
        <TabsTrigger value="work-log" className="gap-1.5">
          <ClipboardList className="w-4 h-4" />
          Журнал работ
        </TabsTrigger>
        <TabsTrigger value="projects" className="gap-1.5">
          <FolderOpen className="w-4 h-4" />
          Проекты
        </TabsTrigger>
        <TabsTrigger value="kanban-supply" className="gap-1.5">
          <PackageSearch className="w-4 h-4" />
          Канбан снабжения
        </TabsTrigger>
        <TabsTrigger value="pto" className="gap-1.5">
          <FileCheck className="w-4 h-4" />
          ПТО
        </TabsTrigger>
        <TabsTrigger value="protocol" className="gap-1.5">
          <ScrollText className="w-4 h-4" />
          Протокол
        </TabsTrigger>
        <TabsTrigger value="finance" className="gap-1.5">
          <DollarSign className="w-4 h-4" />
          Финансы
        </TabsTrigger>
      </TabsList>

      <TabsContent value="kanban-tasks">
        <StubCard
          icon={Kanban}
          title="Канбан задач по объекту"
          description="Доска задач, привязанная к данному объекту, для отслеживания хода работ."
        />
      </TabsContent>

      <TabsContent value="work-log">
        <WorkJournalTab objectId={objectId} />
      </TabsContent>

      <TabsContent value="projects">
        <StubCard
          icon={FolderOpen}
          description="Проектная документация по объекту."
        />
      </TabsContent>

      <TabsContent value="kanban-supply">
        <StubCard
          icon={PackageSearch}
          title="Канбан снабжения по объекту (только просмотр)"
          description="Отображает статус поставок материалов, привязанных к данному объекту. Доступен только для чтения."
        />
      </TabsContent>

      <TabsContent value="pto">
        <StubCard
          icon={FileCheck}
          title="Производственно-технический отдел"
          description="Исполнительная и производственная документация по объекту."
        />
      </TabsContent>

      <TabsContent value="protocol">
        <StubCard
          icon={ScrollText}
          title="Протокол"
          description="Хронологический протокол событий и действий по объекту."
        />
      </TabsContent>

      <TabsContent value="finance">
        <CashFlowTab objectId={objectId} />
      </TabsContent>
    </Tabs>
  );
}
