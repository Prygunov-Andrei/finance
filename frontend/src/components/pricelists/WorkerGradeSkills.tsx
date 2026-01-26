import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, WorkerGradeSkills, CreateWorkerGradeSkillsData } from '../../lib/api';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Label } from '../ui/label';
import { Plus, Edit2, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { CONSTANTS } from '../../constants';
import { useWorkerGrades, useWorkSections } from '../../hooks';

export function WorkerGradeSkillsComponent() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<number | undefined>();
  const [selectedSection, setSelectedSection] = useState<number | undefined>();
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSkill, setDeletingSkill] = useState<WorkerGradeSkills | null>(null);

  const [formData, setFormData] = useState<CreateWorkerGradeSkillsData>({
    grade: 0,
    section: 0,
    description: '',
  });

  const { data: skills, isLoading } = useQuery({
    queryKey: ['worker-grade-skills', selectedGrade, selectedSection],
    queryFn: () => api.getWorkerGradeSkills(selectedGrade, selectedSection),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const { data: grades } = useWorkerGrades(true);

  const { data: allSections } = useWorkSections(false);
  const sections = allSections?.filter((s) => s.is_active);

  const createMutation = useMutation({
    mutationFn: (data: CreateWorkerGradeSkillsData) => api.createWorkerGradeSkills(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-grade-skills'] });
      setDialogOpen(false);
      resetForm();
      toast.success('Навык успешно создан');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteWorkerGradeSkills(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-grade-skills'] });
      setDeleteDialogOpen(false);
      setDeletingSkill(null);
      toast.success('Навык успешно удален');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      grade: 0,
      section: 0,
      description: '',
    });
  };

  const handleOpenDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.grade || !formData.section || !formData.description.trim()) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    createMutation.mutate(formData);
  };

  const handleDelete = (skill: WorkerGradeSkills) => {
    setDeletingSkill(skill);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (deletingSkill) {
      deleteMutation.mutate(deletingSkill.id);
    }
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Навыки разрядов</h1>
          <p className="text-sm text-gray-500 mt-1">
            Описание навыков по разделам для каждого разряда
          </p>
        </div>
        <Button onClick={handleOpenDialog} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Добавить навык
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="filterGrade">Фильтр по разряду</Label>
            <select
              id="filterGrade"
              value={selectedGrade || ''}
              onChange={(e) =>
                setSelectedGrade(e.target.value ? Number(e.target.value) : undefined)
              }
              className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Все разряды</option>
              {grades?.map((grade) => (
                <option key={grade.id} value={grade.id}>
                  {grade.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="filterSection">Фильтр по разделу</Label>
            <select
              id="filterSection"
              value={selectedSection || ''}
              onChange={(e) =>
                setSelectedSection(e.target.value ? Number(e.target.value) : undefined)
              }
              className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Все разделы</option>
              {sections?.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.code} - {section.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Разряд
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Раздел
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Описание
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Действия
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-6 py-12">
                  <div className="flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                  </div>
                </td>
              </tr>
            ) : skills && skills.length > 0 ? (
              skills.map((skill) => (
                <tr key={skill.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-semibold text-sm">
                        {skill.grade_detail?.grade}
                      </span>
                      <span className="font-medium text-gray-900">
                        {skill.grade_detail?.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex px-2 py-1 text-xs font-mono font-medium rounded bg-gray-100 text-gray-700">
                        {skill.section_detail?.code}
                      </span>
                      <span className="text-sm text-gray-900">
                        {skill.section_detail?.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-700 max-w-md">{skill.description}</div>
                  </td>
                  <td className="px-6 py-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(skill)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  Навыки не найдены
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Добавить навык</DialogTitle>
            <DialogDescription>
              Добавьте новый навык для разряда
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="grade">Разряд *</Label>
              <select
                id="grade"
                value={formData.grade}
                onChange={(e) => setFormData({ ...formData, grade: Number(e.target.value) })}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value={0}>Выберите разряд</option>
                {grades?.map((grade) => (
                  <option key={grade.id} value={grade.id}>
                    {grade.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="section">Раздел *</Label>
              <select
                id="section"
                value={formData.section}
                onChange={(e) =>
                  setFormData({ ...formData, section: Number(e.target.value) })
                }
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value={0}>Выберите раздел</option>
                {sections?.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.code} - {section.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="description">Описание *</Label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Опишите навыки, которыми должен обладать рабочий данного разряда для работы в этом разделе"
                required
                rows={4}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  resetForm();
                }}
                disabled={createMutation.isPending}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Создание...
                  </>
                ) : (
                  'Создать'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Удалить навык?</DialogTitle>
            <DialogDescription>
              Подтвердите удаление навыка
            </DialogDescription>
          </DialogHeader>

          <p className="text-sm text-gray-600">
            Вы уверены, что хотите удалить этот навык? Это действие нельзя отменить.
          </p>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeletingSkill(null);
              }}
              disabled={deleteMutation.isPending}
            >
              Отмена
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Удаление...
                </>
              ) : (
                'Удалить'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}