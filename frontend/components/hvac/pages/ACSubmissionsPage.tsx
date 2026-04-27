import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from '@/hooks/erp-router';
import { toast } from 'sonner';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Trash2,
  Wand2,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useHvacAuth as useAuth } from '../hooks/useHvacAuth';
import acRatingService from '../services/acRatingService';
import type {
  ACBrand,
  ACSubmissionDetail,
  ACSubmissionListItem,
  SubmissionStatus,
  SubmissionsListParams,
} from '../services/acRatingTypes';

type StatusTab = 'pending' | 'approved' | 'rejected' | 'all';
type HasBrandFilter = 'all' | 'true' | 'false';

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: 'На модерации',
  approved: 'Одобрена',
  rejected: 'Отклонена',
};

const STATUS_VARIANT: Record<
  SubmissionStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  pending: 'outline',
  approved: 'default',
  rejected: 'destructive',
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU');
  } catch {
    return iso;
  }
}

function formatCapacity(watt: number): string {
  if (!watt) return '—';
  return `${watt.toLocaleString('ru-RU')} Вт`;
}

function YesNo({ value }: { value: boolean }) {
  return value ? (
    <span className="text-green-700">Да</span>
  ) : (
    <span className="text-muted-foreground">Нет</span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export default function ACSubmissionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.is_staff === true;

  const [items, setItems] = useState<ACSubmissionListItem[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusTab, setStatusTab] = useState<StatusTab>('pending');
  const [hasBrand, setHasBrand] = useState<HasBrandFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [rowActionId, setRowActionId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [convertId, setConvertId] = useState<number | null>(null);
  const [convertRunning, setConvertRunning] = useState(false);

  const [brands, setBrands] = useState<ACBrand[]>([]);

  const [detail, setDetail] = useState<ACSubmissionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailBrandId, setDetailBrandId] = useState<string>('');
  const [detailNotes, setDetailNotes] = useState('');
  const [detailSaving, setDetailSaving] = useState(false);

  const [photoIndex, setPhotoIndex] = useState<number | null>(null);

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

  useEffect(() => {
    // Загружаем бренды один раз — нужны для Select-а в Dialog.
    acRatingService
      .getBrands({ is_active: 'true', ordering: 'name' })
      .then((r) => setBrands(r.items))
      .catch(() => setBrands([]));
  }, []);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: SubmissionsListParams = { ordering: '-created_at' };
      if (statusTab !== 'all') params.status = statusTab;
      if (hasBrand !== 'all') params.has_brand = hasBrand;
      if (searchQuery) params.search = searchQuery;
      const result = await acRatingService.getSubmissions(params);
      setItems(result.items);
      setCount(result.count);
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      setError(
        status === 403
          ? 'Недостаточно прав для просмотра заявок.'
          : 'Не удалось загрузить заявки.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedIds([]);
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusTab, hasBrand, searchQuery]);

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

  const handleStatusChange = async (id: number, status: SubmissionStatus) => {
    setRowActionId(id);
    try {
      await acRatingService.updateSubmission(id, { status });
      toast.success(`Статус: ${STATUS_LABEL[status]}`);
      if (statusTab !== 'all' && status !== statusTab) {
        setItems((prev) => prev.filter((r) => r.id !== id));
      } else {
        setItems((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status } : r))
        );
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
      await acRatingService.deleteSubmission(id);
      setItems((prev) => prev.filter((r) => r.id !== id));
      setSelectedIds((prev) => prev.filter((v) => v !== id));
      toast.success('Заявка удалена');
    } catch {
      toast.error('Не удалось удалить заявку');
    }
  };

  const handleBulkStatus = async (status: SubmissionStatus) => {
    if (selectedIds.length === 0) return;
    setBulkRunning(true);
    try {
      const result = await acRatingService.bulkUpdateSubmissions(
        selectedIds,
        status
      );
      toast.success(`Обновлено: ${result.updated} → ${STATUS_LABEL[status]}`);
      setSelectedIds([]);
      loadItems();
    } catch {
      toast.error('Не удалось обновить заявки');
    } finally {
      setBulkRunning(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setBulkRunning(true);
    try {
      await Promise.all(
        selectedIds.map((id) => acRatingService.deleteSubmission(id))
      );
      toast.success(`Удалено: ${selectedIds.length}`);
      setSelectedIds([]);
      setBulkDeleteOpen(false);
      loadItems();
    } catch {
      toast.error('Не удалось удалить часть заявок');
    } finally {
      setBulkRunning(false);
    }
  };

  const handleConvert = async () => {
    if (convertId === null) return;
    const id = convertId;
    setConvertRunning(true);
    try {
      const response = await acRatingService.convertSubmission(id);
      toast.success('Создана модель из заявки');
      setConvertId(null);
      setDetail(null);
      navigate(response.redirect_to);
    } catch (err: unknown) {
      const detail = axios.isAxiosError(err)
        ? (err.response?.data as { detail?: string })?.detail
        : undefined;
      toast.error(detail || 'Не удалось сконвертировать заявку');
    } finally {
      setConvertRunning(false);
    }
  };

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const full = await acRatingService.getSubmission(id);
      setDetail(full);
      setDetailBrandId(full.brand !== null ? String(full.brand) : '');
      setDetailNotes(full.admin_notes || '');
    } catch {
      toast.error('Не удалось загрузить заявку');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDetailSave = async () => {
    if (!detail) return;
    setDetailSaving(true);
    try {
      const payload = {
        admin_notes: detailNotes,
        brand: detailBrandId ? Number(detailBrandId) : null,
      };
      const updated = await acRatingService.updateSubmission(detail.id, payload);
      setDetail(updated);
      // Обновим строку в таблице — brand_name мог поменяться.
      setItems((prev) =>
        prev.map((r) =>
          r.id === updated.id
            ? {
                ...r,
                brand_name: updated.brand_name,
              }
            : r
        )
      );
      toast.success('Сохранено');
    } catch {
      toast.error('Не удалось сохранить');
    } finally {
      setDetailSaving(false);
    }
  };

  const headerCounter = useMemo(() => {
    if (count !== null) return `${count}`;
    return `${items.length}`;
  }, [count, items.length]);

  // Кнопка «Конвертировать» в строке — disabled?
  const convertDisabledReason = (
    item: ACSubmissionListItem
  ): string | null => {
    if (item.converted_model_id) return 'Уже сконвертирована';
    if (item.brand_name === '—') return 'Сначала привяжите бренд (откройте Просмотр)';
    return null;
  };

  const detailConvertDisabledReason = (d: ACSubmissionDetail): string | null => {
    if (d.converted_model_id) return 'Уже сконвертирована';
    if (d.brand === null && !d.custom_brand_name) {
      return 'Сначала привяжите бренд';
    }
    return null;
  };

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1>Заявки на добавление кондиционеров</h1>
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
            <TabsList data-testid="ac-submissions-status-tabs">
              <TabsTrigger value="pending" data-testid="ac-submissions-tab-pending">
                На модерации
              </TabsTrigger>
              <TabsTrigger value="approved">Одобренные</TabsTrigger>
              <TabsTrigger value="rejected">Отклонённые</TabsTrigger>
              <TabsTrigger value="all">Все</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Поиск по inner/outer/series/email/custom бренду"
                className="pl-9"
                data-testid="ac-submissions-search"
              />
            </div>
            <Select
              value={hasBrand}
              onValueChange={(v) => setHasBrand(v as HasBrandFilter)}
            >
              <SelectTrigger
                className="w-[200px]"
                data-testid="ac-submissions-has-brand"
              >
                <SelectValue placeholder="Бренд" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все бренды</SelectItem>
                <SelectItem value="true">С брендом</SelectItem>
                <SelectItem value="false">Без бренда (custom)</SelectItem>
              </SelectContent>
            </Select>
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
              data-testid="ac-submissions-bulk-approve"
            >
              <Check className="w-4 h-4 mr-1" />
              Одобрить выбранные
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkRunning}
              onClick={() => handleBulkStatus('rejected')}
              data-testid="ac-submissions-bulk-reject"
            >
              <X className="w-4 h-4 mr-1" />
              Отклонить выбранные
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={bulkRunning}
              onClick={() => setBulkDeleteOpen(true)}
              data-testid="ac-submissions-bulk-delete"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Удалить выбранные
            </Button>
          </Card>
        )}

        {loading && (
          <Card className="p-12 text-center text-muted-foreground">
            Загрузка заявок...
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
                ? 'Нет заявок, ожидающих модерации'
                : 'Заявки не найдены'}
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
                  <TableHead className="w-14">Фото</TableHead>
                  <TableHead>Бренд</TableHead>
                  <TableHead>Inner Unit</TableHead>
                  <TableHead>Серия</TableHead>
                  <TableHead>Мощность</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Модель</TableHead>
                  <TableHead>Создана</TableHead>
                  <TableHead className="w-52 text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => {
                  const selected = selectedIds.includes(r.id);
                  const acting = rowActionId === r.id;
                  const noBrand = r.brand_name === '—';
                  const convertReason = convertDisabledReason(r);
                  return (
                    <TableRow
                      key={r.id}
                      className={`hover:bg-muted/40 cursor-pointer ${
                        selected ? 'bg-muted/30' : ''
                      }`}
                      onClick={() => openDetail(r.id)}
                      data-testid={`ac-submission-row-${r.id}`}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => toggleSelect(r.id)}
                          aria-label={`Выбрать заявку ${r.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        {r.primary_photo_url ? (
                          <img
                            src={r.primary_photo_url}
                            alt=""
                            className="w-10 h-10 object-cover rounded border"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded border bg-muted/40" />
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            noBrand
                              ? 'text-amber-700 font-medium'
                              : 'font-medium'
                          }
                        >
                          {r.brand_name}
                        </span>
                        {r.photos_count > 0 && (
                          <span className="text-muted-foreground text-xs ml-2">
                            +{r.photos_count} фото
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{r.inner_unit}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.series || '—'}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatCapacity(r.nominal_capacity_watt)}
                      </TableCell>
                      <TableCell
                        className="text-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <a
                          href={`mailto:${r.submitter_email}`}
                          className="text-primary hover:underline"
                        >
                          {r.submitter_email}
                        </a>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[r.status]}>
                          {STATUS_LABEL[r.status]}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {r.converted_model_id ? (
                          <Link
                            to={`/hvac-rating/models/edit/${r.converted_model_id}`}
                            className="text-primary hover:underline text-sm"
                          >
                            #{r.converted_model_id}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
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
                            data-testid={`ac-submission-approve-${r.id}`}
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
                            data-testid={`ac-submission-reject-${r.id}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={Boolean(convertReason)}
                            onClick={() => setConvertId(r.id)}
                            title={convertReason || 'Конвертировать в модель'}
                            className="text-blue-600 hover:text-blue-700"
                            data-testid={`ac-submission-convert-${r.id}`}
                          >
                            <Wand2 className="w-4 h-4" />
                          </Button>
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteId(r.id)}
                              title="Удалить"
                              data-testid={`ac-submission-delete-${r.id}`}
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
            <AlertDialogTitle>Удалить заявку?</AlertDialogTitle>
            <AlertDialogDescription>
              Действие необратимо. Заявка и её фото будут удалены.
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
            <AlertDialogTitle>Удалить выбранные заявки?</AlertDialogTitle>
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

      <AlertDialog
        open={convertId !== null}
        onOpenChange={(open) => !open && !convertRunning && setConvertId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Создать ACModel из заявки?</AlertDialogTitle>
            <AlertDialogDescription>
              Будет создана модель и страница редактирования откроется
              автоматически. Если бренд указан как custom_brand_name, он
              будет создан.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={convertRunning}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConvert}
              disabled={convertRunning}
              data-testid="ac-submission-convert-confirm"
            >
              {convertRunning ? 'Конвертация...' : 'Создать модель'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={detailLoading || detail !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null);
            setPhotoIndex(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Заявка №{detail?.id ?? ''}
              {detail && (
                <Badge
                  variant={STATUS_VARIANT[detail.status]}
                  className="ml-2 align-middle"
                >
                  {STATUS_LABEL[detail.status]}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {detail
                ? `${detail.brand_name} ${detail.inner_unit}`
                : 'Загрузка...'}
            </DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="space-y-6">
              {/* Бренд (warning, если custom) */}
              {detail.brand === null && detail.custom_brand_name && (
                <Card className="p-3 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Бренд не привязан. Custom:{' '}
                    <span className="font-medium">
                      {detail.custom_brand_name}
                    </span>
                    . Привяжите существующий бренд ниже либо оставьте custom —
                    при конверсии будет создан новый бренд.
                  </p>
                </Card>
              )}

              {/* Тех. характеристики */}
              <section>
                <h3 className="text-sm font-semibold mb-2">
                  Технические характеристики
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="Inner Unit">{detail.inner_unit || '—'}</Field>
                  <Field label="Outer Unit">{detail.outer_unit || '—'}</Field>
                  <Field label="Серия">{detail.series || '—'}</Field>
                  <Field label="Компрессор">
                    {detail.compressor_model || '—'}
                  </Field>
                  <Field label="Мощность">
                    {formatCapacity(detail.nominal_capacity_watt)}
                  </Field>
                  <Field label="Цена">
                    {detail.price ? `${detail.price} ₽` : '—'}
                  </Field>
                  <Field label="Подогрев поддона">
                    {detail.drain_pan_heater || '—'}
                  </Field>
                  <Field label="ERV">
                    <YesNo value={detail.erv} />
                  </Field>
                  <Field label="Скорость наружн. вент.">
                    <YesNo value={detail.fan_speed_outdoor} />
                  </Field>
                  <Field label="Подсветка пульта">
                    <YesNo value={detail.remote_backlight} />
                  </Field>
                  <Field label="Скорости вентилятора">
                    {detail.fan_speeds_indoor || '—'}
                  </Field>
                  <Field label="Тонкие фильтры">
                    {detail.fine_filters || '—'}
                  </Field>
                  <Field label="Ионизатор">
                    {detail.ionizer_type || '—'}
                  </Field>
                  <Field label="Русский пульт">
                    {detail.russian_remote || '—'}
                  </Field>
                  <Field label="УФ-лампа">{detail.uv_lamp || '—'}</Field>
                </div>
              </section>

              {/* Теплообменники */}
              <section>
                <h3 className="text-sm font-semibold mb-2">Теплообменники</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Card className="p-3">
                    <div className="text-xs text-muted-foreground mb-2">
                      Внутренний
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <Field label="Длина">
                        {detail.inner_he_length_mm || '—'} мм
                      </Field>
                      <Field label="Трубок">
                        {detail.inner_he_tube_count || '—'}
                      </Field>
                      <Field label="Диаметр">
                        {detail.inner_he_tube_diameter_mm || '—'} мм
                      </Field>
                      <Field label="Площадь">
                        {detail.inner_he_surface_area || '—'}
                      </Field>
                    </div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-xs text-muted-foreground mb-2">
                      Наружный
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <Field label="Длина">
                        {detail.outer_he_length_mm || '—'} мм
                      </Field>
                      <Field label="Трубок">
                        {detail.outer_he_tube_count || '—'}
                      </Field>
                      <Field label="Диаметр">
                        {detail.outer_he_tube_diameter_mm || '—'} мм
                      </Field>
                      <Field label="Толщина">
                        {detail.outer_he_thickness_mm || '—'} мм
                      </Field>
                      <Field label="Площадь">
                        {detail.outer_he_surface_area || '—'}
                      </Field>
                    </div>
                  </Card>
                </div>
              </section>

              {/* Ссылки */}
              {(detail.video_url || detail.buy_url || detail.supplier_url) && (
                <section>
                  <h3 className="text-sm font-semibold mb-2">Ссылки</h3>
                  <div className="space-y-1 text-sm">
                    {detail.video_url && (
                      <div>
                        <span className="text-muted-foreground">Видео: </span>
                        <a
                          href={detail.video_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline break-all"
                        >
                          {detail.video_url}
                        </a>
                      </div>
                    )}
                    {detail.buy_url && (
                      <div>
                        <span className="text-muted-foreground">Купить: </span>
                        <a
                          href={detail.buy_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline break-all"
                        >
                          {detail.buy_url}
                        </a>
                      </div>
                    )}
                    {detail.supplier_url && (
                      <div>
                        <span className="text-muted-foreground">
                          Поставщик:{' '}
                        </span>
                        <a
                          href={detail.supplier_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline break-all"
                        >
                          {detail.supplier_url}
                        </a>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Фото */}
              {detail.photos.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold mb-2">
                    Фото ({detail.photos.length})
                  </h3>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {detail.photos.map((photo, idx) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => setPhotoIndex(idx)}
                        className="block aspect-square rounded border overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                        data-testid={`ac-submission-photo-${photo.id}`}
                      >
                        <img
                          src={photo.image_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Автор + модерация */}
              <section>
                <h3 className="text-sm font-semibold mb-2">
                  Автор и модерация
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Field label="Email">
                    <a
                      href={`mailto:${detail.submitter_email}`}
                      className="text-primary hover:underline"
                    >
                      {detail.submitter_email}
                    </a>
                  </Field>
                  <Field label="IP">
                    <span className="font-mono text-xs">
                      {detail.ip_address || '—'}
                    </span>
                  </Field>
                  <Field label="Создана">{formatDate(detail.created_at)}</Field>
                  <Field label="Согласие">
                    <YesNo value={detail.consent} />
                  </Field>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      Бренд (привязка)
                    </label>
                    <Select
                      value={detailBrandId || 'none'}
                      onValueChange={(v) =>
                        setDetailBrandId(v === 'none' ? '' : v)
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        data-testid="ac-submission-brand-select"
                      >
                        <SelectValue placeholder="Не привязан" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Не привязан —</SelectItem>
                        {brands.map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      Заметки модератора
                    </label>
                    <Textarea
                      value={detailNotes}
                      onChange={(e) => setDetailNotes(e.target.value)}
                      placeholder="Внутренние заметки..."
                      rows={3}
                      data-testid="ac-submission-notes"
                    />
                  </div>
                </div>
              </section>

              {/* Конверсия */}
              <section>
                <h3 className="text-sm font-semibold mb-2">Конверсия</h3>
                {detail.converted_model_id ? (
                  <Card className="p-3 bg-muted/50">
                    <p className="text-sm">
                      Уже сконвертирована в модель{' '}
                      <Link
                        to={`/hvac-rating/models/edit/${detail.converted_model_id}`}
                        className="text-primary hover:underline font-medium"
                      >
                        #{detail.converted_model_id}
                      </Link>
                    </p>
                  </Card>
                ) : (
                  (() => {
                    const reason = detailConvertDisabledReason(detail);
                    return (
                      <Button
                        variant="outline"
                        disabled={Boolean(reason)}
                        title={reason || undefined}
                        onClick={() => setConvertId(detail.id)}
                        data-testid="ac-submission-detail-convert"
                      >
                        <Wand2 className="w-4 h-4 mr-2" />
                        Создать ACModel из этой заявки
                      </Button>
                    );
                  })()
                )}
              </section>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDetail(null)}
              disabled={detailSaving}
            >
              Закрыть
            </Button>
            <Button
              onClick={handleDetailSave}
              disabled={detailSaving || !detail}
              data-testid="ac-submission-save"
            >
              {detailSaving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fullscreen photo viewer */}
      <Dialog
        open={photoIndex !== null}
        onOpenChange={(open) => !open && setPhotoIndex(null)}
      >
        <DialogContent className="max-w-5xl p-2">
          {detail && photoIndex !== null && detail.photos[photoIndex] && (
            <div className="relative">
              <img
                src={detail.photos[photoIndex].image_url}
                alt=""
                className="w-full max-h-[80vh] object-contain"
              />
              {detail.photos.length > 1 && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="absolute left-2 top-1/2 -translate-y-1/2"
                    onClick={() =>
                      setPhotoIndex(
                        (photoIndex - 1 + detail.photos.length) %
                          detail.photos.length
                      )
                    }
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() =>
                      setPhotoIndex((photoIndex + 1) % detail.photos.length)
                    }
                  >
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-background/80 rounded px-3 py-1 text-sm">
                    {photoIndex + 1} / {detail.photos.length}
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
