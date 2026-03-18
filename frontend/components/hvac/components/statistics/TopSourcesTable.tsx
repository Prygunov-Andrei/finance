import React from 'react';
import { Card } from '../ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { TopSource } from '../../services/referencesService';
import { Trophy, Medal, Award } from 'lucide-react';

interface TopSourcesTableProps {
  title: string;
  data: TopSource[];
  type: 'news' | 'ranking' | 'activity';
}

export default function TopSourcesTable({ title, data, type }: TopSourcesTableProps) {
  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Award className="w-5 h-5 text-amber-600" />;
    return null;
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ru-RU').format(num);
  };

  if (data.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="mb-4">{title}</h3>
        <div className="h-32 flex items-center justify-center text-muted-foreground">
          Нет данных для отображения
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="mb-4">{title}</h3>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">№</TableHead>
              <TableHead>Название</TableHead>
              {type === 'news' && <TableHead className="text-right">Новостей</TableHead>}
              {type === 'activity' && <TableHead className="text-right">За 30 дней</TableHead>}
              <TableHead className="text-right">Рейтинг</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((source, index) => {
              const rank = index + 1;
              const isTopThree = rank <= 3;

              return (
                <TableRow
                  key={source.id}
                  className={isTopThree ? 'bg-muted/50' : ''}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getRankIcon(rank)}
                      <span className={isTopThree ? 'font-semibold' : ''}>
                        {rank}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className={isTopThree ? 'font-medium' : ''}>
                    {source.name}
                  </TableCell>
                  {type === 'news' && (
                    <TableCell className="text-right">
                      {formatNumber(source.total_news)}
                    </TableCell>
                  )}
                  {type === 'activity' && (
                    <TableCell className="text-right">
                      {formatNumber(source.news_last_30_days || 0)}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className={isTopThree ? 'font-semibold' : ''}>
                        {source.ranking_score.toFixed(1)}
                      </span>
                      <div
                        className={`w-16 h-2 rounded-full bg-gradient-to-r ${
                          source.ranking_score >= 50
                            ? 'from-green-200 to-green-500'
                            : source.ranking_score >= 20
                            ? 'from-yellow-200 to-yellow-500'
                            : 'from-red-200 to-red-500'
                        }`}
                        style={{
                          width: `${Math.min(source.ranking_score, 100)}px`,
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
