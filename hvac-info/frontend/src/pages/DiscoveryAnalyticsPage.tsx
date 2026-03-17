import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import MainLayout from '../components/MainLayout';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { 
  BarChart3, 
  DollarSign, 
  TrendingUp, 
  Zap,
  AlertCircle,
  Loader2,
  Calendar,
  FileText
} from 'lucide-react';
import searchConfigService, { 
  DiscoveryStats,
  NewsDiscoveryRunListItem 
} from '../services/searchConfigService';
import ApiErrorBanner from '../components/ApiErrorBanner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { useNavigate } from 'react-router';

export default function DiscoveryAnalyticsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DiscoveryStats | null>(null);
  const [runs, setRuns] = useState<NewsDiscoveryRunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [periodDays, setPeriodDays] = useState<number | undefined>(7);

  const isAdmin = user?.is_staff === true;

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin, periodDays]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [statsData, runsData] = await Promise.all([
        searchConfigService.getDiscoveryStats(periodDays),
        searchConfigService.getDiscoveryRuns(1)
      ]);
      
      setStats(statsData);
      setRuns(runsData?.results || []);
    } catch (err: any) {
      console.error('Error loading analytics:', err);
      setError(err);
      // Устанавливаем пустые данные при ошибке
      setStats(null);
      setRuns([]);
    } finally {
      setLoading(false);
    }
  };

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'grok': return 'bg-purple-500';
      case 'anthropic': return 'bg-orange-500';
      case 'gemini': return 'bg-blue-500';
      case 'openai': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getProviderName = (provider: string) => {
    switch (provider) {
      case 'grok': return 'Grok';
      case 'anthropic': return 'Claude';
      case 'gemini': return 'Gemini';
      case 'openai': return 'OpenAI';
      default: return provider;
    }
  };

  if (!isAdmin) {
    return (
      <MainLayout>
        <div className="p-6">
          <Card className="p-12 text-center">
            <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Доступ запрещен</h2>
            <p className="text-muted-foreground">
              Эта страница доступна только администраторам
            </p>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Заголовок */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-primary" />
              <h1 className="text-3xl font-semibold">Аналитика поиска</h1>
            </div>
            
            {/* Фильтр периода */}
            <div className="flex items-center gap-2">
              <Button
                variant={periodDays === 7 ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPeriodDays(7)}
              >
                7 дней
              </Button>
              <Button
                variant={periodDays === 30 ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPeriodDays(30)}
              >
                30 дней
              </Button>
              <Button
                variant={periodDays === undefined ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPeriodDays(undefined)}
              >
                Все время
              </Button>
            </div>
          </div>

          {loading && (
            <Card className="p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-muted-foreground">Загрузка аналитики...</p>
            </Card>
          )}

          {error && (
            <ApiErrorBanner
              error={error}
              onRetry={loadData}
            />
          )}

          {!loading && !error && stats && (
            <>
              {/* Дашборд - карточки */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Cost */}
                <Card className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                      <DollarSign className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Cost</p>
                      <p className="text-2xl font-bold">${parseFloat(stats.total_cost_usd).toFixed(2)}</p>
                    </div>
                  </div>
                </Card>

                {/* Total News */}
                <Card className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total News</p>
                      <p className="text-2xl font-bold">{stats.total_news_found}</p>
                    </div>
                  </div>
                </Card>

                {/* Efficiency */}
                <Card className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Efficiency</p>
                      <p className="text-2xl font-bold">{stats.avg_efficiency.toFixed(1)} news/$</p>
                    </div>
                  </div>
                </Card>

                {/* Total Requests */}
                <Card className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                      <Zap className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Requests</p>
                      <p className="text-2xl font-bold">{stats.total_requests}</p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Breakdown по провайдерам */}
              <Card>
                <div className="p-6 border-b">
                  <h2 className="text-lg font-semibold">Breakdown по провайдерам</h2>
                </div>
                <div className="p-6">
                  {stats.provider_breakdown && Object.keys(stats.provider_breakdown).length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {Object.entries(stats.provider_breakdown).map(([provider, data]) => (
                        <Card key={provider} className="p-4 border-2">
                          <div className="flex items-center gap-2 mb-3">
                            <div className={`w-3 h-3 rounded-full ${getProviderColor(provider)}`} />
                            <h3 className="font-semibold">{getProviderName(provider)}</h3>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Requests:</span>
                              <span className="font-medium">{data.requests}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Input tokens:</span>
                              <span className="font-medium">{(data.input_tokens / 1000).toFixed(1)}K</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Output tokens:</span>
                              <span className="font-medium">{(data.output_tokens / 1000).toFixed(1)}K</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Cost:</span>
                              <span className="font-bold text-red-600">${data.cost.toFixed(4)}</span>
                            </div>
                            {data.errors > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Errors:</span>
                                <span className="font-medium text-red-600">{data.errors}</span>
                              </div>
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center py-8 text-muted-foreground">
                      Нет данных о провайдерах
                    </p>
                  )}
                </div>
              </Card>

              {/* История запусков */}
              <Card>
                <div className="p-6 border-b">
                  <h2 className="text-lg font-semibold">История запусков</h2>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Дата</TableHead>
                      <TableHead>Конфигурация</TableHead>
                      <TableHead>Длительность</TableHead>
                      <TableHead className="text-center">Новостей</TableHead>
                      <TableHead className="text-center">Запросов</TableHead>
                      <TableHead className="text-right">Стоимость</TableHead>
                      <TableHead className="text-right">Эффективность</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                          Нет данных о запусках
                        </TableCell>
                      </TableRow>
                    ) : (
                      runs.map((run) => (
                        <TableRow key={run.id} className="cursor-pointer hover:bg-muted/50">
                          <TableCell className="font-mono text-sm">{run.id}</TableCell>
                          <TableCell className="text-sm">
                            {new Date(run.last_search_date).toLocaleDateString('ru-RU')}
                          </TableCell>
                          <TableCell>
                            {run.config_name ? (
                              <Badge variant="outline">{run.config_name}</Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{run.duration_display}</TableCell>
                          <TableCell className="text-center">
                            <Badge className="bg-blue-500">{run.news_found}</Badge>
                          </TableCell>
                          <TableCell className="text-center">{run.total_requests}</TableCell>
                          <TableCell className="text-right font-mono text-red-600">
                            ${parseFloat(run.estimated_cost_usd).toFixed(4)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            {run.efficiency.toFixed(1)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>

              {/* Общая статистика */}
              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Общая статистика</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Всего запусков</p>
                    <p className="text-2xl font-bold mt-1">{stats.total_runs}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Cost/Run</p>
                    <p className="text-2xl font-bold mt-1">${parseFloat(stats.avg_cost_per_run).toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Input Tokens</p>
                    <p className="text-2xl font-bold mt-1">{(stats.total_input_tokens / 1000000).toFixed(2)}M</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Output Tokens</p>
                    <p className="text-2xl font-bold mt-1">{(stats.total_output_tokens / 1000000).toFixed(2)}M</p>
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
}