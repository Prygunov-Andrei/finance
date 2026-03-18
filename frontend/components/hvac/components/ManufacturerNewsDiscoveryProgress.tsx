import React, { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import referencesService, { ManufacturerNewsDiscoveryStatus } from '../services/referencesService';

interface ManufacturerNewsDiscoveryProgressProps {
  onComplete?: (status: ManufacturerNewsDiscoveryStatus) => void;
  onError?: (error: string) => void;
}

export default function ManufacturerNewsDiscoveryProgress({ onComplete, onError }: ManufacturerNewsDiscoveryProgressProps) {
  const [status, setStatus] = useState<ManufacturerNewsDiscoveryStatus>({
    status: 'running',
    processed: 0,
    total: 0,
    percent: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Начинаем опрос статуса
    pollStatus();

    // Очистка интервала при размонтировании
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const pollStatus = async () => {
    try {
      const newStatus = await referencesService.getManufacturerNewsDiscoveryStatus();
      setStatus(newStatus);

      // Если поиск завершен или произошла ошибка, останавливаем опрос
      if (newStatus.status === 'completed' || newStatus.status === 'error') {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        
        if (newStatus.status === 'completed' && onComplete) {
          onComplete(newStatus);
        } else if (newStatus.status === 'error') {
          const errorMsg = newStatus.message || 'Произошла ошибка при поиске новостей по производителям';
          setError(errorMsg);
          if (onError) {
            onError(errorMsg);
          }
        }
        return;
      }

      // Если поиск все еще выполняется, устанавливаем интервал
      if (!pollIntervalRef.current && newStatus.status === 'running') {
        pollIntervalRef.current = setInterval(async () => {
          try {
            const updatedStatus = await referencesService.getManufacturerNewsDiscoveryStatus();
            setStatus(updatedStatus);

            // Проверяем, завершился ли поиск
            if (updatedStatus.status === 'completed' || updatedStatus.status === 'error') {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }

              if (updatedStatus.status === 'completed' && onComplete) {
                onComplete(updatedStatus);
              } else if (updatedStatus.status === 'error') {
                const errorMsg = updatedStatus.message || 'Произошла ошибка при поиске новостей по производителям';
                setError(errorMsg);
                if (onError) {
                  onError(errorMsg);
                }
              }
            }
          } catch (err: any) {
            // Не прерываем опрос при единичных ошибках
          }
        }, 3000); // Опрос каждые 3 секунды
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Не удалось получить статус поиска по производителям';
      setError(errorMsg);
      if (onError) {
        onError(errorMsg);
      }
    }
  };

  const getStatusIcon = () => {
    switch (status.status) {
      case 'running':
        return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusText = () => {
    switch (status.status) {
      case 'running':
        return 'Выполняется...';
      case 'completed':
        return 'Завершено';
      case 'error':
        return 'Ошибка';
      default:
        return 'Неизвестно';
    }
  };

  const getStatusBadgeVariant = (): "default" | "secondary" | "destructive" | "outline" => {
    switch (status.status) {
      case 'running':
        return 'default';
      case 'completed':
        return 'secondary';
      case 'error':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <h3 className="font-semibold">Поиск новостей по производителям</h3>
          </div>
          <Badge variant={getStatusBadgeVariant()}>
            {getStatusText()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Прогресс-бар */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Обработано {status.processed} из {status.total} производителей
            </span>
            <span className="font-semibold">{status.percent}%</span>
          </div>
          <Progress value={status.percent} className="h-2" />
        </div>

        {/* Сообщение об ошибке */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Дополнительная информация при завершении */}
        {status.status === 'completed' && (
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-xs text-muted-foreground mb-1">Создано новостей</p>
              <p className="text-2xl font-bold text-green-700">{status.created || 0}</p>
            </div>
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-md">
              <p className="text-xs text-muted-foreground mb-1">Ошибок</p>
              <p className="text-2xl font-bold text-orange-700">{status.errors || 0}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}