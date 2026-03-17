import React from 'react';
import { Card } from '../ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { AlertTriangle } from 'lucide-react';

interface CategoryChartProps {
  highPerformers: number;
  mediumPerformers: number;
  lowPerformers: number;
  problematic: number;
}

const COLORS = {
  high: '#10b981', // green-500
  medium: '#f59e0b', // amber-500
  low: '#ef4444', // red-500
};

export default function CategoryChart({
  highPerformers,
  mediumPerformers,
  lowPerformers,
  problematic,
}: CategoryChartProps) {
  // Данные для категорий по рейтингу (ВЗАИМОИСКЛЮЧАЮЩИЕ)
  const ratingData = [
    { name: 'Высокопродуктивные', value: highPerformers, color: COLORS.high },
    { name: 'Средние', value: mediumPerformers, color: COLORS.medium },
    { name: 'Низкопродуктивные', value: lowPerformers, color: COLORS.low },
  ].filter((item) => item.value > 0);

  const totalSources = highPerformers + mediumPerformers + lowPerformers;

  if (ratingData.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-4">Распределение по категориям</h3>
        <div className="h-64 flex items-center justify-center text-muted-foreground">
          Нет данных для отображения
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Секция 1: Категории по рейтингу (круговая диаграмма) */}
      <Card className="p-6 lg:col-span-2">
        <h3 className="font-semibold text-lg mb-4">📊 Распределение по продуктивности</h3>
        <div className="w-full min-h-[320px]" style={{ height: '320px', minHeight: '320px' }}>
          <ResponsiveContainer width="100%" height={320} minHeight={320}>
            <PieChart>
              <Pie
                data={ratingData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {ratingData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ payload }) => {
                  if (payload && payload.length > 0) {
                    const data = payload[0];
                    const percent = totalSources > 0 ? ((data.value as number / totalSources) * 100).toFixed(1) : '0';
                    return (
                      <div className="bg-background border border-border rounded-lg shadow-lg p-3">
                        <p className="font-medium">{data.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {data.value} источник{data.value === 1 ? '' : (data.value as number) > 1 && (data.value as number) < 5 ? 'а' : 'ов'} ({percent}%)
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value, entry: any) => {
                  const percent = totalSources > 0 ? ((entry.payload.value / totalSources) * 100).toFixed(1) : '0';
                  return (
                    <span className="text-sm">
                      {value} ({entry.payload.value} — {percent}%)
                    </span>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Легенда с описанием категорий по рейтингу */}
        <div className="mt-6 space-y-2 text-sm">
          <p className="font-medium mb-3 text-foreground">Категории по рейтингу (взаимоисключающие):</p>
          <p>
            <span className="font-medium text-green-600 dark:text-green-400">Высокопродуктивные:</span> ranking_score &ge; 50
          </p>
          <p>
            <span className="font-medium text-amber-600 dark:text-amber-400">Средние:</span> ranking_score 20–49
          </p>
          <p>
            <span className="font-medium text-red-600 dark:text-red-400">Низкопродуктивные:</span> ranking_score &lt; 20
          </p>
          <div className="pt-3 mt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              ✓ ИТОГО: <span className="font-semibold text-foreground">{totalSources}</span> источников (100%)
            </p>
          </div>
        </div>
      </Card>

      {/* Секция 2: Проблемные источники (отдельная метрика) */}
      <Card className="p-6 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-lg text-amber-900 dark:text-amber-100">
              Проблемные источники
            </h3>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              (отдельная категория)
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-center py-6 bg-background rounded-lg border border-amber-200 dark:border-amber-800">
            <p className="text-5xl font-bold text-amber-600 dark:text-amber-400">
              {problematic}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              источников с error_rate &ge; 30%
            </p>
          </div>

          <div className="mt-6 space-y-3 text-sm">
            <p className="font-medium text-amber-900 dark:text-amber-100">
              Что это значит:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-amber-600 dark:text-amber-400 mt-0.5">•</span>
                <span>Источники с частыми ошибками при поиске новостей</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-600 dark:text-amber-400 mt-0.5">•</span>
                <span>Могут одновременно относиться к любой категории по рейтингу</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-600 dark:text-amber-400 mt-0.5">•</span>
                <span>Рекомендуется проверка и исправление</span>
              </li>
            </ul>
          </div>

          {problematic > 0 && totalSources > 0 && (
            <div className="mt-4 pt-4 border-t border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Это составляет <span className="font-semibold">{((problematic / totalSources) * 100).toFixed(1)}%</span> от всех источников
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}