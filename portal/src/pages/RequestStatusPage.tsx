import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, RequestStatus } from '../lib/api';
import {
  Download, Phone, Loader2, CheckCircle, AlertCircle,
  Clock, FileText, Search, Package,
} from 'lucide-react';

const STATUS_MESSAGES: Record<string, { label: string; desc: string; icon: React.ReactNode }> = {
  uploaded: { label: 'Файлы загружены', desc: 'Запрос в очереди на обработку', icon: <Clock className="w-8 h-8 text-gray-400" /> },
  parsing: { label: 'Парсинг документов', desc: 'Извлекаем спецификации из файлов', icon: <FileText className="w-8 h-8 text-blue-500 animate-pulse" /> },
  matching: { label: 'Подбор товаров', desc: 'Ищем товары и цены в каталоге', icon: <Search className="w-8 h-8 text-indigo-500 animate-pulse" /> },
  review: { label: 'На проверке', desc: 'Оператор проверяет смету перед отправкой', icon: <Package className="w-8 h-8 text-yellow-500" /> },
  ready: { label: 'Смета готова!', desc: 'Скачайте Excel-файл', icon: <CheckCircle className="w-8 h-8 text-green-500" /> },
  delivered: { label: 'Смета готова!', desc: 'Excel отправлен на email', icon: <CheckCircle className="w-8 h-8 text-green-500" /> },
  error: { label: 'Ошибка', desc: '', icon: <AlertCircle className="w-8 h-8 text-red-500" /> },
};

function getRefetchInterval(status: string | undefined): number | false {
  if (!status) return 5_000;
  if (status === 'uploaded') return 5_000;
  if (status === 'parsing') return 30_000;
  if (status === 'matching') return 15_000;
  if (status === 'review') return 120_000;
  return false; // ready/delivered/error — стоп
}

export default function RequestStatusPage() {
  const { token } = useParams<{ token: string }>();
  const [callbackSent, setCallbackSent] = useState(false);
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [callbackLoading, setCallbackLoading] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['request-status', token],
    queryFn: () => api.getRequestStatus(token!),
    enabled: !!token,
    refetchInterval: (query) => getRefetchInterval(query.state.data?.status),
  });

  const submitCallback = async () => {
    if (!phone.trim()) { toast.error('Введите телефон'); return; }
    setCallbackLoading(true);
    try {
      await api.submitCallback(token!, { phone, comment });
      setCallbackSent(true);
      toast.success('Заявка отправлена! Менеджер свяжется с вами.');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCallbackLoading(false);
    }
  };

  const statusInfo = data ? STATUS_MESSAGES[data.status] || STATUS_MESSAGES.error : null;
  const isReady = data?.status === 'ready' || data?.status === 'delivered';
  const isProcessing = data && !isReady && data.status !== 'error';

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-primary-700">Портал расчёта смет</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-12">
        {isLoading && (
          <div className="text-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto" />
            <p className="text-gray-500 mt-4">Загрузка...</p>
          </div>
        )}

        {error && (
          <div className="text-center py-20">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
            <h2 className="text-xl font-semibold text-gray-900 mt-4">Ошибка</h2>
            <p className="text-gray-500 mt-2">{(error as Error).message}</p>
          </div>
        )}

        {data && statusInfo && (
          <div className="space-y-8">
            {/* Статус */}
            <div className="bg-white rounded-2xl shadow-lg border p-8 text-center">
              <div className="mb-4">{statusInfo.icon}</div>
              <h2 className="text-2xl font-bold text-gray-900">{data.project_name}</h2>
              <p className="text-lg font-semibold text-gray-700 mt-2">{statusInfo.label}</p>
              <p className="text-gray-500 mt-1">
                {data.status === 'error' ? data.error_message : statusInfo.desc}
              </p>

              {/* Прогресс-бар */}
              {isProcessing && (
                <div className="mt-6">
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-primary-500 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${data.progress_percent}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-500 mt-2">{data.progress_percent}%</p>
                </div>
              )}

              {/* Кнопка скачивания */}
              {isReady && (
                <button
                  onClick={() => api.downloadEstimate(token!)}
                  className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors"
                >
                  <Download className="w-5 h-5" />
                  Скачать смету (Excel)
                </button>
              )}
            </div>

            {/* Статистика */}
            {data.total_spec_items > 0 && (
              <div className="bg-white rounded-2xl shadow border p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Результат обработки</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{data.total_spec_items}</div>
                    <div className="text-sm text-gray-500">Позиций</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{data.matched_exact}</div>
                    <div className="text-sm text-gray-500">Точных</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-600">{data.matched_analog}</div>
                    <div className="text-sm text-gray-500">Аналогов</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600">{data.unmatched}</div>
                    <div className="text-sm text-gray-500">Не найдено</div>
                  </div>
                </div>
              </div>
            )}

            {/* Файлы */}
            {data.total_files > 0 && (
              <div className="bg-white rounded-2xl shadow border p-6">
                <h3 className="font-semibold text-gray-900 mb-2">
                  Файлов обработано: {data.processed_files} / {data.total_files}
                </h3>
              </div>
            )}

            {/* Информация */}
            {isProcessing && (
              <div className="text-center text-sm text-gray-400">
                <p>Можете закрыть страницу — мы пришлём уведомление на email.</p>
                <p className="mt-1">Ссылка действительна до {new Date(data.expires_at).toLocaleDateString('ru-RU')}</p>
              </div>
            )}

            {/* CTA — Заявка на звонок */}
            {isReady && !callbackSent && (
              <div className="bg-white rounded-2xl shadow border p-8">
                <h3 className="font-semibold text-gray-900 mb-2">Хотите заказать оборудование?</h3>
                <p className="text-gray-500 text-sm mb-4">Наш менеджер свяжется с вами</p>

                <div className="space-y-3">
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="Телефон *"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
                  />
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Комментарий (необязательно)"
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    onClick={submitCallback}
                    disabled={callbackLoading}
                    className="w-full py-2.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {callbackLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                    Оставить заявку
                  </button>
                </div>
              </div>
            )}

            {callbackSent && (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
                <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="font-semibold text-green-800">Заявка отправлена!</p>
                <p className="text-green-600 text-sm">Менеджер свяжется с вами в ближайшее время.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
