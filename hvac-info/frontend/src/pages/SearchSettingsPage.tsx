import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import MainLayout from '../components/MainLayout';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { 
  Settings, 
  Plus, 
  Edit, 
  Copy, 
  Trash2, 
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles
} from 'lucide-react';
import searchConfigService, { 
  SearchConfiguration, 
  SearchConfigurationListItem 
} from '../services/searchConfigService';
import { toast } from 'sonner';
import ApiErrorBanner from '../components/ApiErrorBanner';
import SearchConfigFormDialog from '../components/SearchConfigFormDialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

export default function SearchSettingsPage() {
  const { user } = useAuth();
  const [activeConfig, setActiveConfig] = useState<SearchConfiguration | null>(null);
  const [configurations, setConfigurations] = useState<SearchConfigurationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<SearchConfiguration | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = user?.is_staff === true;

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [active, list] = await Promise.all([
        searchConfigService.getActiveConfiguration().catch(() => null),
        searchConfigService.getConfigurations()
      ]);
      
      setActiveConfig(active);
      setConfigurations(list);
    } catch (err: any) {
      console.error('Error loading search configurations:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (id: number) => {
    try {
      await searchConfigService.activateConfiguration(id);
      toast.success('Конфигурация активирована');
      loadData();
    } catch (err: any) {
      console.error('Error activating configuration:', err);
      toast.error('Ошибка активации конфигурации');
    }
  };

  const handleDuplicate = async (id: number) => {
    try {
      await searchConfigService.duplicateConfiguration(id);
      toast.success('Конфигурация дублирована');
      loadData();
    } catch (err: any) {
      console.error('Error duplicating configuration:', err);
      toast.error('Ошибка дублирования конфигурации');
    }
  };

  const handleDelete = async () => {
    if (!configToDelete) return;
    
    setDeleting(true);
    try {
      await searchConfigService.deleteConfiguration(configToDelete);
      toast.success('Конфигурация удалена');
      setDeleteConfirmOpen(false);
      setConfigToDelete(null);
      loadData();
    } catch (err: any) {
      console.error('Error deleting configuration:', err);
      toast.error('Ошибка удаления конфигурации');
    } finally {
      setDeleting(false);
    }
  };

  const handleEdit = async (id: number) => {
    try {
      const config = await searchConfigService.getConfiguration(id);
      setSelectedConfig(config);
      setFormDialogOpen(true);
    } catch (err: any) {
      console.error('Error loading configuration:', err);
      toast.error('Ошибка загрузки конфигурации');
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
              <Settings className="w-8 h-8 text-primary" />
              <h1 className="text-3xl font-semibold">Настройки поиска</h1>
            </div>
            <Button
              onClick={() => {
                setSelectedConfig(null);
                setFormDialogOpen(true);
              }}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Создать конфигурацию
            </Button>
          </div>

          {loading && (
            <Card className="p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-muted-foreground">Загрузка настроек...</p>
            </Card>
          )}

          {error && (
            <ApiErrorBanner
              error={error}
              onRetry={loadData}
            />
          )}

          {!loading && !error && (
            <>
              {/* Активная конфигурация */}
              {activeConfig && (
                <Card className="p-6 border-2 border-green-500 bg-green-50/50 dark:bg-green-950/20">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-xl font-semibold">{activeConfig.name}</h2>
                        <Badge className="bg-green-500">Активная</Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Провайдер</p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className={`w-2 h-2 rounded-full ${getProviderColor(activeConfig.primary_provider)}`} />
                            <p className="font-medium">{getProviderName(activeConfig.primary_provider)}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Max Results</p>
                          <p className="font-medium mt-1">{activeConfig.max_search_results}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Temperature</p>
                          <p className="font-medium mt-1">{activeConfig.temperature}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Max News/Resource</p>
                          <p className="font-medium mt-1">{activeConfig.max_news_per_resource}</p>
                        </div>
                      </div>
                      <div className="mt-4">
                        <Button
                          size="sm"
                          onClick={() => handleEdit(activeConfig.id)}
                          className="flex items-center gap-2"
                        >
                          <Edit className="w-3 h-3" />
                          Редактировать
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Список конфигураций */}
              <Card>
                <div className="p-6 border-b">
                  <h2 className="text-lg font-semibold">Все конфигурации</h2>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Название</TableHead>
                      <TableHead>Провайдер</TableHead>
                      <TableHead className="text-center">Max Results</TableHead>
                      <TableHead className="text-center">Temperature</TableHead>
                      <TableHead>Обновлено</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {configurations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          Нет конфигураций
                        </TableCell>
                      </TableRow>
                    ) : (
                      configurations.map((config) => (
                        <TableRow key={config.id}>
                          <TableCell>
                            {config.is_active && (
                              <CheckCircle2 className="w-5 h-5 text-green-500" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{config.name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${getProviderColor(config.primary_provider)}`} />
                              {getProviderName(config.primary_provider)}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{config.max_search_results}</TableCell>
                          <TableCell className="text-center">{config.temperature}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(config.updated_at).toLocaleDateString('ru-RU')}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {!config.is_active && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleActivate(config.id)}
                                  className="flex items-center gap-1"
                                >
                                  <Sparkles className="w-3 h-3" />
                                  Активировать
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEdit(config.id)}
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDuplicate(config.id)}
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setConfigToDelete(config.id);
                                  setDeleteConfirmOpen(true);
                                }}
                                disabled={config.is_active}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Диалог создания/редактирования */}
      <SearchConfigFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        config={selectedConfig}
        onSuccess={() => {
          setFormDialogOpen(false);
          setSelectedConfig(null);
          loadData();
        }}
      />

      {/* Диалог подтверждения удаления */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить конфигурацию?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Конфигурация будет удалена навсегда.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
