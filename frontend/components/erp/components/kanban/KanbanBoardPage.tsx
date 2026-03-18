import React, { useMemo, useState, useCallback, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, type DropResult } from '@hello-pangea/dnd';
import { kanbanApi, KanbanCard, KanbanColumn } from '../../lib/kanbanApi';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { KanbanCardCompact } from './KanbanCardCompact';

export type KanbanBoardConfig = {
  renderCreateDialog?: (props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    boardId: string;
    firstColumnId: string;
    cardType: string;
    onCreated: () => void;
  }) => ReactNode;
  renderDetailDialog?: (props: {
    card: KanbanCard | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    allColumns: KanbanColumn[];
    onUpdated: () => void;
  }) => ReactNode;
};

export type TunnelRule = {
  fromColumnKey: string;
  toColumnKey: string;
  buttonLabel: string;
};

type Props = {
  boardKey: string;
  pageTitle: string;
  cardType?: string;
  visibleColumnKeys?: string[];
  boardConfig?: KanbanBoardConfig;
  tunnelRules?: TunnelRule[];
  columnGroups?: string[][];
};

export const KanbanBoardPage = ({ boardKey, pageTitle, cardType, visibleColumnKeys, boardConfig, tunnelRules, columnGroups }: Props) => {
  const qc = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailCard, setDetailCard] = useState<KanbanCard | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const boardQuery = useQuery({
    queryKey: ['kanban', 'board', boardKey],
    queryFn: () => kanbanApi.getBoardByKey(boardKey),
  });

  const boardId = boardQuery.data?.id || null;

  const columnsQuery = useQuery({
    queryKey: ['kanban', 'columns', boardId],
    enabled: Boolean(boardId),
    queryFn: () => kanbanApi.listColumns(boardId as string),
  });

  const cardsQuery = useQuery({
    queryKey: ['kanban', 'cards', boardId, cardType],
    enabled: Boolean(boardId),
    queryFn: () => kanbanApi.listCards(boardId as string, cardType),
  });

  const moveMutation = useMutation({
    mutationFn: ({ cardId, toColumnKey }: { cardId: string; toColumnKey: string }) =>
      kanbanApi.moveCard(cardId, toColumnKey),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['kanban', 'cards', boardId, cardType] });
    },
  });

  const columnsById = useMemo(() => {
    const map = new Map<string, KanbanColumn>();
    (columnsQuery.data || []).forEach((c) => map.set(c.id, c));
    return map;
  }, [columnsQuery.data]);

  const columnsByKey = useMemo(() => {
    const map = new Map<string, KanbanColumn>();
    (columnsQuery.data || []).forEach((c) => map.set(c.key, c));
    return map;
  }, [columnsQuery.data]);

  const cardsByColumnKey = useMemo(() => {
    const result: Record<string, KanbanCard[]> = {};
    const cols = columnsQuery.data || [];
    cols.forEach((c) => (result[c.key] = []));

    (cardsQuery.data || []).forEach((card) => {
      const col = columnsById.get(card.column);
      if (!col) return;
      result[col.key] = result[col.key] || [];
      result[col.key].push(card);
    });

    Object.values(result).forEach((arr) =>
      arr.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru')),
    );
    return result;
  }, [cardsQuery.data, columnsQuery.data, columnsById]);

  const allColumns = useMemo(
    () => (columnsQuery.data || []).slice().sort((a, b) => a.order - b.order),
    [columnsQuery.data],
  );

  const columns = useMemo(
    () => (visibleColumnKeys ? allColumns.filter((c) => visibleColumnKeys.includes(c.key)) : allColumns),
    [allColumns, visibleColumnKeys],
  );

  const firstColumn = columns[0] || null;

  const columnGroupOf = useMemo(() => {
    const map: Record<string, number> = {};
    if (columnGroups) {
      columnGroups.forEach((group, groupIdx) => {
        group.forEach((key) => { map[key] = groupIdx; });
      });
    }
    return map;
  }, [columnGroups]);

  const tunnelRulesByColumn = useMemo(() => {
    const map: Record<string, TunnelRule> = {};
    if (tunnelRules) {
      tunnelRules.forEach((rule) => { map[rule.fromColumnKey] = rule; });
    }
    return map;
  }, [tunnelRules]);

  const handleTunnel = useCallback(
    (cardId: string, toColumnKey: string) => {
      moveMutation.mutate(
        { cardId, toColumnKey },
        {
          onSuccess: () => {
            toast.success('Карточка передана');
          },
          onError: (err: any) => {
            toast.error(`Ошибка: ${err?.message || 'Не удалось переместить'}`);
          },
        },
      );
    },
    [moveMutation],
  );

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return;
      const { draggableId, source, destination } = result;
      const fromKey = source.droppableId;
      const toKey = destination.droppableId;
      if (fromKey === toKey && source.index === destination.index) return;

      if (columnGroups && columnGroups.length > 0) {
        const fromGroup = columnGroupOf[fromKey];
        const toGroup = columnGroupOf[toKey];
        if (fromGroup !== undefined && toGroup !== undefined && fromGroup !== toGroup) return;
      }

      moveMutation.mutate({ cardId: draggableId, toColumnKey: toKey });
    },
    [moveMutation, columnGroups, columnGroupOf],
  );

  const handleCardDoubleClick = useCallback((card: KanbanCard) => {
    setDetailCard(card);
    setIsDetailOpen(true);
  }, []);

  const handleCreated = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['kanban', 'cards', boardId, cardType] });
    setIsCreateOpen(false);
  }, [qc, boardId, cardType]);

  const handleUpdated = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['kanban', 'cards', boardId, cardType] });
  }, [qc, boardId, cardType]);

  if (boardQuery.isLoading) {
    return <div className="p-6">Загрузка...</div>;
  }

  if (boardQuery.error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>Не удалось загрузить доску: {(boardQuery.error as Error).message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!boardQuery.data) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>Доска &laquo;{boardKey}&raquo; не найдена</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{pageTitle}</h1>
        <Button onClick={() => setIsCreateOpen(true)} aria-label="Создать карточку" tabIndex={0}>
          + Создать
        </Button>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div
          className="flex gap-4 overflow-x-auto pb-2"
          style={{ minHeight: 200 }}
        >
          {columns.map((col) => (
            <div key={col.id} className="flex-shrink-0" style={{ width: 300 }}>
              <Card className="h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between gap-2">
                    <span>{col.title}</span>
                    <Badge variant="outline">{(cardsByColumnKey[col.key] || []).length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <Droppable droppableId={col.key}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`space-y-2 min-h-[60px] rounded-md p-1 transition-colors ${
                          snapshot.isDraggingOver ? 'bg-accent/50' : ''
                        }`}
                      >
                        {(cardsByColumnKey[col.key] || []).map((card, idx) => {
                          const rule = tunnelRulesByColumn[col.key];
                          const tunnelAction = rule
                            ? { label: rule.buttonLabel, onTunnel: (cId: string) => handleTunnel(cId, rule.toColumnKey) }
                            : null;
                          return (
                            <KanbanCardCompact
                              key={card.id}
                              card={card}
                              index={idx}
                              onDoubleClick={handleCardDoubleClick}
                              tunnelAction={tunnelAction}
                            />
                          );
                        })}
                        {provided.placeholder}
                        {!cardsQuery.isLoading && (cardsByColumnKey[col.key] || []).length === 0 && (
                          <div className="text-sm text-muted-foreground text-center py-4">Нет карточек</div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </DragDropContext>

      {/* Board-specific Create Dialog */}
      {boardConfig?.renderCreateDialog && boardId && firstColumn
        ? boardConfig.renderCreateDialog({
            open: isCreateOpen,
            onOpenChange: setIsCreateOpen,
            boardId,
            firstColumnId: firstColumn.id,
            cardType: cardType || 'commercial_case',
            onCreated: handleCreated,
          })
        : null}

      {/* Board-specific Detail Dialog */}
      {boardConfig?.renderDetailDialog
        ? boardConfig.renderDetailDialog({
            card: detailCard,
            open: isDetailOpen,
            onOpenChange: (open) => {
              setIsDetailOpen(open);
              if (!open) setDetailCard(null);
            },
            allColumns,
            onUpdated: handleUpdated,
          })
        : null}
    </div>
  );
};
