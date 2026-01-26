import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../ui/button';
import { ArrowLeft, FileText, Calendar, Clock, Users, Loader2, Star, Hash } from 'lucide-react';
import { formatDateTime } from '../../lib/utils';
import { CONSTANTS } from '../../constants';

export function WorkItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showVersions, setShowVersions] = useState(false);

  const { data: workItem, isLoading, error } = useQuery({
    queryKey: ['work-item', id],
    queryFn: () => api.getWorkItemDetail(Number(id)),
    enabled: !!id,
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Запрос истории версий
  const { data: versions, isLoading: versionsLoading } = useQuery({
    queryKey: ['work-item-versions', id],
    queryFn: () => api.getWorkItemVersions(Number(id)),
    enabled: !!id && showVersions,
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !workItem) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Работа не найдена</p>
          <Button
            variant="outline"
            onClick={() => navigate('/work-items')}
            className="mt-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Вернуться к списку
          </Button>
        </div>
      </div>
    );
  }

  // Форматирование разряда
  const formatGrade = (requiredGrade: string | undefined): string => {
    if (!requiredGrade) {
      return '-';
    }
    
    const gradeNum = parseFloat(requiredGrade);
    if (isNaN(gradeNum)) {
      return '-';
    }
    
    // Если целое число, показываем без десятичных
    if (Number.isInteger(gradeNum)) {
      return gradeNum.toString();
    }
    
    // Для дробных - показываем с нужной точностью
    // Убираем лишние нули справа
    return gradeNum.toFixed(2).replace(/\.?0+$/, '');
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/work-items')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex px-3 py-1.5 text-sm font-mono font-medium rounded-lg bg-gray-100 text-gray-700">
                {workItem.article}
              </span>
              {workItem.is_current && (
                <span className="inline-flex px-3 py-1.5 text-sm font-medium rounded-lg bg-green-100 text-green-700">
                  Актуальная версия
                </span>
              )}
              <span className="text-sm text-gray-500">
                Версия {workItem.version_number}
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mt-2">
              {workItem.name}
            </h1>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowVersions(!showVersions)}
        >
          {showVersions ? 'Скрыть историю' : 'Показать историю версий'}
        </Button>
      </div>

      {/* Main Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Основная информация</h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm text-gray-500">Раздел</div>
                <div className="font-medium text-gray-900">
                  {workItem.section_detail.code} - {workItem.section_detail.name}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Hash className="w-5 h-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm text-gray-500">Единица измерения</div>
                <div className="font-medium text-gray-900">{workItem.unit}</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm text-gray-500">Трудозатраты</div>
                <div className="font-medium text-gray-900">
                  {workItem.hours ? `${workItem.hours} часов` : '0 часов (не указано)'}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm text-gray-500">Разряд</div>
                <div className="font-medium text-gray-900">
                  {formatGrade(workItem.required_grade)}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Star className="w-5 h-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm text-gray-500">Коэффициент</div>
                <div className="font-medium text-gray-900">{workItem.coefficient}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Метаданные</h3>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-gray-500">Версия</div>
              <div className="font-medium text-gray-900">v{workItem.version_number}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Статус</div>
              <div className="font-medium text-gray-900">
                {workItem.is_current ? (
                  <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-green-100 text-green-700">
                    Актуальная
                  </span>
                ) : (
                  <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700">
                    Устаревшая
                  </span>
                )}
              </div>
            </div>
            {workItem.parent_version && (
              <div>
                <div className="text-sm text-gray-500">Родительская версия</div>
                <button
                  onClick={() => navigate(`/work-items/${workItem.parent_version}`)}
                  className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Перейти к версии #{workItem.parent_version}
                </button>
              </div>
            )}
            <div>
              <div className="text-sm text-gray-500">Создана</div>
              <div className="font-medium text-gray-900">{formatDateTime(workItem.created_at)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Обновлена</div>
              <div className="font-medium text-gray-900">{formatDateTime(workItem.updated_at)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Composition */}
      {workItem.composition && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Состав работы</h3>
          <p className="text-gray-700 whitespace-pre-wrap">{workItem.composition}</p>
        </div>
      )}

      {/* Comment */}
      {workItem.comment && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Комментарий</h3>
          <p className="text-gray-700 whitespace-pre-wrap">{workItem.comment}</p>
        </div>
      )}

      {/* Version History */}
      {showVersions && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">История версий</h3>
          {versionsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            </div>
          ) : versions && versions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Артикул
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Версия
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Дата создания
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Актуальная
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {versions.map((version) => (
                    <tr key={version.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono text-gray-700">
                          {version.article}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-900">
                          v{version.version_number}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700">
                          {formatDateTime(version.created_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {version.is_current ? (
                          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-green-100 text-green-700">
                            Да
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700">
                            Нет
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/work-items/${version.id}`)}
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          Открыть
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">Нет истории версий</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}