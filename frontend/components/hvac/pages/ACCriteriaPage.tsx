import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from '@/hooks/erp-router';
import { toast } from 'sonner';
import {
  Edit,
  Info,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  ACCriterionGroup,
  ACCriterionListItem,
  ACCriterionValueType,
  CriteriaListParams,
} from '../services/acRatingTypes';

type ActiveFilter = 'all' | 'true' | 'false';

const GROUP_LABEL: Record<ACCriterionGroup, string> = {
  climate: 'Климат',
  compressor: 'Компрессор',
  acoustics: 'Акустика',
  control: 'Управление',
  dimensions: 'Габариты',
  other: 'Прочее',
};

const VALUE_TYPE_LABEL: Record<ACCriterionValueType, string> = {
  numeric: 'Числовой',
  binary: 'Бинарный',
  categorical: 'Категориальный',
  custom_scale: 'Инд. шкала',
  formula: 'Формула',
  lab: 'Лабораторный',
  fallback: 'Fallback',
  brand_age: 'Возраст бренда',
};

export const KEY_MEASUREMENT_NOTE =
  'Флаг «Ключевой замер» применяется только для критериев, включённых в активную методику. Сейчас активна v1.0 — критерии вне неё игнорируются на фронте.';

export default function ACCriteriaPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.is_staff === true;

  const [items, setItems] = useState<ACCriterionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [groupFilter, setGroupFilter] = useState<ACCriterionGroup | 'all'>(
    'all'
  );
  const [valueTypeFilter, setValueTypeFilter] = useState<
    ACCriterionValueType | 'all'
  >('all');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [keyOnly, setKeyOnly] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [deleteId, setDeleteId] = useState<number | null>(null);

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
      const params: CriteriaListParams = { ordering: 'code' };
      if (groupFilter !== 'all') params.group = groupFilter;
      if (valueTypeFilter !== 'all') params.value_type = valueTypeFilter;
      if (activeFilter !== 'all') params.is_active = activeFilter;
      if (keyOnly) params.is_key_measurement = 'true';
      if (searchQuery) params.search = searchQuery;
      const result = await acRatingService.getCriteria(params);
      setItems(result.items);
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      setError(
        status === 403
          ? 'Недостаточно прав для просмотра критериев.'
          : 'Не удалось загрузить список критериев.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupFilter, valueTypeFilter, activeFilter, keyOnly, searchQuery]);

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      await acRatingService.deleteCriterion(deleteId);
      setItems((prev) => prev.filter((c) => c.id !== deleteId));
      toast.success('Критерий удалён');
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const data = axios.isAxiosError(err)
        ? (err.response?.data as Record<string, unknown> | undefined)
        : undefined;
      const detailMsg =
        data && typeof data.detail === 'string' ? data.detail : null;
      const fallback =
        status && status >= 400 && status < 500
          ? 'Нельзя удалить — параметр используется в методиках'
          : 'Не удалось удалить критерий';
      toast.error(detailMsg || fallback);
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1>Критерии (рейтинг)</h1>
            {!loading && (
              <p className="text-sm text-muted-foreground mt-1">
                Всего: {items.length}
              </p>
            )}
          </div>
          {isAdmin && (
            <Button asChild>
              <Link to="/hvac-rating/criteria/create">
                <Plus className="w-4 h-4 mr-2" />
                Добавить критерий
              </Link>
            </Button>
          )}
        </div>

        <Card className="p-4 border-blue-200 bg-blue-50/40">
          <div className="flex items-start gap-2 text-sm">
            <Info className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
            <p className="text-blue-900">{KEY_MEASUREMENT_NOTE}</p>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Поиск по code / названию"
                className="pl-9"
                data-testid="ac-criteria-search"
              />
            </div>
            <Select
              value={groupFilter}
              onValueChange={(v) =>
                setGroupFilter(v as ACCriterionGroup | 'all')
              }
            >
              <SelectTrigger
                className="w-[180px]"
                data-testid="ac-criteria-group-filter"
              >
                <SelectValue placeholder="Группа" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все группы</SelectItem>
                {(Object.keys(GROUP_LABEL) as ACCriterionGroup[]).map((g) => (
                  <SelectItem key={g} value={g}>
                    {GROUP_LABEL[g]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={valueTypeFilter}
              onValueChange={(v) =>
                setValueTypeFilter(v as ACCriterionValueType | 'all')
              }
            >
              <SelectTrigger
                className="w-[200px]"
                data-testid="ac-criteria-value-type-filter"
              >
                <SelectValue placeholder="Тип значения" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                {(Object.keys(VALUE_TYPE_LABEL) as ACCriterionValueType[]).map(
                  (vt) => (
                    <SelectItem key={vt} value={vt}>
                      {VALUE_TYPE_LABEL[vt]}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
            <Select
              value={activeFilter}
              onValueChange={(v) => setActiveFilter(v as ActiveFilter)}
            >
              <SelectTrigger
                className="w-[160px]"
                data-testid="ac-criteria-active-filter"
              >
                <SelectValue placeholder="Активность" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="true">Активные</SelectItem>
                <SelectItem value="false">Архивные</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch
                id="ac-criteria-key-only"
                checked={keyOnly}
                onCheckedChange={setKeyOnly}
                data-testid="ac-criteria-key-only"
              />
              <Label
                htmlFor="ac-criteria-key-only"
                className="text-sm cursor-pointer"
              >
                Только ключевые
              </Label>
            </div>
          </div>
        </Card>

        {loading && (
          <Card className="p-12 text-center text-muted-foreground">
            Загрузка...
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
          <Card className="p-12 text-center space-y-4">
            <p className="text-muted-foreground">Критерии не найдены</p>
            {isAdmin && (
              <Button asChild>
                <Link to="/hvac-rating/criteria/create">
                  <Plus className="w-4 h-4 mr-2" />
                  Добавить первый
                </Link>
              </Button>
            )}
          </Card>
        )}

        {!loading && !error && items.length > 0 && (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32 font-mono text-xs">code</TableHead>
                  <TableHead className="w-16">Фото</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>Группа</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Ед.</TableHead>
                  <TableHead>Активен</TableHead>
                  <TableHead className="text-center">Ключевой</TableHead>
                  <TableHead className="text-right">Методик</TableHead>
                  <TableHead className="w-24 text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow
                    key={c.id}
                    className="hover:bg-muted/40 cursor-pointer"
                    onClick={() =>
                      navigate(`/hvac-rating/criteria/edit/${c.id}`)
                    }
                    data-testid={`ac-criterion-row-${c.id}`}
                  >
                    <TableCell className="font-mono text-xs">
                      {c.code}
                    </TableCell>
                    <TableCell>
                      <div className="w-10 h-10 bg-white border rounded flex items-center justify-center p-0.5">
                        {c.photo_url ? (
                          <ImageWithFallback
                            src={c.photo_url}
                            alt={c.name_ru}
                            className="max-w-full max-h-full object-contain"
                          />
                        ) : (
                          <span className="text-[9px] text-muted-foreground">
                            нет
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{c.name_ru}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {GROUP_LABEL[c.group] ?? c.group}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {VALUE_TYPE_LABEL[c.value_type] ?? c.value_type}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.unit || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch checked={c.is_active} disabled />
                    </TableCell>
                    <TableCell className="text-center">
                      {c.is_key_measurement ? (
                        <Star
                          className="w-4 h-4 text-amber-500 fill-amber-500 inline"
                          data-testid={`ac-criterion-key-${c.id}`}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.methodologies_count}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          asChild
                          title="Редактировать"
                        >
                          <Link to={`/hvac-rating/criteria/edit/${c.id}`}>
                            <Edit className="w-4 h-4" />
                          </Link>
                        </Button>
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(c.id)}
                            title="Удалить"
                            data-testid={`ac-criterion-delete-${c.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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
            <AlertDialogTitle>Удалить критерий?</AlertDialogTitle>
            <AlertDialogDescription>
              Действие нельзя отменить. Если критерий используется в методиках,
              бэкенд вернёт ошибку — удалите его сначала из методики.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="ac-criterion-delete-confirm"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
