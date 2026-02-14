import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { kanbanApi, KanbanCard, KanbanColumn } from '../../lib/kanbanApi';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';

type Props = {
  boardKey: string;
  pageTitle: string;
  cardType?: string;
};

const isOverdue = (dueDate: string | null) => {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d < today;
};

export const KanbanBoardPage = ({ boardKey, pageTitle, cardType }: Props) => {
  const qc = useQueryClient();

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
    mutationFn: ({ cardId, toColumnKey }: { cardId: string; toColumnKey: string }) => kanbanApi.moveCard(cardId, toColumnKey),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['kanban', 'cards', boardId, cardType] });
    },
  });

  const columnsById = useMemo(() => {
    const map = new Map<string, KanbanColumn>();
    (columnsQuery.data || []).forEach((c) => map.set(c.id, c));
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
          <AlertDescription>Доска `{boardKey}` не найдена</AlertDescription>
        </Alert>
      </div>
    );
  }

  const columns = (columnsQuery.data || []).slice().sort((a, b) => a.order - b.order);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{pageTitle}</h1>
        <Badge variant="secondary">{boardQuery.data.title}</Badge>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(280px, 1fr))` }}>
        {columns.map((col) => (
          <Card key={col.id} className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span>{col.title}</span>
                <Badge variant="outline">{(cardsByColumnKey[col.key] || []).length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(cardsByColumnKey[col.key] || []).map((card) => (
                <div key={card.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium leading-snug">{card.title}</div>
                    {isOverdue(card.due_date) ? <Badge variant="destructive">Просрочено</Badge> : null}
                  </div>

                  {card.due_date ? (
                    <div className="text-xs text-muted-foreground">Дедлайн: {new Date(card.due_date).toLocaleDateString('ru-RU')}</div>
                  ) : null}

                  <div className="text-xs text-muted-foreground">
                    Тип: {card.type}
                    {card.assignee_username ? ` • Исполнитель: ${card.assignee_username}` : ''}
                  </div>

                  <div className="pt-1">
                    <Select
                      value={col.key}
                      onValueChange={(toColumnKey) => moveMutation.mutate({ cardId: card.id, toColumnKey })}
                      disabled={moveMutation.isPending}
                    >
                      <SelectTrigger aria-label="Переместить карточку" className="h-8">
                        <SelectValue placeholder="Переместить" />
                      </SelectTrigger>
                      <SelectContent>
                        {columns.map((c) => (
                          <SelectItem key={c.key} value={c.key}>
                            {c.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}

              {!cardsQuery.isLoading && (cardsByColumnKey[col.key] || []).length === 0 ? (
                <div className="text-sm text-muted-foreground">Нет карточек</div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

