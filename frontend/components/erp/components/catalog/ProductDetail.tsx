import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { formatDate, formatAmount } from '../../lib/utils';
import { CONSTANTS } from '../../constants';
import { useCatalogCategories } from '../../hooks';
import { Product, ProductAlias } from '../../types/catalog';
import { SupplierProduct, SupplierStock } from '../../types/supplier';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { Dialog, DialogContent } from '../ui/dialog';
import {
  ArrowLeft, CheckCircle, Archive, Edit, ChevronLeft, ChevronRight,
  ExternalLink, FileText, Package, Warehouse,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { PriceHistoryTable } from './PriceHistoryTable';

type Tab = 'info' | 'aliases' | 'prices' | 'suppliers';

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

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

  // Загрузка предложений поставщиков
  const { data: supplierProducts, isLoading: suppliersLoading } = useQuery({
    queryKey: ['supplier-products', { product: id }],
    queryFn: () => api.getSupplierProducts(`product=${id}`),
    enabled: !!id && activeTab === 'suppliers',
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

  const hasImages = product.images && product.images.length > 0;
  const hasTechSpecs = product.tech_specs && Object.keys(product.tech_specs).length > 0;
  const hasDocs = product.booklet_url || product.manual_url;

  const openGallery = (index: number) => {
    setGalleryIndex(index);
    setGalleryOpen(true);
  };

  const supplierList = supplierProducts?.results || supplierProducts || [];

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
              {product.brand && <div>Бренд: {product.brand}</div>}
              {product.series && <div>Серия: {product.series}</div>}
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
                onClick={() => setIsArchiveDialogOpen(true)}
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
          {([
            { key: 'info' as Tab, label: 'Информация' },
            { key: 'aliases' as Tab, label: `Синонимы (${product.aliases_count})` },
            { key: 'prices' as Tab, label: 'История цен' },
            { key: 'suppliers' as Tab, label: 'Поставщики' },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 border-b-2 transition ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gray-50 p-6">
        {activeTab === 'info' && (
          <div className="max-w-4xl space-y-6">
            {/* Галерея изображений */}
            {hasImages && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg mb-4">Изображения</h3>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {product.images.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`${product.name} — фото ${i + 1}`}
                      className="h-32 w-32 object-contain rounded border cursor-pointer hover:ring-2 hover:ring-blue-400 transition flex-shrink-0"
                      loading="lazy"
                      onClick={() => openGallery(i)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Основная информация */}
            <div className="bg-white rounded-lg shadow p-6 space-y-6">
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

              <div className="grid grid-cols-2 gap-6">
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
                {product.brand && (
                  <div>
                    <Label>Бренд</Label>
                    <div className="mt-1.5 text-gray-900">{product.brand}</div>
                  </div>
                )}
                {product.series && (
                  <div>
                    <Label>Серия</Label>
                    <div className="mt-1.5 text-gray-900">{product.series}</div>
                  </div>
                )}
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

            {/* Описание */}
            {product.description && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg mb-3">Описание</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{product.description}</p>
              </div>
            )}

            {/* Технические характеристики */}
            {hasTechSpecs && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg mb-4">Технические характеристики</h3>
                <table className="w-full">
                  <tbody>
                    {Object.entries(product.tech_specs).map(([key, value]) => (
                      <tr key={key} className="border-b last:border-0">
                        <td className="py-2 pr-4 text-gray-600 font-medium w-1/3">{key}</td>
                        <td className="py-2 text-gray-900">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Документация */}
            {hasDocs && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg mb-4">Документация</h3>
                <div className="flex gap-3">
                  {product.booklet_url && (
                    <a
                      href={product.booklet_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition"
                    >
                      <FileText className="w-4 h-4" />
                      Буклет (PDF)
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {product.manual_url && (
                    <a
                      href={product.manual_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition"
                    >
                      <FileText className="w-4 h-4" />
                      Инструкция (PDF)
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            )}
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

        {activeTab === 'suppliers' && (
          <div className="max-w-6xl">
            {suppliersLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : supplierList.length > 0 ? (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left py-3 px-4">Поставщик</th>
                      <th className="text-left py-3 px-4">НС-код</th>
                      <th className="text-left py-3 px-4">Артикул</th>
                      <th className="text-right py-3 px-4">Закупочная</th>
                      <th className="text-right py-3 px-4">РИЦ</th>
                      <th className="text-right py-3 px-4">Наличие</th>
                      <th className="text-left py-3 px-4">Обновлено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierList.map((sp: SupplierProduct) => (
                      <SupplierProductRow key={sp.id} sp={sp} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow text-center py-12 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Нет предложений от поставщиков</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Диалог архивации */}
      <AlertDialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Архивировать товар?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите архивировать этот товар? Архивированный товар не будет отображаться в каталоге.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                archiveMutation.mutate();
                setIsArchiveDialogOpen(false);
              }}
            >
              Архивировать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Галерея — полноэкранный просмотр */}
      {hasImages && (
        <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
          <DialogContent className="max-w-4xl p-0 bg-black/95 border-0">
            <div className="relative flex items-center justify-center min-h-[60vh]">
              <img
                src={product.images[galleryIndex]}
                alt={`${product.name} — фото ${galleryIndex + 1}`}
                className="max-h-[80vh] max-w-full object-contain"
              />

              {product.images.length > 1 && (
                <>
                  <button
                    onClick={() => setGalleryIndex((prev) => (prev - 1 + product.images.length) % product.images.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={() => setGalleryIndex((prev) => (prev + 1) % product.images.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}

              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
                {galleryIndex + 1} / {product.images.length}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function SupplierProductRow({ sp }: { sp: SupplierProduct }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-b hover:bg-gray-50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="py-3 px-4 font-medium">{sp.brand_name || '—'}</td>
        <td className="py-3 px-4 text-sm text-gray-600">{sp.nc_code || '—'}</td>
        <td className="py-3 px-4 text-sm text-gray-600">{sp.articul || '—'}</td>
        <td className="py-3 px-4 text-right">
          {sp.base_price ? `${formatAmount(sp.base_price)} ${sp.base_price_currency}` : '—'}
        </td>
        <td className="py-3 px-4 text-right">
          {sp.ric_price ? `${formatAmount(sp.ric_price)} ${sp.ric_price_currency}` : '—'}
        </td>
        <td className="py-3 px-4 text-right">
          {sp.total_stock > 0 ? (
            <span className="text-green-700">{sp.total_stock} шт</span>
          ) : (
            <span className="text-gray-400">Нет</span>
          )}
        </td>
        <td className="py-3 px-4 text-sm text-gray-500">
          {sp.price_updated_at ? formatDate(sp.price_updated_at) : '—'}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-600">Название у поставщика:</span>{' '}
                {sp.title}
              </div>
              {sp.series && (
                <div>
                  <span className="font-medium text-gray-600">Серия:</span> {sp.series}
                </div>
              )}
              {sp.category_name && (
                <div>
                  <span className="font-medium text-gray-600">Категория поставщика:</span>{' '}
                  {sp.category_name}
                </div>
              )}
              <div>
                <span className="font-medium text-gray-600">Маркетплейс:</span>{' '}
                {sp.for_marketplace ? 'Да' : 'Нет'}
              </div>
            </div>

            {sp.stocks && sp.stocks.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center gap-1 font-medium text-gray-600 text-sm mb-2">
                  <Warehouse className="w-4 h-4" />
                  Склады:
                </div>
                <div className="flex flex-wrap gap-2">
                  {sp.stocks.map((stock: SupplierStock, i: number) => (
                    <span
                      key={i}
                      className={`px-2 py-1 rounded text-xs ${
                        stock.quantity > 0
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {stock.warehouse_name}: {stock.quantity} шт
                    </span>
                  ))}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
