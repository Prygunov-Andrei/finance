import React, { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { RefreshCw, TrendingUp, Building2, Calendar, BarChart3, Star } from 'lucide-react';
import MetricCard from './MetricCard';
import CategoryChart from './CategoryChart';
import TopManufacturersTable from './TopManufacturersTable';
import referencesService, { ManufacturerStatisticsSummary } from '../../services/referencesService';
import ApiErrorBanner from '../ApiErrorBanner';

export default function ManufacturerStatisticsDashboard() {
  const [statistics, setStatistics] = useState<ManufacturerStatisticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const loadStatistics = async () => {
    setLoading(true);
    try {
      const data = await referencesService.getManufacturerStatisticsSummary();
      setStatistics(data);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatistics();
  }, []);

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ru-RU').format(num);
  };

  const getSuccessRateColor = (rate: number): 'green' | 'orange' | 'red' => {
    if (rate >= 70) return 'green';
    if (rate >= 50) return 'orange';
    return 'red';
  };

  if (loading) {
    return (
      <Card className="p-12 text-center">
        <div className="flex items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          <p className="text-muted-foreground">Загрузка статистики производителей...</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return <ApiErrorBanner error={error} onRetry={loadStatistics} />;
  }

  if (!statistics) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">Нет данных для отображения</p>
        <Button onClick={loadStatistics} className="mt-4">
          <RefreshCw className="w-4 h-4 mr-2" />
          Загрузить статистику
        </Button>
      </Card>
    );
  }

  const { overview, aggregated, averages, categories, top_manufacturers } = statistics;

  return (
    <div className="space-y-6">
      {/* Заголовок с кнопкой обновления */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Статистика производителей</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Общий обзор эффективности поиска новостей по производителям
          </p>
        </div>
        <Button
          onClick={loadStatistics}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Обновить
        </Button>
      </div>

      {/* Блок 1: Основные метрики */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="Всего производителей"
          value={formatNumber(overview.total_manufacturers)}
          subtitle={`${overview.manufacturers_with_stats} со статистикой`}
          icon={Building2}
          color="blue"
        />
        <MetricCard
          title="Активных производителей"
          value={formatNumber(overview.active_manufacturers)}
          subtitle={`${((overview.active_manufacturers / overview.total_manufacturers) * 100).toFixed(1)}% от общего числа`}
          icon={TrendingUp}
          color="green"
        />
        <MetricCard
          title="Всего найдено новостей"
          value={formatNumber(aggregated.total_news_found)}
          subtitle={`${formatNumber(aggregated.total_searches)} поисковых запросов`}
          icon={Building2}
          color="green"
        />
        <MetricCard
          title="Новостей за 30 дней"
          value={formatNumber(aggregated.news_last_30_days)}
          subtitle={
            aggregated.total_news_found > 0
              ? `${((aggregated.news_last_30_days / aggregated.total_news_found) * 100).toFixed(1)}% от общего числа`
              : 'Нет данных'
          }
          icon={Calendar}
          color="orange"
        />
        <MetricCard
          title="Процент успешности"
          value={`${averages.success_rate.toFixed(1)}%`}
          subtitle={`В среднем ${averages.avg_news_per_search.toFixed(2)} новост${
            averages.avg_news_per_search === 1 ? 'ь' : averages.avg_news_per_search < 5 ? 'и' : 'ей'
          } за поиск`}
          icon={BarChart3}
          color={getSuccessRateColor(averages.success_rate)}
        />
        <MetricCard
          title="Средний рейтинг"
          value={averages.avg_ranking_score.toFixed(1)}
          subtitle="Оценка продуктивности"
          icon={Star}
          color="yellow"
        />
      </div>

      {/* Блок 2: Распределение по категориям */}
      <CategoryChart
        highPerformers={categories.high_performers}
        mediumPerformers={categories.medium_performers}
        lowPerformers={categories.low_performers}
        problematic={categories.problematic}
      />

      {/* Блок 3: Топ производителей */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Топ производителей</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <TopManufacturersTable
            title="По количеству новостей"
            data={top_manufacturers.by_news}
            type="news"
          />
          <TopManufacturersTable
            title="По рейтингу"
            data={top_manufacturers.by_ranking}
            type="ranking"
          />
          <TopManufacturersTable
            title="По активности (30 дней)"
            data={top_manufacturers.by_activity}
            type="activity"
          />
        </div>
      </div>

      {/* Дополнительная информация */}
      {aggregated.total_errors > 0 && (
        <Card className="p-4 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-red-500 mt-2" />
            <div>
              <p className="font-medium text-red-900 dark:text-red-100">
                Обнаружены ошибки при поиске новостей
              </p>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                Всего ошибок: {formatNumber(aggregated.total_errors)}. Рекомендуется проверить проблемные производители.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}