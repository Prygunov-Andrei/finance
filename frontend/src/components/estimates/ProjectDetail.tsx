import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ProjectNote } from '../../lib/api';
import { formatDate } from '../../lib/utils';
import { CONSTANTS } from '../../constants';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ArrowLeft, Loader2, FileText, Download, Plus, Edit2, Trash2, Check, Calendar, Users, Info, History } from 'lucide-react';
import { toast } from 'sonner';

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isApprovalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [isNoteDialogOpen, setNoteDialogOpen] = useState(false);
  const [isVersionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<ProjectNote | null>(null);
  const [approvalFile, setApprovalFile] = useState<File | null>(null);
  const [noteText, setNoteText] = useState('');

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.getProjectDetail(Number(id)),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: versions } = useQuery({
    queryKey: ['project-versions', id],
    queryFn: () => api.getProjectVersions(Number(id)),
    enabled: !!id && isVersionHistoryOpen,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: currentUser } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => api.getCurrentUser(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const primaryCheckMutation = useMutation({
    mutationFn: () => api.primaryCheckProject(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      toast.success('Первичная проверка выполнена');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const secondaryCheckMutation = useMutation({
    mutationFn: () => api.secondaryCheckProject(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      toast.success('Вторичная проверка выполнена');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const approveProductionMutation = useMutation({
    mutationFn: (file: File) => api.approveProduction(Number(id), file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      setApprovalDialogOpen(false);
      setApprovalFile(null);
      toast.success('Разрешение в производство получено');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const createVersionMutation = useMutation({
    mutationFn: () => api.createProjectVersion(Number(id)),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Новая версия создана');
      navigate(`/estimates/projects/${data.id}`);
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: (text: string) => api.createProjectNote({ project: Number(id), text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      setNoteDialogOpen(false);
      setNoteText('');
      toast.success('Замечание добавлено');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ noteId, text }: { noteId: number; text: string }) =>
      api.updateProjectNote(noteId, { text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      setEditingNote(null);
      setNoteDialogOpen(false);
      setNoteText('');
      toast.success('Замечание обновлено');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: number) => api.deleteProjectNote(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      toast.success('Замечание удалено');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const handleNoteSubmit = () => {
    if (!noteText.trim()) {
      toast.error('Введите текст замечания');
      return;
    }

    if (editingNote) {
      updateNoteMutation.mutate({ noteId: editingNote.id, text: noteText });
    } else {
      createNoteMutation.mutate(noteText);
    }
  };

  const handleEditNote = (note: ProjectNote) => {
    setEditingNote(note);
    setNoteText(note.text);
    setNoteDialogOpen(true);
  };

  const handleDeleteNote = (noteId: number) => {
    if (window.confirm('Удалить это замечание?')) {
      deleteNoteMutation.mutate(noteId);
    }
  };

  const handleApprovalSubmit = () => {
    if (!approvalFile) {
      toast.error('Загрузите файл разрешения');
      return;
    }

    approveProductionMutation.mutate(approvalFile);
  };

  const handleCreateVersion = () => {
    if (window.confirm('Создать новую версию проекта? Текущая версия будет помечена как неактуальная.')) {
      createVersionMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Проект не найден</p>
          <Button variant="outline" onClick={() => navigate('/estimates/projects')} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Вернуться к списку
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/estimates/projects')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900">{project.cipher}</h1>
              <span className="inline-flex px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-100 text-blue-700">
                {project.stage_display}
              </span>
              <span className="text-sm text-gray-500">v{project.version_number}</span>
              {!project.is_current && (
                <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-600">
                  Старая версия
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">{project.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setVersionHistoryOpen(true)}>
            <History className="w-4 h-4 mr-2" />
            История версий
          </Button>
          <Button variant="outline" onClick={handleCreateVersion}>
            <Plus className="w-4 h-4 mr-2" />
            Новая версия
          </Button>
        </div>
      </div>

      <Tabs defaultValue="info" className="space-y-6">
        <TabsList>
          <TabsTrigger value="info">
            <Info className="w-4 h-4 mr-2" />
            Информация
          </TabsTrigger>
          <TabsTrigger value="checks">
            <Check className="w-4 h-4 mr-2" />
            Проверки
          </TabsTrigger>
          <TabsTrigger value="production">
            <Calendar className="w-4 h-4 mr-2" />
            Производство
          </TabsTrigger>
          <TabsTrigger value="notes">
            <FileText className="w-4 h-4 mr-2" />
            Замечания
            {project.project_notes.length > 0 && (
              <span className="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                {project.project_notes.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Info Tab */}
        <TabsContent value="info" className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Основная информация</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-500">Шифр</div>
                <div className="font-medium text-gray-900">{project.cipher}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Название</div>
                <div className="font-medium text-gray-900">{project.name}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Дата</div>
                <div className="font-medium text-gray-900">{formatDate(project.date)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Стадия</div>
                <div>{project.stage_display}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Объект</div>
                <div className="font-medium text-gray-900">{project.object_name}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Версия</div>
                <div className="font-medium text-gray-900">v{project.version_number}</div>
              </div>
            </div>

            {project.notes && (
              <div className="mt-4 pt-4 border-t">
                <div className="text-sm text-gray-500 mb-2">Примечания</div>
                <div className="text-gray-900 whitespace-pre-wrap">{project.notes}</div>
              </div>
            )}

            <div className="mt-6">
              <a
                href={project.file}
                download
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download className="w-4 h-4 mr-2" />
                Скачать файл проекта
              </a>
            </div>
          </div>
        </TabsContent>

        {/* Checks Tab */}
        <TabsContent value="checks" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Primary Check */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Первичная проверка</h3>
              {project.primary_check_done ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-green-100 text-green-700">
                      ✓ Выполнена
                    </span>
                  </div>
                  {project.primary_check_by_username && (
                    <div>
                      <div className="text-sm text-gray-500">Кто проверил</div>
                      <div className="font-medium text-gray-900">{project.primary_check_by_username}</div>
                    </div>
                  )}
                  {project.primary_check_date && (
                    <div>
                      <div className="text-sm text-gray-500">Дата проверки</div>
                      <div className="font-medium text-gray-900">{formatDate(project.primary_check_date)}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100 text-gray-600">
                    ✗ Не выполнена
                  </span>
                  <Button
                    onClick={() => primaryCheckMutation.mutate()}
                    disabled={primaryCheckMutation.isPending}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {primaryCheckMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Отметка...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Отметить первичную проверку
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* Secondary Check */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Вторичная проверка</h3>
              {project.secondary_check_done ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-green-100 text-green-700">
                      ✓ Выполнена
                    </span>
                  </div>
                  {project.secondary_check_by_username && (
                    <div>
                      <div className="text-sm text-gray-500">Кто проверил</div>
                      <div className="font-medium text-gray-900">{project.secondary_check_by_username}</div>
                    </div>
                  )}
                  {project.secondary_check_date && (
                    <div>
                      <div className="text-sm text-gray-500">Дата проверки</div>
                      <div className="font-medium text-gray-900">{formatDate(project.secondary_check_date)}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100 text-gray-600">
                    ✗ Не выполнена
                  </span>
                  <Button
                    onClick={() => secondaryCheckMutation.mutate()}
                    disabled={secondaryCheckMutation.isPending}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {secondaryCheckMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Отметка...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Отметить вторичную проверку
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Production Tab */}
        <TabsContent value="production" className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Разрешение в производство</h3>
            {project.is_approved_for_production ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-green-100 text-green-700">
                     Разрешено
                  </span>
                </div>
                {project.production_approval_date && (
                  <div>
                    <div className="text-sm text-gray-500">Дата получения разрешения</div>
                    <div className="font-medium text-gray-900">{formatDate(project.production_approval_date)}</div>
                  </div>
                )}
                {project.production_approval_file && (
                  <div>
                    <a
                      href={project.production_approval_file}
                      download
                      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Скачать файл разрешения
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100 text-gray-600">
                  ✗ Не разрешено
                </span>
                <Button
                  onClick={() => setApprovalDialogOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Разрешить в производство
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes" className="space-y-6">
          <div className="flex justify-end">
            <Button onClick={() => {
              setEditingNote(null);
              setNoteText('');
              setNoteDialogOpen(true);
            }} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Добавить замечание
            </Button>
          </div>

          {project.project_notes.length > 0 ? (
            <div className="space-y-4">
              {project.project_notes.map((note) => (
                <div key={note.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-gray-900">{note.author.username}</span>
                        <span className="text-sm text-gray-500">
                          {formatDate(note.created_at)}
                        </span>
                      </div>
                      <p className="text-gray-900 whitespace-pre-wrap">{note.text}</p>
                    </div>
                    {currentUser && note.author.id === currentUser.id && (
                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditNote(note)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteNote(note.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Нет замечаний к проекту</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Approval Dialog */}
      <Dialog open={isApprovalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Разрешить в производство</DialogTitle>
            <DialogDescription>
              Загрузите файл разрешения для перевода проекта в производство
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="approval_file">Файл разрешения *</Label>
              <Input
                id="approval_file"
                type="file"
                onChange={(e) => setApprovalFile(e.target.files?.[0] || null)}
                className="mt-1.5"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={handleApprovalSubmit}
              disabled={approveProductionMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {approveProductionMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Загрузка...
                </>
              ) : (
                'Разрешить'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Note Dialog */}
      <Dialog open={isNoteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingNote ? 'Редактировать замечание' : 'Добавить замечание'}</DialogTitle>
            <DialogDescription>
              {editingNote ? 'Измените текст замечания' : 'Добавьте замечание к проекту'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="note_text">Текст замечания *</Label>
              <textarea
                id="note_text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={5}
                placeholder="Введите текст замечания"
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setNoteDialogOpen(false);
              setEditingNote(null);
              setNoteText('');
            }}>
              Отмена
            </Button>
            <Button
              onClick={handleNoteSubmit}
              disabled={createNoteMutation.isPending || updateNoteMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {(createNoteMutation.isPending || updateNoteMutation.isPending) ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Сохранение...
                </>
              ) : (
                editingNote ? 'Сохранить' : 'Добавить'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={isVersionHistoryOpen} onOpenChange={setVersionHistoryOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>История версий</DialogTitle>
            <DialogDescription>
              Все версии проекта {project.cipher}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {versions && versions.length > 0 ? (
              versions.map((version) => (
                <div
                  key={version.id}
                  onClick={() => {
                    setVersionHistoryOpen(false);
                    navigate(`/estimates/projects/${version.id}`);
                  }}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{version.cipher}</span>
                      <span className="text-sm text-gray-500">v{version.version_number}</span>
                      {version.is_current && (
                        <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-md bg-green-100 text-green-700">
                          Актуальная
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {formatDate(version.date)}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    Открыть
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">Нет других версий</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}