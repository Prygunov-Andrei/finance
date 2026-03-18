import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useBreadcrumb } from '../../hooks/useBreadcrumb';
import { ArrowLeft, AlertCircle, Pencil, Trash2, Copy, FileText, Plus, History, Building2, Calendar, Clock, DollarSign, TrendingUp, User, FileCheck, X, Save, ChevronDown } from 'lucide-react';
import {
  api,
  TechnicalProposalDetail as TKPDetail,
  TKPCharacteristic,
  TKPFrontOfWork,
  TKPEstimateSection,
  TKPEstimateSubsection,
} from "../../lib/api";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { CreateMountingProposalFromTKPDialog } from "./CreateMountingProposalFromTKPDialog";
import { CreateVersionDialog } from "./CreateVersionDialog";
import { formatDate, formatDateTime, formatAmount, formatCurrency, getStatusBadgeClass, getStatusLabel } from '../../lib/utils';
import { CONSTANTS } from '../../constants';
import { useObjects, useLegalEntities } from '../../hooks';

interface EditFormData {
  name: string;
  date: string;
  due_date: string;
  outgoing_number: string;
  object: string;
  object_area: string;
  legal_entity: string;
  advance_required: string;
  work_duration: string;
  validity_days: string;
  notes: string;
}

type TabType =
  | "info"
  | "estimates"
  | "sections"
  | "characteristics"
  | "front";

