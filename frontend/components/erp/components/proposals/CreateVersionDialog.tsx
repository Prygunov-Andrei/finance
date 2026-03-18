import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Alert, AlertDescription } from '../ui/alert';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';

interface CreateVersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: number;
  itemType: 'tkp' | 'mp';
  currentDate: string;
  currentVersionNumber: number;
}

export function CreateVersionDialog({ 
  open, 
  onOpenChange, 
  itemId, 
  itemType,
  currentDate,
  currentVersionNumber 
}: CreateVersionDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(currentDate);

  // Мутация для создания версии
  const createVersionMutation = useMutation({
    mutationFn: async () => {
      const data = selectedDate !== currentDate ? { date: selectedDate } : {};
      
      if (itemType === 'tkp') {
        return api.createTechnicalProposalVersion(itemId, data);
      } else {
        return api.createMountingProposalVersion(itemId, data);
      }
    },
    onSuccess: (data) => {
      // Инвалидация кэша
      if (itemType === 'tkp') {
        queryClient.invalidateQueries({ queryKey: ['technical-proposals'] });
        queryClient.invalidateQueries({ queryKey: ['technical-proposal', itemId.toString()] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['mounting-proposals'] });
        queryClient.invalidateQueries({ queryKey: ['mounting-proposal', itemId.toString()] });
      }
      
      toast.success(`Версия создана. Номер: ${data.number}`);
      onOpenChange(false);
      
      // Перенаправление на страницу новой версии
      if (itemType === 'tkp') {
        navigate(`/proposals/technical-proposals/${data.id}`);
      } else {
        navigate(`/proposals/mounting-proposals/${data.id}`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createVersionMutation.mutate();
  };

  const handleClose = () => {
    setSelectedDate(currentDate);
    onOpenChange(false);
  };

  const itemLabel = itemType === 'tkp' ? 'ТКП' : 'МП';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Создать новую версию {itemLabel}</DialogTitle>
          <DialogDescription>
            Новая версия наследует все данные (кроме файлов сметы)
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Информационный блок */}
          <Alert className="bg-blue-50 border-blue-200">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-sm text-blue-900">
              <p className="font-medium mb-2">Как работает нумерация версий:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Если дата изменилась — будет присвоен новый порядковый номер</li>
                <li>Если дата та же — к номеру добавится суффикс версии (-v2, -v3 и т.д.)</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* Текущая версия */}
          <div className="bg-gray-50 p-3 rounded-md">
            <p className="text-sm text-gray-600">Текущая версия: <span className="font-medium text-gray-900">v{currentVersionNumber}</span></p>
            <p className="text-sm text-gray-600">Новая версия будет: <span className="font-medium text-gray-900">v{currentVersionNumber + 1}</span></p>
          </div>

          {/* Поле выбора даты */}
          <div>
            <Label htmlFor="version-date">Дата новой версии</Label>
            <input
              id="version-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-md mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Оставьте без изменений для создания версии с той же датой
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={createVersionMutation.isPending}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={createVersionMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {createVersionMutation.isPending ? 'Создание...' : 'Создать версию'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
