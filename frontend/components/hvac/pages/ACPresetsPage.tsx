import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from '@/hooks/erp-router';
import { toast } from 'sonner';
import {
  Info,
  Plus,
  RefreshCw,
  Search,
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
import { useHvacAuth as useAuth } from '../hooks/useHvacAuth';
import acRatingService from '../services/acRatingService';
import type { ACPreset, PresetsListParams } from '../services/acRatingTypes';

type ActiveFilter = 'all' | 'true' | 'false';

export const PRESETS_NOTE =
  'Пресеты определяют табы во вкладке «Свой рейтинг» на публичной странице (/rating-split-system/). is_all_selected=ВСЕ означает, что пресет автоматически включает все активные критерии активной методики.';

export default function ACPresetsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.is_staff === true;

  const [items, setItems] = useState<ACPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [allSelectedOnly, setAllSelectedOnly] = useState(false);
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
      const params: PresetsListParams = { ordering: 'order' };
      if (activeFilter !== 'all') params.is_active = activeFilter;
      if (allSelectedOnly) params.is_all_selected = 'true';
      if (searchQuery) params.search = searchQuery;
      const result = await acRatingService.getPresets(params);
      setItems(result.items);
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      setError(
        status === 403
          ? 'Недостаточно прав для просмотра пресетов.'
          : 'Не удалось загрузить список пресетов.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, allSelectedOnly, searchQuery]);

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      await acRatingService.deletePreset(deleteId);
      setItems((prev) => prev.filter((p) => p.id !== deleteId));
      toast.success('Пресет удалён');
    } catch (err: unknown) {
      const data = axios.isAxiosError(err)
        ? (err.response?.data as Record<string, unknown> | undefined)
        : undefined;
      const detailMsg =
        data && typeof data.detail === 'string' ? data.detail : null;
      toast.error(detailMsg || 'Не удалось удалить пресет');
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1>Пресеты «Свой рейтинг»</h1>
            {!loading && (
              <p className="text-sm text-muted-foreground mt-1">
                Всего: {items.length}
              </p>
            )}
          </div>
          {isAdmin && (
            <Button asChild>
              <Link to="/hvac-rating/presets/create">
                <Plus className="w-4 h-4 mr-2" />
                Добавить пресет
              </Link>
            </Button>
          )}
        </div>

        <Card className="p-4 border-blue-200 bg-blue-50/40">
          <div className="flex items-start gap-2 text-sm">
            <Info className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
            <p className="text-blue-900">{PRESETS_NOTE}</p>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Поиск по slug / label"
                className="pl-9"
                data-testid="ac-presets-search"
              />
            </div>
            <Select
              value={activeFilter}
              onValueChange={(v) => setActiveFilter(v as ActiveFilter)}
            >
              <SelectTrigger
                className="w-[160px]"
                data-testid="ac-presets-active-filter"
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
                id="ac-presets-all-selected"
                checked={allSelectedOnly}
                onCheckedChange={setAllSelectedOnly}
                data-testid="ac-presets-all-selected"
              />
              <Label
                htmlFor="ac-presets-all-selected"
                className="text-sm cursor-pointer"
              >
                Только «выбирает все»
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
            <p className="text-muted-foreground">Пресеты не найдены</p>
            {isAdmin && (
              <Button asChild>
                <Link to="/hvac-rating/presets/create">
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
                  <TableHead className="w-16 text-right">order</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead className="font-mono text-xs">slug</TableHead>
                  <TableHead>Активен</TableHead>
                  <TableHead>Все критерии</TableHead>
                  <TableHead className="text-right">Критериев</TableHead>
                  <TableHead className="w-24 text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow
                    key={p.id}
                    className="hover:bg-muted/40 cursor-pointer"
                    onClick={() =>
                      navigate(`/hvac-rating/presets/edit/${p.id}`)
                    }
                    data-testid={`ac-preset-row-${p.id}`}
                  >
                    <TableCell className="text-right tabular-nums">
                      {p.order}
                    </TableCell>
                    <TableCell className="font-medium">{p.label}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {p.slug}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Switch checked={p.is_active} disabled />
                    </TableCell>
                    <TableCell>
                      {p.is_all_selected ? (
                        <Badge>ВСЕ</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.criteria_count < 0 ? (
                        <span className="text-muted-foreground">ВСЕ</span>
                      ) : (
                        p.criteria_count
                      )}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(p.id)}
                            title="Удалить"
                            data-testid={`ac-preset-delete-${p.id}`}
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
            <AlertDialogTitle>Удалить пресет?</AlertDialogTitle>
            <AlertDialogDescription>
              Действие необратимо. После удаления соответствующий таб «Свой
              рейтинг» исчезнет на публичном портале.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
