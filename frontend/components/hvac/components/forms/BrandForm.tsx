import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription } from '../ui/alert';
import { AlertCircle, Upload, X } from 'lucide-react';
import referencesService, { Brand, BrandCreateData, ManufacturerSearchResult } from '../../services/referencesService';
import ManufacturerSearchInput from '../ManufacturerSearchInput';
import ManufacturerForm from './ManufacturerForm';
import { toast } from 'sonner';

interface BrandFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand?: Brand | null;
  onSuccess: () => void;
}

interface FormData {
  name: string;
  manufacturer: ManufacturerSearchResult | null;
  description: string;
  logo: File | null;
}

interface FormErrors {
  name?: string;
  manufacturer?: string;
  description?: string;
  logo?: string;
  general?: string;
}

export default function BrandForm({ open, onOpenChange, brand, onSuccess }: BrandFormProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    manufacturer: null,
    description: '',
    logo: null,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [showManufacturerForm, setShowManufacturerForm] = useState(false);

  const isEdit = !!brand;

  // Загрузка данных бренда при редактировании
  useEffect(() => {
    if (brand && open) {
      setFormData({
        name: brand.name || '',
        manufacturer: brand.manufacturer ? {
          id: brand.manufacturer,
          name: brand.manufacturer_name || '',
        } : null,
        description: brand.description || '',
        logo: null,
      });
      
      if (brand.logo) {
        setLogoPreview(brand.logo);
      }
    } else if (!open) {
      // Сброс формы при закрытии
      setFormData({
        name: '',
        manufacturer: null,
        description: '',
        logo: null,
      });
      setLogoPreview(null);
    }
    setErrors({});
  }, [brand, open]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Валидация имени
    if (!formData.name.trim()) {
      newErrors.name = 'Название обязательно';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Название должно содержать минимум 2 символа';
    }

    // Валидация производителя
    if (!formData.manufacturer) {
      newErrors.manufacturer = 'Выберите производителя';
    }

    // Валидация логотипа (размер файла)
    if (formData.logo && formData.logo.size > 5 * 1024 * 1024) {
      newErrors.logo = 'Размер файла не должен превышать 5MB';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Проверка типа файла
      if (!file.type.startsWith('image/')) {
        setErrors(prev => ({ ...prev, logo: 'Можно загружать только изображения' }));
        return;
      }

      setFormData(prev => ({ ...prev, logo: file }));
      
      // Создание preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      
      // Очищаем ошибку
      if (errors.logo) {
        setErrors(prev => ({ ...prev, logo: undefined }));
      }
    }
  };

  const handleRemoveLogo = () => {
    setFormData(prev => ({ ...prev, logo: null }));
    setLogoPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const data: BrandCreateData = {
        name: formData.name.trim(),
        manufacturer: formData.manufacturer!.id,
        description: formData.description.trim() || undefined,
        logo: formData.logo || undefined,
      };

      if (isEdit && brand) {
        await referencesService.updateBrand(brand.id, data);
        toast.success('Бренд успешно обновлен');
      } else {
        await referencesService.createBrand(data);
        toast.success('Бренд успешно создан');
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error saving brand:', err);
      
      // Обработка ошибок валидации от сервера
      if (err.response?.status === 400 && err.response?.data) {
        const serverErrors: FormErrors = {};
        Object.keys(err.response.data).forEach(key => {
          const messages = err.response.data[key];
          serverErrors[key as keyof FormErrors] = Array.isArray(messages) ? messages[0] : messages;
        });
        setErrors(serverErrors);
      } else if (err.response?.status === 401 || err.response?.status === 403) {
        setErrors({ general: 'У вас нет прав для выполнения этой операции' });
      } else {
        setErrors({ general: err.response?.data?.message || 'Ошибка при сохранении бренда' });
      }
      
      toast.error(isEdit ? 'Ошибка при обновлении бренда' : 'Ошибка при создании бренда');
    } finally {
      setLoading(false);
    }
  };

  const handleManufacturerCreated = () => {
    // После создания производителя обновляем список (можно добавить логику для автоматического выбора)
    toast.success('Производитель создан. Выберите его из списка.');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? 'Редактировать бренд' : 'Создать бренд'}
            </DialogTitle>
            <DialogDescription>
              {isEdit ? 'Обновите информацию о бренде' : 'Добавьте новый бренд'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Общая ошибка */}
            {errors.general && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errors.general}</AlertDescription>
              </Alert>
            )}

            {/* Название */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Название <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, name: e.target.value }));
                  if (errors.name) setErrors(prev => ({ ...prev, name: undefined }));
                }}
                placeholder="Название бренда"
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name}</p>
              )}
            </div>

            {/* Производитель */}
            <div className="space-y-2">
              <Label>
                Производитель <span className="text-destructive">*</span>
              </Label>
              <ManufacturerSearchInput
                value={formData.manufacturer}
                onChange={(manufacturer) => {
                  setFormData(prev => ({ ...prev, manufacturer }));
                  if (errors.manufacturer) setErrors(prev => ({ ...prev, manufacturer: undefined }));
                }}
                onCreateNew={() => setShowManufacturerForm(true)}
                error={errors.manufacturer}
              />
            </div>

            {/* Логотип */}
            <div className="space-y-2">
              <Label htmlFor="logo">Логотип</Label>
              
              {logoPreview ? (
                <div className="relative inline-block">
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="w-32 h-32 object-contain border rounded-lg"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                    onClick={handleRemoveLogo}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
                  <input
                    id="logo"
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="hidden"
                  />
                  <Label htmlFor="logo" className="cursor-pointer">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Нажмите для загрузки логотипа
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      JPG, PNG, GIF, WebP (макс. 5MB)
                    </p>
                  </Label>
                </div>
              )}
              
              {errors.logo && (
                <p className="text-sm text-destructive">{errors.logo}</p>
              )}
            </div>

            {/* Описание */}
            <div className="space-y-2">
              <Label htmlFor="description">Описание</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, description: e.target.value }));
                  if (errors.description) setErrors(prev => ({ ...prev, description: undefined }));
                }}
                placeholder="Описание бренда"
                rows={4}
                className={errors.description ? 'border-destructive' : ''}
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description}</p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Сохранение...' : (isEdit ? 'Сохранить' : 'Создать')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Модальное окно создания производителя */}
      <ManufacturerForm
        open={showManufacturerForm}
        onOpenChange={setShowManufacturerForm}
        onSuccess={handleManufacturerCreated}
      />
    </>
  );
}