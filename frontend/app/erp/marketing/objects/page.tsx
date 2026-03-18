'use client';
import { KanbanBoardPage, KanbanBoardConfig } from '@/components/erp/components/kanban/KanbanBoardPage';
import { CreateCommercialCardDialog } from '@/components/erp/components/kanban/CreateCommercialCardDialog';
import { KanbanCardDetailDialog } from '@/components/erp/components/kanban/KanbanCardDetailDialog';

const commercialBoardConfig: KanbanBoardConfig = {
  renderCreateDialog: (props) => (
    <CreateCommercialCardDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      boardId={props.boardId}
      firstColumnId={props.firstColumnId}
      cardType={props.cardType}
      onCreated={props.onCreated}
    />
  ),
  renderDetailDialog: (props) => (
    <KanbanCardDetailDialog
      card={props.card}
      open={props.open}
      onOpenChange={props.onOpenChange}
      allColumns={props.allColumns}
      onUpdated={props.onUpdated}
    />
  ),
};

export default function MarketingObjectsPage() {
  return (
    <KanbanBoardPage
      boardKey="commercial_pipeline"
      pageTitle="Канбан поиска объектов"
      cardType="commercial_case"
      visibleColumnKeys={['new_clients','meeting_scheduled','meeting_done','calculation_done','no_result','has_result']}
      boardConfig={commercialBoardConfig}
      tunnelRules={[{ fromColumnKey: 'meeting_done', toColumnKey: 'new_calculation', buttonLabel: 'Передать на расчёт КП' }]}
      columnGroups={[['new_clients','meeting_scheduled','meeting_done'],['calculation_done','no_result','has_result']]}
    />
  );
}
