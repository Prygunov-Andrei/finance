import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from '@/hooks/erp-router';
import { toast } from 'sonner';
import {
  Edit,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import type { ACBrand, BrandsListParams } from '../services/acRatingTypes';

type ActiveFilter = 'all' | 'true' | 'false';

export default function ACBrandsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.is_staff === true;

  const [brands, setBrands] = useState<ACBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [normalizeOpen, setNormalizeOpen] = useState(false);
  const [generateDarkOpen, setGenerateDarkOpen] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [generatingDark, setGeneratingDark] = useState(false);

  // Debounced search.
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

  const loadBrands = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: BrandsListParams = { ordering: 'name' };
      if (activeFilter !== 'all') params.is_active = activeFilter;
      if (searchQuery) params.search = searchQuery;
      const result = await acRatingService.getBrands(params);
      setBrands(result.items);
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      setError(
        status === 403
          ? 'Недостаточно прав для просмотра брендов.'
          : 'Не удалось загрузить список брендов.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBrands();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, searchQuery]);

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      await acRatingService.deleteBrand(deleteId);
      setBrands((prev) => prev.filter((b) => b.id !== deleteId));
      toast.success('Бренд удалён');
    } catch (err: unknown) {
      const data = axios.isAxiosError(err)
        ? (err.response?.data as Record<string, unknown> | undefined)
        : undefined;
      const detailMsg =
        data && typeof data.detail === 'string' ? data.detail : null;
      toast.error(detailMsg || 'Не удалось удалить бренд');
    } finally {
      setDeleteId(null);
    }
  };

  const handleNormalize = async () => {
    setNormalizing(true);
    try {
      const result = await acRatingService.normalizeBrandLogos();
      toast.success(
        `Нормализовано: ${result.normalized}` +
          (result.errors.length ? `, ошибок: ${result.errors.length}` : '')
      );
      loadBrands();
    } catch {
      toast.error('Не удалось запустить нормализацию');
    } finally {
      setNormalizing(false);
      setNormalizeOpen(false);
    }
  };

  const handleGenerateDark = async () => {
    setGeneratingDark(true);
    try {
      const result = await acRatingService.generateDarkLogos();
      toast.success(
        `Сгенерировано: ${result.generated}, пропущено цветных: ${result.skipped_colored}` +
          (result.errors.length ? `, ошибок: ${result.errors.length}` : '')
      );
      loadBrands();
    } catch {
      toast.error('Не удалось сгенерировать тёмные логотипы');
    } finally {
      setGeneratingDark(false);
      setGenerateDarkOpen(false);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1>Бренды (рейтинг кондиционеров)</h1>
            {!loading && (
              <p className="text-sm text-muted-foreground mt-1">
                Всего: {brands.length}
              </p>
            )}
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => setNormalizeOpen(true)}
                data-testid="ac-brands-normalize-btn"
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Нормализовать логотипы
              </Button>
              <Button
                variant="outline"
                onClick={() => setGenerateDarkOpen(true)}
                data-testid="ac-brands-generate-dark-btn"
              >
                <Moon className="w-4 h-4 mr-2" />
                Сгенерировать тёмные
              </Button>
              <Button asChild>
                <Link to="/hvac-rating/brands/create">
                  <Plus className="w-4 h-4 mr-2" />
                  Добавить бренд
                </Link>
              </Button>
            </div>
          )}
        </div>

        <Card className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Поиск по названию"
                className="pl-9"
                data-testid="ac-brands-search"
              />
            </div>
            <Select
              value={activeFilter}
              onValueChange={(v) => setActiveFilter(v as ActiveFilter)}
            >
              <SelectTrigger
                className="w-[180px]"
                data-testid="ac-brands-active-filter"
              >
                <SelectValue placeholder="Активность" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="true">Активные</SelectItem>
                <SelectItem value="false">Архивные</SelectItem>
              </SelectContent>
            </Select>
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
              onClick={loadBrands}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Повторить
            </Button>
          </Card>
        )}

        {!loading && !error && brands.length === 0 && (
          <Card className="p-12 text-center space-y-4">
            <p className="text-muted-foreground">Бренды не найдены</p>
            {isAdmin && (
              <Button asChild>
                <Link to="/hvac-rating/brands/create">
                  <Plus className="w-4 h-4 mr-2" />
                  Добавить первый
                </Link>
              </Button>
            )}
          </Card>
        )}

        {!loading && !error && brands.length > 0 && (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Логотипы</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>Origin Class</TableHead>
                  <TableHead>Год РФ</TableHead>
                  <TableHead className="text-right">Моделей</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="w-24 text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brands.map((b) => (
                  <TableRow
                    key={b.id}
                    className="hover:bg-muted/40 cursor-pointer"
                    onClick={() => navigate(`/hvac-rating/brands/edit/${b.id}`)}
                    data-testid={`ac-brand-row-${b.id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-9 bg-white border rounded flex items-center justify-center p-1">
                          {b.logo_url ? (
                            <ImageWithFallback
                              src={b.logo_url}
                              alt={b.name}
                              className="max-w-full max-h-full object-contain"
                            />
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              нет
                            </span>
                          )}
                        </div>
                        <div className="w-14 h-9 bg-zinc-900 border rounded flex items-center justify-center p-1">
                          {b.logo_dark_url ? (
                            <ImageWithFallback
                              src={b.logo_dark_url}
                              alt={`${b.name} dark`}
                              className="max-w-full max-h-full object-contain"
                            />
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              dark?
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell>
                      {b.origin_class_name || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {b.sales_start_year_ru ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.models_count}
                    </TableCell>
                    <TableCell>
                      {b.is_active ? (
                        <Badge variant="default">Активен</Badge>
                      ) : (
                        <Badge variant="secondary">В архиве</Badge>
                      )}
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
                          <Link to={`/hvac-rating/brands/edit/${b.id}`}>
                            <Edit className="w-4 h-4" />
                          </Link>
                        </Button>
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(b.id)}
                            title="Удалить"
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
            <AlertDialogTitle>Удалить бренд?</AlertDialogTitle>
            <AlertDialogDescription>
              Бренд будет удалён вместе со всеми связанными данными. Если за ним
              закреплены модели, бэкенд вернёт ошибку.
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

      <AlertDialog open={normalizeOpen} onOpenChange={setNormalizeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Нормализовать логотипы?</AlertDialogTitle>
            <AlertDialogDescription>
              Все цветные логотипы будут обрезаны и уложены на canvas 200×56.
              Операция перезаписывает исходные файлы.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={normalizing}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleNormalize}
              disabled={normalizing}
              data-testid="ac-brands-normalize-confirm"
            >
              {normalizing ? 'Запускаем...' : 'Запустить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={generateDarkOpen} onOpenChange={setGenerateDarkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Сгенерировать тёмные логотипы?</AlertDialogTitle>
            <AlertDialogDescription>
              Для каждого бренда из светлого логотипа будет сгенерирован
              dark-вариант. Цветные логотипы пропускаются.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={generatingDark}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleGenerateDark}
              disabled={generatingDark}
              data-testid="ac-brands-generate-dark-confirm"
            >
              {generatingDark ? 'Запускаем...' : 'Запустить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
