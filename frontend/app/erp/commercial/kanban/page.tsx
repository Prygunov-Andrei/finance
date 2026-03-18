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

export default function CommercialKanbanPage() {
  return (
    <KanbanBoardPage
      boardKey="commercial_pipeline"
      pageTitle="Канбан КП"
      cardType="commercial_case"
      visibleColumnKeys={['new_calculation','in_progress','invoices_requested','estimate_approval','estimate_approved','kp_prepared']}
      boardConfig={commercialBoardConfig}
      tunnelRules={[{ fromColumnKey: 'kp_prepared', toColumnKey: 'calculation_done', buttonLabel: 'Вернуть в маркетинг' }]}
      columnGroups={[['new_calculation','in_progress','invoices_requested','estimate_approval','estimate_approved','kp_prepared']]}
    />
  );
}