export function TechnicalProposalDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>("info");
  const [isEditing, setIsEditing] = useState(false);
  const [isMountingProposalDialogOpen, setIsMountingProposalDialogOpen] = useState(false);
  const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<EditFormData | null>(null);
  const [statusChangeTarget, setStatusChangeTarget] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { setDetailLabel } = useBreadcrumb();

  const STATUS_OPTIONS = [
    { value: 'draft', label: 'Черновик' },
    { value: 'in_progress', label: 'В работе' },
    { value: 'checking', label: 'На проверке' },
    { value: 'approved', label: 'Утверждён' },
    { value: 'sent', label: 'Отправлено Заказчику' },
    { value: 'agreed', label: 'Согласовано Заказчиком' },
    { value: 'rejected', label: 'Отклонено' },
  ];

  // Загрузка ТКП
  const { data: tkp, isLoading } = useQuery({
    queryKey: ["technical-proposal", id],
    queryFn: () => api.getTechnicalProposal(parseInt(id!)),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  useEffect(() => {
    if (tkp) setDetailLabel(`ТКП ${tkp.number}`);
    return () => setDetailLabel(null);
  }, [tkp?.number, setDetailLabel]);

  // Загрузка версий
  const { data: versions } = useQuery({
    queryKey: ["technical-proposals-versions", id],
    queryFn: () =>
      api.getTechnicalProposalVersions(parseInt(id!)),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Загрузка характеристик
  const { data: characteristics } = useQuery({
    queryKey: ["tkp-characteristics", id],
    queryFn: () => api.getTKPCharacteristics(parseInt(id!)),
    enabled: !!id && activeTab === "characteristics",
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Загрузка фронта работ
  const { data: frontOfWork } = useQuery({
    queryKey: ["tkp-front-of-work", id],
    queryFn: () => api.getTKPFrontOfWork(parseInt(id!)),
    enabled: !!id && activeTab === "front",
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: objectsData } = useObjects(undefined, { enabled: isEditing });
  const objects = Array.isArray(objectsData) ? objectsData : (objectsData as any)?.results ?? [];
  const { data: legalEntitiesData } = useLegalEntities();
  const legalEntities = Array.isArray(legalEntitiesData) ? legalEntitiesData : (legalEntitiesData as any)?.results ?? [];

  // Удаление ТКП
  const deleteMutation = useMutation({
    mutationFn: () =>
      api.deleteTechnicalProposal(parseInt(id!)),
    onSuccess: () => {
      toast.success("ТКП удалено");
      navigate("/proposals/technical-proposals");
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: FormData) =>
      api.updateTechnicalProposal(parseInt(id!), data),
    onSuccess: () => {
      toast.success("ТКП обновлено");
      queryClient.invalidateQueries({ queryKey: ["technical-proposal", id] });
      queryClient.invalidateQueries({ queryKey: ["technical-proposals"] });
      setIsEditing(false);
      setEditFormData(null);
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) => {
      const formData = new FormData();
      formData.append('status', newStatus);
      return api.updateTechnicalProposal(parseInt(id!), formData);
    },
    onSuccess: () => {
      toast.success("Статус обновлён");
      queryClient.invalidateQueries({ queryKey: ["technical-proposal", id] });
      queryClient.invalidateQueries({ queryKey: ["technical-proposals"] });
      setStatusChangeTarget(null);
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
      setStatusChangeTarget(null);
    },
  });

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === tkp?.status) return;
    setStatusChangeTarget(newStatus);
  };

  const handleConfirmStatusChange = () => {
    if (!statusChangeTarget) return;
    statusMutation.mutate(statusChangeTarget);
  };

  const handleStartEditing = () => {
    if (!tkp) return;
    setEditFormData({
      name: tkp.name,
      date: tkp.date,
      due_date: tkp.due_date || '',
      outgoing_number: tkp.outgoing_number || '',
      object: tkp.object.toString(),
      object_area: tkp.object_area?.toString() || '',
      legal_entity: tkp.legal_entity.toString(),
      advance_required: tkp.advance_required || '',
      work_duration: tkp.work_duration || '',
      validity_days: tkp.validity_days.toString(),
      notes: tkp.notes || '',
    });
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setEditFormData(null);
  };

  const handleSaveEditing = () => {
    if (!editFormData) return;
    const formData = new FormData();
    formData.append('name', editFormData.name);
    formData.append('date', editFormData.date);
    if (editFormData.due_date) formData.append('due_date', editFormData.due_date);
    formData.append('object', editFormData.object);
    if (editFormData.object_area) formData.append('object_area', editFormData.object_area);
    formData.append('legal_entity', editFormData.legal_entity);
    if (editFormData.outgoing_number) formData.append('outgoing_number', editFormData.outgoing_number);
    if (editFormData.advance_required) formData.append('advance_required', editFormData.advance_required);
    if (editFormData.work_duration) formData.append('work_duration', editFormData.work_duration);
    formData.append('validity_days', editFormData.validity_days);
    if (editFormData.notes) formData.append('notes', editFormData.notes);
    updateMutation.mutate(formData);
  };

  const handleDelete = () => {
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    deleteMutation.mutate();
    setIsDeleteDialogOpen(false);
  };

  const getStatusBadge = (status: string) => {
    return (
      <Badge className={getStatusBadgeClass(status)}>{getStatusLabel(status)}</Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    );
  }

  if (!tkp) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <AlertCircle className="w-12 h-12 text-gray-400 mb-4" />
        <div className="text-gray-500">ТКП не найдено</div>
        <Button
          onClick={() => navigate("/proposals/technical-proposals")}
          className="mt-4"
        >
          Вернуться к списку
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Хедер */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-4">
            <Button
              onClick={() => navigate("/proposals/technical-proposals")}
              className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-3"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-gray-900">{tkp.name}</h1>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="inline-flex items-center gap-1 cursor-pointer" aria-label="Сменить статус">
                      {getStatusBadge(tkp.status)}
                      <ChevronDown className="w-3 h-3 text-gray-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {STATUS_OPTIONS.map(opt => (
                      <DropdownMenuItem
                        key={opt.value}
                        onClick={() => handleStatusChange(opt.value)}
                        disabled={opt.value === tkp.status}
                        className={opt.value === tkp.status ? 'font-bold' : ''}
                      >
                        {opt.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {tkp.is_latest_version && (
                  <Badge className="bg-blue-50 text-blue-700 border border-blue-200">
                    Актуальная версия
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-gray-600">
                <span>№ {tkp.number}</span>
                {tkp.outgoing_number && (
                  <span>Исх. № {tkp.outgoing_number}</span>
                )}
                <span>Версия {tkp.version_number}</span>
                <span>от {formatDate(tkp.date)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button
                  onClick={handleSaveEditing}
                  className="bg-green-600 text-white hover:bg-green-700"
                  disabled={updateMutation.isPending}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
                </Button>
                <Button
                  onClick={handleCancelEditing}
                  className="bg-gray-100 text-gray-700 hover:bg-gray-200"
                  disabled={updateMutation.isPending}
                >
                  <X className="w-4 h-4 mr-2" />
                  Отмена
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={handleStartEditing}
                  className="bg-blue-600 text-white hover:bg-blue-700"
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Редактировать
                </Button>
                <Button
                  onClick={() => setIsVersionDialogOpen(true)}
                  className="bg-purple-600 text-white hover:bg-purple-700"
                  disabled={!tkp.is_latest_version}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Создать версию
                </Button>
                <Button
                  onClick={handleDelete}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                {tkp.status === "approved" && (
                  <Button
                    onClick={() =>
                      setIsMountingProposalDialogOpen(true)
                    }
                    className="bg-green-600 text-white hover:bg-green-700"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Создать МП
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Вкладки */}
        <div className="flex gap-1 border-b border-gray-200">
          <button
            onClick={() => setActiveTab("info")}
            className={`px-4 py-2 -mb-px transition-colors ${
              activeTab === "info"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Основная информация
          </button>
          <button
            onClick={() => setActiveTab("estimates")}
            className={`px-4 py-2 -mb-px transition-colors ${
              activeTab === "estimates"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Сметы ({tkp.estimates.length})
          </button>
          <button
            onClick={() => setActiveTab("sections")}
            className={`px-4 py-2 -mb-px transition-colors ${
              activeTab === "sections"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Разделы ({tkp.estimate_sections.length})
          </button>
          <button
            onClick={() => setActiveTab("characteristics")}
            className={`px-4 py-2 -mb-px transition-colors ${
              activeTab === "characteristics"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Характеристики ({tkp.characteristics.length})
          </button>
          <button
            onClick={() => setActiveTab("front")}
            className={`px-4 py-2 -mb-px transition-colors ${
              activeTab === "front"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Фронт работ ({tkp.front_of_work.length})
          </button>
        </div>
      </div>

      {/* Контент вкладок */}
      {activeTab === "info" && (
        <InfoTab
          tkp={tkp}
          versions={versions}
          isEditing={isEditing}
          editFormData={editFormData}
          onFieldChange={(field, value) => setEditFormData(prev => prev ? { ...prev, [field]: value } : null)}
          objects={objects}
          legalEntities={legalEntities}
        />
      )}
      {activeTab === "estimates" && <EstimatesTab tkp={tkp} />}
      {activeTab === "sections" && <SectionsTab tkp={tkp} />}
      {activeTab === "characteristics" && (
        <CharacteristicsTab
          tkpId={parseInt(id!)}
          characteristics={characteristics || []}
        />
      )}
      {activeTab === "front" && (
        <FrontOfWorkTab
          tkpId={parseInt(id!)}
          frontOfWork={frontOfWork || []}
        />
      )}

      {/* Диалог создания монтажного проекта */}
      <CreateMountingProposalFromTKPDialog
        open={isMountingProposalDialogOpen}
        onOpenChange={setIsMountingProposalDialogOpen}
        tkpId={tkp.id}
        tkpNumber={tkp.number}
        tkpName={tkp.name}
        tkpObjectId={tkp.object}
      />

      {/* Диалог создания версии */}
      <CreateVersionDialog
        open={isVersionDialogOpen}
        onOpenChange={setIsVersionDialogOpen}
        itemId={tkp.id}
        itemType="tkp"
        currentDate={tkp.date}
        currentVersionNumber={tkp.version_number}
      />

      {/* Диалог подтверждения смены статуса */}
      <AlertDialog open={!!statusChangeTarget} onOpenChange={(open) => { if (!open) setStatusChangeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Подтверждение смены статуса</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите изменить статус на «{STATUS_OPTIONS.find(o => o.value === statusChangeTarget)?.label}»?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmStatusChange} disabled={statusMutation.isPending}>
              {statusMutation.isPending ? 'Сохранение...' : 'Подтвердить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Диалог подтверждения удаления ТКП */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удаление ТКП</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить ТКП «{tkp?.name}»? Это действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700" disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Вкладка "Основная информация"
function InfoTab({
  tkp,
  versions,
  isEditing,
  editFormData,
  onFieldChange,
  objects,
  legalEntities,
}: {
  tkp: TKPDetail;
  versions?: any[];
  isEditing: boolean;
  editFormData: EditFormData | null;
  onFieldChange: (field: keyof EditFormData, value: string) => void;
  objects: any[];
  legalEntities: any[];
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Основная информация */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-gray-900 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          Основная информация
        </h2>
        <div className="space-y-4">
          {isEditing && editFormData ? (
            <>
              <div>
                <Label htmlFor="edit-name">Название</Label>
                <Input
                  id="edit-name"
                  value={editFormData.name}
                  onChange={(e) => onFieldChange('name', e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="edit-object">Объект</Label>
                <select
                  id="edit-object"
                  value={editFormData.object}
                  onChange={(e) => onFieldChange('object', e.target.value)}
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Выберите объект</option>
                  {objects?.map((obj: any) => (
                    <option key={obj.id} value={obj.id}>{obj.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="edit-legal-entity">Юридическое лицо</Label>
                <select
                  id="edit-legal-entity"
                  value={editFormData.legal_entity}
                  onChange={(e) => onFieldChange('legal_entity', e.target.value)}
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Выберите юрлицо</option>
                  {legalEntities?.map((le: any) => (
                    <option key={le.id} value={le.id}>{le.short_name || le.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-date">Дата</Label>
                  <Input
                    id="edit-date"
                    type="date"
                    value={editFormData.date}
                    onChange={(e) => onFieldChange('date', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-due-date">Дата выдачи (крайний срок)</Label>
                  <Input
                    id="edit-due-date"
                    type="date"
                    value={editFormData.due_date}
                    onChange={(e) => onFieldChange('due_date', e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-outgoing">Исходящий номер</Label>
                  <Input
                    id="edit-outgoing"
                    value={editFormData.outgoing_number}
                    onChange={(e) => onFieldChange('outgoing_number', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-area">Площадь объекта (м²)</Label>
                  <Input
                    id="edit-area"
                    type="number"
                    value={editFormData.object_area}
                    onChange={(e) => onFieldChange('object_area', e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="edit-validity">Срок действия (дни)</Label>
                <Input
                  id="edit-validity"
                  type="number"
                  value={editFormData.validity_days}
                  onChange={(e) => onFieldChange('validity_days', e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-advance">Требуемый аванс</Label>
                  <Input
                    id="edit-advance"
                    value={editFormData.advance_required}
                    onChange={(e) => onFieldChange('advance_required', e.target.value)}
                    className="mt-1"
                    placeholder="Например: 30%"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-duration">Срок выполнения работ</Label>
                  <Input
                    id="edit-duration"
                    value={editFormData.work_duration}
                    onChange={(e) => onFieldChange('work_duration', e.target.value)}
                    className="mt-1"
                    placeholder="Например: 14 рабочих дней"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="edit-notes">Примечания</Label>
                <Textarea
                  id="edit-notes"
                  value={editFormData.notes}
                  onChange={(e) => onFieldChange('notes', e.target.value)}
                  className="mt-1"
                  rows={4}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label className="text-gray-600">Объект</Label>
                <div className="mt-1 flex items-start gap-2">
                  <Building2 className="w-4 h-4 text-gray-400 mt-1" />
                  <div>
                    <div className="text-gray-900">{tkp.object_name}</div>
                    {tkp.object_address && (
                      <div className="text-gray-500">{tkp.object_address}</div>
                    )}
                    {tkp.object_area && (
                      <div className="text-gray-500">Площадь: {tkp.object_area} м²</div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-gray-600">Юридическое лицо</Label>
                <div className="mt-1 text-gray-900">{tkp.legal_entity_name}</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-600">Дата создания</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-900">{formatDate(tkp.date)}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-gray-600">Срок действия</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-900">
                      {tkp.validity_days} дн. (до {formatDate(tkp.validity_date)})
                    </span>
                  </div>
                </div>
                {tkp.due_date && (
                  <div>
                    <Label className="text-gray-600">Дата выдачи (крайний срок)</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-900">{formatDate(tkp.due_date)}</span>
                    </div>
                  </div>
                )}
              </div>

              {tkp.advance_required && (
                <div>
                  <Label className="text-gray-600">Требуемый аванс</Label>
                  <div className="mt-1 text-gray-900">{formatCurrency(tkp.advance_required)}</div>
                </div>
              )}

              {tkp.work_duration && (
                <div>
                  <Label className="text-gray-600">Срок выполнения работ</Label>
                  <div className="mt-1 text-gray-900">{tkp.work_duration}</div>
                </div>
              )}

              {tkp.notes && (
                <div>
                  <Label className="text-gray-600">Примечания</Label>
                  <div className="mt-1 text-gray-900 whitespace-pre-wrap">{tkp.notes}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Финансовая информация */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-gray-900 mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-600" />
          Финансовая информация
        </h2>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-gray-600 mb-1">Продажа</div>
            <div className="text-blue-900">{formatCurrency(tkp.total_amount)}</div>
          </div>

          <div className="bg-red-50 rounded-lg p-4">
            <div className="text-gray-600 mb-1">Закупка</div>
            <div className="text-red-900">
              {formatCurrency(String(parseFloat(tkp.total_amount) - parseFloat(tkp.total_profit)))}
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-gray-600 mb-1">Прибыль</div>
            <div className="text-green-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              {formatCurrency(tkp.total_profit)}
              <span className="text-green-700">
                ({parseFloat(tkp.profit_percent).toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>
        <div className="space-y-4">

          {tkp.total_man_hours && (
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-gray-600 mb-1">Трудозатраты</div>
              <div className="text-purple-900 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                {parseFloat(tkp.total_man_hours).toFixed(2)} чел/час
              </div>
            </div>
          )}

          {(tkp.currency_rates.usd || tkp.currency_rates.eur || tkp.currency_rates.cny) && (
            <div>
              <Label className="text-gray-600 mb-2 block">Курсы валют</Label>
              <div className="space-y-2">
                {tkp.currency_rates.usd && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">USD:</span>
                    <span className="text-gray-900">{parseFloat(tkp.currency_rates.usd).toFixed(2)} ₽</span>
                  </div>
                )}
                {tkp.currency_rates.eur && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">EUR:</span>
                    <span className="text-gray-900">{parseFloat(tkp.currency_rates.eur).toFixed(2)} ₽</span>
                  </div>
                )}
                {tkp.currency_rates.cny && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">CNY:</span>
                    <span className="text-gray-900">{parseFloat(tkp.currency_rates.cny).toFixed(2)} ₽</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ответственные лица и история статусов */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-gray-900 mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-purple-600" />
          Ответственные лица
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-3 bg-gray-50 rounded-lg">
            <Label className="text-gray-500 text-xs">Создал</Label>
            <div className="mt-1 text-gray-900 font-medium">{tkp.created_by_name || '—'}</div>
            <div className="text-xs text-gray-400 mt-0.5">{formatDate(tkp.created_at)}</div>
          </div>

          <div className="p-3 bg-gray-50 rounded-lg">
            <Label className="text-gray-500 text-xs">Проверил</Label>
            <div className="mt-1 text-gray-900 font-medium">{tkp.checked_by_name || '—'}</div>
            {tkp.checked_at && (
              <div className="text-xs text-gray-400 mt-0.5">{formatDate(tkp.checked_at)}</div>
            )}
          </div>

          <div className="p-3 bg-gray-50 rounded-lg">
            <Label className="text-gray-500 text-xs">Утвердил</Label>
            <div className="mt-1 text-gray-900 font-medium">{tkp.approved_by_name || '—'}</div>
            {tkp.approved_at && (
              <div className="text-xs text-gray-400 mt-0.5">{formatDate(tkp.approved_at)}</div>
            )}
          </div>
        </div>

        {tkp.status_history && tkp.status_history.length > 0 && (
          <>
            <h3 className="text-gray-700 text-sm font-medium mb-3 flex items-center gap-2">
              <History className="w-4 h-4 text-gray-500" />
              История смены статусов
            </h3>
            <div className="space-y-2">
              {tkp.status_history.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-gray-100 last:border-0">
                  <span className="text-gray-400 text-xs whitespace-nowrap">{formatDateTime(entry.changed_at)}</span>
                  <span className="text-gray-600">{entry.changed_by_name || '—'}</span>
                  <span className="text-gray-400">→</span>
                  <Badge className={getStatusBadgeClass(entry.new_status)}>{getStatusLabel(entry.new_status)}</Badge>
                  {entry.comment && <span className="text-gray-500 italic text-xs">({entry.comment})</span>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* История версий */}
      {versions && versions.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-gray-900 mb-4 flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-orange-600" />
            История версий ({versions.length})
          </h2>
          <div className="space-y-2">
            {versions.map((version: any) => (
              <div
                key={version.id}
                className={`p-3 rounded-lg border ${
                  version.id === tkp.id
                    ? "bg-blue-50 border-blue-200"
                    : "bg-gray-50 border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-gray-900">
                      Версия {version.version_number}
                      {version.is_latest_version && (
                        <Badge className="ml-2 bg-blue-100 text-blue-700">Актуальная</Badge>
                      )}
                    </div>
                    <div className="text-gray-500">{formatDate(version.date)}</div>
                  </div>
                  {version.id !== tkp.id && (
                    <Button
                      onClick={() =>
                        window.open(`/proposals/technical-proposals/${version.id}`, "_blank")
                      }
                      className="bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                      Открыть
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Вкладка "Сметы"
function EstimatesTab({ tkp }: { tkp: TKPDetail }) {
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedEstimates, setSelectedEstimates] = useState<
    number[]
  >([]);
  const [copyData, setCopyData] = useState(true);
  const [removeTarget, setRemoveTarget] = useState<{ id: number; name: string } | null>(null);
  const [isCopyDataDialogOpen, setIsCopyDataDialogOpen] = useState(false);

  // Загрузка смет объекта
  const { data: allEstimates } = useQuery({
    queryKey: ["estimates", { object: tkp.object }],
    queryFn: () => api.getEstimates({ object: tkp.object }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Добавление смет
  const addEstimatesMutation = useMutation({
    mutationFn: (data: {
      estimateIds: number[];
      copyData: boolean;
    }) =>
      api.addEstimatesToTKP(
        tkp.id,
        data.estimateIds,
        data.copyData,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["technical-proposal", tkp.id.toString()],
      });
      toast.success("Сметы добавлены в ТКП");
      setIsAddDialogOpen(false);
      setSelectedEstimates([]);
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Удаление смет
  const removeEstimatesMutation = useMutation({
    mutationFn: (estimateIds: number[]) =>
      api.removeEstimatesFromTKP(tkp.id, estimateIds),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["technical-proposal", tkp.id.toString()],
      });
      toast.success("Смета удалена из ТКП");
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Копирование данных из смет
  const copyDataMutation = useMutation({
    mutationFn: () => api.copyDataFromEstimates(tkp.id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["technical-proposal", tkp.id.toString()],
      });
      queryClient.invalidateQueries({
        queryKey: ["tkp-characteristics", tkp.id.toString()],
      });
      queryClient.invalidateQueries({
        queryKey: ["tkp-front-of-work", tkp.id.toString()],
      });
      toast.success("Данные скопированы из смет");
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const handleAddEstimates = () => {
    if (selectedEstimates.length === 0) {
      toast.error("Выберите хотя бы одну смету");
      return;
    }
    addEstimatesMutation.mutate({
      estimateIds: selectedEstimates,
      copyData,
    });
  };

  const handleRemoveEstimate = (
    estimateId: number,
    estimateName: string,
  ) => {
    setRemoveTarget({ id: estimateId, name: estimateName });
  };

  const handleConfirmRemove = () => {
    if (removeTarget) {
      removeEstimatesMutation.mutate([removeTarget.id]);
      setRemoveTarget(null);
    }
  };

  const handleCopyData = () => {
    setIsCopyDataDialogOpen(true);
  };

  const handleConfirmCopyData = () => {
    copyDataMutation.mutate();
    setIsCopyDataDialogOpen(false);
  };

  // Получаем ID смет, которые уже добавлены
  const addedEstimateIds = tkp.estimate_sections.map(
    (section) => section.source_estimate,
  );

  // Фильтруем доступные для добавления сметы
  const availableEstimates =
    allEstimates?.results?.filter(
      (est) => !addedEstimateIds.includes(est.id),
    ) || [];

  if (tkp.estimates.length === 0 && tkp.estimate_sections.length === 0) {
    return (
      <>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
          <div className="text-center text-gray-500">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p>Сметы не добавлены</p>
            <Button
              onClick={() => setIsAddDialogOpen(true)}
              className="mt-4 bg-blue-600 text-white hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Добавить сметы
            </Button>
          </div>
        </div>

        {/* Диалог добавления смет */}
        {isAddDialogOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-gray-900">
                  Добавить сметы в ТКП
                </h2>
              </div>
              <div className="p-6 overflow-y-auto max-h-96">
                {availableEstimates.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    Нет доступных смет для добавления
                  </div>
                ) : (
                  <div className="space-y-2">
                    {availableEstimates.map((estimate) => (
                      <label
                        key={estimate.id}
                        className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEstimates.includes(
                            estimate.id,
                          )}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedEstimates([
                                ...selectedEstimates,
                                estimate.id,
                              ]);
                            } else {
                              setSelectedEstimates(
                                selectedEstimates.filter(
                                  (id) => id !== estimate.id,
                                ),
                              );
                            }
                          }}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="text-gray-900">
                            {estimate.name}
                          </div>
                          <div className="text-gray-500">
                            Проект: {estimate.project_name}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={copyData}
                      onChange={(e) =>
                        setCopyData(e.target.checked)
                      }
                    />
                    <span className="text-gray-700">
                      Автоматически скопировать характеристики и
                      фронт работ из смет
                    </span>
                  </label>
                </div>
              </div>
              <div className="p-6 border-t border-gray-200 flex justify-end gap-2">
                <Button
                  onClick={() => {
                    setIsAddDialogOpen(false);
                    setSelectedEstimates([]);
                  }}
                  className="bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  Отмена
                </Button>
                <Button
                  onClick={handleAddEstimates}
                  disabled={
                    selectedEstimates.length === 0 ||
                    addEstimatesMutation.isPending
                  }
                  className="bg-blue-600 text-white hover:bg-blue-700"
                >
                  Добавить ({selectedEstimates.length})
                </Button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-gray-900">
              Сметы в ТКП ({tkp.estimates.length})
            </h2>
            <div className="flex gap-2">
              <Button
                onClick={handleCopyData}
                className="bg-purple-600 text-white hover:bg-purple-700"
                title="Скопировать характеристики и фронт работ из связанных смет"
              >
                <Copy className="w-4 h-4 mr-2" />
                Обновить данные из смет
              </Button>
              <Button
                onClick={() => setIsAddDialogOpen(true)}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Добавить сметы
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {(() => {
              const grouped = new Map<number | null, typeof tkp.estimate_sections>();
              tkp.estimate_sections.forEach((section) => {
                const key = section.source_estimate;
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key)!.push(section);
              });
              return Array.from(grouped.entries()).map(([estimateId, sections]) => {
                const estimateName = sections[0]?.estimate_name || sections[0]?.name || 'Смета';
                const totalSale = sections.reduce((s, sec) => s + parseFloat(sec.total_sale || '0'), 0);
                const totalPurchase = sections.reduce((s, sec) => s + parseFloat(sec.total_purchase || '0'), 0);
                const totalProfit = totalSale - totalPurchase;
                return (
                  <div
                    key={estimateId ?? 'unknown'}
                    className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-gray-900">{estimateName}</h3>
                        <p className="text-sm text-gray-500">{sections.length} {sections.length === 1 ? 'раздел' : sections.length < 5 ? 'раздела' : 'разделов'}</p>
                      </div>
                      <Button
                        onClick={() => handleRemoveEstimate(estimateId || sections[0]?.id, estimateName)}
                        className="bg-red-100 text-red-700 hover:bg-red-200"
                        title="Удалить смету из ТКП"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="space-y-1 mb-3">
                      {sections.map((section) => (
                        <div key={section.id} className="flex items-center justify-between text-sm py-1 px-2 bg-gray-50 rounded">
                          <span className="text-gray-700">{section.name}</span>
                          <span className="text-gray-600">{formatCurrency(section.total_sale)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-4 pt-3 border-t border-gray-100">
                      <div>
                        <div className="text-gray-600">Продажа</div>
                        <div className="text-gray-900">{formatCurrency(String(totalSale))}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Закупка</div>
                        <div className="text-gray-900">{formatCurrency(String(totalPurchase))}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Прибыль</div>
                        <div className="text-green-700">{formatCurrency(String(totalProfit))}</div>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* Диалог добавления сме */}
      {isAddDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-gray-900">
                Добавить сметы в ТКП
              </h2>
            </div>
            <div className="p-6 overflow-y-auto max-h-96">
              {availableEstimates.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  Нет доступных смет для добавления
                </div>
              ) : (
                <div className="space-y-2">
                  {availableEstimates.map((estimate) => (
                    <label
                      key={estimate.id}
                      className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEstimates.includes(
                          estimate.id,
                        )}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedEstimates([
                              ...selectedEstimates,
                              estimate.id,
                            ]);
                          } else {
                            setSelectedEstimates(
                              selectedEstimates.filter(
                                (id) => id !== estimate.id,
                              ),
                            );
                          }
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="text-gray-900">
                          {estimate.name}
                        </div>
                        <div className="text-gray-500">
                          Проект: {estimate.project_name}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={copyData}
                    onChange={(e) =>
                      setCopyData(e.target.checked)
                    }
                  />
                  <span className="text-gray-700">
                    Автоматически скопировать характеристики и
                    фронт работ из смет
                  </span>
                </label>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-2">
              <Button
                onClick={() => {
                  setIsAddDialogOpen(false);
                  setSelectedEstimates([]);
                }}
                className="bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Отмена
              </Button>
              <Button
                onClick={handleAddEstimates}
                disabled={
                  selectedEstimates.length === 0 ||
                  addEstimatesMutation.isPending
                }
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                Добавить ({selectedEstimates.length})
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Диалог подтверждения удаления сметы */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удаление сметы из ТКП</AlertDialogTitle>
            <AlertDialogDescription>
              Удалить смету «{removeTarget?.name}» из ТКП?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRemove} className="bg-red-600 hover:bg-red-700">Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Диалог подтверждения копирования данных */}
      <AlertDialog open={isCopyDataDialogOpen} onOpenChange={setIsCopyDataDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Обновление данных из смет</AlertDialogTitle>
            <AlertDialogDescription>
              Скопировать характеристики и фронт работ из связанных смет? Это обновит данные в ТКП.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCopyData}>Подтвердить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Вкладка "Разделы" - показывает иерархию разделов и подразделов из смет
function SectionsTab({ tkp }: { tkp: TKPDetail }) {
  const queryClient = useQueryClient();
  const [expandedSections, setExpandedSections] = useState<
    number[]
  >([]);
  const [editingSubsectionId, setEditingSubsectionId] =
    useState<number | null>(null);
  const [editFormData, setEditFormData] = useState({
    materials_sale: "",
    works_sale: "",
    materials_purchase: "",
    works_purchase: "",
  });

  // Обновление подраздела
  const updateSubsectionMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<TKPEstimateSubsection>;
    }) => api.updateTKPSubsection(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["technical-proposal", tkp.id.toString()],
      });
      toast.success("Подраздел обновлен");
      setEditingSubsectionId(null);
      setEditFormData({
        materials_sale: "",
        works_sale: "",
        materials_purchase: "",
        works_purchase: "",
      });
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const toggleSection = (sectionId: number) => {
    setExpandedSections((prev) =>
      prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId],
    );
  };

  const handleEditSubsection = (
    subsection: TKPEstimateSubsection,
  ) => {
    setEditingSubsectionId(subsection.id);
    setEditFormData({
      materials_sale: subsection.materials_sale,
      works_sale: subsection.works_sale,
      materials_purchase: subsection.materials_purchase,
      works_purchase: subsection.works_purchase,
    });
  };

  const handleSaveSubsection = () => {
    if (editingSubsectionId) {
      updateSubsectionMutation.mutate({
        id: editingSubsectionId,
        data: editFormData,
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingSubsectionId(null);
    setEditFormData({
      materials_sale: "",
      works_sale: "",
      materials_purchase: "",
      works_purchase: "",
    });
  };

  // Рассчитываем общие итоги
  const totalSale = tkp.estimate_sections.reduce(
    (sum, section) =>
      sum + parseFloat(section.total_sale || "0"),
    0,
  );
  const totalPurchase = tkp.estimate_sections.reduce(
    (sum, section) =>
      sum + parseFloat(section.total_purchase || "0"),
    0,
  );
  const totalProfit = totalSale - totalPurchase;

  if (tkp.estimate_sections.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
        <div className="text-center text-gray-500">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p>Разделы не добавлены</p>
          <p className="mt-2">
            Добавьте сметы в ТКП, чтобы увидеть разделы
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-gray-900 mb-4">
          Разделы и подразделы ({tkp.estimate_sections.length})
        </h2>

        <div className="space-y-3">
          {tkp.estimate_sections.map((section) => (
            <div
              key={section.id}
              className="border border-gray-200 rounded-lg overflow-hidden"
            >
              {/* Заголовок раздела */}
              <div
                className="bg-gray-50 p-4 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => toggleSection(section.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-gray-900">
                      {section.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-gray-600">
                        Продажа:{" "}
                        {formatCurrency(section.total_sale)}
                      </div>
                      <div className="text-gray-600">
                        Закупка:{" "}
                        {formatCurrency(section.total_purchase)}
                      </div>
                    </div>
                    <div className="text-green-700">
                      Прибыль:{" "}
                      {formatCurrency(
                        parseFloat(section.total_sale) -
                          parseFloat(section.total_purchase),
                      )}
                    </div>
                    <div className="w-6 text-gray-400">
                      {expandedSections.includes(section.id)
                        ? "▼"
                        : "▶"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Подразделы */}
              {expandedSections.includes(section.id) && (
                <div className="p-4 bg-white">
                  {section.subsections &&
                  section.subsections.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-2 py-2 text-left text-gray-600">
                              Подраздел
                            </th>
                            <th className="px-2 py-2 text-right text-gray-600">
                              Мат. продажа
                            </th>
                            <th className="px-2 py-2 text-right text-gray-600">
                              Работы продажа
                            </th>
                            <th className="px-2 py-2 text-right text-gray-600">
                              Мат. закупка
                            </th>
                            <th className="px-2 py-2 text-right text-gray-600">
                              Работы закупка
                            </th>
                            <th className="px-2 py-2 text-right text-gray-600">
                              Итого
                            </th>
                            <th className="px-2 py-2 text-right text-gray-600">
                              Прибыль
                            </th>
                            <th className="px-2 py-2 text-right text-gray-600">
                              Действия
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {section.subsections.map(
                            (subsection) => (
                              <tr
                                key={subsection.id}
                                className="hover:bg-gray-50"
                              >
                                <td className="px-2 py-2 text-gray-900">
                                  {subsection.name}
                                </td>
                                {editingSubsectionId === subsection.id ? (
                                  <>
                                    <td className="px-2 py-2">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={editFormData.materials_sale}
                                        onChange={(e) => setEditFormData({ ...editFormData, materials_sale: e.target.value })}
                                        className="w-28 text-right"
                                      />
                                    </td>
                                    <td className="px-2 py-2">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={editFormData.works_sale}
                                        onChange={(e) => setEditFormData({ ...editFormData, works_sale: e.target.value })}
                                        className="w-28 text-right"
                                      />
                                    </td>
                                    <td className="px-2 py-2">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={editFormData.materials_purchase}
                                        onChange={(e) => setEditFormData({ ...editFormData, materials_purchase: e.target.value })}
                                        className="w-28 text-right"
                                      />
                                    </td>
                                    <td className="px-2 py-2">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={editFormData.works_purchase}
                                        onChange={(e) => setEditFormData({ ...editFormData, works_purchase: e.target.value })}
                                        className="w-28 text-right"
                                      />
                                    </td>
                                    <td className="px-2 py-2 text-right text-gray-500">
                                      {formatCurrency(String(parseFloat(editFormData.materials_sale || '0') + parseFloat(editFormData.works_sale || '0')))}
                                    </td>
                                    <td className="px-2 py-2 text-right text-gray-500">
                                      {formatCurrency(String(
                                        (parseFloat(editFormData.materials_sale || '0') + parseFloat(editFormData.works_sale || '0')) -
                                        (parseFloat(editFormData.materials_purchase || '0') + parseFloat(editFormData.works_purchase || '0'))
                                      ))}
                                    </td>
                                    <td className="px-2 py-2 text-right flex gap-1">
                                      <Button
                                        onClick={handleSaveSubsection}
                                        disabled={updateSubsectionMutation.isPending}
                                        className="bg-green-600 text-white hover:bg-green-700 px-2 py-1"
                                      >
                                        <Save className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        onClick={handleCancelEdit}
                                        className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-2 py-1"
                                      >
                                        <X className="w-4 h-4" />
                                      </Button>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="px-2 py-2 text-right text-gray-900">
                                      {formatCurrency(subsection.materials_sale)}
                                    </td>
                                    <td className="px-2 py-2 text-right text-gray-900">
                                      {formatCurrency(subsection.works_sale)}
                                    </td>
                                    <td className="px-2 py-2 text-right text-gray-900">
                                      {formatCurrency(subsection.materials_purchase)}
                                    </td>
                                    <td className="px-2 py-2 text-right text-gray-900">
                                      {formatCurrency(subsection.works_purchase)}
                                    </td>
                                    <td className="px-2 py-2 text-right text-gray-900">
                                      {formatCurrency(subsection.total_sale)}
                                    </td>
                                    <td className="px-2 py-2 text-right text-green-700">
                                      {formatCurrency(
                                        parseFloat(subsection.total_sale) - parseFloat(subsection.total_purchase),
                                      )}
                                    </td>
                                    <td className="px-2 py-2 text-right">
                                      <Button
                                        onClick={() => handleEditSubsection(subsection)}
                                        className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-2 py-1"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </Button>
                                    </td>
                                  </>
                                )}
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-4">
                      Подразделы не найдены
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Общая сводка */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-gray-900 mb-4">Общая сводка</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-gray-600 mb-1">
              Итого продажа
            </div>
            <div className="text-blue-900">
              {formatCurrency(totalSale)}
            </div>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <div className="text-gray-600 mb-1">
              Итого закупка
            </div>
            <div className="text-red-900">
              {formatCurrency(totalPurchase)}
            </div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-gray-600 mb-1">
              Итого прибыль
            </div>
            <div className="text-green-900">
              {formatCurrency(totalProfit)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Вкладка "Характеристики"
function CharacteristicsTab({
  tkpId,
  characteristics,
}: {
  tkpId: number;
  characteristics: TKPCharacteristic[];
}) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(
    null,
  );
  const [deleteCharTarget, setDeleteCharTarget] = useState<{ id: number; name: string } | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    purchase_amount: "",
    sale_amount: "",
  });

  // Создание характеристики
  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      purchase_amount: string;
      sale_amount: string;
    }) => api.createTKPCharacteristic({ tkp: tkpId, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tkp-characteristics", tkpId.toString()],
      });
      queryClient.invalidateQueries({
        queryKey: ["technical-proposal", tkpId.toString()],
      });
      toast.success("Характеристика добавлена");
      setIsAdding(false);
      setFormData({
        name: "",
        purchase_amount: "",
        sale_amount: "",
      });
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Обновление характеристики
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<typeof formData>;
    }) => api.updateTKPCharacteristic(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tkp-characteristics", tkpId.toString()],
      });
      queryClient.invalidateQueries({
        queryKey: ["technical-proposal", tkpId.toString()],
      });
      toast.success("Характеристика обновлена");
      setEditingId(null);
      setFormData({
        name: "",
        purchase_amount: "",
        sale_amount: "",
      });
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Удаление характеристики
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteTKPCharacteristic(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tkp-characteristics", tkpId.toString()],
      });
      queryClient.invalidateQueries({
        queryKey: ["technical-proposal", tkpId.toString()],
      });
      toast.success("Характеристика удалена");
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (char: TKPCharacteristic) => {
    setEditingId(char.id);
    setFormData({
      name: char.name,
      purchase_amount: char.purchase_amount,
      sale_amount: char.sale_amount,
    });
    setIsAdding(true);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({
      name: "",
      purchase_amount: "",
      sale_amount: "",
    });
  };

  const calculateProfit = (sale: string, purchase: string) => {
    const saleNum = parseFloat(sale) || 0;
    const purchaseNum = parseFloat(purchase) || 0;
    return saleNum - purchaseNum;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-gray-900">Характеристики</h2>
        {!isAdding && (
          <Button
            onClick={() => setIsAdding(true)}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Добавить
          </Button>
        )}
      </div>

      {isAdding && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200"
        >
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <Label htmlFor="name">Название</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    name: e.target.value,
                  })
                }
                required
                placeholder="Введите название"
              />
            </div>
            <div>
              <Label htmlFor="purchase_amount">
                Сумма закупки
              </Label>
              <Input
                id="purchase_amount"
                type="number"
                step="0.01"
                value={formData.purchase_amount}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    purchase_amount: e.target.value,
                  })
                }
                required
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="sale_amount">Сумма продажи</Label>
              <Input
                id="sale_amount"
                type="number"
                step="0.01"
                value={formData.sale_amount}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    sale_amount: e.target.value,
                  })
                }
                required
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="submit"
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {editingId ? "Сохранить" : "Добавить"}
            </Button>
            <Button
              type="button"
              onClick={handleCancel}
              className="bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Отмена
            </Button>
          </div>
        </form>
      )}

      {characteristics.length === 0 && !isAdding ? (
        <div className="text-center py-12 text-gray-500">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p>Характеристики не добавлены</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-y border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-gray-600">
                  Название
                </th>
                <th className="px-4 py-3 text-right text-gray-600">
                  Сумма закупки
                </th>
                <th className="px-4 py-3 text-right text-gray-600">
                  Сумма продажи
                </th>
                <th className="px-4 py-3 text-right text-gray-600">
                  Прибыль
                </th>
                <th className="px-4 py-3 text-right text-gray-600">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {characteristics.map((char) => (
                <tr key={char.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">
                    {char.name}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    {formatCurrency(char.purchase_amount)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    {formatCurrency(char.sale_amount)}
                  </td>
                  <td className="px-4 py-3 text-right text-green-700">
                    {formatCurrency(
                      calculateProfit(
                        char.sale_amount,
                        char.purchase_amount,
                      ),
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        onClick={() => handleEdit(char)}
                        className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-3"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => setDeleteCharTarget({ id: char.id, name: char.name })}
                        className="bg-red-100 text-red-700 hover:bg-red-200 px-3"
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
      )}

      <AlertDialog open={!!deleteCharTarget} onOpenChange={(open) => { if (!open) setDeleteCharTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удаление характеристики</AlertDialogTitle>
            <AlertDialogDescription>
              Удалить характеристику «{deleteCharTarget?.name}»?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteCharTarget) { deleteMutation.mutate(deleteCharTarget.id); setDeleteCharTarget(null); } }} className="bg-red-600 hover:bg-red-700">Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Вкладка "Фронт работ"
function FrontOfWorkTab({
  tkpId,
  frontOfWork,
}: {
  tkpId: number;
  frontOfWork: TKPFrontOfWork[];
}) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(
    null,
  );
  const [deleteFrontTarget, setDeleteFrontTarget] = useState<{ id: number; name: string } | null>(null);
  const [formData, setFormData] = useState({
    front_item: "",
    when_text: "",
    when_date: "",
  });

  // Загрузка элементов фронта работ
  const { data: frontItems } = useQuery({
    queryKey: ["front-of-work-items"],
    queryFn: () => api.getFrontOfWorkItems(),
    enabled: isAdding,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Создание элемента
  const createMutation = useMutation({
    mutationFn: (data: {
      front_item: number;
      when_text?: string;
      when_date?: string;
    }) => api.createTKPFrontOfWork({ tkp: tkpId, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tkp-front-of-work", tkpId.toString()],
      });
      queryClient.invalidateQueries({
        queryKey: ["technical-proposal", tkpId.toString()],
      });
      toast.success("Элемент добавлен");
      setIsAdding(false);
      setFormData({
        front_item: "",
        when_text: "",
        when_date: "",
      });
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Обновление элемена
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<{ when_text: string; when_date: string }>;
    }) => api.updateTKPFrontOfWork(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tkp-front-of-work", tkpId.toString()],
      });
      queryClient.invalidateQueries({
        queryKey: ["technical-proposal", tkpId.toString()],
      });
      toast.success("Элемент обновлен");
      setEditingId(null);
      setFormData({
        front_item: "",
        when_text: "",
        when_date: "",
      });
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Удаление элемента
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteTKPFrontOfWork(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tkp-front-of-work", tkpId.toString()],
      });
      queryClient.invalidateQueries({
        queryKey: ["technical-proposal", tkpId.toString()],
      });
      toast.success("Элемент удален");
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        data: {
          when_text: formData.when_text,
          when_date: formData.when_date || undefined,
        },
      });
    } else {
      createMutation.mutate({
        front_item: parseInt(formData.front_item),
        when_text: formData.when_text || undefined,
        when_date: formData.when_date || undefined,
      });
    }
  };

  const handleEdit = (item: TKPFrontOfWork) => {
    setEditingId(item.id);
    setFormData({
      front_item: item.front_item.toString(),
      when_text: item.when_text,
      when_date: item.when_date || "",
    });
    setIsAdding(true);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({
      front_item: "",
      when_text: "",
      when_date: "",
    });
  };

  const formatDateOrDash = (dateString: string | null) => {
    if (!dateString) return "-";
    return formatDate(dateString);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-gray-900">Фронт работ</h2>
        {!isAdding && (
          <Button
            onClick={() => setIsAdding(true)}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Добавить
          </Button>
        )}
      </div>

      {isAdding && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200"
        >
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <Label htmlFor="front_item">
                Элемент фронта работ
              </Label>
              <select
                id="front_item"
                value={formData.front_item}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    front_item: e.target.value,
                  })
                }
                required={!editingId}
                disabled={!!editingId}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Выберите элемент</option>
                {frontItems?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="when_text">Когда (текст)</Label>
              <Input
                id="when_text"
                value={formData.when_text}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    when_text: e.target.value,
                  })
                }
                placeholder="Описание срока"
              />
            </div>
            <div>
              <Label htmlFor="when_date">Когда (дата)</Label>
              <Input
                id="when_date"
                type="date"
                value={formData.when_date}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    when_date: e.target.value,
                  })
                }
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="submit"
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {editingId ? "Сохранить" : "Добавить"}
            </Button>
            <Button
              type="button"
              onClick={handleCancel}
              className="bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Отмена
            </Button>
          </div>
        </form>
      )}

      {frontOfWork.length === 0 && !isAdding ? (
        <div className="text-center py-12 text-gray-500">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p>Фронт работ не добавлен</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-y border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-gray-600">
                  Элемент
                </th>
                <th className="px-4 py-3 text-left text-gray-600">
                  Категория
                </th>
                <th className="px-4 py-3 text-left text-gray-600">
                  Когда (текст)
                </th>
                <th className="px-4 py-3 text-left text-gray-600">
                  Когда (дата)
                </th>
                <th className="px-4 py-3 text-right text-gray-600">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {frontOfWork.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">
                    {item.front_item_name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {item.front_item_category}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {item.when_text || "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDateOrDash(item.when_date)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        onClick={() => handleEdit(item)}
                        className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-3"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => setDeleteFrontTarget({ id: item.id, name: item.front_item_name })}
                        className="bg-red-100 text-red-700 hover:bg-red-200 px-3"
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
      )}

      <AlertDialog open={!!deleteFrontTarget} onOpenChange={(open) => { if (!open) setDeleteFrontTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удаление элемента фронта работ</AlertDialogTitle>
            <AlertDialogDescription>
              Удалить элемент «{deleteFrontTarget?.name}»?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteFrontTarget) { deleteMutation.mutate(deleteFrontTarget.id); setDeleteFrontTarget(null); } }} className="bg-red-600 hover:bg-red-700">Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}