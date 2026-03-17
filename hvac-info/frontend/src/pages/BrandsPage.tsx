import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import referencesService, { Brand } from '../services/referencesService';
import MainLayout from '../components/MainLayout';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { Building2, Plus, Edit2, Trash2 } from 'lucide-react';
import BrandForm from '../components/forms/BrandForm';
import DeleteConfirmDialog from '../components/DeleteConfirmDialog';
import { toast } from 'sonner';

export default function BrandsPage() {
  const { language, getLocalizedField } = useLanguage();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'manufacturer'>('name');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [brandToDelete, setBrandToDelete] = useState<Brand | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = user?.is_staff === true;

  useEffect(() => {
    loadBrands();
  }, [language]);

  const loadBrands = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await referencesService.getBrands(language);
      setBrands(data);
    } catch (err: any) {
      console.error('Error loading brands:', err);
      setError(t('brands.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const sortedBrands = [...brands].sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    } else {
      const aManuf = a.manufacturer_name || '';
      const bManuf = b.manufacturer_name || '';
      return aManuf.localeCompare(bManuf);
    }
  });

  const handleAddBrand = () => {
    setSelectedBrand(null);
    setFormOpen(true);
  };

  const handleEditBrand = (brand: Brand) => {
    setSelectedBrand(brand);
    setFormOpen(true);
  };

  const handleDeleteBrand = (brand: Brand) => {
    setBrandToDelete(brand);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!brandToDelete) return;
    setDeleting(true);
    try {
      await referencesService.deleteBrand(brandToDelete.id);
      toast.success('Бренд успешно удален');
      loadBrands();
      setDeleteDialogOpen(false);
      setBrandToDelete(null);
    } catch (err: any) {
      console.error('Error deleting brand:', err);
      toast.error('Ошибка при удалении бренда');
    } finally {
      setDeleting(false);
    }
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setSelectedBrand(null);
  };

  const handleFormSubmit = async (brand: Brand) => {
    setFormOpen(false);
    setLoading(true);
    try {
      if (brand.id) {
        await referencesService.updateBrand(brand);
        setBrands(
          brands.map((b) => (b.id === brand.id ? { ...brand } : b))
        );
        toast.success(t('brands.updateSuccess'));
      } else {
        const newBrand = await referencesService.createBrand(brand);
        setBrands([...brands, newBrand]);
        toast.success(t('brands.createSuccess'));
      }
    } catch (err: any) {
      console.error('Error saving brand:', err);
      toast.error(t('brands.saveError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1>{t('brands.title')}</h1>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && !loading && !error && (
                <Button
                  variant="outline"
                  onClick={handleAddBrand}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Добавить бренд
                </Button>
              )}
              <span className="text-sm text-muted-foreground">{t('common.filter')}:</span>
              <Button
                variant={sortBy === 'name' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSortBy('name')}
              >
                {t('brands.name')}
              </Button>
              <Button
                variant={sortBy === 'manufacturer' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSortBy('manufacturer')}
              >
                {t('brands.manufacturer')}
              </Button>
            </div>
          </div>

          {loading && (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">{t('common.loading')}</p>
            </Card>
          )}

          {error && (
            <Card className="p-6 border-destructive bg-destructive/10">
              <p className="text-destructive">{error}</p>
            </Card>
          )}

          {!loading && !error && brands.length === 0 && (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">{t('brands.notFound')}</p>
            </Card>
          )}

          {!loading && !error && brands.length > 0 && (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20"></TableHead>
                    <TableHead>{t('brands.name')}</TableHead>
                    <TableHead>{t('brands.manufacturer')}</TableHead>
                    <TableHead>{t('brands.description')}</TableHead>
                    {isAdmin && <TableHead className="w-20"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedBrands.map((brand) => (
                    <TableRow key={brand.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="w-16 h-16 bg-muted rounded flex items-center justify-center p-2">
                          {brand.logo ? (
                            <ImageWithFallback
                              src={brand.logo}
                              alt={brand.name}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <Building2 className="w-8 h-8 text-muted-foreground opacity-50" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{brand.name}</TableCell>
                      <TableCell>
                        {brand.manufacturer_name && (
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {brand.manufacturer_name}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-md">
                        {getLocalizedField(brand, 'description') && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {getLocalizedField(brand, 'description')}
                          </p>
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditBrand(brand)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteBrand(brand)}
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
            </Card>
          )}

          {/* Форма добавления/редактирования бренда */}
          <BrandForm
            open={formOpen}
            onOpenChange={setFormOpen}
            brand={selectedBrand}
            onSuccess={loadBrands}
          />

          {/* Диалог подтверждения удаления бренда */}
          <DeleteConfirmDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            title="Удалить бренд"
            description="Вы уверены, что хотите удалить этот бренд?"
            itemName={brandToDelete?.name}
            onConfirm={handleConfirmDelete}
            loading={deleting}
          />
        </div>
      </div>
    </MainLayout>
  );
}