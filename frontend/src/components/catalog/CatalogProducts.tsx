import { toast } from 'sonner';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDate, formatAmount } from '../../lib/utils';
import { CONSTANTS } from '../../constants';
import { useCatalogCategories, useCatalogCategoryTree } from '../../hooks';
import { Product } from '../../types/catalog';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { CategoryTreeSelect } from './CategoryTreeSelect';
import { Button } from '../ui/button';
import { Search, Eye, Plus, Edit, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { ProductFormDialog } from './ProductFormDialog';
import { DeleteProductDialog } from './DeleteProductDialog';

export function CatalogProducts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    status: '',
    category: '',
    is_service: '',
    search: '',
  });
  const [page, setPage] = useState(1);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Загрузка товаров
  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', filters, page],
    queryFn: () =>
      api.getProducts({
        status: filters.status || undefined,
        category: filters.category ? parseInt(filters.category) : undefined,
        is_service: filters.is_service ? filters.is_service === 'true' : undefined,
        search: filters.search || undefined,
        page,
      }),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Загрузка дерева категорий для фильтра
  const { data: categoryTree } = useCatalogCategoryTree();

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'new':
        return 'bg-blue-100 text-blue-800';
      case 'verified':
        return 'bg-green-100 text-green-800';
      case 'merged':
        return 'bg-gray-100 text-gray-800';
      case 'archived':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Мутации
  const createMutation = useMutation({
    mutationFn: (data: any) => api.createProduct(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Товар успешно создан');
    },
    onError: () => {
      toast.error('Ошибка при создании товара');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.updateProduct(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Товар успешно обновлён');
    },
    onError: () => {
      toast.error('Ошибка при обновлении товара');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Товар успешно удалён');
    },
    onError: () => {
      toast.error('Ошибка при удалении товара');
    },
  });

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="p-6 border-b bg-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl">Товары и услуги</h1>
            <p className="text-gray-500 mt-1">Справочник товаров каталога</p>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Добавить товар
          </Button>
        </div>

        {/* Фильтры */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Поиск по названию..."
              className="pl-10"
            />
          </div>

          <Select
            value={filters.status || "all"}
            onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? "" : value })}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Все статусы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="new">Новый</SelectItem>
              <SelectItem value="verified">Подтверждённый</SelectItem>
              <SelectItem value="merged">Объединённый</SelectItem>
              <SelectItem value="archived">Архивный</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.is_service || "all"}
            onValueChange={(value) => setFilters({ ...filters, is_service: value === "all" ? "" : value })}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Все типы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              <SelectItem value="false">Товары</SelectItem>
              <SelectItem value="true">Услуги</SelectItem>
            </SelectContent>
          </Select>

          <CategoryTreeSelect
            value={filters.category}
            onValueChange={(value) => setFilters({ ...filters, category: value })}
            categories={categoryTree || []}
            className="w-48"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : productsData && productsData.results && productsData.results.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left py-3 px-4">Название</th>
                  <th className="text-left py-3 px-4">Категория</th>
                  <th className="text-left py-3 px-4">Ед.изм.</th>
                  <th className="text-left py-3 px-4">Тип</th>
                  <th className="text-left py-3 px-4">Статус</th>
                  <th className="text-center py-3 px-4">Синонимов</th>
                  <th className="text-center py-3 px-4">Действия</th>
                </tr>
              </thead>
              <tbody>
                {productsData.results.map((product: Product) => (
                  <tr
                    key={product.id}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/catalog/products/${product.id}`)}
                  >
                    <td className="py-3 px-4">{product.name}</td>
                    <td className="py-3 px-4 text-gray-600">
                      {product.category_name || '—'}
                    </td>
                    <td className="py-3 px-4">{product.default_unit}</td>
                    <td className="py-3 px-4">
                      {product.is_service ? (
                        <span className="text-purple-600">Услуга</span>
                      ) : (
                        <span className="text-gray-600">Товар</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 rounded text-xs ${getStatusBadgeClass(
                          product.status
                        )}`}
                      >
                        {product.status_display}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">{product.aliases_count}</td>
                    <td className="py-3 px-4 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/catalog/products/${product.id}`);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProduct(product);
                          setIsEditDialogOpen(true);
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProduct(product);
                          setIsDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12 text-gray-500">
            Товары не найдены
          </div>
        )}

        {/* Pagination */}
        {productsData && productsData.count > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t">
            <div className="text-sm text-gray-600">
              Всего товаров: {productsData.count}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!productsData.previous}
              >
                Назад
              </Button>
              <Button
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
                disabled={!productsData.next}
              >
                Вперёд
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create Product Dialog */}
      <ProductFormDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onSave={async (data) => {
          await createMutation.mutateAsync(data);
          setIsCreateDialogOpen(false);
        }}
        product={null}
        categories={categoryTree || []}
        mode="create"
      />

      {/* Edit Product Dialog */}
      <ProductFormDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        onSave={async (data) => {
          if (selectedProduct) {
            await updateMutation.mutateAsync({ id: selectedProduct.id, data });
            setIsEditDialogOpen(false);
          }
        }}
        product={selectedProduct}
        categories={categoryTree || []}
        mode="edit"
      />

      {/* Delete Product Dialog */}
      <DeleteProductDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={async () => {
          if (selectedProduct) {
            await deleteMutation.mutateAsync(selectedProduct.id);
            setIsDeleteDialogOpen(false);
          }
        }}
        product={selectedProduct}
      />
    </div>
  );
}