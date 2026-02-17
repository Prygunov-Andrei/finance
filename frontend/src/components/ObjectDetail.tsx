import { useParams, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { CONSTANTS } from '../constants';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { ArrowLeft, Loader2, LayoutDashboard, UserCheck, HardHat, Settings } from 'lucide-react';
import { ObjectHeader } from './objects/ObjectHeader';
import { ObjectMainTab } from './objects/ObjectMainTab';
import { ObjectCustomerTab } from './objects/ObjectCustomerTab';
import { ObjectExecutorsTab } from './objects/ObjectExecutorsTab';
import { ObjectSettingsTab } from './objects/ObjectSettingsTab';

export function ObjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const objectId = parseInt(id || '0');

  const { data: object, isLoading, error } = useQuery({
    queryKey: ['construction-object', objectId],
    queryFn: () => api.getConstructionObjectById(objectId),
    enabled: !!objectId,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !object) {
    return (
      <div className="p-8">
        <div className="bg-red-50 text-red-600 p-4 rounded-xl">
          Ошибка загрузки объекта: {(error as Error)?.message || 'Объект не найден'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate('/objects')}
          className="mb-4"
          aria-label="Назад к списку объектов"
          tabIndex={0}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад к списку
        </Button>

        <ObjectHeader object={object} objectId={objectId} />

        <Tabs defaultValue="main" className="w-full mt-6">
          <TabsList className="flex w-full mb-6">
            <TabsTrigger value="main" className="flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4" />
              Основное
            </TabsTrigger>
            <TabsTrigger value="customer" className="flex items-center gap-2">
              <UserCheck className="w-4 h-4" />
              Заказчик
            </TabsTrigger>
            <TabsTrigger value="executors" className="flex items-center gap-2">
              <HardHat className="w-4 h-4" />
              Исполнители
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Настройки
            </TabsTrigger>
          </TabsList>

          <TabsContent value="main">
            <ObjectMainTab objectId={objectId} />
          </TabsContent>

          <TabsContent value="customer">
            <ObjectCustomerTab objectId={objectId} />
          </TabsContent>

          <TabsContent value="executors">
            <ObjectExecutorsTab objectId={objectId} />
          </TabsContent>

          <TabsContent value="settings">
            <ObjectSettingsTab objectId={objectId} objectName={object.name} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
