import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription } from '../ui/alert';
import { AlertCircle, Upload, X } from 'lucide-react';
import referencesService, { Resource, ResourceCreateData } from '../../services/referencesService';
import { toast } from 'sonner';

interface ResourceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource?: Resource | null;
  onSuccess: () => void;
}

interface FormData {
  name: string;
  url: string;
  section: string;
  description: string;
  logo: File | null;
}

interface FormErrors {
  name?: string;
  url?: string;
  section?: string;
  description?: string;
  logo?: string;
  general?: string;
}

export default function ResourceForm({ open, onOpenChange, resource, onSuccess }: ResourceFormProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    url: '',
    section: '',
    description: '',
    logo: null,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const isEdit = !!resource;

  // Загрузка данных источника при редактировании
  useEffect(() => {
    if (resource && open) {
      setFormData({
        name: resource.name || '',
        url: resource.url || '',
        section: resource.section || '',
        description: resource.description || '',
        logo: null,
      });
      
      if (resource.logo) {
        setLogoPreview(resource.logo);
      }
    } else if (!open) {
      // Сброс формы при закрытии
      setFormData({
        name: '',
        url: '',
        section: '',
        description: '',
        logo: null,
      });
      setLogoPreview(null);
    }
    setErrors({});
  }, [resource, open]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Валидация имени
    if (!formData.name.trim()) {
      newErrors.name = 'Название обязательно';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Название должно содержать минимум 2 символа';
    }

    // Валидация URL
    if (!formData.url.trim()) {
      newErrors.url = 'URL обязателен';
    } else {
      const urlPattern = /^https?:\/\/.+/i;
      if (!urlPattern.test(formData.url)) {
        newErrors.url = 'URL должен начинаться с http:// или https://';
      }
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
      const data: ResourceCreateData = {
        name: formData.name.trim(),
        url: formData.url.trim(),
        section: formData.section.trim() || undefined,
        description: formData.description.trim() || undefined,
        logo: formData.logo || undefined,
      };

      if (isEdit && resource) {
        await referencesService.updateResource(resource.id, data);
        toast.success('Источник успешно обновлен');
      } else {
        await referencesService.createResource(data);
        toast.success('Источник успешно создан');
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error saving resource:', err);
      
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
        setErrors({ general: err.response?.data?.message || 'Ошибка при сохранении источника' });
      }
      
      toast.error(isEdit ? 'Ошибка при обновлении источника' : 'Ошибка при создании источника');
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
            {isEdit ? 'Редактировать источник' : 'Создать источник'}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? 'Обновите информацию об источнике' : 'Добавьте новый источник'}
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
              placeholder="Название источника"
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="url">
              URL <span className="text-destructive">*</span>
            </Label>
            <Input
              id="url"
              type="url"
              value={formData.url}
              onChange={handleInputChange('url')}
              placeholder="https://example.com"
              className={errors.url ? 'border-destructive' : ''}
            />
            {errors.url && (
              <p className="text-sm text-destructive">{errors.url}</p>
            )}
          </div>

          {/* Секция/Регион */}
          <div className="space-y-2">
            <Label htmlFor="section">Секция/Регион</Label>
            <Input
              id="section"
              value={formData.section}
              onChange={handleInputChange('section')}
              placeholder="Например: Россия, Европа, Мировые"
              className={errors.section ? 'border-destructive' : ''}
            />
            {errors.section && (
              <p className="text-sm text-destructive">{errors.section}</p>
            )}
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
              onChange={handleInputChange('description')}
              placeholder="Описание источника"
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