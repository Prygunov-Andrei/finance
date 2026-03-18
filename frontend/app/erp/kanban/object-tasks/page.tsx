'use client';
import { KanbanBoardPage } from '@/components/erp/components/kanban/KanbanBoardPage';

export default function KanbanObjectTasksPage() {
  return (
    <KanbanBoardPage
      boardKey="object_tasks"
      pageTitle="Задачи по объектам"
      cardType="object_task"
    />
  );
}
