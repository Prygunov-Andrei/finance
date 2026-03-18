import React from 'react';
import { Card } from '../ui/card';
import { Trophy, TrendingUp, Zap } from 'lucide-react';
import { TopManufacturer } from '../../services/referencesService';

interface TopManufacturersTableProps {
  title: string;
  data: TopManufacturer[];
  type: 'news' | 'ranking' | 'activity';
}

export default function TopManufacturersTable({ title, data, type }: TopManufacturersTableProps) {
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ru-RU').format(num);
  };

  const getIcon = () => {
    switch (type) {
      case 'news':
        return Trophy;
      case 'ranking':
        return TrendingUp;
      case 'activity':
        return Zap;
    }
  };

  const Icon = getIcon();

  const getMainMetric = (manufacturer: TopManufacturer) => {
    switch (type) {
      case 'news':
        return formatNumber(manufacturer.total_news);
      case 'ranking':
        return manufacturer.ranking_score.toFixed(1);
      case 'activity':
        return formatNumber(manufacturer.news_last_30_days || 0);
    }
  };

  const getSecondaryMetric = (manufacturer: TopManufacturer) => {
    switch (type) {
      case 'news':
        return `Рейтинг: ${manufacturer.ranking_score.toFixed(1)}`;
      case 'ranking':
        return `Новостей: ${formatNumber(manufacturer.total_news)}`;
      case 'activity':
        return `Рейтинг: ${manufacturer.ranking_score.toFixed(1)}`;
    }
  };

  const getMetricLabel = () => {
    switch (type) {
      case 'news':
        return 'Новостей';
      case 'ranking':
        return 'Рейтинг';
      case 'activity':
        return 'За 30 дн.';
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">{title}</h3>
        </div>
      </div>
      <div className="divide-y">
        {data.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Нет данных
          </div>
        ) : (
          data.map((manufacturer, index) => (
            <div
              key={manufacturer.id}
              className={`p-4 hover:bg-muted/30 transition-colors ${
                index < 3 ? 'bg-primary/5' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div
                    className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      index === 0
                        ? 'bg-yellow-500 text-white'
                        : index === 1
                        ? 'bg-gray-400 text-white'
                        : index === 2
                        ? 'bg-amber-600 text-white'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate" title={manufacturer.name}>
                      {manufacturer.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {getSecondaryMetric(manufacturer)}
                    </p>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="font-bold text-primary">
                    {getMainMetric(manufacturer)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {getMetricLabel()}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
