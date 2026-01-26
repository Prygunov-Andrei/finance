import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ContractAmendment, CreateContractAmendmentData } from '../lib/api';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Plus, Loader2, FileText, MoreVertical, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate, formatAmount, formatCurrency } from '../lib/utils';
import { CONSTANTS } from '../constants';

interface ContractAmendmentsTabProps {
  contractId: number;
}

export function ContractAmendmentsTab({ contractId }: ContractAmendmentsTabProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAmendment, setEditingAmendment] = useState<ContractAmendment | null>(null);
  const queryClient = useQueryClient();

  const { data: amendments, isLoading } = useQuery({
    queryKey: ['contract-amendments', contractId],
    queryFn: () => api.getContractAmendments(contractId),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Безопасное преобразование данных
  const amendmentsList = Array.isArray(amendments) ? amendments : (amendments as any)?.results || [];

  const createMutation = useMutation({
    mutationFn: (data: FormData) => api.createContractAmendment(contractId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-amendments', contractId] });
      queryClient.invalidateQueries({ queryKey: ['contract', contractId] });
      setIsDialogOpen(false);
      toast.success('Дополнительное соглашение создано');
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error?.message || 'Не удалось создать дополнительное соглашение'}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteContractAmendment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-amendments', contractId] });
      toast.success('Дополнительное соглашение удалено');
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error?.message || 'Не удалось удалить'}`);
    },
  });

  const handleDelete = (amendment: ContractAmendment) => {
    if (confirm(`Удалить дополнительное соглашение "${amendment.number}"?`)) {
      deleteMutation.mutate(amendment.id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Дополнительные соглашения</h3>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Добавить соглашение
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Новое дополнительное соглашение</DialogTitle>
            </DialogHeader>
            <AmendmentForm
              contractId={contractId}
              onSubmit={(data) => createMutation.mutate(data)}
              isLoading={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {!amendmentsList || amendmentsList.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">Нет дополнительных соглашений</p>
          <Button onClick={() => setIsDialogOpen(true)} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Добавить первое соглашение
          </Button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Номер
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Дата
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Причина
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Изменения
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {amendmentsList.map((amendment) => (
                  <tr key={amendment.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="text-sm font-medium text-gray-900">{amendment.number}</div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="text-xs text-gray-500">{formatDate(amendment.date)}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-sm text-gray-600 max-w-xs truncate">{amendment.reason}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-xs text-gray-500 space-y-1">
                        {amendment.new_start_date && (
                          <div>Начало: {formatDate(amendment.new_start_date)}</div>
                        )}
                        {amendment.new_end_date && (
                          <div>Окончание: {formatDate(amendment.new_end_date)}</div>
                        )}
                        {amendment.new_total_amount && (
                          <div>Сумма: {formatAmount(amendment.new_total_amount)} ₽</div>
                        )}
                        {!amendment.new_start_date && !amendment.new_end_date && !amendment.new_total_amount && (
                          <span className="text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          {amendment.file && (
                            <DropdownMenuItem asChild>
                              <a href={amendment.file} target="_blank" rel="noopener noreferrer">
                                <Download className="w-4 h-4 mr-2" />
                                Скачать файл
                              </a>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => handleDelete(amendment)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Удалить
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

interface AmendmentFormProps {
  contractId: number;
  onSubmit: (data: FormData) => void;
  isLoading: boolean;
}

function AmendmentForm({ contractId, onSubmit, isLoading }: AmendmentFormProps) {
  const [formData, setFormData] = useState({
    number: '',
    date: new Date().toISOString().split('T')[0],
    reason: '',
    new_start_date: '',
    new_end_date: '',
    new_total_amount: '',
  });
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.number || !formData.date || !formData.reason) {
      toast.error('Заполните обязательные поля');
      return;
    }

    const formDataToSubmit = new FormData();
    formDataToSubmit.append('number', formData.number);
    formDataToSubmit.append('date', formData.date);
    formDataToSubmit.append('reason', formData.reason);
    
    if (formData.new_start_date) {
      formDataToSubmit.append('new_start_date', formData.new_start_date);
    }
    if (formData.new_end_date) {
      formDataToSubmit.append('new_end_date', formData.new_end_date);
    }
    if (formData.new_total_amount) {
      formDataToSubmit.append('new_total_amount', formData.new_total_amount);
    }
    if (file) {
      formDataToSubmit.append('file', file);
    }

    onSubmit(formDataToSubmit);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
        <strong>Внимание:</strong> При указании новых значений для дат или суммы они автоматически обновят договор.
      </div>

      <div>
        <Label htmlFor="number">
          Номер соглашения <span className="text-red-500">*</span>
        </Label>
        <Input
          id="number"
          value={formData.number}
          onChange={(e) => setFormData({ ...formData, number: e.target.value })}
          placeholder="ДС-001"
          disabled={isLoading}
          className="mt-1.5"
          required
        />
      </div>

      <div>
        <Label htmlFor="date">
          Дата подписания <span className="text-red-500">*</span>
        </Label>
        <Input
          id="date"
          type="date"
          value={formData.date}
          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          disabled={isLoading}
          className="mt-1.5"
          required
        />
      </div>

      <div>
        <Label htmlFor="reason">
          Причина изменений <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id="reason"
          value={formData.reason}
          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
          placeholder="Опишите причину внесения изменений..."
          disabled={isLoading}
          className="mt-1.5"
          rows={3}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="new_start_date">Новая дата начала</Label>
          <Input
            id="new_start_date"
            type="date"
            value={formData.new_start_date}
            onChange={(e) => setFormData({ ...formData, new_start_date: e.target.value })}
            disabled={isLoading}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="new_end_date">Новая дата окончания</Label>
          <Input
            id="new_end_date"
            type="date"
            value={formData.new_end_date}
            onChange={(e) => setFormData({ ...formData, new_end_date: e.target.value })}
            disabled={isLoading}
            className="mt-1.5"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="new_total_amount">Новая сумма договора</Label>
        <Input
          id="new_total_amount"
          type="number"
          step="0.01"
          value={formData.new_total_amount}
          onChange={(e) => setFormData({ ...formData, new_total_amount: e.target.value })}
          placeholder="0.00"
          disabled={isLoading}
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="file">Скан документа</Label>
        <Input
          id="file"
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          accept=".pdf,.jpg,.jpeg,.png"
          disabled={isLoading}
          className="mt-1.5"
        />
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Создание...
            </>
          ) : (
            'Создать'
          )}
        </Button>
      </div>
    </form>
  );
}