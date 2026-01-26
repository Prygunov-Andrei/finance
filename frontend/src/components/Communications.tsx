import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Correspondence, ContractListItem } from '../lib/api';
import { Loader2, Plus, Search, Filter, ArrowDownCircle, ArrowUpCircle, Download, Edit, Trash2, Link as LinkIcon } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { formatDate, formatAmount, formatCurrency } from '../lib/utils';
import { CONSTANTS } from '../constants';

export function Communications() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedCorrespondence, setSelectedCorrespondence] = useState<Correspondence | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    contract: '',
    type: '',
    category: '',
    status: '',
  });
  
  // Form state
  const [formData, setFormData] = useState({
    contract: '',
    type: 'incoming' as 'incoming' | 'outgoing',
    category: 'уведомление' as 'уведомление' | 'претензия' | 'запрос' | 'ответ' | 'прочее',
    number: '',
    date: '',
    status: 'новое' as 'новое' | 'в работе' | 'отвечено' | 'закрыто',
    subject: '',
    description: '',
    file: null as File | null,
    related_to: '',
  });

  const queryClient = useQueryClient();

  // Загрузка данных
  const { data: correspondence, isLoading: correspondenceLoading } = useQuery({
    queryKey: ['correspondence', filters, searchQuery],
    queryFn: () => api.getCorrespondence({
      contract: filters.contract && filters.contract !== 'all' ? parseInt(filters.contract) : undefined,
      type: filters.type && filters.type !== 'all' ? filters.type as 'incoming' | 'outgoing' : undefined,
      category: filters.category && filters.category !== 'all' ? filters.category : undefined,
      status: filters.status && filters.status !== 'all' ? filters.status : undefined,
      search: searchQuery || undefined,
    }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: contractsData } = useQuery({
    queryKey: ['contracts'],
    queryFn: () => api.getContracts(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const contracts = contractsData?.results || [];

  // Получить список писем для связанного письма (по выбранному договору)
  const { data: relatedCorrespondence } = useQuery({
    queryKey: ['correspondence-for-related', formData.contract],
    queryFn: () => formData.contract ? api.getCorrespondence({ contract: parseInt(formData.contract) }) : Promise.resolve([]),
    enabled: !!formData.contract,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return api.createCorrespondence({
        contract: parseInt(data.contract),
        type: data.type,
        category: data.category,
        number: data.number,
        date: data.date,
        status: data.status,
        subject: data.subject,
        description: data.description || undefined,
        file: data.file || undefined,
        related_to: data.related_to ? parseInt(data.related_to) : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correspondence'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast.success('Письмо успешно создано');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка создания письма: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      return api.updateCorrespondence(id, {
        contract: parseInt(data.contract),
        type: data.type,
        category: data.category,
        number: data.number,
        date: data.date,
        status: data.status,
        subject: data.subject,
        description: data.description || undefined,
        file: data.file || undefined,
        related_to: data.related_to ? parseInt(data.related_to) : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correspondence'] });
      setIsEditDialogOpen(false);
      resetForm();
      toast.success('Письмо успешно обновлено');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка обновления письма: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCorrespondence(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correspondence'] });
      setSelectedCorrespondence(null);
      toast.success('Письмо успешно удалено');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка удаления письма: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!formData.contract || !formData.number || !formData.date || !formData.subject) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    createMutation.mutate(formData);
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!selectedCorrespondence) return;
    
    if (!formData.contract || !formData.number || !formData.date || !formData.subject) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    updateMutation.mutate({ id: selectedCorrespondence.id, data: formData });
  };

  const handleEdit = (corr: Correspondence) => {
    setFormData({
      contract: corr.contract?.toString() || '',
      type: corr.type,
      category: corr.category,
      number: corr.number,
      date: corr.date,
      status: corr.status,
      subject: corr.subject,
      description: corr.description || '',
      file: null,
      related_to: corr.related_to?.toString() || '',
    });
    setSelectedCorrespondence(corr);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('Вы уверены, что хотите удалить это письмо?')) {
      deleteMutation.mutate(id);
    }
  };

  const resetForm = () => {
    setFormData({
      contract: '',
      type: 'incoming',
      category: 'уведомление',
      number: '',
      date: '',
      status: 'новое',
      subject: '',
      description: '',
      file: null,
      related_to: '',
    });
    setSelectedCorrespondence(null);
  };

  const getTypeLabel = (type: string) => {
    return type === 'incoming' ? 'Входящее' : 'Исходящее';
  };

  const getTypeBadge = (type: string) => {
    return type === 'incoming' 
      ? 'bg-blue-100 text-blue-700' 
      : 'bg-green-100 text-green-700';
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'уведомление': return 'bg-gray-100 text-gray-700';
      case 'претензия': return 'bg-red-100 text-red-700';
      case 'запрос': return 'bg-blue-100 text-blue-700';
      case 'ответ': return 'bg-green-100 text-green-700';
      case 'прочее': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'новое': return 'bg-yellow-100 text-yellow-700';
      case 'в работе': return 'bg-blue-100 text-blue-700';
      case 'отвечено': return 'bg-green-100 text-green-700';
      case 'закрыто': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (correspondenceLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl mb-1">Переписка</h1>
          <p className="text-gray-500 text-sm">Управление корреспонденцией · Всего: {correspondence?.length || 0}</p>
        </div>
        <Button 
          onClick={() => {
            resetForm();
            setIsCreateDialogOpen(true);
          }} 
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Создать письмо
        </Button>
      </div>

      {/* Фильтры */}
      <Card className="p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-500" />
          <h3 className="text-sm">Фильтры</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
            <Label className="text-xs text-gray-600">Договор</Label>
            <Select
              value={filters.contract}
              onValueChange={(value) => setFilters({ ...filters, contract: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Все" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                {contracts?.results?.map((contract) => (
                  <SelectItem key={contract.id} value={contract.id.toString()}>
                    {contract.number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-gray-600">Тип</Label>
            <Select
              value={filters.type}
              onValueChange={(value) => setFilters({ ...filters, type: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Все" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="incoming">Входящее</SelectItem>
                <SelectItem value="outgoing">Исходящее</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-gray-600">Категория</Label>
            <Select
              value={filters.category}
              onValueChange={(value) => setFilters({ ...filters, category: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Все" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="уведомление">Уведомление</SelectItem>
                <SelectItem value="претензия">Претензия</SelectItem>
                <SelectItem value="запрос">Запрос</SelectItem>
                <SelectItem value="ответ">Ответ</SelectItem>
                <SelectItem value="прочее">Прочее</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-gray-600">Статус</Label>
            <Select
              value={filters.status}
              onValueChange={(value) => setFilters({ ...filters, status: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Все" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="новое">Новое</SelectItem>
                <SelectItem value="в работе">В работе</SelectItem>
                <SelectItem value="отвечено">Отвечено</SelectItem>
                <SelectItem value="закрыто">Закрыто</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-gray-600">Поиск</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Поиск..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </div>

        {(filters.contract || filters.type || filters.category || filters.status || searchQuery) && (
          <div className="mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilters({
                  contract: '',
                  type: '',
                  category: '',
                  status: '',
                });
                setSearchQuery('');
              }}
            >
              Сбросить фильтры
            </Button>
          </div>
        )}
      </Card>

      {/* Таблица */}
      <Card className="p-6">
        {!correspondence || correspondence.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Писем не найдено. Создайте первое письмо.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Дата</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Номер</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Тип</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Категория</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Договор</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Тема</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Статус</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Действия</th>
                </tr>
              </thead>
              <tbody>
                {correspondence.map((corr) => (
                  <tr 
                    key={corr.id} 
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedCorrespondence(corr)}
                  >
                    <td className="py-3 px-4 text-sm text-gray-600">{formatDate(corr.date)}</td>
                    <td className="py-3 px-4 text-sm font-medium">{corr.number}</td>
                    <td className="py-3 px-4 text-sm">
                      <Badge className={getTypeBadge(corr.type)}>
                        {corr.type === 'incoming' ? (
                          <ArrowDownCircle className="w-3 h-3 mr-1 inline" />
                        ) : (
                          <ArrowUpCircle className="w-3 h-3 mr-1 inline" />
                        )}
                        {getTypeLabel(corr.type)}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <Badge className={getCategoryBadge(corr.category)}>
                        {corr.category}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <div>
                        <div className="font-medium">{corr.contract_name}</div>
                        <div className="text-xs text-gray-500">{corr.contract_number}</div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{corr.subject}</td>
                    <td className="py-3 px-4 text-sm">
                      <Badge className={getStatusBadge(corr.status)}>
                        {corr.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-sm text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(corr);
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(corr.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold mb-4">Новое письмо</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Создание нового письма в переписке
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="contract">Договор *</Label>
              <Select 
                value={formData.contract} 
                onValueChange={(value) => setFormData({ ...formData, contract: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите договор" />
                </SelectTrigger>
                <SelectContent>
                  {contracts?.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id.toString()}>
                      {contract.number} - {contract.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="type">Тип *</Label>
              <Select 
                value={formData.type} 
                onValueChange={(value: 'incoming' | 'outgoing') => setFormData({ ...formData, type: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="incoming">Входящее</SelectItem>
                  <SelectItem value="outgoing">Исходящее</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="category">Категория *</Label>
              <Select 
                value={formData.category}
                onValueChange={(value: any) => setFormData({ ...formData, category: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="уведомление">Уведомление</SelectItem>
                  <SelectItem value="претензия">Претензия</SelectItem>
                  <SelectItem value="запрос">Запрос</SelectItem>
                  <SelectItem value="ответ">Ответ</SelectItem>
                  <SelectItem value="прочее">Прочее</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="number">Номер *</Label>
              <Input
                id="number"
                type="text"
                placeholder="№123/2024"
                value={formData.number}
                onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="date">Дата *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="subject">Тема *</Label>
              <Input
                id="subject"
                type="text"
                placeholder="Тема письма"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Описание</Label>
              <Textarea
                id="description"
                placeholder="Описание письма"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="status">Статус</Label>
              <Select 
                value={formData.status}
                onValueChange={(value: any) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="новое">Новое</SelectItem>
                  <SelectItem value="в работе">В работе</SelectItem>
                  <SelectItem value="отвечено">Отвечено</SelectItem>
                  <SelectItem value="закрыто">Закрыто</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="related_to">Связанное письмо (опционально)</Label>
              <Select 
                value={formData.related_to || 'none'}
                onValueChange={(value) => setFormData({ ...formData, related_to: value === 'none' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Не связано" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не связано</SelectItem>
                  {relatedCorrespondence?.filter(c => c.id !== selectedCorrespondence?.id).map((corr) => (
                    <SelectItem key={corr.id} value={corr.id.toString()}>
                      {corr.number} - {corr.subject}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="file">Файл</Label>
              <Input
                id="file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setFormData({ ...formData, file });
                }}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={createMutation.isPending} className="flex-1">
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Создание...
                  </>
                ) : (
                  'Создать'
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                className="flex-1"
              >
                Отмена
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold mb-4">Редактировать письмо</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Изменение данных письма
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <Label htmlFor="edit-contract">Договор *</Label>
              <Select 
                value={formData.contract} 
                onValueChange={(value) => setFormData({ ...formData, contract: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите договор" />
                </SelectTrigger>
                <SelectContent>
                  {contracts?.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id.toString()}>
                      {contract.number} - {contract.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit-type">Тип *</Label>
              <Select 
                value={formData.type} 
                onValueChange={(value: 'incoming' | 'outgoing') => setFormData({ ...formData, type: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="incoming">Входящее</SelectItem>
                  <SelectItem value="outgoing">Исходящее</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit-category">Категория *</Label>
              <Select 
                value={formData.category}
                onValueChange={(value: any) => setFormData({ ...formData, category: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="уведомление">Уведомление</SelectItem>
                  <SelectItem value="претензия">Претензия</SelectItem>
                  <SelectItem value="запрос">Запрос</SelectItem>
                  <SelectItem value="ответ">Ответ</SelectItem>
                  <SelectItem value="прочее">Прочее</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit-number">Номер *</Label>
              <Input
                id="edit-number"
                type="text"
                placeholder="№123/2024"
                value={formData.number}
                onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="edit-date">Дата *</Label>
              <Input
                id="edit-date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="edit-subject">Тема *</Label>
              <Input
                id="edit-subject"
                type="text"
                placeholder="Тема письма"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="edit-description">Описание</Label>
              <Textarea
                id="edit-description"
                placeholder="Описание письма"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="edit-status">Статус</Label>
              <Select 
                value={formData.status}
                onValueChange={(value: any) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="новое">Новое</SelectItem>
                  <SelectItem value="в работе">В работе</SelectItem>
                  <SelectItem value="отвечено">Отвечено</SelectItem>
                  <SelectItem value="закрыто">Закрыто</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit-related_to">Связанное письмо (опционально)</Label>
              <Select 
                value={formData.related_to || 'none'}
                onValueChange={(value) => setFormData({ ...formData, related_to: value === 'none' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Не связано" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не связано</SelectItem>
                  {relatedCorrespondence?.filter(c => c.id !== selectedCorrespondence?.id).map((corr) => (
                    <SelectItem key={corr.id} value={corr.id.toString()}>
                      {corr.number} - {corr.subject}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit-file">Файл</Label>
              <Input
                id="edit-file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setFormData({ ...formData, file });
                }}
              />
              {selectedCorrespondence?.file && (
                <p className="text-xs text-gray-500 mt-1">
                  Текущий файл: <a href={selectedCorrespondence.file} target="_blank" className="text-blue-500 underline">Скачать</a>
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={updateMutation.isPending} className="flex-1">
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  'Сохранить'
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  resetForm();
                }}
                className="flex-1"
              >
                Отмена
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      {selectedCorrespondence && !isEditDialogOpen && (
        <Dialog open={!!selectedCorrespondence} onOpenChange={() => setSelectedCorrespondence(null)}>
          <DialogContent className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold mb-4">Детали письма</DialogTitle>
              <DialogDescription className="text-sm text-gray-500">
                Подробная информация о письме
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Дата</p>
                  <p className="font-medium">{formatDate(selectedCorrespondence.date)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Номер</p>
                  <p className="font-medium">{selectedCorrespondence.number}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Тип</p>
                  <Badge className={getTypeBadge(selectedCorrespondence.type)}>
                    {selectedCorrespondence.type === 'incoming' ? (
                      <ArrowDownCircle className="w-3 h-3 mr-1 inline" />
                    ) : (
                      <ArrowUpCircle className="w-3 h-3 mr-1 inline" />
                    )}
                    {getTypeLabel(selectedCorrespondence.type)}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Категория</p>
                  <Badge className={getCategoryBadge(selectedCorrespondence.category)}>
                    {selectedCorrespondence.category}
                  </Badge>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-500">Договор</p>
                  <p className="font-medium">{selectedCorrespondence.contract_name}</p>
                  <p className="text-xs text-gray-500">{selectedCorrespondence.contract_number}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-500">Статус</p>
                  <Badge className={getStatusBadge(selectedCorrespondence.status)}>
                    {selectedCorrespondence.status}
                  </Badge>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-xs text-gray-500 mb-1">Тема</p>
                <p className="font-medium">{selectedCorrespondence.subject}</p>
              </div>

              {selectedCorrespondence.description && (
                <div className="border-t pt-4">
                  <p className="text-xs text-gray-500 mb-1">Описание</p>
                  <p className="text-sm whitespace-pre-wrap">{selectedCorrespondence.description}</p>
                </div>
              )}

              {selectedCorrespondence.related_to && (
                <div className="border-t pt-4">
                  <p className="text-xs text-gray-500 mb-2">Связанное письмо</p>
                  <div className="flex items-center gap-2">
                    <LinkIcon className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium">{selectedCorrespondence.related_to_number}</span>
                  </div>
                </div>
              )}

              {selectedCorrespondence.file && (
                <div className="border-t pt-4">
                  <p className="text-xs text-gray-500 mb-2">Файл</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(selectedCorrespondence.file, '_blank')}
                    className="flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Скачать файл
                  </Button>
                </div>
              )}

              <div className="border-t pt-4 text-xs text-gray-500">
                <p>Создано: {formatDate(selectedCorrespondence.created_at)}</p>
                <p>Обновлено: {formatDate(selectedCorrespondence.updated_at)}</p>
              </div>
            </div>

            <div className="flex justify-between mt-6">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    handleEdit(selectedCorrespondence);
                  }}
                  className="flex items-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Редактировать
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleDelete(selectedCorrespondence.id)}
                  className="flex items-center gap-2 text-red-500 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                  Удалить
                </Button>
              </div>
              <Button variant="outline" onClick={() => setSelectedCorrespondence(null)}>
                Закрыть
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}