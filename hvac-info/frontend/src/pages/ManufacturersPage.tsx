import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import referencesService, { Manufacturer } from '../services/referencesService';
import MainLayout from '../components/MainLayout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ExternalLink, ChevronDown, ChevronUp, AlertCircle, RefreshCw, Sparkles, Plus, Edit2, Trash2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { useTranslation } from 'react-i18next';
import ManufacturerStatisticsDashboard from '../components/statistics/ManufacturerStatisticsDashboard';
import ManufacturerNewsDiscoveryDialog from '../components/ManufacturerNewsDiscoveryDialog';
import ManufacturerForm from '../components/forms/ManufacturerForm';
import DeleteConfirmDialog from '../components/DeleteConfirmDialog';
import { toast } from 'sonner';

export default function ManufacturersPage() {
  const { language, getLocalizedField } = useLanguage();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
  const [discoveryDialogOpen, setDiscoveryDialogOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedManufacturer, setSelectedManufacturer] = useState<Manufacturer | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [manufacturerToDelete, setManufacturerToDelete] = useState<Manufacturer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = user?.is_staff === true;

  useEffect(() => {
    loadManufacturers();
  }, [language]);

  const loadManufacturers = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await referencesService.getManufacturers(language);
      setManufacturers(data);
      
      // Разворачиваем все регионы по умолчанию
      const regions = new Set(data.map(m => m.region || 'Другие').filter(Boolean));
      setExpandedRegions(regions);
    } catch (err: any) {
      console.error('Error loading manufacturers:', err);
      setError(t('manufacturers.loadError'));
    } finally {
      setLoading(false);
    }
  };

  // Группировка по регионам
  const groupedManufacturers = manufacturers.reduce((acc, manufacturer) => {
    const region = manufacturer.region || 'Другие';
    if (!acc[region]) {
      acc[region] = [];
    }
    acc[region].push(manufacturer);
    return acc;
  }, {} as Record<string, Manufacturer[]>);

  const toggleRegion = (region: string) => {
    const newExpanded = new Set(expandedRegions);
    if (newExpanded.has(region)) {
      newExpanded.delete(region);
    } else {
      newExpanded.add(region);
    }
    setExpandedRegions(newExpanded);
  };

  const handleAddManufacturer = () => {
    setSelectedManufacturer(null);
    setFormOpen(true);
  };

  const handleEditManufacturer = (manufacturer: Manufacturer) => {
    setSelectedManufacturer(manufacturer);
    setFormOpen(true);
  };

  const handleDeleteManufacturer = (manufacturer: Manufacturer) => {
    setManufacturerToDelete(manufacturer);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteManufacturer = async () => {
    if (!manufacturerToDelete) return;
    setDeleting(true);
    try {
      await referencesService.deleteManufacturer(manufacturerToDelete.id);
      toast.success(t('manufacturers.deleteSuccess'));
      loadManufacturers();
      setDeleteDialogOpen(false);
      setManufacturerToDelete(null);
    } catch (err: any) {
      console.error('Error deleting manufacturer:', err);
      toast.error(t('manufacturers.deleteError'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <MainLayout>
      <div className="p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <h1>{t('manufacturers.title')}</h1>
            
            <div className="flex items-center gap-2">
              {/* Кнопка добавления производителя - только для админов */}
              {isAdmin && !loading && !error && (
                <Button
                  onClick={handleAddManufacturer}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Добавить производителя
                </Button>
              )}
              
              {/* Кнопка "Найти новости по проиводителям" - только для админов */}
              {isAdmin && !loading && !error && manufacturers.length > 0 && (
                <Button
                  onClick={() => setDiscoveryDialogOpen(true)}
                  className="flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Найти новости по производителям
                </Button>
              )}
            </div>
          </div>

          {loading && (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">{t('common.loading')}</p>
            </Card>
          )}

          {error && (
            <Card className="p-6 border-destructive bg-destructive/10">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-destructive font-medium mb-2">{error}</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Backend не отвечает на запросы. Возможные причины:
                  </p>
                  <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 mb-4">
                    <li>Django сервер не запущен</li>
                    <li>Localtunnel не работает или слишком медленный</li>
                    <li>Endpoint /api/references/manufacturers/ недоступен</li>
                    <li>CORS блокирует запросы</li>
                  </ul>
                  <Button 
                    onClick={loadManufacturers}
                    variant="outline"
                    size="sm"
                    disabled={loading}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Попробовать еще раз
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {!loading && !error && manufacturers.length === 0 && (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">{t('manufacturers.notFound')}</p>
            </Card>
          )}

          {/* Инфографика статистики производителей - только для администраторов */}
          {!loading && !error && manufacturers.length > 0 && isAdmin && (
            <ManufacturerStatisticsDashboard />
          )}

          {!loading && !error && manufacturers.length > 0 && (
            <div className="space-y-4">
              {Object.entries(groupedManufacturers)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([region, items]) => (
                  <Card key={region} className="overflow-hidden">
                    <button
                      onClick={() => toggleRegion(region)}
                      className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <h3>{region}</h3>
                        <span className="text-sm text-muted-foreground">
                          ({items.length})
                        </span>
                      </div>
                      {expandedRegions.has(region) ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>

                    {expandedRegions.has(region) && (
                      <div className="border-t">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('manufacturers.name')}</TableHead>
                              <TableHead>{t('manufacturers.description')}</TableHead>
                              <TableHead>{t('manufacturers.website')}</TableHead>
                              {isAdmin && (
                                <TableHead className="text-right">
                                  {t('common.actions')}
                                </TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.map((manufacturer) => (
                              <TableRow key={manufacturer.id}>
                                <TableCell>
                                  {manufacturer.name}
                                </TableCell>
                                <TableCell className="max-w-md">
                                  <p className="text-sm text-muted-foreground line-clamp-2">
                                    {getLocalizedField(manufacturer, 'description') || '—'}
                                  </p>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {manufacturer.website_1 && (
                                      <a
                                        href={manufacturer.website_1}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline text-sm flex items-center gap-1"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                        {t('manufacturers.website')}
                                      </a>
                                    )}
                                    {manufacturer.website_2 && (
                                      <a
                                        href={manufacturer.website_2}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline text-sm flex items-center gap-1"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                        2
                                      </a>
                                    )}
                                    {manufacturer.website_3 && (
                                      <a
                                        href={manufacturer.website_3}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline text-sm flex items-center gap-1"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                        3
                                      </a>
                                    )}
                                  </div>
                                </TableCell>
                                {isAdmin && (
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleEditManufacturer(manufacturer)}
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDeleteManufacturer(manufacturer)}
                                        className="text-destructive hover:text-destructive"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </Card>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Диалог автоматического поиска новостей по производителям */}
      <ManufacturerNewsDiscoveryDialog
        open={discoveryDialogOpen}
        onOpenChange={setDiscoveryDialogOpen}
        totalManufacturers={manufacturers.length}
      />

      {/* Форма добавления/редактирования производителя */}
      <ManufacturerForm
        open={formOpen}
        onOpenChange={setFormOpen}
        manufacturer={selectedManufacturer}
        onSuccess={loadManufacturers}
      />

      {/* Диалог подтверждения удаления производителя */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Удалить производителя"
        description="Вы уверены, что хотите удалить этого производителя?"
        warning={manufacturerToDelete ? `Все бренды производителя "${manufacturerToDelete.name}" также будут удалены.` : undefined}
        itemName={manufacturerToDelete?.name}
        onConfirm={confirmDeleteManufacturer}
        loading={deleting}
      />
    </MainLayout>
  );
}