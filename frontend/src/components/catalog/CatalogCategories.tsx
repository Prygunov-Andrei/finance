import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDate, formatAmount } from '../../lib/utils';
import { CONSTANTS } from '../../constants';
import { useCatalogCategories, useCatalogCategoryTree } from '../../hooks';
import { Category, CategoryTreeNode } from '../../types/catalog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { ChevronRight, ChevronDown, Plus, Trash2, Edit } from 'lucide-react';
import { toast } from 'sonner';

export function CatalogCategories() {
  const queryClient = useQueryClient();
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [isCreating, setIsCreating] = useState(false);

  // Загрузка дерева категорий
  const { data: categoryTree, isLoading: treeLoading } = useCatalogCategoryTree();

  // Загрузка выбранной категории
  const { data: selectedCategory } = useQuery({
    queryKey: ['category', selectedCategoryId],
    queryFn: () => api.getCategoryById(selectedCategoryId!),
    enabled: !!selectedCategoryId && !isCreating,
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Форма
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    parent_category: null,
    description: '',
    sort_order: '0',
    is_active: true,
  });

  // Обновление формы при выборе категории
  useEffect(() => {
    if (selectedCategory && !isCreating) {
      setFormData({
        name: selectedCategory.name || '',
        code: selectedCategory.code || '',
        parent_category: selectedCategory.parent?.id || null,
        description: selectedCategory.description || '',
        sort_order: selectedCategory.sort_order?.toString() || '0',
        is_active: selectedCategory.is_active ?? true,
      });
    }
  }, [selectedCategory, isCreating]);

  // Создание категории
  const createMutation = useMutation({
    mutationFn: (data: any) => api.createCategory(data),
    onSuccess: () => {
      toast.success('Категория создана');
      queryClient.invalidateQueries({ queryKey: ['category-tree'] });
      setIsCreating(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Обновление категории
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      api.updateCategory(id, data),
    onSuccess: () => {
      toast.success('Категория обновлена');
      queryClient.invalidateQueries({ queryKey: ['category-tree'] });
      queryClient.invalidateQueries({ queryKey: ['category', selectedCategoryId] });
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Удаление категории
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCategory(id),
    onSuccess: () => {
      toast.success('Категория удалена');
      queryClient.invalidateQueries({ queryKey: ['category-tree'] });
      setSelectedCategoryId(null);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      parent_category: null,
      description: '',
      sort_order: '0',
      is_active: true,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const dataToSubmit = {
      name: formData.name,
      code: formData.code,
      parent: formData.parent_category,
      description: formData.description,
      sort_order: parseInt(formData.sort_order),
      is_active: formData.is_active,
    };

    if (isCreating) {
      createMutation.mutate(dataToSubmit);
    } else if (selectedCategoryId) {
      updateMutation.mutate({ id: selectedCategoryId, data: dataToSubmit });
    }
  };

  const handleDelete = () => {
    if (!selectedCategoryId) return;
    
    if (window.confirm('Вы уверены, что хотите удалить эту категорию?')) {
      deleteMutation.mutate(selectedCategoryId);
    }
  };

  const toggleExpand = (id: number) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCategories(newExpanded);
  };

  // Функция для преобразования дерева в плоский список с отступами
  const flattenCategoryTree = (nodes: CategoryTreeNode[], level: number = 0): Array<{id: number, name: string, level: number}> => {
    const result: Array<{id: number, name: string, level: number}> = [];
    
    nodes.forEach(node => {
      // Пропускаем текущую редактируемую категорию, чтобы не создать циклическую зависимость
      if (!isCreating && node.id === selectedCategoryId) {
        return;
      }
      
      result.push({
        id: node.id,
        name: node.name,
        level: level
      });
      
      if (node.children && node.children.length > 0) {
        result.push(...flattenCategoryTree(node.children, level + 1));
      }
    });
    
    return result;
  };

  const renderTreeNode = (node: CategoryTreeNode, level: number = 0) => {
    const isExpanded = expandedCategories.has(node.id);
    const isSelected = selectedCategoryId === node.id;
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 py-2 px-3 cursor-pointer hover:bg-gray-100 rounded ${
            isSelected ? 'bg-blue-50 border-l-4 border-blue-600' : ''
          }`}
          style={{ paddingLeft: `${level * 20 + 12}px` }}
          onClick={() => {
            setSelectedCategoryId(node.id);
            setIsCreating(false);
          }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
              className="p-1"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          ) : (
            <div className="w-6" />
          )}
          <span className="flex-1">{node.name}</span>
          <span className="text-xs text-gray-500">{node.code}</span>
        </div>

        {isExpanded && hasChildren && (
          <div>
            {node.children.map((child) => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b bg-white">
        <div>
          <h1 className="text-2xl">Категории товаров</h1>
          <p className="text-gray-500 mt-1">Иерархия категорий каталога</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Левая панель - дерево */}
        <div className="w-1/3 border-r bg-white overflow-y-auto">
          <div className="p-4">
            <Button
              onClick={() => {
                setIsCreating(true);
                setSelectedCategoryId(null);
                resetForm();
              }}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Добавить категорию
            </Button>
          </div>

          <div className="px-2">
            {treeLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : categoryTree && categoryTree.length > 0 ? (
              categoryTree.map((node) => renderTreeNode(node))
            ) : (
              <div className="text-center py-8 text-gray-500">
                Категории не найдены
              </div>
            )}
          </div>
        </div>

        {/* Правая панель - форма */}
        <div className="flex-1 bg-gray-50 overflow-y-auto">
          {(selectedCategoryId || isCreating) ? (
            <form onSubmit={handleSubmit} className="p-6 space-y-6 max-w-2xl">
              <div>
                <h2 className="text-xl">
                  {isCreating ? 'Создание категории' : 'Редактирование категории'}
                </h2>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">
                    Название <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Электротехническое оборудование"
                    className="mt-1.5"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="code">
                    Код <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value })
                    }
                    placeholder="ELEC"
                    className="mt-1.5"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="parent">Родительская категория</Label>
                  <Select
                    value={formData.parent_category?.toString() || "none"}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        parent_category: value === "none" ? null : parseInt(value),
                      })
                    }
                  >
                    <SelectTrigger id="parent" className="mt-1.5">
                      <SelectValue placeholder="Не выбрана (корневая)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Не выбрана (корневая)</SelectItem>
                      {categoryTree && categoryTree.length > 0 &&
                        flattenCategoryTree(categoryTree).map((category) => (
                          <SelectItem key={category.id} value={category.id.toString()}>
                            <span style={{ paddingLeft: `${category.level * 16}px` }}>
                              {category.level > 0 && '└ '}
                              {category.name}
                            </span>
                          </SelectItem>
                        ))
                      }
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="description">Описание</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Описание категории..."
                    className="mt-1.5"
                    rows={4}
                  />
                </div>

                <div>
                  <Label htmlFor="sort_order">Порядок сортировки</Label>
                  <Input
                    id="sort_order"
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) =>
                      setFormData({ ...formData, sort_order: e.target.value })
                    }
                    className="mt-1.5"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, is_active: checked as boolean })
                    }
                  />
                  <Label htmlFor="is_active" className="cursor-pointer">
                    Активна
                  </Label>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <Button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {isCreating ? 'Создать' : 'Сохранить'}
                </Button>

                {!isCreating && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Удалить
                  </Button>
                )}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreating(false);
                    setSelectedCategoryId(null);
                    resetForm();
                  }}
                >
                  Отмена
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              Выберите категорию для редактирования или создайте новую
            </div>
          )}
        </div>
      </div>
    </div>
  );
}