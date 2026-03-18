'use client';
import { KanbanBoardPage } from '@/components/erp/components/kanban/KanbanBoardPage';

export default function KanbanSupplyPage() {
  return (
    <KanbanBoardPage
      boardKey="supply"
      pageTitle="Канбан снабжения"
      cardType="supply_case"
    />
  );
}
