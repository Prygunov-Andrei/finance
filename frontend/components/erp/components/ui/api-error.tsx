import { AlertCircle, Server } from 'lucide-react';

interface ApiErrorProps {
  error: Error;
  retry?: () => void;
}

export function ApiError({ error, retry }: ApiErrorProps) {
  const isNetworkError = error.message.includes('Сетевая ошибка') || error.message.includes('Failed to fetch');
  
  // Извлекаем текущий API URL из сообщения об ошибке
  const apiUrlMatch = error.message.match(/https?:\/\/[^\s]+/);
  const currentApiUrl = apiUrlMatch ? apiUrlMatch[0] : 'не определен';
  
  return (
    <div className="p-8">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-3xl mx-auto">
        <div className="flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-red-900 mb-2">
              {isNetworkError ? 'Ошибка подключения к серверу' : 'Ошибка загрузки данных'}
            </h3>
            <p className="text-sm text-red-700 mb-4">
              {error.message}
            </p>
            {isNetworkError && (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <Server className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-blue-900 mb-2">Текущий URL API:</p>
                      <code className="block bg-blue-100 text-blue-800 px-3 py-2 rounded text-sm font-mono break-all">
                        {currentApiUrl}
                      </code>
                    </div>
                  </div>
                </div>

                <div className="text-sm text-red-600 bg-red-100 rounded-lg p-4 mb-4">
                  <p className="font-medium mb-2">Как исправить:</p>
                  <ol className="list-decimal list-inside space-y-2">
                    <li>
                      <strong>Обновите URL в файле <code className="bg-red-200 px-1 rounded">/.env.local</code></strong>
                      <div className="ml-5 mt-2 bg-white rounded p-2 font-mono text-xs">
                        VITE_API_URL=http://localhost:8000/api/v1
                      </div>
                    </li>
                    <li className="mt-2">Убедитесь, что Django сервер запущен</li>
                    <li>Перезапустите приложение после изменения .env.local</li>
                  </ol>
                </div>

                <div className="text-sm text-gray-600 bg-gray-100 rounded-lg p-3">
                  <p className="font-medium mb-1">Возможные причины:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Сервер Django не запущен или недоступен</li>
                    <li>Ngrok URL устарел (ngrok URLs временные)</li>
                    <li>API endpoint еще не реализован на бэкенде</li>
                    <li>Проблемы с CORS или сетевым подключением</li>
                  </ul>
                </div>
              </>
            )}
            {retry && (
              <button
                onClick={retry}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
              >
                Повторить запрос
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}