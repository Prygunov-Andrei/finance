import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, RefreshCw, Settings } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { API_CONFIG } from '../config/api';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';

interface ApiDiagnosticsProps {
  error?: any;
  onSuccess?: () => void;
}

export default function ApiDiagnostics({ error, onSuccess }: ApiDiagnosticsProps) {
  const [currentUrl, setCurrentUrl] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const presets = [
    { id: 'ngrok', label: 'Ngrok (Permanent)', url: 'https://hvac-news.ngrok.io/api' },
    { id: 'localhost8000', label: 'Localhost:8000', url: 'http://localhost:8000/api' },
    { id: 'localhost8080', label: 'Localhost:8080', url: 'http://localhost:8080/api' },
    { id: '127.0.0.1', label: '127.0.0.1:8000', url: 'http://127.0.0.1:8000/api' },
    { id: 'custom', label: 'Свой URL', url: '' },
  ];

  useEffect(() => {
    const current = API_CONFIG.BASE_URL;
    setCurrentUrl(current);
    
    // Определяем, какой пресет выбран
    const matchingPreset = presets.find(p => p.url === current);
    if (matchingPreset) {
      setSelectedPreset(matchingPreset.id);
    } else {
      setSelectedPreset('custom');
      setCustomUrl(current);
    }
  }, []);

  const testUrl = async (url: string): Promise<{ success: boolean; message: string }> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 секунд

      const response = await fetch(url.replace('/api', '/api/'), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { success: true, message: 'API доступен! ✓' };
      } else {
        return { success: false, message: `API вернул ошибку: ${response.status}` };
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, message: 'Таймаут соединения (10 сек)' };
      }
      return { success: false, message: `Ошибка подключения: ${err.message}` };
    }
  };

  const handleTest = async () => {
    const urlToTest = selectedPreset === 'custom' ? customUrl : presets.find(p => p.id === selectedPreset)?.url || '';
    
    if (!urlToTest) {
      setTestResult({ success: false, message: 'Введите URL для проверки' });
      return;
    }

    setTesting(true);
    setTestResult(null);
    
    const result = await testUrl(urlToTest);
    setTestResult(result);
    setTesting(false);
  };

  const handleSave = () => {
    const urlToSave = selectedPreset === 'custom' ? customUrl : presets.find(p => p.id === selectedPreset)?.url || '';
    
    if (!urlToSave) {
      setTestResult({ success: false, message: 'Введите URL для сохранения' });
      return;
    }

    localStorage.setItem('api_base_url', urlToSave);
    setTestResult({ success: true, message: 'URL сохранен! Перезагружаю...' });
    
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertCircle className="size-5 text-destructive" />
          <CardTitle>Проблема подключения к API</CardTitle>
        </div>
        <CardDescription>
          Backend API недоступен. Проверьте, что Django сервер и ngrok туннель запущены.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Текущая конфигурация */}
        <Alert>
          <AlertDescription>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">Текущий URL:</span>
                <code className="text-sm bg-muted px-2 py-1 rounded">{currentUrl}</code>
              </div>
              {error && (
                <div className="text-sm text-destructive mt-2">
                  <strong>Ошибка:</strong> {error.message || 'timeout of 30000ms exceeded'}
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>

        {/* Выбор URL */}
        <div className="space-y-4">
          <Label>Выберите адрес API:</Label>
          <RadioGroup value={selectedPreset} onValueChange={setSelectedPreset}>
            {presets.map(preset => (
              <div key={preset.id} className="flex items-center space-x-2">
                <RadioGroupItem value={preset.id} id={preset.id} />
                <Label htmlFor={preset.id} className="flex-1 cursor-pointer">
                  {preset.label}
                  {preset.url && <span className="text-sm text-muted-foreground ml-2">({preset.url})</span>}
                </Label>
              </div>
            ))}
          </RadioGroup>

          {/* Поле для своего URL */}
          {selectedPreset === 'custom' && (
            <div className="space-y-2 ml-6">
              <Label htmlFor="customUrl">Введите URL API:</Label>
              <Input
                id="customUrl"
                type="url"
                placeholder="https://your-domain.ngrok.io/api"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Результат теста */}
        {testResult && (
          <Alert variant={testResult.success ? 'default' : 'destructive'}>
            <div className="flex items-center gap-2">
              {testResult.success ? (
                <CheckCircle className="size-4" />
              ) : (
                <AlertCircle className="size-4" />
              )}
              <AlertDescription>{testResult.message}</AlertDescription>
            </div>
          </Alert>
        )}

        {/* Кнопки действий */}
        <div className="flex gap-3">
          <Button
            onClick={handleTest}
            disabled={testing}
            variant="outline"
            className="flex-1"
          >
            {testing ? (
              <>
                <RefreshCw className="size-4 mr-2 animate-spin" />
                Проверка...
              </>
            ) : (
              <>
                <Settings className="size-4 mr-2" />
                Проверить доступность
              </>
            )}
          </Button>
          
          <Button
            onClick={handleSave}
            disabled={testing || !testResult?.success}
            className="flex-1"
          >
            Сохранить и перезагрузить
          </Button>
        </div>

        {/* Инструкции */}
        <div className="text-sm text-muted-foreground space-y-2 pt-4 border-t">
          <p className="font-medium">Как исправить:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Убедитесь, что Django сервер запущен: <code className="text-xs bg-muted px-1 py-0.5 rounded">python manage.py runserver</code></li>
            <li>Проверьте, что ngrok работает: <code className="text-xs bg-muted px-1 py-0.5 rounded">ngrok http 8000</code></li>
            <li>Выберите правильный URL выше и нажмите "Проверить доступность"</li>
            <li>Если проверка успешна, нажмите "Сохранить и перезагрузить"</li>
          </ol>
          <p className="pt-2">
            <strong>Для локальной разработки:</strong> выберите "Localhost:8000" если Django запущен локально
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
