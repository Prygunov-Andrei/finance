import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDate, formatAmount } from '../../lib/utils';
import { CONSTANTS } from '../../constants';
import { useCatalogCategories, useCatalogCategoryTree } from '../../hooks';
import { Product, ProductDuplicate } from '../../types/catalog';
import { Button } from '../ui/button';
import { CheckCircle, Archive, Search as SearchIcon, GitMerge } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { MergeProductsModal } from './MergeProductsModal';

export function CatalogModeration() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'new' | 'duplicates'>('new');
  const [duplicates, setDuplicates] = useState<ProductDuplicate[]>([]);
  const [isSearchingDuplicates, setIsSearchingDuplicates] = useState(false);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);

  // Загрузка новых товаров
  const { data: newProductsData, isLoading: newProductsLoading } = useQuery({
    queryKey: ['products', 'new'],
    queryFn: () => api.getProducts({ status: 'new' }),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Подтверждение товара
  const verifyMutation = useMutation({
    mutationFn: (id: number) => api.verifyProduct(id),
    onSuccess: () => {
      toast.success('Товар подтверждён');
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Архивация товара
  const archiveMutation = useMutation({
    mutationFn: (id: number) => api.archiveProduct(id),
    onSuccess: () => {
      toast.success('Товар архивирован');
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Поиск дубликатов
  const handleFindDuplicates = async () => {
    setIsSearchingDuplicates(true);
    try {
      const result = await api.findDuplicateProducts();
      setDuplicates(result);
      toast.success(`Найдено ${result.length} групп похожих товаров`);
    } catch (error: any) {
      toast.error(`Ошибка: ${error.message}`);
    } finally {
      setIsSearchingDuplicates(false);
    }
  };

  // Объединение товаров
  const mergeMutation = useMutation({
    mutationFn: (data: { target_id: number; source_ids: number[] }) =>
      api.mergeProducts(data),
    onSuccess: () => {
      toast.success('Товары объединены');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setMergeModalOpen(false);
      setSelectedProducts([]);
      // Обновляем список дубликатов
      handleFindDuplicates();
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="p-6 border-b bg-white">
        <div>
          <h1 className="text-2xl">Модерация товаров</h1>
          <p className="text-gray-500 mt-1">
            Проверка новых товаров и поиск дубликатов
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b bg-white">
        <div className="flex px-6">
          <button
            onClick={() => setActiveTab('new')}
            className={`px-4 py-3 border-b-2 transition ${
              activeTab === 'new'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Новые товары
            {newProductsData && newProductsData.count > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                {newProductsData.count}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('duplicates')}
            className={`px-4 py-3 border-b-2 transition ${
              activeTab === 'duplicates'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Дубликаты
            {duplicates.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-orange-600 text-white text-xs rounded-full">
                {duplicates.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gray-50 p-6">
        {activeTab === 'new' && (
          <div className="bg-white rounded-lg shadow">
            {newProductsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : newProductsData && newProductsData.results && newProductsData.results.length > 0 ? (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-3 px-4">Название</th>
                    <th className="text-left py-3 px-4">Категория</th>
                    <th className="text-left py-3 px-4">Ед.изм.</th>
                    <th className="text-left py-3 px-4">Создан из платежа</th>
                    <th className="text-left py-3 px-4">Создан</th>
                    <th className="text-center py-3 px-4">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {newProductsData.results.map((product: Product) => (
                    <tr key={product.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">{product.name}</td>
                      <td className="py-3 px-4 text-gray-600">
                        {product.category_name || '—'}
                      </td>
                      <td className="py-3 px-4">{product.default_unit}</td>
                      <td className="py-3 px-4">
                        {product.source_payment ? (
                          <a
                            href={`/payments/${product.source_payment}`}
                            className="text-blue-600 hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/payments/${product.source_payment}`);
                            }}
                          >
                            Платёж #{product.source_payment}
                          </a>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {formatDate(product.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => verifyMutation.mutate(product.id)}
                            disabled={verifyMutation.isPending}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Подтвердить
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              // Ищем похожие для конкретного товара
                              setIsSearchingDuplicates(true);
                              try {
                                const result = await api.findDuplicateProducts();
                                // Фильтруем только группы с этим товаром
                                const filtered = result.filter(
                                  (group: ProductDuplicate) =>
                                    group.product.id === product.id ||
                                    group.similar.some((s) => s.id === product.id)
                                );
                                setDuplicates(filtered);
                                setActiveTab('duplicates');
                                if (filtered.length > 0) {
                                  toast.success(`Найдено ${filtered.length} похожих товаров`);
                                } else {
                                  toast.info('Похожие товары не найдены');
                                }
                              } catch (error: any) {
                                toast.error(`Ошибка: ${error.message}`);
                              } finally {
                                setIsSearchingDuplicates(false);
                              }
                            }}
                            disabled={isSearchingDuplicates}
                          >
                            <SearchIcon className="w-4 h-4 mr-1" />
                            Найти похожие
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/catalog/products/${product.id}`)}
                          >
                            Подробнее
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (
                                window.confirm(
                                  'Вы уверены, что хотите архивировать этот товар?'
                                )
                              ) {
                                archiveMutation.mutate(product.id);
                              }
                            }}
                            disabled={archiveMutation.isPending}
                            className="text-red-600 hover:bg-red-50"
                          >
                            <Archive className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12 text-gray-500">
                Нет новых товаров для модерации
              </div>
            )}
          </div>
        )}

        {activeTab === 'duplicates' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg">Поиск дубликатов</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Система автоматически найдёт похожие товары в каталоге
                  </p>
                </div>
                <Button
                  onClick={handleFindDuplicates}
                  disabled={isSearchingDuplicates}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <SearchIcon className="w-4 h-4 mr-2" />
                  {isSearchingDuplicates ? 'Поиск...' : 'Найти дубликаты'}
                </Button>
              </div>
            </div>

            {duplicates.length > 0 ? (
              <div className="space-y-4">
                {duplicates.map((group, index) => (
                  <div key={index} className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h4 className="text-lg">
                          Основной товар: {group.product.name}
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">
                          Найдено {group.similar.length} похожих товаров
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          // Загружаем полные данные товаров для объединения
                          Promise.all([
                            api.getProductById(group.product.id),
                            ...group.similar.map((s) => api.getProductById(s.id)),
                          ]).then((products) => {
                            setSelectedProducts(products);
                            setMergeModalOpen(true);
                          });
                        }}
                        className="bg-orange-600 hover:bg-orange-700"
                      >
                        <GitMerge className="w-4 h-4 mr-2" />
                        Объединить
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {group.similar.map((similar) => (
                        <div
                          key={similar.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded"
                        >
                          <div className="flex-1">
                            <div>{similar.name}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              Схожесть: {(similar.score * 100).toFixed(0)}%
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/catalog/products/${similar.id}`)}
                          >
                            Подробнее
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
                Нажмите кнопку "Найти дубликаты" для начала поиска
              </div>
            )}
          </div>
        )}
      </div>

      {/* Модальное окно объединения */}
      <MergeProductsModal
        isOpen={mergeModalOpen}
        onClose={() => {
          setMergeModalOpen(false);
          setSelectedProducts([]);
        }}
        products={selectedProducts}
        onMerge={async (targetId, sourceIds) => {
          await mergeMutation.mutateAsync({ target_id: targetId, source_ids: sourceIds });
        }}
      />
    </div>
  );
}