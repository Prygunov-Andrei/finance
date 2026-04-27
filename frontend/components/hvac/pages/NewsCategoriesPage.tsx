import React, { useState, useEffect, useCallback } from 'react';
import { useHvacAuth as useAuth } from '../hooks/useHvacAuth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Plus, Trash2, Loader2, FolderTree, Save, X, Pencil, RotateCcw, Star,
} from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import newsCategoriesService, {
  NewsCategoryItem,
} from '../services/newsCategoriesService';
import { toast } from 'sonner';
import ApiErrorBanner from '../components/ApiErrorBanner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * Auto-slugify: латиница + цифры + дефис, кириллица транслитерируется (минимально),
 * пробелы и спецсимволы → '-'. Бэкенд хранит slug в нижнем регистре.
 */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
  з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya',
};

export function slugify(name: string): string {
  const lower = (name || '').toLowerCase().trim();
  let out = '';
  for (const ch of lower) {
    if (TRANSLIT[ch] !== undefined) out += TRANSLIT[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else out += '-';
  }
  return out.replace(/-+/g, '-').replace(/^-|-$/g, '');
}

interface InlineEditState {
  slug: string;
  name: string;
  order: number;
}

const FEATURED_NONE = '__none__';

export default function NewsCategoriesPage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<NewsCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Inline создание новой строки
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newSlugTouched, setNewSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  // Inline rename
  const [editing, setEditing] = useState<InlineEditState | null>(null);

  // Featured news settings (главная новость в hero на hvac-info.com)
  const [featuredCategorySlug, setFeaturedCategorySlug] = useState<string | null>(null);
  const [featuredLoaded, setFeaturedLoaded] = useState(false);
  const [savingFeatured, setSavingFeatured] = useState(false);

  const isAdmin = user?.is_staff === true;

  const loadCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await newsCategoriesService.getNewsCategories();
      setCategories(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadCategories();
  }, [isAdmin, loadCategories]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    newsCategoriesService.getFeaturedSettings()
      .then((s) => {
        if (cancelled) return;
        setFeaturedCategorySlug(s.category_slug ?? null);
        setFeaturedLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setFeaturedLoaded(true);
      });
    return () => { cancelled = true; };
  }, [isAdmin]);

  const saveFeatured = async () => {
    setSavingFeatured(true);
    try {
      await newsCategoriesService.updateFeaturedSettings({
        category: featuredCategorySlug,
      });
      toast.success('Главная новость в hero обновлена');
    } catch {
      toast.error('Ошибка сохранения');
    } finally {
      setSavingFeatured(false);
    }
  };

  const sorted = [...categories].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name, 'ru');
  });

  const startCreate = () => {
    setNewName('');
    setNewSlug('');
    setNewSlugTouched(false);
    setCreating(true);
  };

  const cancelCreate = () => {
    setCreating(false);
    setNewName('');
    setNewSlug('');
    setNewSlugTouched(false);
  };

  const handleCreateNameChange = (value: string) => {
    setNewName(value);
    if (!newSlugTouched) setNewSlug(slugify(value));
  };

  const handleCreate = async () => {
    const slug = newSlug.trim();
    const name = newName.trim();
    if (!name || !slug) {
      toast.error('Заполните название и slug');
      return;
    }
    try {
      setSaving(true);
      const maxOrder = categories.reduce((m, c) => Math.max(m, c.order), 0);
      await newsCategoriesService.createNewsCategory({
        slug,
        name,
        order: maxOrder + 10,
        is_active: true,
      });
      toast.success('Раздел создан');
      cancelCreate();
      loadCategories();
    } catch {
      toast.error('Ошибка создания раздела');
    } finally {
      setSaving(false);
    }
  };

  const startRename = (c: NewsCategoryItem) => {
    setEditing({ slug: c.slug, name: c.name, order: c.order });
  };

  const cancelRename = () => setEditing(null);

  const handleRenameSave = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) {
      toast.error('Название не может быть пустым');
      return;
    }
    try {
      setSaving(true);
      await newsCategoriesService.updateNewsCategory(editing.slug, {
        name,
        order: editing.order,
      });
      toast.success('Раздел обновлён');
      setEditing(null);
      loadCategories();
    } catch {
      toast.error('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleOrderChange = async (c: NewsCategoryItem, newOrder: number) => {
    if (Number.isNaN(newOrder) || newOrder === c.order) return;
    try {
      await newsCategoriesService.updateNewsCategory(c.slug, { order: newOrder });
      loadCategories();
    } catch {
      toast.error('Ошибка обновления порядка');
    }
  };

  const handleToggleActive = async (c: NewsCategoryItem) => {
    try {
      await newsCategoriesService.updateNewsCategory(c.slug, {
        is_active: !c.is_active,
      });
      loadCategories();
    } catch {
      toast.error('Ошибка обновления');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await newsCategoriesService.deleteNewsCategory(deleteConfirm);
      toast.success('Раздел отключён');
      loadCategories();
    } catch {
      toast.error('Ошибка удаления');
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleRestore = async (c: NewsCategoryItem) => {
    try {
      await newsCategoriesService.restoreNewsCategory(c.slug);
      toast.success('Раздел восстановлен');
      loadCategories();
    } catch {
      toast.error('Ошибка восстановления');
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Доступ только для администраторов
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <ApiErrorBanner error={error} onRetry={loadCategories} />;
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderTree className="h-6 w-6" /> Разделы новостей
          </h1>
          <p className="text-muted-foreground mt-1">
            Управление категориями HVAC-новостей: создание, переименование,
            порядок и видимость в публичной ленте.
          </p>
        </div>
        {!creating && (
          <Button onClick={startCreate} data-testid="add-category-btn">
            <Plus className="h-4 w-4 mr-2" /> Добавить раздел
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[260px]">
            <h3 className="font-semibold flex items-center gap-2">
              <Star className="h-4 w-4" />
              Главная новость в hero (hvac-info.com)
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Из выбранной категории берётся последняя 5★-новость для hero-блока
              на главной. Пусто = последняя 5★-новость из всех категорий.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={featuredCategorySlug ?? FEATURED_NONE}
              onValueChange={(v) =>
                setFeaturedCategorySlug(v === FEATURED_NONE ? null : v)
              }
              disabled={!featuredLoaded || savingFeatured}
            >
              <SelectTrigger
                className="w-64"
                data-testid="featured-category-select"
              >
                <SelectValue placeholder="— Любая категория —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FEATURED_NONE}>— Любая категория —</SelectItem>
                {sorted
                  .filter((c) => c.is_active)
                  .map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              onClick={saveFeatured}
              disabled={!featuredLoaded || savingFeatured}
              data-testid="featured-save-btn"
            >
              {savingFeatured && (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              )}
              Сохранить
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Название</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium w-24">Порядок</th>
              <th className="px-4 py-3 font-medium w-28">Активен</th>
              <th className="px-4 py-3 font-medium w-44 text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {creating && (
              <tr className="bg-accent/30" data-testid="create-row">
                <td className="px-4 py-3">
                  <Input
                    autoFocus
                    placeholder="Название раздела"
                    value={newName}
                    onChange={(e) => handleCreateNameChange(e.target.value)}
                    data-testid="create-name-input"
                  />
                </td>
                <td className="px-4 py-3">
                  <Input
                    placeholder="slug"
                    value={newSlug}
                    onChange={(e) => {
                      setNewSlug(e.target.value);
                      setNewSlugTouched(true);
                    }}
                    data-testid="create-slug-input"
                  />
                </td>
                <td className="px-4 py-3 text-muted-foreground">авто</td>
                <td className="px-4 py-3"><Switch checked disabled /></td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleCreate}
                      disabled={saving}
                      data-testid="create-save-btn"
                    >
                      {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={cancelCreate}
                      disabled={saving}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            )}

            {sorted.map((c) => {
              const isEditing = editing?.slug === c.slug;
              const inactive = !c.is_active;
              return (
                <tr
                  key={c.slug}
                  className={inactive ? 'opacity-60' : ''}
                  data-testid={`category-row-${c.slug}`}
                >
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <Input
                        autoFocus
                        value={editing!.name}
                        onChange={(e) =>
                          setEditing((prev) =>
                            prev ? { ...prev, name: e.target.value } : prev,
                          )
                        }
                        data-testid={`rename-input-${c.slug}`}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={inactive ? 'line-through' : 'font-medium'}>
                          {c.name}
                        </span>
                        {inactive && (
                          <Badge variant="outline" className="text-xs">
                            Отключён
                          </Badge>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {c.slug}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <Input
                        type="number"
                        value={editing!.order}
                        onChange={(e) =>
                          setEditing((prev) =>
                            prev
                              ? { ...prev, order: Number(e.target.value) }
                              : prev,
                          )
                        }
                        className="w-20"
                      />
                    ) : (
                      <Input
                        type="number"
                        defaultValue={c.order}
                        onBlur={(e) => handleOrderChange(c, Number(e.target.value))}
                        className="w-20"
                        data-testid={`order-input-${c.slug}`}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={c.is_active}
                      onCheckedChange={() => handleToggleActive(c)}
                      data-testid={`toggle-active-${c.slug}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      {isEditing ? (
                        <>
                          <Button
                            size="sm"
                            onClick={handleRenameSave}
                            disabled={saving}
                            data-testid={`rename-save-${c.slug}`}
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelRename}
                            disabled={saving}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startRename(c)}
                            data-testid={`rename-btn-${c.slug}`}
                            title="Переименовать"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {inactive ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRestore(c)}
                              data-testid={`restore-btn-${c.slug}`}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" /> Вернуть
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteConfirm(c.slug)}
                              data-testid={`delete-btn-${c.slug}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {sorted.length === 0 && !creating && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  Нет разделов. Нажмите «Добавить раздел».
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <AlertDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отключить раздел?</AlertDialogTitle>
            <AlertDialogDescription>
              Раздел будет помечен как неактивный (soft-delete) и пропадёт из
              публичной ленты. Существующие новости останутся, можно вернуть
              позже.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Отключить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
