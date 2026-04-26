import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from '@/hooks/erp-router';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
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
  ACAvailability,
  ACBrand,
  ACModelDetail,
  ACModelPhotoNested,
  ACModelRawValue,
  ACModelSupplier,
  ACModelWritable,
  ACPublishStatus,
  EquipmentType,
  RegionChoice,
} from '../services/acRatingTypes';

const MAX_PHOTOS = 6;
const EDITORIAL_BODY_LIMIT = 5000;

const AVAILABILITY_LABEL: Record<ACAvailability, string> = {
  in_stock: 'В наличии',
  low_stock: 'Мало',
  out_of_stock: 'Нет в наличии',
  unknown: 'Неизвестно',
};

interface FormState {
  brand: number | null;
  series: string;
  inner_unit: string;
  outer_unit: string;
  nominal_capacity: string;
  equipment_type: number | null;
  publish_status: ACPublishStatus;
  price: string;
  region_codes: string[];

  youtube_url: string;
  rutube_url: string;
  vk_url: string;

  inner_unit_dimensions: string;
  inner_unit_weight_kg: string;
  outer_unit_dimensions: string;
  outer_unit_weight_kg: string;

  editorial_lede: string;
  editorial_body: string;
  editorial_quote: string;
  editorial_quote_author: string;

  pros_text: string;
  cons_text: string;

  is_ad: boolean;
  ad_position: string;

  suppliers: ACModelSupplier[];
  raw_values: ACModelRawValue[];
}

const INITIAL_FORM: FormState = {
  brand: null,
  series: '',
  inner_unit: '',
  outer_unit: '',
  nominal_capacity: '',
  equipment_type: null,
  publish_status: 'draft',
  price: '',
  region_codes: [],
  youtube_url: '',
  rutube_url: '',
  vk_url: '',
  inner_unit_dimensions: '',
  inner_unit_weight_kg: '',
  outer_unit_dimensions: '',
  outer_unit_weight_kg: '',
  editorial_lede: '',
  editorial_body: '',
  editorial_quote: '',
  editorial_quote_author: '',
  pros_text: '',
  cons_text: '',
  is_ad: false,
  ad_position: '',
  suppliers: [],
  raw_values: [],
};

function detailToForm(detail: ACModelDetail): FormState {
  return {
    brand: detail.brand,
    series: detail.series,
    inner_unit: detail.inner_unit,
    outer_unit: detail.outer_unit,
    nominal_capacity:
      detail.nominal_capacity !== null && detail.nominal_capacity !== undefined
        ? String(detail.nominal_capacity)
        : '',
    equipment_type: detail.equipment_type,
    publish_status: detail.publish_status,
    price: detail.price ?? '',
    region_codes: detail.region_codes ?? [],
    youtube_url: detail.youtube_url ?? '',
    rutube_url: detail.rutube_url ?? '',
    vk_url: detail.vk_url ?? '',
    inner_unit_dimensions: detail.inner_unit_dimensions ?? '',
    inner_unit_weight_kg: detail.inner_unit_weight_kg ?? '',
    outer_unit_dimensions: detail.outer_unit_dimensions ?? '',
    outer_unit_weight_kg: detail.outer_unit_weight_kg ?? '',
    editorial_lede: detail.editorial_lede ?? '',
    editorial_body: detail.editorial_body ?? '',
    editorial_quote: detail.editorial_quote ?? '',
    editorial_quote_author: detail.editorial_quote_author ?? '',
    pros_text: detail.pros_text ?? '',
    cons_text: detail.cons_text ?? '',
    is_ad: detail.is_ad,
    ad_position:
      detail.ad_position !== null && detail.ad_position !== undefined
        ? String(detail.ad_position)
        : '',
    suppliers: detail.suppliers ?? [],
    raw_values: detail.raw_values ?? [],
  };
}

