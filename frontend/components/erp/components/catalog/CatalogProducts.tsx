import { toast } from 'sonner';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { CONSTANTS } from '../../constants';
import { useCatalogCategoryTree } from '../../hooks';
import { Product, CategoryTreeNode } from '../../types/catalog';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { Search, Plus, Trash2, ChevronRight, ChevronDown, FolderOpen, Package } from 'lucide-react';
import { useNavigate } from 'react-router';
import { ProductFormDialog } from './ProductFormDialog';
import { DeleteProductDialog } from './DeleteProductDialog';

export function CatalogProducts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Состояние дерева категорий
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());

  // Фильтры и пагинация
  const [filters, setFilters] = useState({
    status: '',
    is_service: '',
    search: '',
    supplier: '',
    in_stock: '',
  });
  const [page, setPage] = useState(1);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Загрузка дерева категорий
  const { categoryTree, uncategorizedCount, isLoading: treeLoading } = useCatalogCategoryTree();

  // Загрузка поставщиков (контрагенты-вендоры)
  const { data: suppliers } = useQuery({
    queryKey: ['counterparties-vendors'],
    queryFn: () => api.getCounterparties({ type: 'vendor' }),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Загрузка товаров
  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', selectedCategoryId, filters, page],
    queryFn: () =>
      api.getProducts({
        category: selectedCategoryId === 'uncategorized'
          ? 'uncategorized' as any
          : selectedCategoryId ? parseInt(selectedCategoryId) : undefined,
        status: filters.status || undefined,
        is_service: filters.is_service ? filters.is_service === 'true' : undefined,
        search: filters.search || undefined,
        supplier: filters.supplier ? parseInt(filters.supplier) : undefined,
        in_stock: filters.in_stock ? filters.in_stock === 'true' : undefined,
        page,
      }),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Найти выбранную категорию в дереве
  const findCategory = (nodes: CategoryTreeNode[], id: number): CategoryTreeNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = findCategory(node.children, id);
      if (found) return found;
    }
    return null;
  };

  const selectedCategoryNode = selectedCategoryId && selectedCategoryId !== 'uncategorized' && categoryTree
    ? findCategory(categoryTree, parseInt(selectedCategoryId))
    : null;

  const isUncategorized = selectedCategoryId === 'uncategorized';

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-800';
      case 'verified': return 'bg-green-100 text-green-800';
      case 'merged': return 'bg-gray-100 text-gray-800';
      case 'archived': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Мутации
  const createMutation = useMutation({
    mutationFn: (data: any) => api.createProduct(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['category-tree'] });
      toast.success('Товар создан');
    },
    onError: () => toast.error('Ошибка при создании товара'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['category-tree'] });
      toast.success('Товар удалён');
    },
    onError: () => toast.error('Ошибка при удалении товара'),
  });

  // Переключение раскрытия категории
  const toggleExpand = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Выбор категории
  const handleCategoryClick = (id: number) => {
    const newValue = selectedCategoryId === String(id) ? '' : String(id);
    setSelectedCategoryId(newValue);
    setPage(1);
  };

  // Рендер узла дерева
  const renderTreeNode = (node: CategoryTreeNode, level: number = 0) => {
    const isExpanded = expandedCategories.has(node.id);
    const isSelected = selectedCategoryId === String(node.id);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1 py-1.5 px-2 cursor-pointer rounded-md text-sm transition-colors ${
            isSelected
              ? 'bg-blue-100 text-blue-900 font-medium'
              : 'hover:bg-gray-100 text-gray-700'
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => handleCategoryClick(node.id)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => toggleExpand(node.id, e)}
              className="p-0.5 rounded hover:bg-gray-200"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4.5" />
          )}
          <span className="flex-1 truncate">{node.name}</span>
          {node.total_count > 0 && (
            <span className={`text-xs tabular-nums ${
              isSelected ? 'text-blue-600' : 'text-gray-400'
            }`}>
              {node.total_count}
            </span>
          )}
        </div>

        {isExpanded && hasChildren && (
          <div>
            {node.children.map((child) => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // Подсчёт общего количества товаров (включая без категории)
  const categorizedProducts = categoryTree?.reduce((sum: number, cat: CategoryTreeNode) => sum + cat.total_count, 0) || 0;
  const totalProducts = categorizedProducts + uncategorizedCount;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="p-4 border-b bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Номенклатура</h1>
          <p className="text-sm text-gray-500">
            {selectedCategoryNode
              ? selectedCategoryNode.name
              : isUncategorized
                ? `Без категории (${productsData?.count || 0})`
                : `Все товары (${productsData?.count || 0})`
            }
          </p>
        </div>
        <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Добавить
        </Button>
      </div>

      {/* Content: tree + products */}
      <div className="flex-1 flex overflow-hidden">
        {/* Левая панель — дерево категорий */}
        <div className="w-64 border-r bg-gray-50/50 overflow-y-auto flex-shrink-0">
          {/* Все товары */}
          <div className="p-2">
            <div
              className={`flex items-center gap-2 py-2 px-3 cursor-pointer rounded-md text-sm transition-colors ${
                !selectedCategoryId
                  ? 'bg-blue-100 text-blue-900 font-medium'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
              onClick={() => { setSelectedCategoryId(''); setPage(1); }}
            >
              <Package className="w-4 h-4" />
              <span className="flex-1">Все товары</span>
              <span className={`text-xs tabular-nums ${!selectedCategoryId ? 'text-blue-600' : 'text-gray-400'}`}>
                {totalProducts}
              </span>
            </div>
          </div>

          <div className="border-t mx-2" />

          {/* Дерево */}
          <div className="p-2">
            {treeLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              </div>
            ) : categoryTree && categoryTree.length > 0 ? (
              <>
                {categoryTree.map((node) => renderTreeNode(node))}
                {uncategorizedCount > 0 && (
                  <>
                    <div className="border-t mx-0 my-1" />
                    <div
                      className={`flex items-center gap-2 py-1.5 px-2 cursor-pointer rounded-md text-sm transition-colors ${
                        selectedCategoryId === 'uncategorized'
                          ? 'bg-blue-100 text-blue-900 font-medium'
                          : 'hover:bg-gray-100 text-gray-500'
                      }`}
                      onClick={() => { setSelectedCategoryId('uncategorized'); setPage(1); }}
                    >
                      <span className="w-4.5" />
                      <span className="flex-1 truncate">Без категории</span>
                      <span className={`text-xs tabular-nums ${
                        selectedCategoryId === 'uncategorized' ? 'text-blue-600' : 'text-gray-400'
                      }`}>
                        {uncategorizedCount}
                      </span>
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-gray-400 text-sm">
                Категории не найдены
              </div>
            )}
          </div>
        </div>

        {/* Правая панель — товары */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Фильтры */}
          <div className="flex gap-3 p-3 border-b bg-gray-50/50">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={filters.search}
                onChange={(e) => { setFilters({ ...filters, search: e.target.value }); setPage(1); }}
                placeholder="Поиск по названию..."
                className="pl-8 h-9"
              />
            </div>

            <Select
              value={filters.status || "all"}
              onValueChange={(v) => { setFilters({ ...filters, status: v === "all" ? "" : v }); setPage(1); }}
            >
              <SelectTrigger className="w-40 h-9">
                <SelectValue placeholder="Статус" />
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
              onValueChange={(v) => { setFilters({ ...filters, is_service: v === "all" ? "" : v }); setPage(1); }}
            >
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="Тип" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                <SelectItem value="false">Товары</SelectItem>
                <SelectItem value="true">Услуги</SelectItem>
              </SelectContent>
            </Select>

            {suppliers && suppliers.results && suppliers.results.length > 0 && (
              <Select
                value={filters.supplier || "all"}
                onValueChange={(v) => { setFilters({ ...filters, supplier: v === "all" ? "" : v }); setPage(1); }}
              >
                <SelectTrigger className="w-44 h-9">
                  <SelectValue placeholder="Поставщик" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все поставщики</SelectItem>
                  {suppliers.results.map((s: any) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select
              value={filters.in_stock || "all"}
              onValueChange={(v) => { setFilters({ ...filters, in_stock: v === "all" ? "" : v }); setPage(1); }}
            >
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="Наличие" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Любое наличие</SelectItem>
                <SelectItem value="true">В наличии</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Таблица товаров */}
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : productsData && productsData.results && productsData.results.length > 0 ? (
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-2 w-10"></th>
                    <th className="text-left py-2.5 px-4 text-sm font-medium text-gray-600">Название</th>
                    <th className="text-left py-2.5 px-4 text-sm font-medium text-gray-600 w-28">Бренд</th>
                    <th className="text-left py-2.5 px-4 text-sm font-medium text-gray-600">Категория</th>
                    <th className="text-left py-2.5 px-4 text-sm font-medium text-gray-600 w-20">Ед.изм.</th>
                    <th className="text-left py-2.5 px-4 text-sm font-medium text-gray-600 w-24">Статус</th>
                    <th className="text-center py-2.5 px-4 text-sm font-medium text-gray-600 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {productsData.results.map((product: Product) => (
                    <tr
                      key={product.id}
                      role="link"
                      tabIndex={0}
                      className="border-b hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/catalog/products/${product.id}`)}
                      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/catalog/products/${product.id}`); }}
                    >
                      <td className="py-1.5 px-2">
                        {product.images && product.images.length > 0 ? (
                          <img
                            src={product.images[0]}
                            alt=""
                            className="w-8 h-8 object-contain rounded"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center">
                            <Package className="w-4 h-4 text-gray-300" />
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-sm">{product.name}</td>
                      <td className="py-2.5 px-4 text-sm text-gray-500">{product.brand || '—'}</td>
                      <td className="py-2.5 px-4 text-sm text-gray-500">
                        {product.category_name || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-sm">{product.default_unit}</td>
                      <td className="py-2.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadgeClass(product.status)}`}>
                          {product.status_display}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProduct(product);
                            setIsDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-gray-400" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <FolderOpen className="w-12 h-12 mb-3" />
                <p>Товары не найдены</p>
                {selectedCategoryNode && (
                  <p className="text-sm mt-1">в категории &laquo;{selectedCategoryNode.name}&raquo;</p>
                )}
              </div>
            )}
          </div>

          {/* Пагинация */}
          {productsData && productsData.count > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
              <span className="text-gray-500">
                Показано {productsData.results.length} из {productsData.count}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!productsData.previous}
                >
                  Назад
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!productsData.next}
                >
                  Вперёд
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Диалоги */}
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
