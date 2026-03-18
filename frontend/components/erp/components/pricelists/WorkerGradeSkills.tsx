import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, WorkerGradeSkills, CreateWorkerGradeSkillsData } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Plus, Edit2, Trash2, Loader2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { CONSTANTS } from '../../constants';
import { useWorkerGrades, useWorkSections } from '@/hooks';

export function WorkerGradeSkillsComponent() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<WorkerGradeSkills | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<number | undefined>();
  const [selectedSection, setSelectedSection] = useState<number | undefined>();
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSkill, setDeletingSkill] = useState<WorkerGradeSkills | null>(null);
  const [openCards, setOpenCards] = useState<Set<number>>(new Set());

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
  const sections = allSections?.filter((s) => s.is_active && s.parent === null);

  const createMutation = useMutation({
    mutationFn: (data: CreateWorkerGradeSkillsData) => api.createWorkerGradeSkills(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-grade-skills'] });
      setDialogOpen(false);
      setEditingSkill(null);
      resetForm();
      toast.success('Навык успешно создан');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateWorkerGradeSkillsData> }) =>
      api.updateWorkerGradeSkills(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-grade-skills'] });
      setDialogOpen(false);
      setEditingSkill(null);
      resetForm();
      toast.success('Навык успешно обновлен');
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

  const handleOpenCreate = () => {
    setEditingSkill(null);
    resetForm();
    setDialogOpen(true);
  };

  const handleOpenEdit = (skill: WorkerGradeSkills) => {
    setEditingSkill(skill);
    setFormData({
      grade: skill.grade,
      section: skill.section,
      description: skill.description,
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.grade || !formData.section || !formData.description.trim()) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    if (editingSkill) {
      updateMutation.mutate({ id: editingSkill.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
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

  const toggleCard = (id: number) => {
    setOpenCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

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
        <Button onClick={handleOpenCreate} className="bg-blue-600 hover:bg-blue-700">
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
                  {section.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
            <div className="flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          </div>
        ) : skills && skills.length > 0 ? (
          skills.map((skill) => (
            <Collapsible
              key={skill.id}
              open={openCards.has(skill.id)}
              onOpenChange={() => toggleCard(skill.id)}
            >
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-semibold text-sm">
                        {skill.grade_detail?.grade}
                      </span>
                      <div>
                        <span className="font-medium text-gray-900">
                          {skill.grade_detail?.name}
                        </span>
                        <span className="mx-2 text-gray-300">&middot;</span>
                        <span className="text-sm text-gray-600">
                          {skill.section_detail?.name}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(skill);
                        }}
                        className="text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(skill);
                        }}
                        className="text-gray-500 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <ChevronDown
                        className={`w-5 h-5 text-gray-400 transition-transform ${
                          openCards.has(skill.id) ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-6 pb-6 border-t border-gray-100">
                    <article className="prose prose-sm prose-slate max-w-none pt-4">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {skill.description}
                      </ReactMarkdown>
                    </article>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
            Навыки не найдены
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSkill ? 'Редактировать навык' : 'Добавить навык'}</DialogTitle>
            <DialogDescription>
              {editingSkill ? 'Измените данные навыка' : 'Добавьте новый навык для разряда'}
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
                    {section.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="description">Описание * (поддерживается Markdown)</Label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Опишите навыки (поддерживается Markdown разметка)"
                required
                rows={12}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  setEditingSkill(null);
                  resetForm();
                }}
                disabled={isMutating}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={isMutating}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isMutating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {editingSkill ? 'Сохранение...' : 'Создание...'}
                  </>
                ) : (
                  editingSkill ? 'Сохранить' : 'Создать'
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
            Вы уверены, что хотите удалить навык{' '}
            <strong>{deletingSkill?.grade_detail?.name}</strong> для раздела{' '}
            <strong>{deletingSkill?.section_detail?.name}</strong>? Это действие нельзя отменить.
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
