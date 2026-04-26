import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from '@/hooks/erp-router';
import { toast } from 'sonner';
import { ArrowLeft, Info, Save, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import acRatingService from '../services/acRatingService';
import type {
  ACCriterion,
  ACCriterionGroup,
  ACCriterionValueType,
} from '../services/acRatingTypes';
import { KEY_MEASUREMENT_NOTE } from './ACCriteriaPage';

interface ACCriterionEditorProps {
  mode?: 'create' | 'edit';
}

const VALUE_TYPE_OPTIONS: Array<{ value: ACCriterionValueType; label: string }> = [
  { value: 'numeric', label: 'Числовой' },
  { value: 'binary', label: 'Бинарный (да/нет)' },
  { value: 'categorical', label: 'Категориальный' },
  { value: 'custom_scale', label: 'Индивидуальная шкала' },
  { value: 'formula', label: 'Формульная логика' },
  { value: 'lab', label: 'Лабораторный' },
  { value: 'fallback', label: 'С fallback-логикой' },
  { value: 'brand_age', label: 'Возраст бренда в РФ' },
];

const GROUP_OPTIONS: Array<{ value: ACCriterionGroup; label: string }> = [
  { value: 'climate', label: 'Климат' },
  { value: 'compressor', label: 'Компрессор и контур' },
  { value: 'acoustics', label: 'Акустика' },
  { value: 'control', label: 'Управление и датчики' },
  { value: 'dimensions', label: 'Габариты и комплектация' },
  { value: 'other', label: 'Прочее' },
];

export default function ACCriterionEditor({
  mode: modeProp,
}: ACCriterionEditorProps) {
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const mode: 'create' | 'edit' = modeProp ?? (params?.id ? 'edit' : 'create');
  const criterionId = params?.id ? Number(params.id) : null;

  const [criterion, setCriterion] = useState<ACCriterion | null>(null);
  const [code, setCode] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameDe, setNameDe] = useState('');
  const [namePt, setNamePt] = useState('');
  const [descRu, setDescRu] = useState('');
  const [descEn, setDescEn] = useState('');
  const [descDe, setDescDe] = useState('');
  const [descPt, setDescPt] = useState('');
  const [unit, setUnit] = useState('');
  const [valueType, setValueType] =
    useState<ACCriterionValueType>('numeric');
  const [group, setGroup] = useState<ACCriterionGroup>('other');
  const [isActive, setIsActive] = useState(true);
  const [isKey, setIsKey] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (mode !== 'edit' || criterionId === null) return;
    setLoading(true);
    setError(null);
    acRatingService
      .getCriterion(criterionId)
      .then((c) => {
        setCriterion(c);
        setCode(c.code);
        setNameRu(c.name_ru);
        setNameEn(c.name_en);
        setNameDe(c.name_de);
        setNamePt(c.name_pt);
        setDescRu(c.description_ru);
        setDescEn(c.description_en);
        setDescDe(c.description_de);
        setDescPt(c.description_pt);
        setUnit(c.unit);
        setValueType(c.value_type);
        setGroup(c.group);
        setIsActive(c.is_active);
        setIsKey(c.is_key_measurement);
      })
      .catch((err: unknown) => {
        const status = axios.isAxiosError(err)
          ? err.response?.status
          : undefined;
        setError(
          status === 404 ? 'Критерий не найден' : 'Не удалось загрузить критерий'
        );
      })
      .finally(() => setLoading(false));
  }, [mode, criterionId]);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const handlePickPhoto = (file: File | null) => {
    setPhotoFile(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (mode === 'create' && !code.trim()) next.code = 'Поле обязательно';
    if (!nameRu.trim()) next.name_ru = 'Поле обязательно';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildPayload = (): FormData => {
    const fd = new FormData();
    if (mode === 'create') fd.append('code', code.trim());
    fd.append('name_ru', nameRu.trim());
    fd.append('name_en', nameEn);
    fd.append('name_de', nameDe);
    fd.append('name_pt', namePt);
    fd.append('description_ru', descRu);
    fd.append('description_en', descEn);
    fd.append('description_de', descDe);
    fd.append('description_pt', descPt);
    fd.append('unit', unit);
    fd.append('value_type', valueType);
    fd.append('group', group);
    fd.append('is_active', isActive ? 'true' : 'false');
    fd.append('is_key_measurement', isKey ? 'true' : 'false');
    if (photoFile) fd.append('photo', photoFile);
    return fd;
  };

  const handleSave = async () => {
    if (!validate()) {
      toast.error('Проверьте обязательные поля');
      return;
    }
    setSaving(true);
    try {
      if (mode === 'create') {
        const created = await acRatingService.createCriterion(buildPayload());
        toast.success('Критерий создан');
        navigate(`/hvac-rating/criteria/edit/${created.id}`);
      } else if (criterionId !== null) {
        const updated = await acRatingService.updateCriterion(
          criterionId,
          buildPayload()
        );
        setCriterion(updated);
        setPhotoFile(null);
        if (photoPreview) URL.revokeObjectURL(photoPreview);
        setPhotoPreview(null);
        toast.success('Сохранено');
      }
    } catch (err: unknown) {
      const data = axios.isAxiosError(err)
        ? (err.response?.data as Record<string, unknown> | undefined)
        : undefined;
      const detailMsg =
        data && typeof data.detail === 'string'
          ? data.detail
          : data && typeof data.code === 'string'
          ? `code: ${data.code}`
          : data && Array.isArray((data as Record<string, unknown>).code)
          ? `code: ${((data as Record<string, unknown>).code as string[])[0]}`
          : null;
      toast.error(detailMsg || 'Не удалось сохранить критерий');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (criterionId === null) return;
    setDeleting(true);
    try {
      await acRatingService.deleteCriterion(criterionId);
      toast.success('Критерий удалён');
      navigate('/hvac-rating/criteria');
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
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <Card className="p-12 text-center text-muted-foreground">
          Загрузка...
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="p-6 border-destructive bg-destructive/10">
          <p className="text-destructive">{error}</p>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => navigate('/hvac-rating/criteria')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />К списку
          </Button>
        </Card>
      </div>
    );
  }

  const photoSrc = photoPreview || criterion?.photo_url || '';

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/hvac-rating/criteria')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />К списку
            </Button>
            <h1>
              {mode === 'create'
                ? 'Новый критерий'
                : `Критерий: ${criterion?.name_ru ?? ''}`}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {mode === 'edit' && (
              <Button
                variant="outline"
                onClick={() => setDeleteOpen(true)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />Удалить
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => navigate('/hvac-rating/criteria')}
            >
              Отмена
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              data-testid="ac-criterion-save"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </div>

        <Card className="p-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ac-criterion-code">
                Код <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ac-criterion-code"
                className="mt-1 font-mono text-sm"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={mode === 'edit'}
                placeholder="напр. noise_min"
                data-testid="ac-criterion-code"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Уникальный идентификатор. После создания изменить нельзя.
              </p>
              {errors.code && (
                <p
                  className="text-xs text-destructive mt-1"
                  data-testid="ac-criterion-code-error"
                >
                  {errors.code}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="ac-criterion-name-ru">
                Название (RU) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ac-criterion-name-ru"
                className="mt-1"
                value={nameRu}
                onChange={(e) => setNameRu(e.target.value)}
                data-testid="ac-criterion-name-ru"
              />
              {errors.name_ru && (
                <p
                  className="text-xs text-destructive mt-1"
                  data-testid="ac-criterion-name-ru-error"
                >
                  {errors.name_ru}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="ac-criterion-desc-ru">Описание (RU)</Label>
            <Textarea
              id="ac-criterion-desc-ru"
              className="mt-1"
              rows={3}
              value={descRu}
              onChange={(e) => setDescRu(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="ac-criterion-unit">Единица измерения</Label>
              <Input
                id="ac-criterion-unit"
                className="mt-1"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="напр. дБ, кВт"
              />
            </div>
            <div>
              <Label htmlFor="ac-criterion-value-type">Тип значения</Label>
              <Select
                value={valueType}
                onValueChange={(v) =>
                  setValueType(v as ACCriterionValueType)
                }
              >
                <SelectTrigger
                  id="ac-criterion-value-type"
                  className="mt-1"
                  data-testid="ac-criterion-value-type"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VALUE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ac-criterion-group">Группа</Label>
              <Select
                value={group}
                onValueChange={(v) => setGroup(v as ACCriterionGroup)}
              >
                <SelectTrigger
                  id="ac-criterion-group"
                  className="mt-1"
                  data-testid="ac-criterion-group"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUP_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-3">
              <Switch
                id="ac-criterion-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label htmlFor="ac-criterion-active">Активен</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="ac-criterion-key"
                checked={isKey}
                onCheckedChange={setIsKey}
                data-testid="ac-criterion-key"
              />
              <Label
                htmlFor="ac-criterion-key"
                className="flex items-center gap-1.5"
                title={KEY_MEASUREMENT_NOTE}
              >
                Ключевой замер
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
              </Label>
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            {KEY_MEASUREMENT_NOTE}
          </p>

          <div className="pt-4 border-t">
            <Label>Фото параметра</Label>
            <div className="mt-2 flex items-center gap-3">
              <div className="w-32 h-24 bg-white border rounded flex items-center justify-center p-1">
                {photoSrc ? (
                  <ImageWithFallback
                    src={photoSrc}
                    alt={nameRu || 'photo'}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">нет</span>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => photoInputRef.current?.click()}
                data-testid="ac-criterion-photo-pick"
              >
                <Upload className="w-4 h-4 mr-2" />
                Выбрать
              </Button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                hidden
                data-testid="ac-criterion-photo-input"
                onChange={(e) => handlePickPhoto(e.target.files?.[0] || null)}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Фото показывается на странице методики
              (/rating-split-system/methodology/) в карточке параметра. PNG/JPG
              до ~2 МБ. Рекомендуется 4:3 или 16:9.
            </p>
          </div>

          <details className="pt-2 border-t group">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground select-none">
              Перевод названия (EN/DE/PT)
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="ac-criterion-name-en">EN</Label>
                <Input
                  id="ac-criterion-name-en"
                  className="mt-1"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ac-criterion-name-de">DE</Label>
                <Input
                  id="ac-criterion-name-de"
                  className="mt-1"
                  value={nameDe}
                  onChange={(e) => setNameDe(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ac-criterion-name-pt">PT</Label>
                <Input
                  id="ac-criterion-name-pt"
                  className="mt-1"
                  value={namePt}
                  onChange={(e) => setNamePt(e.target.value)}
                />
              </div>
            </div>
          </details>

          <details className="pt-2 border-t group">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground select-none">
              Перевод описания (EN/DE/PT)
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <Label htmlFor="ac-criterion-desc-en">EN</Label>
                <Textarea
                  id="ac-criterion-desc-en"
                  className="mt-1"
                  rows={2}
                  value={descEn}
                  onChange={(e) => setDescEn(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ac-criterion-desc-de">DE</Label>
                <Textarea
                  id="ac-criterion-desc-de"
                  className="mt-1"
                  rows={2}
                  value={descDe}
                  onChange={(e) => setDescDe(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ac-criterion-desc-pt">PT</Label>
                <Textarea
                  id="ac-criterion-desc-pt"
                  className="mt-1"
                  rows={2}
                  value={descPt}
                  onChange={(e) => setDescPt(e.target.value)}
                />
              </div>
            </div>
          </details>

          {mode === 'edit' && criterion && (
            <div className="grid gap-2 sm:grid-cols-2 pt-4 border-t text-sm text-muted-foreground">
              <div>
                Создан: {new Date(criterion.created_at).toLocaleDateString('ru-RU')}
              </div>
              <div>
                Обновлён: {new Date(criterion.updated_at).toLocaleDateString('ru-RU')}
              </div>
            </div>
          )}
        </Card>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить критерий?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Если критерий используется в
              методиках — удаление не пройдёт.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
