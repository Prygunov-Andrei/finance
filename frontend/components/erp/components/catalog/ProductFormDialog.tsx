import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { CategoryTreeNode, Product } from '../../types/catalog';
import { Loader2 } from 'lucide-react';

interface ProductFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  product?: Product | null;
  categories: CategoryTreeNode[];
  mode: 'create' | 'edit';
}

const UNIT_OPTIONS = [
  { value: 'шт', label: 'шт' },
  { value: 'м', label: 'м' },
  { value: 'м²', label: 'м²' },
  { value: 'м³', label: 'м³' },
  { value: 'кг', label: 'кг' },
  { value: 'т', label: 'т' },
  { value: 'л', label: 'л' },
  { value: 'компл', label: 'компл' },
  { value: 'ч', label: 'ч' },
  { value: 'усл', label: 'усл' },
  { value: 'ед', label: 'ед' },
];

export function ProductFormDialog({
  isOpen,
  onClose,
  onSave,
  product,
  categories,
  mode,
}: ProductFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: null as number | null,
    default_unit: 'шт',
    is_service: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Преобразование дерева категорий в плоский список
  const flattenCategories = (nodes: CategoryTreeNode[], level: number = 0): Array<{ id: number; name: string; level: number }> => {
    const result: Array<{ id: number; name: string; level: number }> = [];
    nodes.forEach((node) => {
      result.push({ id: node.id, name: node.name, level });
      if (node.children && node.children.length > 0) {
        result.push(...flattenCategories(node.children, level + 1));
      }
    });
    return result;
  };

  const flatCategories = flattenCategories(categories);

  // Предзаполнение формы при редактировании
  useEffect(() => {
    if (mode === 'edit' && product) {
      setFormData({
        name: product.name,
        category: product.category,
        default_unit: product.default_unit,
        is_service: product.is_service,
      });
    } else {
      setFormData({
        name: '',
        category: null,
        default_unit: 'шт',
        is_service: false,
      });
    }
    setErrors({});
  }, [mode, product, isOpen]);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Название обязательно';
    } else if (formData.name.length > 500) {
      newErrors.name = 'Название не должно превышать 500 символов';
    }

    if (!formData.default_unit) {
      newErrors.default_unit = 'Единица измерения обязательна';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error: any) {
      // Обработка ошибок валидации от API
      if (error.response?.data) {
        const apiErrors: Record<string, string> = {};
        Object.entries(error.response.data).forEach(([key, value]) => {
          apiErrors[key] = Array.isArray(value) ? value[0] : String(value);
        });
        setErrors(apiErrors);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Создать товар' : 'Редактировать товар'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create' ? 'Добавьте новый товар в каталог' : 'Обновите информацию о товаре'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Название */}
          <div>
            <Label htmlFor="name">
              Название <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Введите название товара"
              className="mt-1.5"
              maxLength={500}
            />
            {errors.name && (
              <p className="text-sm text-red-500 mt-1">{errors.name}</p>
            )}
          </div>

          {/* Категория */}
          <div>
            <Label htmlFor="category">Категория</Label>
            <Select
              value={formData.category?.toString() || 'none'}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  category: value === 'none' ? null : parseInt(value),
                })
              }
            >
              <SelectTrigger id="category" className="mt-1.5">
                <SelectValue placeholder="Не выбрана" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не выбрана</SelectItem>
                {flatCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    <span style={{ paddingLeft: `${cat.level * 16}px` }}>
                      {cat.level > 0 && '└ '}
                      {cat.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && (
              <p className="text-sm text-red-500 mt-1">{errors.category}</p>
            )}
          </div>

          {/* Единица измерения */}
          <div>
            <Label htmlFor="unit">
              Единица измерения <span className="text-red-500">*</span>
            </Label>
            <Select
              value={formData.default_unit}
              onValueChange={(value) =>
                setFormData({ ...formData, default_unit: value })
              }
            >
              <SelectTrigger id="unit" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map((unit) => (
                  <SelectItem key={unit.value} value={unit.value}>
                    {unit.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.default_unit && (
              <p className="text-sm text-red-500 mt-1">{errors.default_unit}</p>
            )}
          </div>

          {/* Тип */}
          <div>
            <Label>Тип</Label>
            <div className="flex gap-1 mt-2 p-1 bg-gray-100 rounded-lg">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, is_service: false })}
                className={`flex-1 py-2 px-4 rounded-md transition-all ${
                  !formData.is_service
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Товар
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, is_service: true })}
                className={`flex-1 py-2 px-4 rounded-md transition-all ${
                  formData.is_service
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Услуга
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Сохранение...
              </>
            ) : mode === 'create' ? (
              'Создать'
            ) : (
              'Сохранить'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}