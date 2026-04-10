import React, { useState, useEffect, useCallback } from 'react';
import { useHvacAuth as useAuth } from '../hooks/useHvacAuth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Plus, Trash2, Loader2, Star, ChevronDown, ChevronRight, GripVertical, Save,
} from 'lucide-react';
import ratingService, { RatingCriterion, RatingCriterionCreate } from '../services/ratingService';
import { toast } from 'sonner';
import ApiErrorBanner from '../components/ApiErrorBanner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const STAR_LABELS: Record<number, string> = {
  0: '0 — Не классифицировано',
  2: '2 — Не по теме',
  3: '3 — Не интересно',
  4: '4 — Ограниченно интересно',
  5: '5 — Интересно',
};

const STAR_LEVELS = [5, 4, 3, 2, 0];

export default function RatingCriteriaPage() {
  const { user } = useAuth();
  const [criteria, setCriteria] = useState<RatingCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [expandedLevels, setExpandedLevels] = useState<Set<number>>(new Set(STAR_LEVELS));
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCriterion, setEditingCriterion] = useState<RatingCriterion | null>(null);
  const [formData, setFormData] = useState<RatingCriterionCreate>({
    star_rating: 3,
    name: '',
    description: '',
    keywords: [],
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  const isAdmin = user?.is_staff === true;

  const loadCriteria = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await ratingService.getCriteria(undefined, true);
      setCriteria(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadCriteria();
  }, [isAdmin, loadCriteria]);

  const getCriteriaByLevel = (level: number) =>
    criteria.filter(c => c.star_rating === level);

  const toggleLevel = (level: number) => {
    setExpandedLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  const handleToggleActive = async (criterion: RatingCriterion) => {
    try {
      await ratingService.updateCriterion(criterion.id, { is_active: !criterion.is_active });
      loadCriteria();
    } catch { toast.error('Ошибка обновления'); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await ratingService.deleteCriterion(deleteConfirm);
      toast.success('Критерий удалён');
      loadCriteria();
    } catch { toast.error('Ошибка удаления'); }
    finally { setDeleteConfirm(null); }
  };

  const openCreateForm = (starRating: number) => {
    setEditingCriterion(null);
    setFormData({
      star_rating: starRating,
      name: '',
      description: '',
      keywords: [],
      is_active: true,
    });
    setFormOpen(true);
  };

  const openEditForm = (criterion: RatingCriterion) => {
    setEditingCriterion(criterion);
    setFormData({
      star_rating: criterion.star_rating,
      name: criterion.name,
      description: criterion.description,
      keywords: criterion.keywords,
      is_active: criterion.is_active,
      parent: criterion.parent,
      override_star_rating: criterion.override_star_rating,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.description.trim()) {
      toast.error('Заполните имя и описание');
      return;
    }
    try {
      setSaving(true);
      if (editingCriterion) {
        await ratingService.updateCriterion(editingCriterion.id, formData);
        toast.success('Критерий обновлён');
      } else {
        await ratingService.createCriterion(formData);
        toast.success('Критерий создан');
      }
      setFormOpen(false);
      loadCriteria();
    } catch { toast.error('Ошибка сохранения'); }
    finally { setSaving(false); }
  };

  if (!isAdmin) {
    return <div className="p-6 text-center text-muted-foreground">Доступ только для администраторов</div>;
  }

  if (loading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (error) {
    return <ApiErrorBanner error={error} onRetry={loadCriteria} />;
  }

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Star className="h-6 w-6" /> Критерии рейтинга
        </h1>
        <p className="text-muted-foreground mt-1">
          Настройка критериев автоматической оценки новостей по звёздам
        </p>
      </div>

      {STAR_LEVELS.map(level => {
        const levelCriteria = getCriteriaByLevel(level);
        const isExpanded = expandedLevels.has(level);

        return (
          <Card key={level} className="overflow-hidden">
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/50"
              onClick={() => toggleLevel(level)}
            >
              <div className="flex items-center gap-3">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="text-lg">
                  {level > 0 ? '★'.repeat(level) : '○'}
                </span>
                <span className="font-semibold">{STAR_LABELS[level]}</span>
                <Badge variant="secondary">{levelCriteria.length}</Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); openCreateForm(level); }}
              >
                <Plus className="h-4 w-4 mr-1" /> Добавить
              </Button>
            </div>

            {isExpanded && levelCriteria.length > 0 && (
              <div className="border-t divide-y">
                {levelCriteria.map(criterion => (
                  <div key={criterion.id}>
                    <div className="flex items-start gap-3 p-4 hover:bg-accent/30">
                      <GripVertical className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${!criterion.is_active ? 'line-through text-muted-foreground' : ''}`}>
                            {criterion.name}
                          </span>
                          {!criterion.is_active && (
                            <Badge variant="outline" className="text-xs">выключен</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {criterion.description}
                        </p>
                        {criterion.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {criterion.keywords.slice(0, 5).map((kw, i) => (
                              <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>
                            ))}
                            {criterion.keywords.length > 5 && (
                              <Badge variant="outline" className="text-xs">+{criterion.keywords.length - 5}</Badge>
                            )}
                          </div>
                        )}
                        {/* Дочерние критерии */}
                        {criterion.children && criterion.children.length > 0 && (
                          <div className="mt-3 pl-4 border-l-2 border-primary/20 space-y-2">
                            {criterion.children.map(child => (
                              <div key={child.id} className="text-sm">
                                <span className="font-medium">↳ {child.name}</span>
                                {child.override_star_rating && (
                                  <Badge className="ml-2 text-xs">→ {child.override_star_rating}★</Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Switch
                          checked={criterion.is_active}
                          onCheckedChange={() => handleToggleActive(criterion)}
                        />
                        <Button variant="ghost" size="sm" onClick={() => openEditForm(criterion)}>
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(criterion.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isExpanded && levelCriteria.length === 0 && (
              <div className="p-4 border-t text-center text-muted-foreground text-sm">
                Нет критериев для этого уровня
              </div>
            )}
          </Card>
        );
      })}

      {/* Диалог создания/редактирования */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingCriterion ? 'Редактировать критерий' : 'Новый критерий'}
            </DialogTitle>
            <DialogDescription>
              {editingCriterion
                ? 'Измените параметры критерия оценки'
                : 'Добавьте новый критерий для автоматической оценки новостей'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Уровень звёзд</Label>
              <Select
                value={String(formData.star_rating)}
                onValueChange={v => setFormData(prev => ({ ...prev, star_rating: Number(v) }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAR_LEVELS.map(level => (
                    <SelectItem key={level} value={String(level)}>
                      {STAR_LABELS[level]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Название</Label>
              <Input
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Короткое имя критерия"
              />
            </div>
            <div>
              <Label>Описание (для промпта LLM)</Label>
              <Textarea
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Подробное описание для LLM"
                rows={4}
              />
            </div>
            <div>
              <Label>Ключевые слова (через запятую)</Label>
              <Input
                value={(formData.keywords || []).join(', ')}
                onChange={e => setFormData(prev => ({
                  ...prev,
                  keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                }))}
                placeholder="ключ1, ключ2, ключ3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingCriterion ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Подтверждение удаления */}
      <AlertDialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить критерий?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие необратимо. Критерий и все его дочерние критерии будут удалены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
