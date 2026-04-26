import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from '@/hooks/erp-router';
import { toast } from 'sonner';
import { ArrowLeft, Save, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import type { ACBrand } from '../services/acRatingTypes';

interface ACBrandEditorProps {
  mode?: 'create' | 'edit';
}

export default function ACBrandEditor({ mode: modeProp }: ACBrandEditorProps) {
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const mode: 'create' | 'edit' = modeProp ?? (params?.id ? 'edit' : 'create');
  const brandId = params?.id ? Number(params.id) : null;

  const [brand, setBrand] = useState<ACBrand | null>(null);
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [salesStartYear, setSalesStartYear] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoDarkFile, setLogoDarkFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoDarkPreview, setLogoDarkPreview] = useState<string | null>(null);

  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const lightInputRef = useRef<HTMLInputElement | null>(null);
  const darkInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (mode !== 'edit' || brandId === null) return;
    setLoading(true);
    setError(null);
    acRatingService
      .getBrand(brandId)
      .then((b) => {
        setBrand(b);
        setName(b.name);
        setIsActive(b.is_active);
        setSalesStartYear(
          b.sales_start_year_ru !== null ? String(b.sales_start_year_ru) : ''
        );
      })
      .catch((err: unknown) => {
        const status = axios.isAxiosError(err)
          ? err.response?.status
          : undefined;
        setError(
          status === 404 ? 'Бренд не найден' : 'Не удалось загрузить бренд'
        );
      })
      .finally(() => setLoading(false));
  }, [mode, brandId]);

  // Cleanup object URLs.
  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      if (logoDarkPreview) URL.revokeObjectURL(logoDarkPreview);
    };
  }, [logoPreview, logoDarkPreview]);

  const handlePickLight = (file: File | null) => {
    setLogoFile(file);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(file ? URL.createObjectURL(file) : null);
  };

  const handlePickDark = (file: File | null) => {
    setLogoDarkFile(file);
    if (logoDarkPreview) URL.revokeObjectURL(logoDarkPreview);
    setLogoDarkPreview(file ? URL.createObjectURL(file) : null);
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Поле обязательно';
    if (mode === 'create' && !logoFile)
      next.logo = 'Загрузите светлый логотип';
    if (salesStartYear.trim() !== '') {
      const y = Number(salesStartYear);
      if (!Number.isInteger(y) || y < 1900 || y > 2100)
        next.sales_start_year_ru = 'Введите корректный год';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildPayload = (): FormData => {
    const fd = new FormData();
    fd.append('name', name.trim());
    fd.append('is_active', isActive ? 'true' : 'false');
    if (salesStartYear.trim() !== '') {
      fd.append('sales_start_year_ru', salesStartYear.trim());
    }
    if (logoFile) fd.append('logo', logoFile);
    if (logoDarkFile) fd.append('logo_dark', logoDarkFile);
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
        const created = await acRatingService.createBrand(buildPayload());
        toast.success('Бренд создан');
        navigate(`/hvac-rating/brands/edit/${created.id}`);
      } else if (brandId !== null) {
        const updated = await acRatingService.updateBrand(
          brandId,
          buildPayload()
        );
        setBrand(updated);
        setLogoFile(null);
        setLogoDarkFile(null);
        if (logoPreview) URL.revokeObjectURL(logoPreview);
        if (logoDarkPreview) URL.revokeObjectURL(logoDarkPreview);
        setLogoPreview(null);
        setLogoDarkPreview(null);
        toast.success('Сохранено');
      }
    } catch (err: unknown) {
      const data = axios.isAxiosError(err)
        ? (err.response?.data as Record<string, unknown> | undefined)
        : undefined;
      const detailMsg =
        data && typeof data.detail === 'string'
          ? data.detail
          : data && typeof data.name === 'string'
          ? `name: ${data.name}`
          : null;
      toast.error(detailMsg || 'Не удалось сохранить бренд');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (brandId === null) return;
    setDeleting(true);
    try {
      await acRatingService.deleteBrand(brandId);
      toast.success('Бренд удалён');
      navigate('/hvac-rating/brands');
    } catch (err: unknown) {
      const data = axios.isAxiosError(err)
        ? (err.response?.data as Record<string, unknown> | undefined)
        : undefined;
      const detailMsg =
        data && typeof data.detail === 'string' ? data.detail : null;
      toast.error(detailMsg || 'Не удалось удалить бренд');
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
            onClick={() => navigate('/hvac-rating/brands')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />К списку
          </Button>
        </Card>
      </div>
    );
  }

  const lightSrc = logoPreview || brand?.logo_url || '';
  const darkSrc = logoDarkPreview || brand?.logo_dark_url || '';

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/hvac-rating/brands')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />К списку
            </Button>
            <h1>{mode === 'create' ? 'Новый бренд' : `Бренд: ${brand?.name ?? ''}`}</h1>
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
              onClick={() => navigate('/hvac-rating/brands')}
            >
              Отмена
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              data-testid="ac-brand-save"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </div>

        <Card className="p-6 space-y-4">
          <div>
            <Label htmlFor="ac-brand-name">
              Название <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ac-brand-name"
              className="mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="ac-brand-name"
            />
            {errors.name && (
              <p
                className="text-xs text-destructive mt-1"
                data-testid="ac-brand-name-error"
              >
                {errors.name}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Светлый логотип (для светлой темы)</Label>
              <div className="mt-2 flex items-center gap-3">
                <div className="w-32 h-16 bg-white border rounded flex items-center justify-center p-1">
                  {lightSrc ? (
                    <ImageWithFallback
                      src={lightSrc}
                      alt="logo"
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
                  onClick={() => lightInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Выбрать
                </Button>
                <input
                  ref={lightInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => handlePickLight(e.target.files?.[0] || null)}
                />
              </div>
              {errors.logo && (
                <p className="text-xs text-destructive mt-1">{errors.logo}</p>
              )}
            </div>

            <div>
              <Label>Тёмный логотип (для тёмной темы)</Label>
              <div className="mt-2 flex items-center gap-3">
                <div className="w-32 h-16 bg-zinc-900 border rounded flex items-center justify-center p-1">
                  {darkSrc ? (
                    <ImageWithFallback
                      src={darkSrc}
                      alt="logo dark"
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
                  onClick={() => darkInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Выбрать
                </Button>
                <input
                  ref={darkInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => handlePickDark(e.target.files?.[0] || null)}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Можно сгенерировать пакетно из списка брендов.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="ac-brand-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <Label htmlFor="ac-brand-active">Активен (показывать в рейтинге)</Label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ac-brand-year">Начало продаж в РФ (год)</Label>
              <Input
                id="ac-brand-year"
                type="number"
                className="mt-1"
                value={salesStartYear}
                onChange={(e) => setSalesStartYear(e.target.value)}
              />
              {errors.sales_start_year_ru && (
                <p className="text-xs text-destructive mt-1">
                  {errors.sales_start_year_ru}
                </p>
              )}
            </div>
            <div>
              <Label>Origin Class</Label>
              <p className="text-sm text-muted-foreground mt-2">
                {brand?.origin_class_name || 'не задан'} — настраивается через
                Django-admin (BrandOriginClass).
              </p>
            </div>
          </div>

          {mode === 'edit' && brand && (
            <div className="grid gap-2 sm:grid-cols-2 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Моделей за брендом: <span className="font-medium">{brand.models_count}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Создан: {new Date(brand.created_at).toLocaleDateString('ru-RU')}
              </div>
            </div>
          )}
        </Card>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить бренд?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Если за брендом числятся модели —
              удаление не пройдёт.
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
