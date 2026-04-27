import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from '@/hooks/erp-router';
import { toast } from 'sonner';
import {
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { ImageWithFallback } from '@/components/common/ImageWithFallback';
import { useHvacAuth as useAuth } from '../hooks/useHvacAuth';
import acRatingService from '../services/acRatingService';
import type {
  ACBrand,
  ACModelListItem,
  ACPublishStatus,
  RegionChoice,
} from '../services/acRatingTypes';

const STATUS_LABEL: Record<ACPublishStatus, string> = {
  draft: 'Черновик',
  review: 'На проверке',
  published: 'Опубликован',
  archived: 'В архиве',
};

const STATUS_VARIANT: Record<
  ACPublishStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'secondary',
  review: 'outline',
  published: 'default',
  archived: 'destructive',
};

type StatusFilter = 'all' | ACPublishStatus;
type RegionFilter = 'all' | string;

export default function ACModelsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.is_staff === true;

  const [models, setModels] = useState<ACModelListItem[]>([]);
  const [brands, setBrands] = useState<ACBrand[]>([]);
  const [regions, setRegions] = useState<RegionChoice[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [regionFilter, setRegionFilter] = useState<RegionFilter>('all');
  const [brandFilter, setBrandFilter] = useState<number[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleteOneId, setDeleteOneId] = useState<number | null>(null);
  const [recalcId, setRecalcId] = useState<number | null>(null);

  // Debounce поиска. 300 ms — стандарт для UI-фильтров.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Справочники: один раз при mount.
  useEffect(() => {
    acRatingService.getBrands({ ordering: 'name' })
      .then((r) => setBrands(r.items))
      .catch(() => setBrands([]));
    acRatingService.getRegions().then(setRegions).catch(() => setRegions([]));
  }, []);

  const loadModels = async (nextPage: number, reset: boolean) => {
    try {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      const result = await acRatingService.getModels({
        brand: brandFilter,
        publish_status: statusFilter === 'all' ? '' : statusFilter,
        region: regionFilter === 'all' ? undefined : regionFilter,
        search: searchQuery || undefined,
        page: nextPage,
      });
      setModels((prev) => (reset ? result.items : [...prev, ...result.items]));
      setHasNext(!!result.next);
      setCount(result.count);
      setPage(nextPage);
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      setError(
        status === 403
          ? 'Недостаточно прав для просмотра каталога моделей.'
          : 'Не удалось загрузить список моделей.'
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Перезагрузка списка при смене фильтров.
  useEffect(() => {
    setSelectedIds([]);
    loadModels(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, regionFilter, brandFilter, searchQuery]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.length === models.length ? [] : models.map((m) => m.id)
    );
  };

  const toggleBrandFilter = (id: number) => {
    setBrandFilter((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  };

  const resetFilters = () => {
    setStatusFilter('all');
    setRegionFilter('all');
    setBrandFilter([]);
    setSearchInput('');
    setSearchQuery('');
  };

  const handleRecalc = async (id: number) => {
    setRecalcId(id);
    try {
      const result = await acRatingService.recalculateModel(id);
      setModels((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                total_index: result.model.total_index,
                publish_status: result.model.publish_status,
              }
            : m
        )
      );
      toast.success(
        `Пересчёт: total_index = ${result.model.total_index.toFixed(1)}`
      );
    } catch {
      toast.error('Не удалось пересчитать модель');
    } finally {
      setRecalcId(null);
    }
  };

  const handleDeleteOne = async () => {
    if (deleteOneId === null) return;
    const id = deleteOneId;
    setDeleteOneId(null);
    try {
      await acRatingService.deleteModel(id);
      setModels((prev) => prev.filter((m) => m.id !== id));
      setSelectedIds((prev) => prev.filter((v) => v !== id));
      toast.success('Модель удалена');
    } catch {
      toast.error('Не удалось удалить модель');
    }
  };

  const handleBulkStatus = async (status: ACPublishStatus) => {
    if (selectedIds.length === 0) return;
    setBulkRunning(true);
    try {
      await Promise.all(
        selectedIds.map((id) =>
          acRatingService.updateModel(id, { publish_status: status })
        )
      );
      toast.success(
        `Обновлено: ${selectedIds.length} → ${STATUS_LABEL[status]}`
      );
      setSelectedIds([]);
      loadModels(1, true);
    } catch {
      toast.error('Не удалось обновить часть моделей');
    } finally {
      setBulkRunning(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setBulkRunning(true);
    try {
      await Promise.all(selectedIds.map((id) => acRatingService.deleteModel(id)));
      toast.success(`Удалено: ${selectedIds.length}`);
      setSelectedIds([]);
      setBulkDeleteOpen(false);
      loadModels(1, true);
    } catch {
      toast.error('Не удалось удалить часть моделей');
    } finally {
      setBulkRunning(false);
    }
  };

  const headerCounter = useMemo(() => {
    if (count !== null) return `${count}`;
    return `${models.length}`;
  }, [count, models.length]);

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Шапка */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1>Каталог моделей</h1>
            {!loading && (
              <p className="text-sm text-muted-foreground mt-1">
                Всего: {headerCounter}
              </p>
            )}
          </div>
          {isAdmin && (
            <Button asChild>
              <Link to="/hvac-rating/models/create">
                <Plus className="w-4 h-4 mr-2" />
                Добавить модель
              </Link>
            </Button>
          )}
        </div>

        {/* Фильтры */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Поиск по inner unit / outer unit / серии / бренду"
                className="pl-9"
                data-testid="ac-models-search"
              />
            </div>

            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger
                className="w-[180px]"
                data-testid="ac-models-status-filter"
              >
                <SelectValue placeholder="Статус публикации" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="draft">Черновик</SelectItem>
                <SelectItem value="review">На проверке</SelectItem>
                <SelectItem value="published">Опубликован</SelectItem>
                <SelectItem value="archived">В архиве</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={regionFilter}
              onValueChange={(v) => setRegionFilter(v as RegionFilter)}
            >
              <SelectTrigger
                className="w-[160px]"
                data-testid="ac-models-region-filter"
              >
                <SelectValue placeholder="Регион" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все регионы</SelectItem>
                {regions.map((r) => (
                  <SelectItem key={r.code} value={r.code}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={resetFilters}
              data-testid="ac-models-reset"
            >
              Сбросить
            </Button>
          </div>

          {brands.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground mr-1">
                Бренды:
              </span>
              {brands.map((b) => {
                const active = brandFilter.includes(b.id);
                return (
                  <button
                    key={b.id}
                    onClick={() => toggleBrandFilter(b.id)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:bg-accent'
                    }`}
                    data-testid={`ac-models-brand-chip-${b.id}`}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Bulk-actions */}
        {isAdmin && selectedIds.length > 0 && (
          <Card className="p-3 flex items-center gap-2 flex-wrap bg-muted/50">
            <span className="text-sm text-muted-foreground mr-2">
              Выбрано: {selectedIds.length}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkRunning}
              onClick={() => handleBulkStatus('published')}
              data-testid="ac-models-bulk-publish"
            >
              Опубликовать
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkRunning}
              onClick={() => handleBulkStatus('draft')}
            >
              В черновики
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkRunning}
              onClick={() => handleBulkStatus('archived')}
            >
              В архив
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={bulkRunning}
              onClick={() => setBulkDeleteOpen(true)}
              data-testid="ac-models-bulk-delete"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Удалить выбранные
            </Button>
          </Card>
        )}

        {/* Таблица / состояния */}
        {loading && (
          <Card className="p-12 text-center text-muted-foreground">
            Загрузка моделей...
          </Card>
        )}

        {!loading && error && (
          <Card className="p-6 border-destructive bg-destructive/10">
            <p className="text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => loadModels(1, true)}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Повторить
            </Button>
          </Card>
        )}

        {!loading && !error && models.length === 0 && (
          <Card className="p-12 text-center space-y-4">
            <p className="text-muted-foreground">Моделей пока нет</p>
            {isAdmin && (
              <Button asChild>
                <Link to="/hvac-rating/models/create">
                  <Plus className="w-4 h-4 mr-2" />
                  Добавить первую
                </Link>
              </Button>
            )}
          </Card>
        )}

        {!loading && !error && models.length > 0 && (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        models.length > 0 &&
                        selectedIds.length === models.length
                      }
                      onCheckedChange={toggleSelectAll}
                      aria-label="Выбрать все"
                    />
                  </TableHead>
                  <TableHead className="w-16">Фото</TableHead>
                  <TableHead>Бренд</TableHead>
                  <TableHead>Inner Unit</TableHead>
                  <TableHead>Серия</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="text-right">Index</TableHead>
                  <TableHead>Реклама</TableHead>
                  <TableHead className="w-32 text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((m) => {
                  const selected = selectedIds.includes(m.id);
                  return (
                    <TableRow
                      key={m.id}
                      className={`hover:bg-muted/40 cursor-pointer ${
                        selected ? 'bg-muted/30' : ''
                      }`}
                      onClick={() => navigate(`/hvac-rating/models/edit/${m.id}`)}
                      data-testid={`ac-model-row-${m.id}`}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => toggleSelect(m.id)}
                          aria-label={`Выбрать модель ${m.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="w-10 h-10 bg-muted rounded flex items-center justify-center overflow-hidden">
                          {m.primary_photo_url ? (
                            <ImageWithFallback
                              src={m.primary_photo_url}
                              alt={m.inner_unit}
                              className="max-w-full max-h-full object-contain"
                            />
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {m.brand_name}
                      </TableCell>
                      <TableCell>
                        {m.inner_unit || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>{m.series || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[m.publish_status]}>
                          {STATUS_LABEL[m.publish_status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(m.total_index).toFixed(1)}
                      </TableCell>
                      <TableCell>
                        {m.is_ad ? (
                          <Badge variant="outline">
                            Реклама{m.ad_position ? ` #${m.ad_position}` : ''}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={recalcId === m.id}
                            onClick={() => handleRecalc(m.id)}
                            title="Пересчитать total_index"
                            data-testid={`ac-model-recalc-${m.id}`}
                          >
                            <RefreshCw
                              className={`w-4 h-4 ${
                                recalcId === m.id ? 'animate-spin' : ''
                              }`}
                            />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteOneId(m.id)}
                            title="Удалить"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}

        {hasNext && !loading && !error && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              disabled={loadingMore}
              onClick={() => loadModels(page + 1, false)}
            >
              {loadingMore ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Загрузка...
                </>
              ) : (
                'Показать ещё'
              )}
            </Button>
          </div>
        )}
      </div>

      <AlertDialog
        open={deleteOneId !== null}
        onOpenChange={(open) => !open && setDeleteOneId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить модель?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Связанные фото, поставщики и
              значения параметров будут удалены вместе с моделью.
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
            <AlertDialogTitle>Удалить выбранные модели?</AlertDialogTitle>
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
    </div>
  );
}
