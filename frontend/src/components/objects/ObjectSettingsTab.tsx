import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { toast } from 'sonner';
import { Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { InviteSection, GeoSettingsSection, SupergroupSection } from './WorkJournalTab';

type ObjectSettingsTabProps = {
  objectId: number;
  objectName: string;
};

export function ObjectSettingsTab({ objectId, objectName }: ObjectSettingsTabProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteConstructionObject(objectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-objects'] });
      toast.success('Объект успешно удалён');
      navigate('/objects');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Ошибка при удалении объекта');
    },
  });

  const handleDelete = () => {
    if (deleteConfirmation !== objectName) return;
    deleteMutation.mutate();
  };

  const handleDeleteDialogChange = (open: boolean) => {
    setIsDeleteDialogOpen(open);
    if (!open) {
      setDeleteConfirmation('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Настройки журнала работ */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Настройки журнала работ</h2>
        <InviteSection objectId={objectId} />
        <GeoSettingsSection objectId={objectId} />
        <SupergroupSection objectId={objectId} />
      </div>

      {/* Опасная зона */}
      <div className="border border-red-200 bg-red-50/50 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-red-900">Опасная зона</h3>
            <p className="text-sm text-red-700 mt-1">
              Удаление объекта необратимо. Все связанные данные будут удалены.
            </p>
            <Button
              variant="outline"
              className="mt-4 border-red-300 text-red-600 hover:bg-red-100 hover:text-red-700"
              onClick={() => setIsDeleteDialogOpen(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Удалить объект
            </Button>
          </div>
        </div>
      </div>

      {/* Диалог подтверждения удаления */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={handleDeleteDialogChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Удаление объекта</DialogTitle>
            <DialogDescription>
              Для подтверждения удаления введите название объекта:{' '}
              <strong className="text-gray-900">{objectName}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              placeholder="Введите название объекта"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              aria-label="Подтверждение названия объекта"
            />
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => handleDeleteDialogChange(false)}
                disabled={deleteMutation.isPending}
              >
                Отмена
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteConfirmation !== objectName || deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Удаление...
                  </>
                ) : (
                  'Удалить'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
