import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Pencil,
  Save,
  X,
  Trash2,
  Copy,
  FileText,
  Send,
  Calendar,
  Building2,
  User,
  Clock,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { api, MountingProposalDetail as MPDetailType } from '../../lib/api';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { toast } from 'sonner';
import { CreateVersionDialog } from './CreateVersionDialog';
import { formatDate, formatDateTime, formatCurrency, getStatusBadgeClass, getStatusLabel } from '../../lib/utils';
import { useCounterparties } from '../../hooks';
import { CONSTANTS } from '../../constants';

type TabType = 'info' | 'conditions';

interface EditFormData {
  name: string;
  date: string;
  counterparty: string;
  total_amount: string;
  man_hours: string;
  notes: string;
  status: string;
}

const MP_STATUS_OPTIONS = [
  { value: 'draft', label: 'Черновик' },
  { value: 'published', label: 'Опубликовано' },
  { value: 'sent', label: 'Отправлено' },
  { value: 'approved', label: 'Утверждено' },
  { value: 'rejected', label: 'Отклонено' },
];

export function MountingProposalDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('info');
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState<EditFormData | null>(null);
  const [isCreateVersionDialogOpen, setIsCreateVersionDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isTelegramDialogOpen, setIsTelegramDialogOpen] = useState(false);

  const { data: mp, isLoading } = useQuery({
    queryKey: ['mounting-proposal', id],
    queryFn: () => api.getMountingProposal(parseInt(id!)),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: versions } = useQuery({
    queryKey: ['mounting-proposal-versions', id],
    queryFn: () => api.getMountingProposalVersions(parseInt(id!)),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: counterpartiesData } = useCounterparties(undefined, { enabled: isEditing });
  const counterparties = Array.isArray(counterpartiesData)
    ? counterpartiesData
    : (counterpartiesData as any)?.results ?? [];

  const updateMutation = useMutation({
    mutationFn: (formData: FormData) => api.updateMountingProposal(parseInt(id!), formData),
    onSuccess: () => {
      toast.success('МП обновлено');
      queryClient.invalidateQueries({ queryKey: ['mounting-proposal', id] });
      queryClient.invalidateQueries({ queryKey: ['mounting-proposals'] });
      setIsEditing(false);
      setEditFormData(null);
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteMountingProposal(parseInt(id!)),
    onSuccess: () => {
      toast.success('МП удалено');
      navigate('/proposals/mounting-proposals');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const publishToTelegramMutation = useMutation({
    mutationFn: () => api.publishMountingProposalToTelegram(parseInt(id!)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mounting-proposal', id] });
      queryClient.invalidateQueries({ queryKey: ['mounting-proposals'] });
      toast.success('МП опубликовано в Telegram');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const handleStartEditing = () => {
    if (!mp) return;
    setEditFormData({
      name: mp.name,
      date: mp.date,
      counterparty: mp.counterparty?.toString() ?? '',
      total_amount: mp.total_amount,
      man_hours: mp.man_hours,
      notes: mp.notes ?? '',
      status: mp.status,
    });
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setEditFormData(null);
  };

  const handleSaveEditing = () => {
    if (!editFormData) return;
    const formData = new FormData();
    formData.append('name', editFormData.name);
    formData.append('date', editFormData.date);
    if (editFormData.counterparty) formData.append('counterparty', editFormData.counterparty);
    formData.append('total_amount', editFormData.total_amount);
    formData.append('man_hours', editFormData.man_hours);
    formData.append('notes', editFormData.notes);
    formData.append('status', editFormData.status);
    updateMutation.mutate(formData);
  };

  const handleFieldChange = (field: keyof EditFormData, value: string) => {
    setEditFormData((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    );
  }

  if (!mp) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <AlertCircle className="w-12 h-12 text-gray-400 mb-4" />
        <div className="text-gray-500">МП не найдено</div>
        <Button
          onClick={() => navigate('/proposals/mounting-proposals')}
          className="mt-4 bg-blue-600 text-white hover:bg-blue-700"
        >
          Вернуться к списку
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Хедер */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-4">
            <Button
              onClick={() => navigate('/proposals/mounting-proposals')}
              className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-3"
              aria-label="Вернуться к списку МП"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3 mb-2">
                {isEditing && editFormData ? (
                  <Input
                    value={editFormData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    className="text-lg font-semibold w-96"
                    aria-label="Название МП"
                  />
                ) : (
                  <h1 className="text-gray-900">{mp.name}</h1>
                )}
                <Badge className={getStatusBadgeClass(mp.status)}>{getStatusLabel(mp.status)}</Badge>
                {mp.telegram_published && (
                  <Badge className="bg-green-50 text-green-700 border border-green-200">
                    <Send className="w-3 h-3 mr-1" />
                    Опубликовано в Telegram
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-gray-600">
                <span>№ {mp.number}</span>
                <span>Версия {mp.version_number}</span>
                <span>от {formatDate(mp.date)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {!mp.telegram_published && mp.status === 'published' && !isEditing && (
              <Button
                onClick={() => setIsTelegramDialogOpen(true)}
                className="bg-green-600 text-white hover:bg-green-700"
              >
                <Send className="w-4 h-4 mr-2" />
                Опубликовать в Telegram
              </Button>
            )}
            {isEditing ? (
              <>
                <Button
                  onClick={handleSaveEditing}
                  disabled={updateMutation.isPending}
                  className="bg-green-600 text-white hover:bg-green-700"
                  aria-label="Сохранить изменения"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
                </Button>
                <Button
                  onClick={handleCancelEditing}
                  className="bg-gray-100 text-gray-700 hover:bg-gray-200"
                  aria-label="Отменить редактирование"
                >
                  <X className="w-4 h-4 mr-2" />
                  Отмена
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={handleStartEditing}
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  aria-label="Редактировать МП"
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Редактировать
                </Button>
                <Button
                  onClick={() => setIsCreateVersionDialogOpen(true)}
                  className="bg-purple-600 text-white hover:bg-purple-700"
                  aria-label="Создать новую версию"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Создать версию
                </Button>
                <Button
                  onClick={() => setIsDeleteDialogOpen(true)}
                  className="bg-red-600 text-white hover:bg-red-700"
                  aria-label="Удалить МП"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Вкладки */}
        <div className="flex gap-1 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('info')}
            className={`px-4 py-2 -mb-px transition-colors ${
              activeTab === 'info'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Основная информация
          </button>
          <button
            onClick={() => setActiveTab('conditions')}
            className={`px-4 py-2 -mb-px transition-colors ${
              activeTab === 'conditions'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Условия ({mp.conditions.length})
          </button>
        </div>
      </div>

      {/* Контент вкладок */}
      {activeTab === 'info' && (
        <InfoTab
          mp={mp}
          versions={versions}
          isEditing={isEditing}
          editFormData={editFormData}
          onFieldChange={handleFieldChange}
          counterparties={counterparties}
        />
      )}
      {activeTab === 'conditions' && <ConditionsTab mp={mp} />}

      {/* Диалог создания версии */}
      <CreateVersionDialog
        open={isCreateVersionDialogOpen}
        onOpenChange={setIsCreateVersionDialogOpen}
        itemId={mp.id}
        itemType="mp"
        currentDate={mp.date}
        currentVersionNumber={mp.version_number}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить МП</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить МП &quot;{mp.name}&quot;? Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isTelegramDialogOpen} onOpenChange={setIsTelegramDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Публикация в Telegram</AlertDialogTitle>
            <AlertDialogDescription>
              Опубликовать МП {mp.number} в Telegram?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => publishToTelegramMutation.mutate()}>
              Опубликовать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Вкладка «Основная информация» ───────────────────────────────────────────

interface InfoTabProps {
  mp: MPDetailType;
  versions?: any[];
  isEditing: boolean;
  editFormData: EditFormData | null;
  onFieldChange: (field: keyof EditFormData, value: string) => void;
  counterparties: any[];
}

function InfoTab({ mp, versions, isEditing, editFormData, onFieldChange, counterparties }: InfoTabProps) {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Основная информация */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-gray-900 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          Основная информация
        </h2>
        <div className="space-y-4">
          <div>
            <Label className="text-gray-600">Объект</Label>
            <div className="mt-1 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <div className="text-gray-900">{mp.object_name}</div>
            </div>
          </div>

          <div>
            <Label className="text-gray-600">Контрагент (Исполнитель)</Label>
            {isEditing && editFormData ? (
              <select
                value={editFormData.counterparty}
                onChange={(e) => onFieldChange('counterparty', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Выбор исполнителя"
              >
                <option value="">— Не указан —</option>
                {counterparties.map((cp: any) => (
                  <option key={cp.id} value={cp.id}>{cp.name}</option>
                ))}
              </select>
            ) : (
              <div className="mt-1 text-gray-900">
                {mp.counterparty_name ?? <span className="text-gray-400">—</span>}
              </div>
            )}
          </div>

          {mp.parent_tkp && (
            <div>
              <Label className="text-gray-600">Связанное ТКП</Label>
              <div className="mt-1">
                <button
                  onClick={() => navigate(`/proposals/technical-proposals/${mp.parent_tkp}`)}
                  className="text-blue-600 hover:underline flex items-center gap-2"
                  aria-label={`Открыть ТКП ${mp.parent_tkp_number}`}
                >
                  {mp.parent_tkp_number} - {mp.parent_tkp_name}
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {mp.mounting_estimates && mp.mounting_estimates.length > 0 && (
            <div>
              <Label className="text-gray-600">Монтажные сметы ({mp.mounting_estimates.length})</Label>
              <div className="mt-1 space-y-1">
                {mp.mounting_estimates.map((meId: number) => (
                  <button
                    key={meId}
                    onClick={() => navigate(`/estimates/mounting-estimates/${meId}`)}
                    className="text-blue-600 hover:underline flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Монтажная смета #{meId}
                    <ExternalLink className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-gray-600">Дата МП</Label>
            {isEditing && editFormData ? (
              <Input
                type="date"
                value={editFormData.date}
                onChange={(e) => onFieldChange('date', e.target.value)}
                className="mt-1"
                aria-label="Дата МП"
              />
            ) : (
              <div className="mt-1 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-gray-900">{formatDate(mp.date)}</span>
              </div>
            )}
          </div>

          <div>
            <Label className="text-gray-600">Статус</Label>
            {isEditing && editFormData ? (
              <select
                value={editFormData.status}
                onChange={(e) => onFieldChange('status', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Статус МП"
              >
                {MP_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : null}
          </div>

          <div>
            <Label className="text-gray-600">Примечания</Label>
            {isEditing && editFormData ? (
              <textarea
                value={editFormData.notes}
                onChange={(e) => onFieldChange('notes', e.target.value)}
                rows={3}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Примечания"
              />
            ) : (
              mp.notes ? (
                <div className="mt-1 text-gray-900 whitespace-pre-wrap">{mp.notes}</div>
              ) : (
                <div className="mt-1 text-gray-400">—</div>
              )
            )}
          </div>

          {mp.file_url && (
            <div>
              <Label className="text-gray-600">Файл МП</Label>
              <div className="mt-1">
                <a
                  href={mp.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Открыть файл
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Финансовая информация */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-gray-900 mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-600" />
          Финансовая информация
        </h2>
        <div className="space-y-4">
          <div>
            <Label className="text-gray-600">Общая сумма (₽)</Label>
            {isEditing && editFormData ? (
              <Input
                type="number"
                step="0.01"
                value={editFormData.total_amount}
                onChange={(e) => onFieldChange('total_amount', e.target.value)}
                className="mt-1"
                aria-label="Общая сумма"
              />
            ) : (
              <div className="mt-1 bg-blue-50 rounded-lg p-4">
                <div className="text-blue-900">{formatCurrency(mp.total_amount)}</div>
              </div>
            )}
          </div>

          <div>
            <Label className="text-gray-600">Трудозатраты (чел/час)</Label>
            {isEditing && editFormData ? (
              <Input
                type="number"
                step="0.01"
                value={editFormData.man_hours}
                onChange={(e) => onFieldChange('man_hours', e.target.value)}
                className="mt-1"
                aria-label="Трудозатраты"
              />
            ) : (
              parseFloat(mp.man_hours) > 0 ? (
                <div className="mt-1 bg-purple-50 rounded-lg p-4">
                  <div className="text-purple-900 flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    {parseFloat(mp.man_hours).toFixed(2)} чел/час
                  </div>
                </div>
              ) : (
                <div className="mt-1 text-gray-400">—</div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Информация о создании */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-gray-900 mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-purple-600" />
          Информация о создании
        </h2>
        <div className="space-y-4">
          <div>
            <Label className="text-gray-600">Создал</Label>
            <div className="mt-1 text-gray-900">{mp.created_by_name}</div>
          </div>
          <div>
            <Label className="text-gray-600">Дата создания</Label>
            <div className="mt-1 text-gray-900">{formatDateTime(mp.created_at)}</div>
          </div>
          {mp.updated_at !== mp.created_at && (
            <div>
              <Label className="text-gray-600">Последнее обновление</Label>
              <div className="mt-1 text-gray-900">{formatDateTime(mp.updated_at)}</div>
            </div>
          )}
          {mp.telegram_published && mp.telegram_published_at && (
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-gray-600 mb-1 flex items-center gap-2">
                <Send className="w-4 h-4 text-green-600" />
                Опубликовано в Telegram
              </div>
              <div className="text-green-900">{formatDateTime(mp.telegram_published_at)}</div>
            </div>
          )}
        </div>
      </div>

      {/* История версий */}
      {versions && versions.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-gray-900 mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-orange-600" />
            История версий ({versions.length})
          </h2>
          <div className="space-y-2">
            {versions.map((version: any) => (
              <div
                key={version.id}
                className={`p-3 rounded-lg border ${
                  version.id === mp.id ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-gray-900 flex items-center gap-2">
                      Версия {version.version_number}
                      {version.telegram_published && (
                        <Send className="w-3 h-3 text-green-600" aria-label="Опубликовано в Telegram" />
                      )}
                    </div>
                    <div className="text-gray-500">{formatDate(version.date)}</div>
                  </div>
                  {version.id !== mp.id && (
                    <Button
                      onClick={() => navigate(`/proposals/mounting-proposals/${version.id}`)}
                      className="bg-gray-100 text-gray-700 hover:bg-gray-200"
                      aria-label={`Открыть версию ${version.version_number}`}
                    >
                      Открыть
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Вкладка «Условия» ───────────────────────────────────────────────────────

function ConditionsTab({ mp }: { mp: MPDetailType }) {
  if (mp.conditions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
        <div className="text-center text-gray-500">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p>Условия не добавлены</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-gray-900 mb-4">Условия для МП</h2>
      <div className="space-y-4">
        {mp.conditions.map((condition, index) => (
          <div
            key={condition.id}
            className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 text-blue-700 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0">
                {index + 1}
              </div>
              <div className="flex-1">
                <h3 className="text-gray-900 mb-1">{condition.name}</h3>
                {condition.description && (
                  <p className="text-gray-600">{condition.description}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
