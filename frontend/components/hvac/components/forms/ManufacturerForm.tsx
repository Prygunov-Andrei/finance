import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription } from '../ui/alert';
import { AlertCircle } from 'lucide-react';
import referencesService, { Manufacturer, ManufacturerCreateData } from '../../services/referencesService';
import { toast } from 'sonner';

interface ManufacturerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manufacturer?: Manufacturer | null;
  onSuccess: () => void;
}

interface FormData {
  name: string;
  website_1: string;
  website_2: string;
  website_3: string;
  description: string;
  region: string;
}

interface FormErrors {
  name?: string;
  website_1?: string;
  website_2?: string;
  website_3?: string;
  description?: string;
  region?: string;
  general?: string;
}

export default function ManufacturerForm({ open, onOpenChange, manufacturer, onSuccess }: ManufacturerFormProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    website_1: '',
    website_2: '',
    website_3: '',
    description: '',
    region: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  const isEdit = !!manufacturer;

  // Загрузка данных производителя при редактировании
  useEffect(() => {
    if (manufacturer) {
      setFormData({
        name: manufacturer.name || '',
        website_1: manufacturer.website_1 || '',
        website_2: manufacturer.website_2 || '',
        website_3: manufacturer.website_3 || '',
        description: manufacturer.description || '',
        region: manufacturer.region || '',
      });
    } else {
      // Сброс формы при создании нового
      setFormData({
        name: '',
        website_1: '',
        website_2: '',
        website_3: '',
        description: '',
        region: '',
      });
    }
    setErrors({});
  }, [manufacturer, open]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Валидация имени
    if (!formData.name.trim()) {
      newErrors.name = 'Название обязательно';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Название должно содержать минимум 2 символа';
    }

    // Валидация URL
    const urlPattern = /^https?:\/\/.+/i;
    if (formData.website_1 && !urlPattern.test(formData.website_1)) {
      newErrors.website_1 = 'URL должен начинаться с http:// или https://';
    }
    if (formData.website_2 && !urlPattern.test(formData.website_2)) {
      newErrors.website_2 = 'URL должен начинаться с http:// или https://';
    }
    if (formData.website_3 && !urlPattern.test(formData.website_3)) {
      newErrors.website_3 = 'URL должен начинаться с http:// или https://';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const data: ManufacturerCreateData = {
        name: formData.name.trim(),
        website_1: formData.website_1.trim() || undefined,
        website_2: formData.website_2.trim() || undefined,
        website_3: formData.website_3.trim() || undefined,
        description: formData.description.trim() || undefined,
        region: formData.region.trim() || undefined,
      };

      if (isEdit && manufacturer) {
        await referencesService.updateManufacturer(manufacturer.id, data);
        toast.success('Производитель успешно обновлен');
      } else {
        await referencesService.createManufacturer(data);
        toast.success('Производитель успешно создан');
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error saving manufacturer:', err);
      
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
        setErrors({ general: err.response?.data?.message || 'Ошибка при сохранении производителя' });
      }
      
      toast.error(isEdit ? 'Ошибка при обновлении производителя' : 'Ошибка при создании производителя');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    // Очищаем ошибку при изменении поля
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Редактировать производителя' : 'Создать производителя'}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? 'Обновите информацию о производителе' : 'Введите информацию о новом производителе'}
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
              onChange={handleInputChange('name')}
              placeholder="Название производителя"
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Регион */}
          <div className="space-y-2">
            <Label htmlFor="region">Регион</Label>
            <Input
              id="region"
              value={formData.region}
              onChange={handleInputChange('region')}
              placeholder="Например: Россия, США, Германия"
              className={errors.region ? 'border-destructive' : ''}
            />
            {errors.region && (
              <p className="text-sm text-destructive">{errors.region}</p>
            )}
          </div>

          {/* Сайт 1 */}
          <div className="space-y-2">
            <Label htmlFor="website_1">Веб-сайт 1</Label>
            <Input
              id="website_1"
              type="url"
              value={formData.website_1}
              onChange={handleInputChange('website_1')}
              placeholder="https://example.com"
              className={errors.website_1 ? 'border-destructive' : ''}
            />
            {errors.website_1 && (
              <p className="text-sm text-destructive">{errors.website_1}</p>
            )}
          </div>

          {/* Сайт 2 */}
          <div className="space-y-2">
            <Label htmlFor="website_2">Веб-сайт 2</Label>
            <Input
              id="website_2"
              type="url"
              value={formData.website_2}
              onChange={handleInputChange('website_2')}
              placeholder="https://example.com"
              className={errors.website_2 ? 'border-destructive' : ''}
            />
            {errors.website_2 && (
              <p className="text-sm text-destructive">{errors.website_2}</p>
            )}
          </div>

          {/* Сайт 3 */}
          <div className="space-y-2">
            <Label htmlFor="website_3">Веб-сайт 3</Label>
            <Input
              id="website_3"
              type="url"
              value={formData.website_3}
              onChange={handleInputChange('website_3')}
              placeholder="https://example.com"
              className={errors.website_3 ? 'border-destructive' : ''}
            />
            {errors.website_3 && (
              <p className="text-sm text-destructive">{errors.website_3}</p>
            )}
          </div>

          {/* Описание */}
          <div className="space-y-2">
            <Label htmlFor="description">Описание</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={handleInputChange('description')}
              placeholder="Описание производителя"
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
  );
}