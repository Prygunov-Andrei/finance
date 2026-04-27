import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from '@/hooks/erp-router';
import { toast } from 'sonner';
import {
  Check,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useHvacAuth as useAuth } from '../hooks/useHvacAuth';
import acRatingService from '../services/acRatingService';
import type {
  ACReview,
  ReviewStatus,
  ReviewsListParams,
} from '../services/acRatingTypes';

type StatusTab = 'pending' | 'approved' | 'rejected' | 'all';

const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: 'На модерации',
  approved: 'Одобрен',
  rejected: 'Отклонён',
};

const STATUS_VARIANT: Record<
  ReviewStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  pending: 'outline',
  approved: 'default',
  rejected: 'destructive',
};

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU');
  } catch {
    return iso;
  }
}

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`w-3.5 h-3.5 ${
            n <= value
              ? 'fill-amber-400 text-amber-400'
              : 'text-muted-foreground/40'
          }`}
        />
      ))}
    </div>
  );
}

export default function ACReviewsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.is_staff === true;

  const [items, setItems] = useState<ACReview[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusTab, setStatusTab] = useState<StatusTab>('pending');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [rowActionId, setRowActionId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [viewReview, setViewReview] = useState<ACReview | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => setSearchQuery(searchInput.trim()),
      300
    );
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: ReviewsListParams = { ordering: '-created_at' };
      if (statusTab !== 'all') params.status = statusTab;
      if (searchQuery) params.search = searchQuery;
      const result = await acRatingService.getReviews(params);
      setItems(result.items);
      setCount(result.count);
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      setError(
        status === 403
          ? 'Недостаточно прав для просмотра отзывов.'
          : 'Не удалось загрузить отзывы.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedIds([]);
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusTab, searchQuery]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.length === items.length ? [] : items.map((r) => r.id)
    );
  };

  const handleStatusChange = async (id: number, status: ReviewStatus) => {
    setRowActionId(id);
    try {
      const updated = await acRatingService.updateReviewStatus(id, status);
      setItems((prev) => prev.map((r) => (r.id === id ? updated : r)));
      toast.success(`Статус: ${STATUS_LABEL[status]}`);
      // Если фильтр не all и больше не подходит — убираем из видимого списка
      if (statusTab !== 'all' && updated.status !== statusTab) {
        setItems((prev) => prev.filter((r) => r.id !== id));
      }
    } catch {
      toast.error('Не удалось обновить статус');
    } finally {
      setRowActionId(null);
    }
  };

  const handleDeleteOne = async () => {
    if (deleteId === null) return;
    const id = deleteId;
    setDeleteId(null);
    try {
      await acRatingService.deleteReview(id);
      setItems((prev) => prev.filter((r) => r.id !== id));
      setSelectedIds((prev) => prev.filter((v) => v !== id));
      toast.success('Отзыв удалён');
    } catch {
      toast.error('Не удалось удалить отзыв');
    }
  };

  const handleBulkStatus = async (status: ReviewStatus) => {
    if (selectedIds.length === 0) return;
    setBulkRunning(true);
    try {
      const result = await acRatingService.bulkUpdateReviews(
        selectedIds,
        status
      );
      toast.success(
        `Обновлено: ${result.updated} → ${STATUS_LABEL[status]}`
      );
      setSelectedIds([]);
      loadItems();
    } catch {
      toast.error('Не удалось обновить отзывы');
    } finally {
      setBulkRunning(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setBulkRunning(true);
    try {
      await Promise.all(
        selectedIds.map((id) => acRatingService.deleteReview(id))
      );
      toast.success(`Удалено: ${selectedIds.length}`);
      setSelectedIds([]);
      setBulkDeleteOpen(false);
      loadItems();
    } catch {
      toast.error('Не удалось удалить часть отзывов');
    } finally {
      setBulkRunning(false);
    }
  };

  const headerCounter = useMemo(() => {
    if (count !== null) return `${count}`;
    return `${items.length}`;
  }, [count, items.length]);

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1>Отзывы (модерация)</h1>
            {!loading && (
              <p className="text-sm text-muted-foreground mt-1">
                {statusTab === 'pending'
                  ? `Ожидают модерации: ${headerCounter}`
                  : `Всего: ${headerCounter}`}
              </p>
            )}
          </div>
        </div>

        <Card className="p-4 space-y-3">
          <Tabs
            value={statusTab}
            onValueChange={(v) => setStatusTab(v as StatusTab)}
          >
            <TabsList data-testid="ac-reviews-status-tabs">
              <TabsTrigger value="pending" data-testid="ac-reviews-tab-pending">
                На модерации
              </TabsTrigger>
              <TabsTrigger value="approved">Одобрены</TabsTrigger>
              <TabsTrigger value="rejected">Отклонены</TabsTrigger>
              <TabsTrigger value="all">Все</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Поиск по автору / тексту / pros / cons"
                className="pl-9"
                data-testid="ac-reviews-search"
              />
            </div>
          </div>
        </Card>

        {isAdmin && selectedIds.length > 0 && (
          <Card className="p-3 flex items-center gap-2 flex-wrap bg-muted/50">
            <span className="text-sm text-muted-foreground mr-2">
              Выбрано: {selectedIds.length}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkRunning}
              onClick={() => handleBulkStatus('approved')}
              data-testid="ac-reviews-bulk-approve"
            >
              <Check className="w-4 h-4 mr-1" />
              Одобрить выбранные
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkRunning}
              onClick={() => handleBulkStatus('rejected')}
              data-testid="ac-reviews-bulk-reject"
            >
              <X className="w-4 h-4 mr-1" />
              Отклонить выбранные
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkRunning}
              onClick={() => handleBulkStatus('pending')}
              data-testid="ac-reviews-bulk-pending"
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Вернуть на модерацию
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={bulkRunning}
              onClick={() => setBulkDeleteOpen(true)}
              data-testid="ac-reviews-bulk-delete"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Удалить выбранные
            </Button>
          </Card>
        )}

        {loading && (
          <Card className="p-12 text-center text-muted-foreground">
            Загрузка отзывов...
          </Card>
        )}

        {!loading && error && (
          <Card className="p-6 border-destructive bg-destructive/10">
            <p className="text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={loadItems}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Повторить
            </Button>
          </Card>
        )}

        {!loading && !error && items.length === 0 && (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">
              {statusTab === 'pending'
                ? 'Нет отзывов, ожидающих модерации'
                : 'Отзывы не найдены'}
            </p>
          </Card>
        )}

        {!loading && !error && items.length > 0 && (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        items.length > 0 && selectedIds.length === items.length
                      }
                      onCheckedChange={toggleSelectAll}
                      aria-label="Выбрать все"
                    />
                  </TableHead>
                  <TableHead>Модель</TableHead>
                  <TableHead>Автор</TableHead>
                  <TableHead>Оценка</TableHead>
                  <TableHead>Плюсы</TableHead>
                  <TableHead>Минусы</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Дата</TableHead>
                  <TableHead className="w-44 text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => {
                  const selected = selectedIds.includes(r.id);
                  const acting = rowActionId === r.id;
                  return (
                    <TableRow
                      key={r.id}
                      className={`hover:bg-muted/40 cursor-pointer ${
                        selected ? 'bg-muted/30' : ''
                      }`}
                      onClick={() => setViewReview(r)}
                      data-testid={`ac-review-row-${r.id}`}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => toggleSelect(r.id)}
                          aria-label={`Выбрать отзыв ${r.id}`}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Link
                          to={`/hvac-rating/models/edit/${r.model}`}
                          className="text-primary hover:underline"
                        >
                          <span className="font-medium">{r.model_brand}</span>
                          {r.model_inner_unit && (
                            <span className="text-muted-foreground ml-1">
                              {r.model_inner_unit}
                            </span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.author_name || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Stars value={r.rating} />
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px]">
                        {r.pros ? (
                          truncate(r.pros, 100)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px]">
                        {r.cons ? (
                          truncate(r.cons, 100)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[r.status]}>
                          {STATUS_LABEL[r.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(r.created_at)}
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={r.status === 'approved' || acting}
                            onClick={() => handleStatusChange(r.id, 'approved')}
                            title="Одобрить"
                            className="text-green-600 hover:text-green-700"
                            data-testid={`ac-review-approve-${r.id}`}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={r.status === 'rejected' || acting}
                            onClick={() => handleStatusChange(r.id, 'rejected')}
                            title="Отклонить"
                            className="text-amber-600 hover:text-amber-700"
                            data-testid={`ac-review-reject-${r.id}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteId(r.id)}
                              title="Удалить"
                              data-testid={`ac-review-delete-${r.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить отзыв?</AlertDialogTitle>
            <AlertDialogDescription>
              Действие необратимо. Отзыв будет удалён из базы.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOne}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить выбранные отзывы?</AlertDialogTitle>
            <AlertDialogDescription>
              Будет удалено: {selectedIds.length}. Действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkRunning}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkRunning}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkRunning ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={viewReview !== null}
        onOpenChange={(open) => !open && setViewReview(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Отзыв №{viewReview?.id ?? ''}
              {viewReview && (
                <Badge
                  variant={STATUS_VARIANT[viewReview.status]}
                  className="ml-2 align-middle"
                >
                  {STATUS_LABEL[viewReview.status]}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {viewReview?.model_brand} {viewReview?.model_inner_unit}
            </DialogDescription>
          </DialogHeader>

          {viewReview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Автор</div>
                  <div>{viewReview.author_name || '—'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Оценка</div>
                  <Stars value={viewReview.rating} />
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Создан</div>
                  <div>{formatDate(viewReview.created_at)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">IP</div>
                  <div className="font-mono text-xs">
                    {viewReview.ip_address || '—'}
                  </div>
                </div>
              </div>

              {viewReview.pros && (
                <div>
                  <div className="text-xs font-medium text-green-700 mb-1">
                    Плюсы
                  </div>
                  <p className="text-sm whitespace-pre-wrap">
                    {viewReview.pros}
                  </p>
                </div>
              )}

              {viewReview.cons && (
                <div>
                  <div className="text-xs font-medium text-amber-700 mb-1">
                    Минусы
                  </div>
                  <p className="text-sm whitespace-pre-wrap">
                    {viewReview.cons}
                  </p>
                </div>
              )}

              {viewReview.comment && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    Комментарий
                  </div>
                  <p className="text-sm whitespace-pre-wrap">
                    {viewReview.comment}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-3 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={viewReview.status === 'approved'}
                  onClick={() => {
                    handleStatusChange(viewReview.id, 'approved');
                    setViewReview(null);
                  }}
                  className="text-green-600"
                >
                  <Check className="w-4 h-4 mr-1" />
                  Одобрить
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={viewReview.status === 'rejected'}
                  onClick={() => {
                    handleStatusChange(viewReview.id, 'rejected');
                    setViewReview(null);
                  }}
                  className="text-amber-600"
                >
                  <X className="w-4 h-4 mr-1" />
                  Отклонить
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigate(`/hvac-rating/models/edit/${viewReview.model}`);
                  }}
                  className="ml-auto"
                >
                  Открыть модель
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