function buildPayload(form: FormState, mode: 'create' | 'edit'): ACModelWritable {
  const numOrNull = (s: string): number | null => {
    if (s.trim() === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const strDecimalOrNull = (s: string): string | null =>
    s.trim() === '' ? null : s.trim();

  const payload: ACModelWritable = {
    brand: form.brand ?? undefined,
    series: form.series,
    inner_unit: form.inner_unit,
    outer_unit: form.outer_unit,
    nominal_capacity: numOrNull(form.nominal_capacity),
    equipment_type: form.equipment_type,
    publish_status: form.publish_status,
    youtube_url: form.youtube_url,
    rutube_url: form.rutube_url,
    vk_url: form.vk_url,
    price: strDecimalOrNull(form.price),
    pros_text: form.pros_text,
    cons_text: form.cons_text,
    is_ad: form.is_ad,
    ad_position: form.is_ad ? numOrNull(form.ad_position) : null,
    editorial_lede: form.editorial_lede,
    editorial_body: form.editorial_body,
    editorial_quote: form.editorial_quote,
    editorial_quote_author: form.editorial_quote_author,
    inner_unit_dimensions: form.inner_unit_dimensions,
    inner_unit_weight_kg: strDecimalOrNull(form.inner_unit_weight_kg),
    outer_unit_dimensions: form.outer_unit_dimensions,
    outer_unit_weight_kg: strDecimalOrNull(form.outer_unit_weight_kg),
    region_codes: form.region_codes,
    suppliers: form.suppliers,
  };
  if (mode === 'edit' && form.raw_values.length > 0) {
    payload.raw_values = form.raw_values;
  }
  return payload;
}

interface ACModelEditorProps {
  mode?: 'create' | 'edit';
}

export default function ACModelEditor({ mode: modeProp }: ACModelEditorProps) {
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const mode: 'create' | 'edit' = modeProp ?? (params?.id ? 'edit' : 'create');
  const modelId = params?.id ? Number(params.id) : null;

  const [detail, setDetail] = useState<ACModelDetail | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [brands, setBrands] = useState<ACBrand[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentType[]>([]);
  const [regions, setRegions] = useState<RegionChoice[]>([]);
  const [photos, setPhotos] = useState<ACModelPhotoNested[]>([]);

  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photoBusy, setPhotoBusy] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);

  // Справочники.
  useEffect(() => {
    acRatingService.getBrands({ ordering: 'name' })
      .then((r) => setBrands(r.items))
      .catch(() => setBrands([]));
    acRatingService.getEquipmentTypes().then(setEquipmentTypes).catch(() =>
      setEquipmentTypes([])
    );
    acRatingService.getRegions().then(setRegions).catch(() => setRegions([]));
  }, []);

  // Загрузка модели в edit-режиме.
  useEffect(() => {
    if (mode !== 'edit' || modelId === null) return;
    setLoading(true);
    setError(null);
    acRatingService
      .getModel(modelId)
      .then((d) => {
        setDetail(d);
        setForm(detailToForm(d));
        setPhotos(d.photos ?? []);
      })
      .catch((err: unknown) => {
        const status = axios.isAxiosError(err)
          ? err.response?.status
          : undefined;
        setError(
          status === 404
            ? 'Модель не найдена'
            : 'Не удалось загрузить модель'
        );
      })
      .finally(() => setLoading(false));
  }, [mode, modelId]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.brand) next.brand = 'Выберите бренд';
    if (!form.inner_unit.trim())
      next.inner_unit = 'Поле обязательно';
    if (form.editorial_body.length > EDITORIAL_BODY_LIMIT)
      next.editorial_body = `Максимум ${EDITORIAL_BODY_LIMIT} символов`;
    if (form.is_ad && form.ad_position.trim() === '')
      next.ad_position = 'Укажите позицию или отключите рекламу';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      toast.error('Проверьте обязательные поля');
      return;
    }
    setSaving(true);
    try {
      if (mode === 'create') {
        const created = await acRatingService.createModel(
          buildPayload(form, 'create')
        );
        toast.success('Модель создана');
        navigate(`/hvac-rating/models/edit/${created.id}`);
      } else if (modelId !== null) {
        const updated = await acRatingService.updateModel(
          modelId,
          buildPayload(form, 'edit')
        );
        setDetail(updated);
        setForm(detailToForm(updated));
        toast.success('Сохранено');
      }
    } catch (err: unknown) {
      const data = axios.isAxiosError(err)
        ? (err.response?.data as Record<string, unknown> | undefined)
        : undefined;
      const detailMsg =
        data && typeof data.detail === 'string' ? data.detail : null;
      toast.error(detailMsg || 'Не удалось сохранить модель');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (modelId === null) return;
    setDeleting(true);
    try {
      await acRatingService.deleteModel(modelId);
      toast.success('Модель удалена');
      navigate('/hvac-rating/models');
    } catch {
      toast.error('Не удалось удалить модель');
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const setField = <K extends keyof FormState>(
    key: K,
    value: FormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleRegion = (code: string) => {
    setField(
      'region_codes',
      form.region_codes.includes(code)
        ? form.region_codes.filter((c) => c !== code)
        : [...form.region_codes, code]
    );
  };

  // ── Suppliers ───────────────────────────────────────────────────────
  const addSupplier = () => {
    setField('suppliers', [
      ...form.suppliers,
      {
        name: '',
        url: '',
        order: form.suppliers.length,
        price: null,
        city: '',
        rating: null,
        availability: 'unknown',
        note: '',
      },
    ]);
  };

  const updateSupplier = (
    index: number,
    patch: Partial<ACModelSupplier>
  ) => {
    setField(
      'suppliers',
      form.suppliers.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
  };

  const removeSupplier = (index: number) => {
    setField(
      'suppliers',
      form.suppliers.filter((_, i) => i !== index)
    );
  };

  // ── Raw values ──────────────────────────────────────────────────────
  const updateRawValue = (
    index: number,
    patch: Partial<ACModelRawValue>
  ) => {
    setField(
      'raw_values',
      form.raw_values.map((rv, i) => (i === index ? { ...rv, ...patch } : rv))
    );
  };

  // ── Photos ──────────────────────────────────────────────────────────
  const handleUploadPhoto = async (file: File) => {
    if (modelId === null) return;
    if (photos.length >= MAX_PHOTOS) {
      toast.error(`Лимит фото: ${MAX_PHOTOS}`);
      return;
    }
    setPhotoBusy(true);
    try {
      const photo = await acRatingService.uploadModelPhoto(modelId, file);
      setPhotos((prev) => [
        ...prev,
        { id: photo.id, image_url: photo.image_url, alt: photo.alt, order: photo.order },
      ]);
      toast.success('Фото загружено');
    } catch {
      toast.error('Не удалось загрузить фото');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleDeletePhoto = async (photoId: number) => {
    if (modelId === null) return;
    setPhotoBusy(true);
    try {
      await acRatingService.deleteModelPhoto(modelId, photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      toast.success('Фото удалено');
    } catch {
      toast.error('Не удалось удалить фото');
    } finally {
      setPhotoBusy(false);
    }
  };

  const movePhoto = async (index: number, dir: -1 | 1) => {
    if (modelId === null) return;
    const target = index + dir;
    if (target < 0 || target >= photos.length) return;
    const reordered = [...photos];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setPhotos(reordered);
    try {
      await acRatingService.reorderModelPhotos(
        modelId,
        reordered.map((p) => p.id)
      );
    } catch {
      toast.error('Не удалось сохранить порядок фото');
    }
  };

  const updatePhotoAlt = async (photoId: number, alt: string) => {
    if (modelId === null) return;
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, alt } : p)));
    try {
      await acRatingService.updateModelPhoto(modelId, photoId, { alt });
    } catch {
      toast.error('Не удалось обновить alt-текст');
    }
  };

  const headerTitle = mode === 'create'
    ? 'Новая модель'
    : `Модель${detail ? `: ${detail.brand_detail?.name ?? ''} ${detail.inner_unit}` : ''}`;

  const slugInfo = useMemo(() => {
    if (mode === 'create') return 'Slug сгенерируется автоматически после сохранения.';
    return detail?.slug || '—';
  }, [mode, detail]);

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
            onClick={() => navigate('/hvac-rating/models')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />К списку
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/hvac-rating/models')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />К списку
            </Button>
            <h1>{headerTitle}</h1>
            {mode === 'edit' && detail && (
              <Badge variant="outline">
                Index: {Number(detail.total_index).toFixed(1)}
              </Badge>
            )}
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
              onClick={() => navigate('/hvac-rating/models')}
            >
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="main">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="main">Основное</TabsTrigger>
            <TabsTrigger value="video">Видео</TabsTrigger>
            <TabsTrigger value="dimensions">Габариты</TabsTrigger>
            <TabsTrigger value="editorial">Обзор</TabsTrigger>
            <TabsTrigger value="proscons">Плюсы/Минусы</TabsTrigger>
            <TabsTrigger value="ad">Реклама</TabsTrigger>
            <TabsTrigger value="photos" disabled={mode === 'create'}>
              Фото
            </TabsTrigger>
            <TabsTrigger value="suppliers">Поставщики</TabsTrigger>
            <TabsTrigger value="params" disabled={mode === 'create'}>
              Параметры
            </TabsTrigger>
          </TabsList>

          {/* ── Main ──────────────────────────────────────────── */}
          <TabsContent value="main" className="mt-4">
            <Card className="p-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="ac-brand">
                    Бренд <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.brand !== null ? String(form.brand) : ''}
                    onValueChange={(v) => setField('brand', Number(v))}
                  >
                    <SelectTrigger
                      id="ac-brand"
                      className="mt-1"
                      data-testid="ac-editor-brand"
                    >
                      <SelectValue placeholder="Выберите бренд" />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.brand && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.brand}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="ac-series">Серия</Label>
                  <Input
                    id="ac-series"
                    className="mt-1"
                    value={form.series}
                    onChange={(e) => setField('series', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="ac-inner">
                    Inner Unit <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="ac-inner"
                    className="mt-1"
                    value={form.inner_unit}
                    onChange={(e) => setField('inner_unit', e.target.value)}
                    data-testid="ac-editor-inner"
                  />
                  {errors.inner_unit && (
                    <p
                      className="text-xs text-destructive mt-1"
                      data-testid="ac-editor-inner-error"
                    >
                      {errors.inner_unit}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="ac-outer">Outer Unit</Label>
                  <Input
                    id="ac-outer"
                    className="mt-1"
                    value={form.outer_unit}
                    onChange={(e) => setField('outer_unit', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="ac-capacity">
                    Номинальная мощность (Вт)
                  </Label>
                  <Input
                    id="ac-capacity"
                    type="number"
                    className="mt-1"
                    value={form.nominal_capacity}
                    onChange={(e) =>
                      setField('nominal_capacity', e.target.value)
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="ac-equipment-type">Тип оборудования</Label>
                  <Select
                    value={
                      form.equipment_type !== null
                        ? String(form.equipment_type)
                        : 'none'
                    }
                    onValueChange={(v) =>
                      setField(
                        'equipment_type',
                        v === 'none' ? null : Number(v)
                      )
                    }
                  >
                    <SelectTrigger id="ac-equipment-type" className="mt-1">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {equipmentTypes.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="ac-status">Статус публикации</Label>
                  <Select
                    value={form.publish_status}
                    onValueChange={(v) =>
                      setField('publish_status', v as ACPublishStatus)
                    }
                  >
                    <SelectTrigger id="ac-status" className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Черновик</SelectItem>
                      <SelectItem value="review">На проверке</SelectItem>
                      <SelectItem value="published">Опубликован</SelectItem>
                      <SelectItem value="archived">В архиве</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="ac-price">Цена</Label>
                  <Input
                    id="ac-price"
                    type="number"
                    step="0.01"
                    className="mt-1"
                    value={form.price}
                    onChange={(e) => setField('price', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label className="block mb-2">Регионы</Label>
                <div className="flex flex-wrap gap-3">
                  {regions.length === 0 && (
                    <span className="text-sm text-muted-foreground">
                      Список регионов не загружен
                    </span>
                  )}
                  {regions.map((r) => {
                    const checked = form.region_codes.includes(r.code);
                    return (
                      <label
                        key={r.code}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleRegion(r.code)}
                          aria-label={r.label}
                        />
                        {r.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Slug</Label>
                  <p className="text-sm text-muted-foreground mt-1 font-mono">
                    {slugInfo}
                  </p>
                </div>
                <div>
                  <Label>Total Index</Label>
                  <p className="text-sm text-muted-foreground mt-1 tabular-nums">
                    {detail
                      ? Number(detail.total_index).toFixed(2)
                      : 'будет рассчитан после сохранения'}
                  </p>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* ── Video ─────────────────────────────────────────── */}
          <TabsContent value="video" className="mt-4">
            <Card className="p-6 space-y-4">
              <div>
                <Label htmlFor="ac-yt">YouTube URL</Label>
                <Input
                  id="ac-yt"
                  type="url"
                  className="mt-1"
                  value={form.youtube_url}
                  onChange={(e) => setField('youtube_url', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ac-rt">Rutube URL</Label>
                <Input
                  id="ac-rt"
                  type="url"
                  className="mt-1"
                  value={form.rutube_url}
                  onChange={(e) => setField('rutube_url', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ac-vk">VK Video URL</Label>
                <Input
                  id="ac-vk"
                  type="url"
                  className="mt-1"
                  value={form.vk_url}
                  onChange={(e) => setField('vk_url', e.target.value)}
                />
              </div>
            </Card>
          </TabsContent>

          {/* ── Dimensions ────────────────────────────────────── */}
          <TabsContent value="dimensions" className="mt-4">
            <Card className="p-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Размеры внутреннего блока</Label>
                  <Input
                    className="mt-1"
                    placeholder="850 × 295 × 189 мм"
                    value={form.inner_unit_dimensions}
                    onChange={(e) =>
                      setField('inner_unit_dimensions', e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label>Вес внутреннего блока (кг)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="mt-1"
                    value={form.inner_unit_weight_kg}
                    onChange={(e) =>
                      setField('inner_unit_weight_kg', e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label>Размеры внешнего блока</Label>
                  <Input
                    className="mt-1"
                    placeholder="780 × 540 × 250 мм"
                    value={form.outer_unit_dimensions}
                    onChange={(e) =>
                      setField('outer_unit_dimensions', e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label>Вес внешнего блока (кг)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="mt-1"
                    value={form.outer_unit_weight_kg}
                    onChange={(e) =>
                      setField('outer_unit_weight_kg', e.target.value)
                    }
                  />
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* ── Editorial ─────────────────────────────────────── */}
          <TabsContent value="editorial" className="mt-4">
            <Card className="p-6 space-y-4">
              <div>
                <Label htmlFor="ac-lede">Лид (вступление)</Label>
                <Textarea
                  id="ac-lede"
                  className="mt-1"
                  rows={3}
                  value={form.editorial_lede}
                  onChange={(e) => setField('editorial_lede', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ac-body" className="flex justify-between">
                  <span>Текст обзора</span>
                  <span
                    className={`text-xs ${
                      form.editorial_body.length > EDITORIAL_BODY_LIMIT
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {form.editorial_body.length} / {EDITORIAL_BODY_LIMIT}
                  </span>
                </Label>
                <Textarea
                  id="ac-body"
                  className="mt-1"
                  rows={10}
                  value={form.editorial_body}
                  onChange={(e) => setField('editorial_body', e.target.value)}
                />
                {errors.editorial_body && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.editorial_body}
                  </p>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="ac-quote">Цитата</Label>
                  <Textarea
                    id="ac-quote"
                    className="mt-1"
                    rows={2}
                    value={form.editorial_quote}
                    onChange={(e) =>
                      setField('editorial_quote', e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="ac-quote-author">Автор цитаты</Label>
                  <Input
                    id="ac-quote-author"
                    className="mt-1"
                    value={form.editorial_quote_author}
                    onChange={(e) =>
                      setField('editorial_quote_author', e.target.value)
                    }
                  />
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* ── Pros/Cons ─────────────────────────────────────── */}
          <TabsContent value="proscons" className="mt-4">
            <Card className="p-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Плюсы</Label>
                  <Textarea
                    className="mt-1"
                    rows={8}
                    value={form.pros_text}
                    onChange={(e) => setField('pros_text', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Минусы</Label>
                  <Textarea
                    className="mt-1"
                    rows={8}
                    value={form.cons_text}
                    onChange={(e) => setField('cons_text', e.target.value)}
                  />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Кнопка «Сгенерировать через ИИ» появится в Ф8B.
              </div>
            </Card>
          </TabsContent>

          {/* ── Ad ────────────────────────────────────────────── */}
          <TabsContent value="ad" className="mt-4">
            <Card className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Switch
                  id="ac-is-ad"
                  checked={form.is_ad}
                  onCheckedChange={(v) => setField('is_ad', v)}
                />
                <Label htmlFor="ac-is-ad">Показывать как рекламную</Label>
              </div>
              <div>
                <Label htmlFor="ac-ad-position">Позиция в рекламном блоке</Label>
                <Input
                  id="ac-ad-position"
                  type="number"
                  className="mt-1 w-40"
                  disabled={!form.is_ad}
                  value={form.ad_position}
                  onChange={(e) => setField('ad_position', e.target.value)}
                />
                {errors.ad_position && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.ad_position}
                  </p>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* ── Photos ────────────────────────────────────────── */}
          <TabsContent value="photos" className="mt-4">
            <Card className="p-6 space-y-4">
              {mode === 'create' ? (
                <p className="text-muted-foreground">
                  Сначала сохраните модель — после этого станут доступны
                  загрузка фото.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-sm text-muted-foreground">
                      Фото: {photos.length} / {MAX_PHOTOS}
                    </div>
                    <Button
                      onClick={() => fileRef.current?.click()}
                      disabled={photoBusy || photos.length >= MAX_PHOTOS}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Добавить фото
                    </Button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadPhoto(file);
                        e.target.value = '';
                      }}
                    />
                  </div>
                  {photos.length === 0 && (
                    <p className="text-muted-foreground text-sm">
                      Фото пока не загружены.
                    </p>
                  )}
                  <div className="space-y-3">
                    {photos.map((photo, idx) => (
                      <div
                        key={photo.id}
                        className="flex items-start gap-3 p-3 border rounded-lg"
                      >
                        <div className="w-24 h-24 bg-muted rounded overflow-hidden flex items-center justify-center flex-shrink-0">
                          {photo.image_url && (
                            <ImageWithFallback
                              src={photo.image_url}
                              alt={photo.alt}
                              className="max-w-full max-h-full object-contain"
                            />
                          )}
                        </div>
                        <div className="flex-1 space-y-2">
                          <Input
                            value={photo.alt}
                            placeholder="alt-текст"
                            onChange={(e) =>
                              setPhotos((prev) =>
                                prev.map((p) =>
                                  p.id === photo.id
                                    ? { ...p, alt: e.target.value }
                                    : p
                                )
                              )
                            }
                            onBlur={(e) =>
                              updatePhotoAlt(photo.id, e.target.value)
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            order: {photo.order}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={idx === 0 || photoBusy}
                            onClick={() => movePhoto(idx, -1)}
                            title="Вверх"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={idx === photos.length - 1 || photoBusy}
                            onClick={() => movePhoto(idx, 1)}
                            title="Вниз"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            disabled={photoBusy}
                            onClick={() => handleDeletePhoto(photo.id)}
                            title="Удалить"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
          </TabsContent>

          {/* ── Suppliers ─────────────────────────────────────── */}
          <TabsContent value="suppliers" className="mt-4">
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-medium">Где купить</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addSupplier}
                  data-testid="ac-editor-add-supplier"
                >
                  <Plus className="w-4 h-4 mr-2" />Добавить поставщика
                </Button>
              </div>
              {form.suppliers.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  Поставщики не добавлены.
                </p>
              )}
              <div className="space-y-3">
                {form.suppliers.map((supplier, idx) => (
                  <div
                    key={supplier.id ?? `new-${idx}`}
                    className="border rounded-lg p-3 space-y-2"
                  >
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        placeholder="Название"
                        value={supplier.name}
                        onChange={(e) =>
                          updateSupplier(idx, { name: e.target.value })
                        }
                      />
                      <Input
                        placeholder="URL"
                        value={supplier.url}
                        onChange={(e) =>
                          updateSupplier(idx, { url: e.target.value })
                        }
                      />
                      <Input
                        placeholder="Город"
                        value={supplier.city}
                        onChange={(e) =>
                          updateSupplier(idx, { city: e.target.value })
                        }
                      />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Цена"
                        value={supplier.price ?? ''}
                        onChange={(e) =>
                          updateSupplier(idx, {
                            price:
                              e.target.value.trim() === ''
                                ? null
                                : e.target.value,
                          })
                        }
                      />
                      <Input
                        type="number"
                        step="0.1"
                        min={0}
                        max={5}
                        placeholder="Рейтинг (0–5)"
                        value={supplier.rating ?? ''}
                        onChange={(e) =>
                          updateSupplier(idx, {
                            rating:
                              e.target.value.trim() === ''
                                ? null
                                : e.target.value,
                          })
                        }
                      />
                      <Select
                        value={supplier.availability}
                        onValueChange={(v) =>
                          updateSupplier(idx, {
                            availability: v as ACAvailability,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            Object.entries(AVAILABILITY_LABEL) as [
                              ACAvailability,
                              string,
                            ][]
                          ).map(([code, label]) => (
                            <SelectItem key={code} value={code}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        placeholder="Порядок"
                        value={supplier.order}
                        onChange={(e) =>
                          updateSupplier(idx, {
                            order: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <Textarea
                      rows={2}
                      placeholder="Заметка"
                      value={supplier.note}
                      onChange={(e) =>
                        updateSupplier(idx, { note: e.target.value })
                      }
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => removeSupplier(idx)}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />Удалить
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* ── Raw values ────────────────────────────────────── */}
          <TabsContent value="params" className="mt-4">
            <Card className="p-6 space-y-4">
              {mode === 'create' ? (
                <p className="text-muted-foreground">
                  Параметры станут доступны после сохранения модели.
                </p>
              ) : form.raw_values.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Значения параметров не добавлены. Добавление новых критериев —
                  в Ф8B.
                </p>
              ) : (
                <div className="space-y-3">
                  {form.raw_values.map((rv, idx) => (
                    <div
                      key={rv.criterion_code}
                      className="grid gap-2 sm:grid-cols-4 border-b pb-3"
                    >
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Критерий
                        </Label>
                        <p className="text-sm font-medium">
                          {rv.criterion_name || rv.criterion_code}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {rv.criterion_code}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs">raw_value</Label>
                        <Input
                          value={rv.raw_value}
                          onChange={(e) =>
                            updateRawValue(idx, { raw_value: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">numeric_value</Label>
                        <Input
                          type="number"
                          step="0.0001"
                          value={
                            rv.numeric_value !== null &&
                            rv.numeric_value !== undefined
                              ? String(rv.numeric_value)
                              : ''
                          }
                          onChange={(e) =>
                            updateRawValue(idx, {
                              numeric_value:
                                e.target.value.trim() === ''
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Источник</Label>
                        <Input
                          value={rv.source}
                          onChange={(e) =>
                            updateRawValue(idx, { source: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить модель?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить.
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
