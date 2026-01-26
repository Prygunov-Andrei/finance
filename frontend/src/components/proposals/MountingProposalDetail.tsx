import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Pencil, 
  Trash2, 
  Copy, 
  FileText, 
  Download,
  Send,
  Calendar,
  Building2,
  User,
  Clock,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { CreateMountingProposalDialog } from './CreateMountingProposalDialog';
import { CreateVersionDialog } from './CreateVersionDialog';
import { formatDate, formatDateTime, formatAmount, formatCurrency, getStatusBadgeClass, getStatusLabel } from '../../lib/utils';
import { CONSTANTS } from '../../constants';

type TabType = 'info' | 'conditions';

export function MountingProposalDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('info');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreateVersionDialogOpen, setIsCreateVersionDialogOpen] = useState(false);

  // Загрузка МП
  const { data: mp, isLoading } = useQuery({
    queryKey: ['mounting-proposal', id],
    queryFn: () => api.getMountingProposal(parseInt(id!)),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Загрузка версий
  const { data: versions } = useQuery({
    queryKey: ['mounting-proposal-versions', id],
    queryFn: () => api.getMountingProposalVersions(parseInt(id!)),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Удаление МП
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteMountingProposal(parseInt(id!)),
    onSuccess: () => {
      toast.success('МП удалено');
      navigate('/mounting-proposals');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Публикация в Telegram
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

  const handleDelete = () => {
    if (confirm(`Вы уверены, что хотите удалить МП \"${mp?.name}\"?`)) {
      deleteMutation.mutate();
    }
  };

  const handlePublishToTelegram = () => {
    if (mp && confirm(`Опубликовать МП ${mp.number} в Telegram?`)) {
      publishToTelegramMutation.mutate();
    }
  };

  const getStatusBadge = (status: string) => {
    return <Badge className={getStatusBadgeClass(status)}>{getStatusLabel(status)}</Badge>;
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
        <Button onClick={() => navigate('/mounting-proposals')} className="mt-4 bg-blue-600 text-white hover:bg-blue-700">
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
              onClick={() => navigate('/mounting-proposals')}
              className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-3"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-gray-900">{mp.name}</h1>
                {getStatusBadge(mp.status)}
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
            {!mp.telegram_published && mp.status === 'published' && (
              <Button
                onClick={handlePublishToTelegram}
                className="bg-green-600 text-white hover:bg-green-700"
              >
                <Send className="w-4 h-4 mr-2" />
                Опубликовать в Telegram
              </Button>
            )}
            <Button
              onClick={() => setIsEditDialogOpen(true)}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              <Pencil className="w-4 h-4 mr-2" />
              Редактировать
            </Button>
            <Button
              onClick={() => setIsCreateVersionDialogOpen(true)}
              className="bg-purple-600 text-white hover:bg-purple-700"
            >
              <Copy className="w-4 h-4 mr-2" />
              Создать версию
            </Button>
            <Button
              onClick={handleDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
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
      {activeTab === 'info' && <InfoTab mp={mp} versions={versions} />}
      {activeTab === 'conditions' && <ConditionsTab mp={mp} />}

      {/* Диалог редактирования */}
      <CreateMountingProposalDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        mp={mp}
      />

      {/* Диалог создания версии */}
      <CreateVersionDialog
        open={isCreateVersionDialogOpen}
        onOpenChange={setIsCreateVersionDialogOpen}
        itemId={mp.id}
        itemType="mp"
        currentDate={mp.date}
        currentVersionNumber={mp.version_number}
      />
    </div>
  );
}

// Вкладка "Основная информация"
function InfoTab({ mp, versions }: { mp: any; versions?: any[] }) {
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

          {mp.counterparty_name && (
            <div>
              <Label className="text-gray-600">Контрагент</Label>
              <div className="mt-1 text-gray-900">{mp.counterparty_name}</div>
            </div>
          )}

          {mp.parent_tkp && (
            <div>
              <Label className="text-gray-600">Связанное ТКП</Label>
              <div className="mt-1">
                <button
                  onClick={() => navigate(`/proposals/technical-proposals/${mp.parent_tkp}`)}
                  className="text-blue-600 hover:underline flex items-center gap-2"
                >
                  {mp.parent_tkp_number} - {mp.parent_tkp_name}
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {mp.mounting_estimate && (
            <div>
              <Label className="text-gray-600">Монтажная смета</Label>
              <div className="mt-1">
                <button
                  onClick={() => navigate(`/estimates/mounting-estimates/${mp.mounting_estimate}`)}
                  className="text-blue-600 hover:underline flex items-center gap-2"
                >
                  {mp.mounting_estimate_number}
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div>
            <Label className="text-gray-600">Дата создания</Label>
            <div className="mt-1 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-gray-900">{formatDate(mp.date)}</span>
            </div>
          </div>

          {mp.notes && (
            <div>
              <Label className="text-gray-600">Примечания</Label>
              <div className="mt-1 text-gray-900 whitespace-pre-wrap">{mp.notes}</div>
            </div>
          )}

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
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-gray-600 mb-1">Общая сумма</div>
            <div className="text-blue-900">{formatCurrency(mp.total_amount)}</div>
          </div>

          {parseFloat(mp.man_hours) > 0 && (
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-gray-600 mb-1">Трудозатраты</div>
              <div className="text-purple-900 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                {parseFloat(mp.man_hours).toFixed(2)} чел/час
              </div>
            </div>
          )}
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
            {versions.map((version) => (
              <div
                key={version.id}
                className={`p-3 rounded-lg border ${
                  version.id === mp.id
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-gray-900 flex items-center gap-2">
                      Версия {version.version_number}
                      {version.telegram_published && (
                        <Send className="w-3 h-3 text-green-600" title="Опубликовано в Telegram" />
                      )}
                    </div>
                    <div className="text-gray-500">{formatDate(version.date)}</div>
                  </div>
                  {version.id !== mp.id && (
                    <Button
                      onClick={() => window.open(`/mounting-proposals/${version.id}`, '_blank')}
                      className="bg-gray-100 text-gray-700 hover:bg-gray-200"
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

// Вкладка "Условия"
function ConditionsTab({ mp }: { mp: any }) {
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
        {mp.conditions.map((condition: any, index: number) => (
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
                {condition.text && (
                  <p className="text-gray-700 mt-2 whitespace-pre-wrap">{condition.text}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}