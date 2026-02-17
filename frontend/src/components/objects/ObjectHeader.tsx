import { useState, useRef, useEffect, useCallback } from 'react';
import { api, ConstructionObject } from '../../lib/api';
import { formatDate, formatDateTime, getStatusBadgeClass, getStatusLabel, cn } from '../../lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Building2, MapPin, Calendar, Pencil, Loader2, Check, X, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../ui/badge';

type ObjectHeaderProps = {
  object: ConstructionObject;
  objectId: number;
};

const STATUS_OPTIONS = [
  { value: 'planned', label: 'Планируется' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'completed', label: 'Завершён' },
  { value: 'suspended', label: 'Приостановлен' },
] as const;

type EditingField = 'name' | 'address' | 'description' | null;
type SaveState = Record<string, 'idle' | 'saving' | 'saved'>;

export function ObjectHeader({ object, objectId }: ObjectHeaderProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingField, setEditingField] = useState<EditingField>(null);
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({
    name: object.name,
    address: object.address,
    description: object.description || '',
  });
  const [saveStates, setSaveStates] = useState<SaveState>({});

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [pendingDateField, setPendingDateField] = useState<'start_date' | 'end_date' | null>(null);
  const [pendingDateValue, setPendingDateValue] = useState<string>('');

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  useEffect(() => {
    setEditValues({
      name: object.name,
      address: object.address,
      description: object.description || '',
    });
  }, [object.name, object.address, object.description]);

  const invalidateObject = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['construction-object', objectId] });
    queryClient.invalidateQueries({ queryKey: ['construction-objects'] });
  }, [queryClient, objectId]);

  const fieldMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.updateConstructionObject(objectId, data as any),
    onSuccess: () => {
      invalidateObject();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Ошибка при сохранении');
    },
  });

  const photoMutation = useMutation({
    mutationFn: (file: File) => api.uploadObjectPhoto(objectId, file),
    onSuccess: () => {
      invalidateObject();
      toast.success('Фото обновлено');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Ошибка загрузки фото');
    },
    onSettled: () => {
      setIsUploadingPhoto(false);
    },
  });

  const showSavedBriefly = (field: string) => {
    setSaveStates((prev) => ({ ...prev, [field]: 'saved' }));
    setTimeout(() => {
      setSaveStates((prev) => ({ ...prev, [field]: 'idle' }));
    }, 1500);
  };

  const saveField = async (field: EditingField, value: string) => {
    if (!field) return;

    const originalValue =
      field === 'name'
        ? object.name
        : field === 'address'
          ? object.address
          : object.description || '';

    if (value.trim() === originalValue.trim()) {
      setEditingField(null);
      return;
    }

    if (field === 'name' && !value.trim()) {
      toast.error('Название не может быть пустым');
      setEditValues((prev) => ({ ...prev, name: object.name }));
      setEditingField(null);
      return;
    }

    setSaveStates((prev) => ({ ...prev, [field]: 'saving' }));
    setEditingField(null);

    try {
      await fieldMutation.mutateAsync({ [field]: value.trim() });
      showSavedBriefly(field);
    } catch {
      setEditValues((prev) => ({ ...prev, [field]: originalValue }));
      setSaveStates((prev) => ({ ...prev, [field]: 'idle' }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, field: EditingField) => {
    if (e.key === 'Enter' && field !== 'description') {
      e.preventDefault();
      saveField(field, editValues[field!]);
    }
    if (e.key === 'Escape') {
      setEditValues((prev) => ({
        ...prev,
        [field!]:
          field === 'name'
            ? object.name
            : field === 'address'
              ? object.address
              : object.description || '',
      }));
      setEditingField(null);
    }
  };

  const handleStatusSelect = (newStatus: string) => {
    if (newStatus === object.status) return;
    setPendingStatus(newStatus);
    setStatusDialogOpen(true);
  };

  const confirmStatusChange = async () => {
    if (!pendingStatus) return;
    setStatusDialogOpen(false);
    setSaveStates((prev) => ({ ...prev, status: 'saving' }));
    try {
      await fieldMutation.mutateAsync({ status: pendingStatus });
      showSavedBriefly('status');
      toast.success('Статус изменён');
    } catch {
      setSaveStates((prev) => ({ ...prev, status: 'idle' }));
    }
    setPendingStatus(null);
  };

  const handleDateClick = (field: 'start_date' | 'end_date') => {
    const current = object[field];
    setPendingDateField(field);
    setPendingDateValue(current ? new Date(current).toISOString().split('T')[0] : '');
    setDateDialogOpen(true);
  };

  const confirmDateChange = async () => {
    if (!pendingDateField) return;
    setDateDialogOpen(false);
    setSaveStates((prev) => ({ ...prev, [pendingDateField!]: 'saving' }));
    try {
      await fieldMutation.mutateAsync({
        [pendingDateField]: pendingDateValue || null,
      });
      showSavedBriefly(pendingDateField);
      toast.success('Дата обновлена');
    } catch {
      setSaveStates((prev) => ({ ...prev, [pendingDateField!]: 'idle' }));
    }
    setPendingDateField(null);
    setPendingDateValue('');
  };

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPhoto(true);
    photoMutation.mutate(file);
    e.target.value = '';
  };

  const renderFieldIndicator = (field: string) => {
    const state = saveStates[field];
    if (state === 'saving') {
      return <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 flex-shrink-0" />;
    }
    if (state === 'saved') {
      return <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />;
    }
    return null;
  };

  const dateLabel = (field: 'start_date' | 'end_date') =>
    field === 'start_date' ? 'Дата начала' : 'Дата окончания';

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-start gap-5">
          {/* Avatar / Photo */}
          <button
            type="button"
            onClick={handlePhotoClick}
            className="relative group w-20 h-20 rounded-full overflow-hidden flex-shrink-0 border-2 border-gray-200 hover:border-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label="Загрузить фото объекта"
          >
            {object.photo ? (
              <img
                src={object.photo}
                alt={object.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-blue-100 flex items-center justify-center">
                <Building2 className="w-9 h-9 text-blue-600" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              {isUploadingPhoto ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : (
                <Camera className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
          />

          {/* Main info */}
          <div className="flex-1 min-w-0">
            {/* Name */}
            <div
              className="flex items-center gap-2 mb-1"
              onMouseEnter={() => setHoveredField('name')}
              onMouseLeave={() => setHoveredField(null)}
            >
              {editingField === 'name' ? (
                <Input
                  autoFocus
                  value={editValues.name}
                  onChange={(e) =>
                    setEditValues((prev) => ({ ...prev, name: e.target.value }))
                  }
                  onBlur={() => saveField('name', editValues.name)}
                  onKeyDown={(e) => handleKeyDown(e, 'name')}
                  className="text-2xl font-semibold h-auto py-1 px-2 -ml-2"
                />
              ) : (
                <h1
                  className="text-2xl font-semibold text-gray-900 cursor-pointer hover:text-blue-700 transition-colors truncate"
                  onClick={() => setEditingField('name')}
                >
                  {object.name}
                </h1>
              )}
              {editingField !== 'name' && hoveredField === 'name' && (
                <Pencil
                  className="w-4 h-4 text-gray-400 cursor-pointer flex-shrink-0"
                  onClick={() => setEditingField('name')}
                />
              )}
              {renderFieldIndicator('name')}
            </div>

            {/* Address */}
            <div
              className="flex items-center gap-2 mb-2"
              onMouseEnter={() => setHoveredField('address')}
              onMouseLeave={() => setHoveredField(null)}
            >
              <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
              {editingField === 'address' ? (
                <Input
                  autoFocus
                  value={editValues.address}
                  onChange={(e) =>
                    setEditValues((prev) => ({ ...prev, address: e.target.value }))
                  }
                  onBlur={() => saveField('address', editValues.address)}
                  onKeyDown={(e) => handleKeyDown(e, 'address')}
                  className="text-sm h-auto py-1 px-2"
                />
              ) : (
                <span
                  className="text-sm text-gray-600 cursor-pointer hover:text-blue-600 transition-colors truncate"
                  onClick={() => setEditingField('address')}
                >
                  {object.address || 'Добавить адрес'}
                </span>
              )}
              {editingField !== 'address' && hoveredField === 'address' && (
                <Pencil
                  className="w-3.5 h-3.5 text-gray-400 cursor-pointer flex-shrink-0"
                  onClick={() => setEditingField('address')}
                />
              )}
              {renderFieldIndicator('address')}
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              <Select
                value={object.status}
                onValueChange={handleStatusSelect}
              >
                <SelectTrigger className="w-auto h-auto border-0 p-0 shadow-none focus:ring-0">
                  <Badge
                    className={cn(
                      'cursor-pointer text-sm font-medium px-3 py-1',
                      getStatusBadgeClass(object.status)
                    )}
                  >
                    {getStatusLabel(object.status)}
                  </Badge>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            'w-2 h-2 rounded-full',
                            opt.value === 'planned' && 'bg-purple-500',
                            opt.value === 'in_progress' && 'bg-blue-500',
                            opt.value === 'completed' && 'bg-green-500',
                            opt.value === 'suspended' && 'bg-orange-500'
                          )}
                        />
                        {opt.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {renderFieldIndicator('status')}
            </div>
          </div>
        </div>

        {/* Description */}
        <div
          className="mt-4 pt-4 border-t border-gray-100"
          onMouseEnter={() => setHoveredField('description')}
          onMouseLeave={() => setHoveredField(null)}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Описание
            </span>
            {editingField !== 'description' && hoveredField === 'description' && (
              <Pencil
                className="w-3 h-3 text-gray-400 cursor-pointer"
                onClick={() => setEditingField('description')}
              />
            )}
            {renderFieldIndicator('description')}
          </div>
          {editingField === 'description' ? (
            <div className="space-y-2">
              <Textarea
                autoFocus
                rows={3}
                value={editValues.description}
                onChange={(e) =>
                  setEditValues((prev) => ({ ...prev, description: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setEditValues((prev) => ({
                      ...prev,
                      description: object.description || '',
                    }));
                    setEditingField(null);
                  }
                }}
                className="text-sm"
                placeholder="Описание объекта..."
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => saveField('description', editValues.description)}
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  Сохранить
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditValues((prev) => ({
                      ...prev,
                      description: object.description || '',
                    }));
                    setEditingField(null);
                  }}
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  Отмена
                </Button>
              </div>
            </div>
          ) : (
            <p
              className="text-sm text-gray-700 cursor-pointer hover:text-blue-600 transition-colors whitespace-pre-wrap"
              onClick={() => setEditingField('description')}
            >
              {object.description || (
                <span className="text-gray-400 italic">Нажмите, чтобы добавить описание</span>
              )}
            </p>
          )}
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-4 pt-4 border-t border-gray-100">
          {/* Start date — editable */}
          <div
            className="group cursor-pointer"
            onClick={() => handleDateClick('start_date')}
          >
            <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              Дата начала
              <Pencil className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                {formatDate(object.start_date)}
              </span>
              {renderFieldIndicator('start_date')}
            </div>
          </div>

          {/* End date — editable */}
          <div
            className="group cursor-pointer"
            onClick={() => handleDateClick('end_date')}
          >
            <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              Дата окончания
              <Pencil className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                {formatDate(object.end_date)}
              </span>
              {renderFieldIndicator('end_date')}
            </div>
          </div>

          {/* Contracts count — read-only */}
          <div>
            <div className="text-xs text-gray-500 mb-1">Договоров</div>
            <div className="text-sm font-medium text-gray-900">
              {object.contracts_count ?? 0}
            </div>
          </div>

          {/* Created at — read-only */}
          <div>
            <div className="text-xs text-gray-500 mb-1">Создан</div>
            <div className="text-sm font-medium text-gray-900">
              {formatDateTime(object.created_at)}
            </div>
          </div>

          {/* Updated at — read-only */}
          <div>
            <div className="text-xs text-gray-500 mb-1">Обновлён</div>
            <div className="text-sm font-medium text-gray-900">
              {formatDateTime(object.updated_at)}
            </div>
          </div>
        </div>
      </div>

      {/* Status change confirmation dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Смена статуса</DialogTitle>
            <DialogDescription>
              Вы действительно хотите сменить статус с «
              {getStatusLabel(object.status)}» на «
              {pendingStatus ? getStatusLabel(pendingStatus) : ''}»?
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 py-3">
            <Badge className={cn('text-sm', getStatusBadgeClass(object.status))}>
              {getStatusLabel(object.status)}
            </Badge>
            <span className="text-gray-400">&rarr;</span>
            {pendingStatus && (
              <Badge className={cn('text-sm', getStatusBadgeClass(pendingStatus))}>
                {getStatusLabel(pendingStatus)}
              </Badge>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setStatusDialogOpen(false);
                setPendingStatus(null);
              }}
            >
              Отмена
            </Button>
            <Button onClick={confirmStatusChange} disabled={fieldMutation.isPending}>
              {fieldMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Сохранение...
                </>
              ) : (
                'Подтвердить'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Date change confirmation dialog */}
      <Dialog open={dateDialogOpen} onOpenChange={setDateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Изменение даты</DialogTitle>
            <DialogDescription>
              Укажите новое значение для поля «
              {pendingDateField ? dateLabel(pendingDateField) : ''}».
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <Input
              type="date"
              value={pendingDateValue}
              onChange={(e) => setPendingDateValue(e.target.value)}
              className="w-full"
            />
            {pendingDateField && object[pendingDateField] && (
              <p className="text-xs text-gray-500 mt-2">
                Текущее значение: {formatDate(object[pendingDateField])}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setDateDialogOpen(false);
                setPendingDateField(null);
                setPendingDateValue('');
              }}
            >
              Отмена
            </Button>
            <Button onClick={confirmDateChange} disabled={fieldMutation.isPending}>
              {fieldMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Сохранение...
                </>
              ) : (
                'Подтвердить'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
