import { useState, useRef } from 'react';
import { useParams, useNavigate } from '@/hooks/erp-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ProjectNote } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { CONSTANTS } from '@/constants';
import { useProjectFileTypes } from '@/hooks/useReferenceData';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Loader2, FileText, Download, Plus, Edit2, Trash2, Check, Calendar, Users, Info, History, Upload, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { downloadNotesAsMarkdown } from './notes-export';

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
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<number | null>(null);
  const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false);
  const [isUploadFileDialogOpen, setUploadFileDialogOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFileType, setUploadFileType] = useState<number>(0);
  const [uploadFileTitle, setUploadFileTitle] = useState('');
  const [deleteFileTarget, setDeleteFileTarget] = useState<number | null>(null);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);

  const { data: fileTypes } = useProjectFileTypes();

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.estimates.getProjectDetail(Number(id)),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: versions } = useQuery({
    queryKey: ['project-versions', id],
    queryFn: () => api.estimates.getProjectVersions(Number(id)),
    enabled: !!id && isVersionHistoryOpen,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: currentUser } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => api.auth.getCurrentUser(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const primaryCheckMutation = useMutation({
    mutationFn: () => api.estimates.primaryCheckProject(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Первичная проверка выполнена');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const secondaryCheckMutation = useMutation({
    mutationFn: () => api.estimates.secondaryCheckProject(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Вторичная проверка выполнена');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const approveProductionMutation = useMutation({
    mutationFn: (file: File) => api.estimates.approveProduction(Number(id), file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setApprovalDialogOpen(false);
      setApprovalFile(null);
      toast.success('Разрешение в производство получено');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const createVersionMutation = useMutation({
    mutationFn: () => api.estimates.createProjectVersion(Number(id)),
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
    mutationFn: (text: string) => api.estimates.createProjectNote({ project: Number(id), text }),
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
      api.estimates.updateProjectNote(noteId, { text }),
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
    mutationFn: (noteId: number) => api.estimates.deleteProjectNote(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      toast.success('Замечание удалено');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: (formData: FormData) => api.estimates.uploadProjectFile(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      setUploadFileDialogOpen(false);
      setUploadFile(null);
      setUploadFileType(0);
      setUploadFileTitle('');
      toast.success('Файл загружен');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileId: number) => api.estimates.deleteProjectFile(fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      toast.success('Файл удалён');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const handleUploadFileSubmit = () => {
    if (!uploadFile) {
      toast.error('Выберите файл');
      return;
    }
    if (!uploadFileType) {
      toast.error('Выберите тип файла');
      return;
    }
    const formData = new FormData();
    formData.append('project', id!);
    formData.append('file', uploadFile);
    formData.append('file_type', uploadFileType.toString());
    if (uploadFileTitle) formData.append('title', uploadFileTitle);
    uploadFileMutation.mutate(formData);
  };

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
    setDeleteNoteTarget(noteId);
  };

  const handleApprovalSubmit = () => {
    if (!approvalFile) {
      toast.error('Загрузите файл разрешения');
      return;
    }

    approveProductionMutation.mutate(approvalFile);
  };

  const handleCreateVersion = () => {
    setIsVersionDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Проект не найден</p>
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
              <h1 className="text-2xl font-semibold text-foreground">{project.cipher}</h1>
              <span className="inline-flex px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-100 dark:bg-blue-900/30 text-primary">
                {project.stage_display}
              </span>
              <span className="text-sm text-muted-foreground">v{project.version_number}</span>
              {!project.is_current && (
                <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-muted text-muted-foreground">
                  Старая версия
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{project.name}</p>
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
              <span className="ml-2 bg-muted text-muted-foreground px-2 py-0.5 rounded-full text-xs">
                {project.project_notes.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Info Tab */}
        <TabsContent value="info" className="space-y-6">
          <div className="bg-card rounded-xl shadow-sm border border-border p-6">
            <h3 className="font-semibold text-foreground mb-4">Основная информация</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Шифр</div>
                <div className="font-medium text-foreground">{project.cipher}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Название</div>
                <div className="font-medium text-foreground">{project.name}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Дата</div>
                <div className="font-medium text-foreground">{formatDate(project.date)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Стадия</div>
                <div>{project.stage_display}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Объект</div>
                <div className="font-medium text-foreground">{project.object_name}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Версия</div>
                <div className="font-medium text-foreground">v{project.version_number}</div>
              </div>
            </div>

            {project.notes && (
              <div className="mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground mb-2">Примечания</div>
                <div className="text-foreground whitespace-pre-wrap">{project.notes}</div>
              </div>
            )}

          </div>

          {/* Файлы проекта */}
          <div className="bg-card rounded-xl shadow-sm border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Paperclip className="w-4 h-4" />
                Файлы проекта
                {project.project_files && project.project_files.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">
                    ({project.project_files.length})
                  </span>
                )}
              </h3>
              <Button
                size="sm"
                onClick={() => {
                  setUploadFileType(fileTypes?.[0]?.id ?? 0);
                  setUploadFileDialogOpen(true);
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Upload className="w-4 h-4 mr-2" />
                Загрузить файл
              </Button>
            </div>

            {project.project_files && project.project_files.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted border-b border-border">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Тип</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Файл</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Название</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Загрузил</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Дата</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {project.project_files.map((pf) => (
                      <tr key={pf.id} className="hover:bg-muted/50">
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-blue-100 dark:bg-blue-900/30 text-primary">
                            {pf.file_type_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          {pf.original_filename}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {pf.title || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {pf.uploaded_by_username || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {formatDate(pf.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <a
                              href={pf.file}
                              download
                              className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted transition-colors"
                              title="Скачать"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-red-500"
                              onClick={() => setDeleteFileTarget(pf.id)}
                              title="Удалить"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : project.file ? (
              <div className="py-4">
                <a
                  href={project.file}
                  download
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Скачать файл проекта (legacy)
                </a>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Нет загруженных файлов</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Checks Tab */}
        <TabsContent value="checks" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Primary Check */}
            <div className="bg-card rounded-xl shadow-sm border border-border p-6">
              <h3 className="font-semibold text-foreground mb-4">Первичная проверка</h3>
              {project.primary_check_done ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                      ✓ Выполнена
                    </span>
                  </div>
                  {project.primary_check_by_username && (
                    <div>
                      <div className="text-sm text-muted-foreground">Кто проверил</div>
                      <div className="font-medium text-foreground">{project.primary_check_by_username}</div>
                    </div>
                  )}
                  {project.primary_check_date && (
                    <div>
                      <div className="text-sm text-muted-foreground">Дата проверки</div>
                      <div className="font-medium text-foreground">{formatDate(project.primary_check_date)}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-muted text-muted-foreground">
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
            <div className="bg-card rounded-xl shadow-sm border border-border p-6">
              <h3 className="font-semibold text-foreground mb-4">Вторичная проверка</h3>
              {project.secondary_check_done ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                      ✓ Выполнена
                    </span>
                  </div>
                  {project.secondary_check_by_username && (
                    <div>
                      <div className="text-sm text-muted-foreground">Кто проверил</div>
                      <div className="font-medium text-foreground">{project.secondary_check_by_username}</div>
                    </div>
                  )}
                  {project.secondary_check_date && (
                    <div>
                      <div className="text-sm text-muted-foreground">Дата проверки</div>
                      <div className="font-medium text-foreground">{formatDate(project.secondary_check_date)}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-muted text-muted-foreground">
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
          <div className="bg-card rounded-xl shadow-sm border border-border p-6">
            <h3 className="font-semibold text-foreground mb-4">Разрешение в производство</h3>
            {project.is_approved_for_production ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                     Разрешено
                  </span>
                </div>
                {project.production_approval_date && (
                  <div>
                    <div className="text-sm text-muted-foreground">Дата получения разрешения</div>
                    <div className="font-medium text-foreground">{formatDate(project.production_approval_date)}</div>
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
                <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-muted text-muted-foreground">
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
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={project.project_notes.length === 0}
              onClick={() => downloadNotesAsMarkdown(project.name, project.cipher || project.id, project.project_notes)}
            >
              <Download className="w-4 h-4 mr-2" />
              Скачать .md
            </Button>
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
                <div key={note.id} className="bg-card rounded-xl shadow-sm border border-border p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-foreground">{note.author.username}</span>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(note.created_at)}
                        </span>
                      </div>
                      <div className="prose prose-sm max-w-none dark:prose-invert text-foreground">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.text}</ReactMarkdown>
                      </div>
                    </div>
                    {currentUser && typeof currentUser === 'object' && 'id' in (currentUser as Record<string, unknown>) && note.author.id === (currentUser as Record<string, unknown>).id ? (
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
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-xl shadow-sm border border-border p-12 text-center">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Нет замечаний к проекту</p>
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

          <Tabs defaultValue="editor" className="w-full">
            <TabsList className="mb-2">
              <TabsTrigger value="editor">Редактор</TabsTrigger>
              <TabsTrigger value="preview">Предпросмотр</TabsTrigger>
            </TabsList>
            <TabsContent value="editor" className="space-y-2">
              <textarea
                id="note_text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={10}
                placeholder="Введите текст замечания (поддерживается Markdown)"
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Markdown: **жирный**, *курсив*, - списки, # заголовки, `код`
              </p>
            </TabsContent>
            <TabsContent value="preview">
              <div className="min-h-[240px] px-3 py-2 border border-border rounded-lg bg-muted/30">
                {noteText.trim() ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{noteText}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm italic">Начните вводить текст для предпросмотра</p>
                )}
              </div>
            </TabsContent>
          </Tabs>

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

      {/* Delete Note AlertDialog */}
      <AlertDialog open={deleteNoteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteNoteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить замечание</AlertDialogTitle>
            <AlertDialogDescription>
              Удалить это замечание?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteNoteTarget !== null) {
                  deleteNoteMutation.mutate(deleteNoteTarget);
                  setDeleteNoteTarget(null);
                }
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Version AlertDialog */}
      <AlertDialog open={isVersionDialogOpen} onOpenChange={setIsVersionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Новая версия проекта</AlertDialogTitle>
            <AlertDialogDescription>
              Создать новую версию проекта? Текущая версия будет помечена как неактуальная.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => { createVersionMutation.mutate(); setIsVersionDialogOpen(false); }}>
              Создать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upload File Dialog */}
      <Dialog open={isUploadFileDialogOpen} onOpenChange={(open) => { if (!open) { setUploadFileDialogOpen(false); setUploadFile(null); setUploadFileTitle(''); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Загрузить файл</DialogTitle>
            <DialogDescription>
              Добавьте файл к проекту
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="upload-file">Файл *</Label>
              <Input
                id="upload-file"
                type="file"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="upload-file-type">Тип файла *</Label>
              <select
                id="upload-file-type"
                value={uploadFileType}
                onChange={(e) => setUploadFileType(Number(e.target.value))}
                className="mt-1.5 w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value={0}>Выберите тип</option>
                {fileTypes?.map((ft) => (
                  <option key={ft.id} value={ft.id}>{ft.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="upload-file-title">Название (опционально)</Label>
              <Input
                id="upload-file-title"
                value={uploadFileTitle}
                onChange={(e) => setUploadFileTitle(e.target.value)}
                placeholder="Описание файла"
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadFileDialogOpen(false); setUploadFile(null); setUploadFileTitle(''); }}>
              Отмена
            </Button>
            <Button
              onClick={handleUploadFileSubmit}
              disabled={uploadFileMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {uploadFileMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Загрузка...
                </>
              ) : (
                'Загрузить'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete File AlertDialog */}
      <AlertDialog open={deleteFileTarget !== null} onOpenChange={(open) => { if (!open) setDeleteFileTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить файл</AlertDialogTitle>
            <AlertDialogDescription>
              Удалить этот файл проекта? Действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteFileTarget !== null) {
                  deleteFileMutation.mutate(deleteFileTarget);
                  setDeleteFileTarget(null);
                }
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                  className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted cursor-pointer transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{version.cipher}</span>
                      <span className="text-sm text-muted-foreground">v{version.version_number}</span>
                      {version.is_current && (
                        <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-md bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                          Актуальная
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {formatDate(version.date)}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    Открыть
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">Нет других версий</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}