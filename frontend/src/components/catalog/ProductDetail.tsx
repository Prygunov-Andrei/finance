import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { formatDate, formatAmount } from '../../lib/utils';
import { CONSTANTS } from '../../constants';
import { useCatalogCategories, useCatalogCategoryTree } from '../../hooks';
import { Product, ProductAlias, Category } from '../../types/catalog';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { ArrowLeft, CheckCircle, Archive, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { PriceHistoryTable } from './PriceHistoryTable';

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'info' | 'aliases' | 'prices'>('info');
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // Загрузка товара
  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.getProductById(parseInt(id!)),
    enabled: !!id,
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Загрузка категорий
  const { data: categories } = useCatalogCategories();

  // Загрузка истории цен
  const { data: prices, isLoading: pricesLoading } = useQuery({
    queryKey: ['product-prices', id],
    queryFn: () => api.getProductPrices(parseInt(id!)),
    enabled: !!id && activeTab === 'prices',
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Обновление категории
  const updateCategoryMutation = useMutation({
    mutationFn: (categoryId: number | null) =>
      api.updateProduct(parseInt(id!), { category: categoryId }),
    onSuccess: () => {
      toast.success('Категория обновлена');
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      setIsEditingCategory(false);
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Подтверждение товара
  const verifyMutation = useMutation({
    mutationFn: () => api.verifyProduct(parseInt(id!)),
    onSuccess: () => {
      toast.success('Товар подтверждён');
      queryClient.invalidateQueries({ queryKey: ['product', id] });
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Архивация товара
  const archiveMutation = useMutation({
    mutationFn: () => api.archiveProduct(parseInt(id!)),
    onSuccess: () => {
      toast.success('Товар архивирован');
      queryClient.invalidateQueries({ queryKey: ['product', id] });
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-gray-500">Товар не найден</p>
          <Button
            variant="outline"
            onClick={() => navigate('/catalog/products')}
            className="mt-4"
          >
            Назад к списку
          </Button>
        </div>
      </div>
    );
  }

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

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="p-6 border-b bg-white">
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="ghost"
            onClick={() => navigate('/catalog/products')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад
          </Button>
        </div>

        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl">{product.name}</h1>
              <span
                className={`px-2 py-1 rounded text-xs ${getStatusBadgeClass(
                  product.status
                )}`}
              >
                {product.status_display}
              </span>
              {product.is_service && (
                <span className="px-2 py-1 rounded text-xs bg-purple-100 text-purple-800">
                  Услуга
                </span>
              )}
            </div>
            <div className="text-gray-600 space-y-1">
              <div>Категория: {product.category_name || 'Не указана'}</div>
              <div>Единица измерения: {product.default_unit}</div>
              {product.aliases_count > 0 && (
                <div>Синонимов: {product.aliases_count}</div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {product.status === 'new' && (
              <Button
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Подтвердить
              </Button>
            )}

            {product.status !== 'archived' && (
              <Button
                onClick={() => {
                  if (
                    window.confirm(
                      'Вы уверены, что хотите архивировать этот товар?'
                    )
                  ) {
                    archiveMutation.mutate();
                  }
                }}
                disabled={archiveMutation.isPending}
                variant="outline"
                className="text-red-600 hover:bg-red-50"
              >
                <Archive className="w-4 h-4 mr-2" />
                Архивировать
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b bg-white">
        <div className="flex px-6">
          <button
            onClick={() => setActiveTab('info')}
            className={`px-4 py-3 border-b-2 transition ${
              activeTab === 'info'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Информация
          </button>
          <button
            onClick={() => setActiveTab('aliases')}
            className={`px-4 py-3 border-b-2 transition ${
              activeTab === 'aliases'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Синонимы ({product.aliases_count})
          </button>
          <button
            onClick={() => setActiveTab('prices')}
            className={`px-4 py-3 border-b-2 transition ${
              activeTab === 'prices'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            История цен
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gray-50 p-6">
        {activeTab === 'info' && (
          <div className="max-w-2xl bg-white rounded-lg shadow p-6 space-y-6">
            <div>
              <Label>Название</Label>
              <div className="mt-1.5 text-gray-900">{product.name}</div>
            </div>

            <div>
              <Label>Нормализованное название</Label>
              <div className="mt-1.5 text-gray-600">{product.normalized_name}</div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label>Категория</Label>
                {!isEditingCategory && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsEditingCategory(true);
                      setSelectedCategory(product.category?.toString() || '');
                    }}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Изменить
                  </Button>
                )}
              </div>
              {isEditingCategory ? (
                <div className="flex gap-2">
                  <Select
                    value={selectedCategory || "none"}
                    onValueChange={(val) => setSelectedCategory(val === "none" ? "" : val)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Выберите категорию" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Без категории</SelectItem>
                      {categories?.map((cat: any) => (
                        <SelectItem key={cat.id} value={cat.id.toString()}>
                          {cat.full_path || cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => {
                      updateCategoryMutation.mutate(
                        selectedCategory ? parseInt(selectedCategory) : null
                      );
                    }}
                    disabled={updateCategoryMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Сохранить
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditingCategory(false)}
                  >
                    Отмена
                  </Button>
                </div>
              ) : (
                <div className="mt-1.5 text-gray-900">
                  {product.category_path || product.category_name || 'Не указана'}
                </div>
              )}
            </div>

            <div>
              <Label>Единица измерения</Label>
              <div className="mt-1.5 text-gray-900">{product.default_unit}</div>
            </div>

            <div>
              <Label>Тип</Label>
              <div className="mt-1.5 text-gray-900">
                {product.is_service ? 'Услуга' : 'Товар'}
              </div>
            </div>

            <div>
              <Label>Статус</Label>
              <div className="mt-1.5">
                <span
                  className={`px-2 py-1 rounded text-xs ${getStatusBadgeClass(
                    product.status
                  )}`}
                >
                  {product.status_display}
                </span>
              </div>
            </div>

            {product.merged_into && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
                <div className="text-sm text-yellow-800">
                  Этот товар объединён в товар #{product.merged_into}
                </div>
              </div>
            )}

            <div className="pt-4 border-t text-sm text-gray-500">
              <div>Создан: {formatDate(product.created_at)}</div>
              <div>Обновлён: {formatDate(product.updated_at)}</div>
            </div>
          </div>
        )}

        {activeTab === 'aliases' && (
          <div className="max-w-4xl bg-white rounded-lg shadow">
            {product.aliases && product.aliases.length > 0 ? (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-3 px-4">Название</th>
                    <th className="text-left py-3 px-4">Источник</th>
                    <th className="text-left py-3 px-4">Создан</th>
                  </tr>
                </thead>
                <tbody>
                  {product.aliases.map((alias: ProductAlias) => (
                    <tr key={alias.id} className="border-b">
                      <td className="py-3 px-4">{alias.alias_name}</td>
                      <td className="py-3 px-4">
                        {alias.source_payment ? (
                          <a
                            href={`/payments/${alias.source_payment}`}
                            className="text-blue-600 hover:underline"
                          >
                            Платёж #{alias.source_payment}
                          </a>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {formatDate(alias.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-gray-500">
                Синонимы отсутствуют
              </div>
            )}
          </div>
        )}

        {activeTab === 'prices' && (
          <div className="max-w-6xl bg-white rounded-lg shadow p-6">
            <h3 className="text-lg mb-4">История цен</h3>
            <PriceHistoryTable prices={prices || []} isLoading={pricesLoading} />
          </div>
        )}
      </div>
    </div>
  );
}