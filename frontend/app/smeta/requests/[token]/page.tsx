'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface RequestStatus {
  id: number;
  status: string;
  email: string;
  file_name: string;
  created_at: string;
  result_url: string | null;
}

export default function RequestStatusPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<RequestStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/public/v1/estimates/status/?access_token=${token}`);
        if (!res.ok) throw new Error('Заявка не найдена');
        setData(await res.json());
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Link href="/smeta" className="text-blue-600 hover:underline">
            Вернуться к форме
          </Link>
        </div>
      </div>
    );
  }

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: 'В очереди', color: 'bg-yellow-100 text-yellow-800' },
    processing: { label: 'Обрабатывается', color: 'bg-blue-100 text-blue-800' },
    completed: { label: 'Готово', color: 'bg-green-100 text-green-800' },
    failed: { label: 'Ошибка', color: 'bg-red-100 text-red-800' },
  };

  const status = statusLabels[data?.status || ''] || statusLabels.pending;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Статус заявки</h1>

        <div className="space-y-4">
          <div>
            <span className="text-sm text-gray-500">Статус</span>
            <div className="mt-1">
              <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${status.color}`}>
                {status.label}
              </span>
            </div>
          </div>

          {data?.file_name && (
            <div>
              <span className="text-sm text-gray-500">Файл</span>
              <p className="text-sm text-gray-900">{data.file_name}</p>
            </div>
          )}

          {data?.email && (
            <div>
              <span className="text-sm text-gray-500">Email</span>
              <p className="text-sm text-gray-900">{data.email}</p>
            </div>
          )}

          {data?.result_url && (
            <a
              href={data.result_url}
              className="block w-full py-3 text-center bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Скачать результат
            </a>
          )}
        </div>

        <div className="mt-8 text-center">
          <Link href="/smeta" className="text-sm text-gray-500 hover:text-blue-600">
            &larr; Отправить ещё одну смету
          </Link>
        </div>
      </div>
    </div>
  );
}
