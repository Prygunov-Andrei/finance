import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  api,
  Employee,
  EmployeeDetail,
  CreateEmployeeData,
  PositionRecord,
  CreatePositionRecordData,
  SalaryHistoryRecord,
  CreateSalaryRecordData,
  LegalEntity,
  EmployeeBrief,
  ERP_SECTIONS,
  ERPPermissionLevel,
  ERPPermissions,
} from '../lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Users,
  Plus,
  Search,
  Loader2,
  Pencil,
  Trash2,
  UserCircle,
  Briefcase,
  Banknote,
  Landmark,
  ShieldCheck,
  Link2,
  ChevronRight,
  CalendarDays,
  Building2,
  X,
  Save,
  BadgeCheck,
  BadgeMinus,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLegalEntities } from '../hooks';
import { OrgChart } from './OrgChart';

// =====================================================================
// EMPLOYEES TAB (список + создание)
// =====================================================================

export function PersonnelTab() {
  const [activeSubTab, setActiveSubTab] = useState<'employees' | 'hierarchy'>('employees');

  return (
    <div>
      <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as 'employees' | 'hierarchy')}>
        <TabsList className="mb-4">
          <TabsTrigger value="employees" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Сотрудники
          </TabsTrigger>
          <TabsTrigger value="hierarchy" className="flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            Иерархия
          </TabsTrigger>
        </TabsList>

        <TabsContent value="employees">
          <EmployeesListTab />
        </TabsContent>

        <TabsContent value="hierarchy">
          <OrgChart />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmployeesListTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterLegalEntity, setFilterLegalEntity] = useState<string>('all');
  const [filterActive, setFilterActive] = useState<string>('true');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeDetail | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);

  const { data: legalEntities = [] } = useLegalEntities();

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees', search, filterLegalEntity, filterActive],
    queryFn: () =>
      api.getEmployees({
        search: search || undefined,
        legal_entity: filterLegalEntity !== 'all' ? Number(filterLegalEntity) : undefined,
        is_active: filterActive !== 'all' ? filterActive === 'true' : undefined,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteEmployee(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Сотрудник удалён');
      setDeletingEmployee(null);
    },
    onError: (e: any) => toast.error(`Ошибка: ${e?.message}`),
  });

  const handleOpenEdit = async (emp: Employee) => {
    try {
      const detail = await api.getEmployee(emp.id);
      setEditingEmployee(detail);
    } catch (e: any) {
      toast.error(`Ошибка загрузки: ${e?.message}`);
    }
  };

  return (
    <div>
      {/* Панель фильтров */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Поиск по ФИО..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={filterLegalEntity} onValueChange={setFilterLegalEntity}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Юр. лицо" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все юр. лица</SelectItem>
            {legalEntities.map((le: LegalEntity) => (
              <SelectItem key={le.id} value={String(le.id)}>
                {le.short_name || le.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterActive} onValueChange={setFilterActive}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem value="true">Активные</SelectItem>
            <SelectItem value="false">Уволенные</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={() => setIsCreateOpen(true)} className="ml-auto bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-1" />
          Добавить сотрудника
        </Button>
      </div>

      {/* Список */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : employees.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Нет сотрудников</p>
          <p className="text-sm">Добавьте первого сотрудника</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {employees.map((emp) => (
            <div
              key={emp.id}
              className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <UserCircle className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 truncate">{emp.full_name}</h3>
                      {!emp.is_active && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Уволен</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate">
                      {emp.current_position || 'Должность не указана'}
                    </p>
                  </div>
                  <div className="hidden md:flex items-center gap-4 text-sm text-gray-500">
                    {emp.current_legal_entities?.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Building2 className="w-4 h-4" />
                        <span>
                          {emp.current_legal_entities.map((le) => le.short_name).join(', ')}
                        </span>
                      </div>
                    )}
                    {emp.hire_date && (
                      <div className="flex items-center gap-1">
                        <CalendarDays className="w-4 h-4" />
                        <span>{new Date(emp.hire_date).toLocaleDateString('ru-RU')}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Banknote className="w-4 h-4" />
                      <span>{Number(emp.salary_full).toLocaleString('ru-RU')} ₽</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenEdit(emp)}
                    aria-label="Редактировать"
                    tabIndex={0}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeletingEmployee(emp)}
                    aria-label="Удалить"
                    tabIndex={0}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Диалог создания */}
      <EmployeeFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        employee={null}
        legalEntities={legalEntities}
      />

      {/* Диалог редактирования */}
      {editingEmployee && (
        <EmployeeFormDialog
          open={!!editingEmployee}
          onOpenChange={(open) => {
            if (!open) setEditingEmployee(null);
          }}
          employee={editingEmployee}
          legalEntities={legalEntities}
        />
      )}

      {/* Подтверждение удаления */}
      <AlertDialog open={!!deletingEmployee} onOpenChange={(open) => !open && setDeletingEmployee(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить сотрудника?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить сотрудника «{deletingEmployee?.full_name}»? Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deletingEmployee && deleteMutation.mutate(deletingEmployee.id)}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =====================================================================
// EMPLOYEE FORM DIALOG (создание/редактирование)
// =====================================================================

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeDetail | null;
  legalEntities: LegalEntity[];
}

const defaultErpPermissions = (): ERPPermissions => {
  const perms: ERPPermissions = {};
  ERP_SECTIONS.forEach((s) => {
    perms[s.code] = 'none';
  });
  return perms;
};

function EmployeeFormDialog({ open, onOpenChange, employee, legalEntities }: EmployeeFormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!employee;

  const [activeTab, setActiveTab] = useState('main');

  // Main form state
  const [formData, setFormData] = useState<CreateEmployeeData>(() => ({
    full_name: employee?.full_name || '',
    date_of_birth: employee?.date_of_birth || '',
    gender: employee?.gender || '',
    current_position: employee?.current_position || '',
    hire_date: employee?.hire_date || '',
    salary_full: employee ? Number(employee.salary_full) : 0,
    salary_official: employee ? Number(employee.salary_official) : 0,
    responsibilities: employee?.responsibilities || '',
    bank_name: employee?.bank_name || '',
    bank_bik: employee?.bank_bik || '',
    bank_corr_account: employee?.bank_corr_account || '',
    bank_account: employee?.bank_account || '',
    bank_card_number: employee?.bank_card_number || '',
    user: employee?.user || null,
    counterparty: employee?.counterparty || null,
    supervisor_ids: employee?.supervisors_brief?.map((s) => s.id) || [],
    erp_permissions: employee?.erp_permissions || defaultErpPermissions(),
    is_active: employee?.is_active ?? true,
  }));

  // All employees for supervisor selection
  const { data: allEmployees = [] } = useQuery({
    queryKey: ['employees', '', 'all', 'all'],
    queryFn: () => api.getEmployees(),
  });

  const saveMutation = useMutation({
    mutationFn: (data: CreateEmployeeData) =>
      isEdit ? api.updateEmployee(employee!.id, data) : api.createEmployee(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success(isEdit ? 'Сотрудник обновлён' : 'Сотрудник создан');
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(`Ошибка: ${e?.message}`),
  });

  const handleSave = () => {
    if (!formData.full_name.trim()) {
      toast.error('Укажите ФИО сотрудника');
      return;
    }
    saveMutation.mutate(formData);
  };

  const handleFieldChange = (field: keyof CreateEmployeeData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePermissionChange = (section: string, level: ERPPermissionLevel) => {
    setFormData((prev) => ({
      ...prev,
      erp_permissions: { ...prev.erp_permissions, [section]: level },
    }));
  };

  // Position records (only in edit mode)
  const [showPositionForm, setShowPositionForm] = useState(false);
  const [newPosition, setNewPosition] = useState<CreatePositionRecordData>({
    legal_entity: legalEntities[0]?.id || 0,
    position_title: '',
    start_date: new Date().toISOString().split('T')[0],
    is_current: true,
  });

  const createPositionMutation = useMutation({
    mutationFn: (data: CreatePositionRecordData) => api.createPositionRecord(employee!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Должность добавлена');
      setShowPositionForm(false);
      setNewPosition({
        legal_entity: legalEntities[0]?.id || 0,
        position_title: '',
        start_date: new Date().toISOString().split('T')[0],
        is_current: true,
      });
      // Refresh employee detail
      if (employee) {
        api.getEmployee(employee.id).then((detail) => {
          // Update local state with new positions
          queryClient.setQueryData(['employee', employee.id], detail);
        });
      }
    },
    onError: (e: any) => toast.error(`Ошибка: ${e?.message}`),
  });

  // Salary history (only in edit mode)
  const [showSalaryForm, setShowSalaryForm] = useState(false);
  const [newSalary, setNewSalary] = useState<CreateSalaryRecordData>({
    salary_full: Number(formData.salary_full) || 0,
    salary_official: Number(formData.salary_official) || 0,
    effective_date: new Date().toISOString().split('T')[0],
    reason: '',
  });

  const createSalaryMutation = useMutation({
    mutationFn: (data: CreateSalaryRecordData) => api.createSalaryRecord(employee!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Запись об окладе добавлена');
      setShowSalaryForm(false);
    },
    onError: (e: any) => toast.error(`Ошибка: ${e?.message}`),
  });

  // Create counterparty
  const createCounterpartyMutation = useMutation({
    mutationFn: () => api.createCounterpartyFromEmployee(employee!.id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['counterparties'] });
      toast.success(data.message);
      handleFieldChange('counterparty', data.id);
    },
    onError: (e: any) => toast.error(`Ошибка: ${e?.message}`),
  });

  const supervisorOptions = allEmployees.filter((e) => e.id !== employee?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCircle className="w-5 h-5" />
            {isEdit ? `Сотрудник: ${employee.full_name}` : 'Новый сотрудник'}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="flex flex-wrap mb-4">
            <TabsTrigger value="main" className="flex items-center gap-1.5">
              <UserCircle className="w-4 h-4" /> Основное
            </TabsTrigger>
            {isEdit && (
              <TabsTrigger value="positions" className="flex items-center gap-1.5">
                <Briefcase className="w-4 h-4" /> Должности
              </TabsTrigger>
            )}
            {isEdit && (
              <TabsTrigger value="salary" className="flex items-center gap-1.5">
                <Banknote className="w-4 h-4" /> Оклад
              </TabsTrigger>
            )}
            <TabsTrigger value="bank" className="flex items-center gap-1.5">
              <Landmark className="w-4 h-4" /> Банк. реквизиты
            </TabsTrigger>
            <TabsTrigger value="access" className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" /> Доступ ERP
            </TabsTrigger>
            {isEdit && (
              <TabsTrigger value="counterparty" className="flex items-center gap-1.5">
                <Link2 className="w-4 h-4" /> Контрагент
              </TabsTrigger>
            )}
          </TabsList>

          <div className="flex-1 overflow-auto min-h-[420px]">
            {/* ===== ОСНОВНОЕ ===== */}
            <TabsContent value="main" className="mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>ФИО *</Label>
                  <Input
                    value={formData.full_name}
                    onChange={(e) => handleFieldChange('full_name', e.target.value)}
                    placeholder="Иванов Иван Иванович"
                  />
                </div>
                <div>
                  <Label>Дата рождения</Label>
                  <Input
                    type="date"
                    value={formData.date_of_birth || ''}
                    onChange={(e) => handleFieldChange('date_of_birth', e.target.value || null)}
                  />
                </div>
                <div>
                  <Label>Пол</Label>
                  <Select
                    value={formData.gender || 'none'}
                    onValueChange={(v) => handleFieldChange('gender', v === 'none' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Не указан" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Не указан</SelectItem>
                      <SelectItem value="M">Мужской</SelectItem>
                      <SelectItem value="F">Женский</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Текущая должность</Label>
                  <Input
                    value={formData.current_position || ''}
                    onChange={(e) => handleFieldChange('current_position', e.target.value)}
                    placeholder="Менеджер проекта"
                  />
                </div>
                <div>
                  <Label>Дата приёма на работу</Label>
                  <Input
                    type="date"
                    value={formData.hire_date || ''}
                    onChange={(e) => handleFieldChange('hire_date', e.target.value || null)}
                  />
                </div>
                <div>
                  <Label>Оклад полный (₽)</Label>
                  <Input
                    type="number"
                    value={formData.salary_full || ''}
                    onChange={(e) => handleFieldChange('salary_full', Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Оклад официальный (₽)</Label>
                  <Input
                    type="number"
                    value={formData.salary_official || ''}
                    onChange={(e) => handleFieldChange('salary_official', Number(e.target.value))}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Руководители</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {(formData.supervisor_ids || []).map((sid) => {
                      const sup = allEmployees.find((e) => e.id === sid);
                      return sup ? (
                        <span
                          key={sid}
                          className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-sm px-2 py-1 rounded-full"
                        >
                          {sup.full_name}
                          <button
                            type="button"
                            onClick={() =>
                              handleFieldChange(
                                'supervisor_ids',
                                (formData.supervisor_ids || []).filter((id) => id !== sid)
                              )
                            }
                            className="hover:text-red-500"
                            aria-label={`Убрать руководителя ${sup.full_name}`}
                            tabIndex={0}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ) : null;
                    })}
                    <Select
                      value=""
                      onValueChange={(v) => {
                        const id = Number(v);
                        if (id && !(formData.supervisor_ids || []).includes(id)) {
                          handleFieldChange('supervisor_ids', [...(formData.supervisor_ids || []), id]);
                        }
                      }}
                    >
                      <SelectTrigger className="w-[200px] h-8">
                        <SelectValue placeholder="+ Добавить" />
                      </SelectTrigger>
                      <SelectContent>
                        {supervisorOptions
                          .filter((e) => !(formData.supervisor_ids || []).includes(e.id))
                          .map((e) => (
                            <SelectItem key={e.id} value={String(e.id)}>
                              {e.full_name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="col-span-2">
                  <Label>Обязанности</Label>
                  <Textarea
                    value={formData.responsibilities || ''}
                    onChange={(e) => handleFieldChange('responsibilities', e.target.value)}
                    placeholder="Описание обязанностей сотрудника..."
                    rows={4}
                    className="resize-y"
                  />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active ?? true}
                    onChange={(e) => handleFieldChange('is_active', e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="is_active" className="cursor-pointer">
                    Активен (работает)
                  </Label>
                </div>
              </div>
            </TabsContent>

            {/* ===== ДОЛЖНОСТИ (только edit) ===== */}
            {isEdit && (
              <TabsContent value="positions" className="mt-0">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">История должностей</h3>
                    <Button
                      size="sm"
                      onClick={() => setShowPositionForm(!showPositionForm)}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Добавить
                    </Button>
                  </div>

                  {showPositionForm && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Юридическое лицо *</Label>
                          <Select
                            value={String(newPosition.legal_entity)}
                            onValueChange={(v) =>
                              setNewPosition((p) => ({ ...p, legal_entity: Number(v) }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {legalEntities.map((le) => (
                                <SelectItem key={le.id} value={String(le.id)}>
                                  {le.short_name || le.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Должность *</Label>
                          <Input
                            value={newPosition.position_title}
                            onChange={(e) =>
                              setNewPosition((p) => ({ ...p, position_title: e.target.value }))
                            }
                            placeholder="Менеджер проекта"
                          />
                        </div>
                        <div>
                          <Label>Дата начала *</Label>
                          <Input
                            type="date"
                            value={newPosition.start_date}
                            onChange={(e) =>
                              setNewPosition((p) => ({ ...p, start_date: e.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <Label>Дата окончания</Label>
                          <Input
                            type="date"
                            value={newPosition.end_date || ''}
                            onChange={(e) =>
                              setNewPosition((p) => ({
                                ...p,
                                end_date: e.target.value || null,
                                is_current: !e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label>Номер приказа</Label>
                          <Input
                            value={newPosition.order_number || ''}
                            onChange={(e) =>
                              setNewPosition((p) => ({ ...p, order_number: e.target.value }))
                            }
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => createPositionMutation.mutate(newPosition)}
                          disabled={
                            !newPosition.position_title || !newPosition.legal_entity || createPositionMutation.isPending
                          }
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {createPositionMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4 mr-1" />
                          )}
                          Сохранить
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setShowPositionForm(false)}>
                          Отмена
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Timeline */}
                  <div className="space-y-3">
                    {employee.positions.length === 0 ? (
                      <p className="text-gray-500 text-sm text-center py-4">Нет записей о должностях</p>
                    ) : (
                      employee.positions.map((pos) => (
                        <div
                          key={pos.id}
                          className={`border rounded-xl p-4 ${
                            pos.is_current
                              ? 'border-green-300 bg-green-50'
                              : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold">{pos.position_title}</h4>
                                {pos.is_current && (
                                  <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full">
                                    Текущая
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                                <Building2 className="w-3.5 h-3.5" />
                                {pos.legal_entity_name}
                              </p>
                              <p className="text-sm text-gray-500 mt-1">
                                {new Date(pos.start_date).toLocaleDateString('ru-RU')}
                                {pos.end_date
                                  ? ` — ${new Date(pos.end_date).toLocaleDateString('ru-RU')}`
                                  : ' — н.в.'}
                              </p>
                              {pos.order_number && (
                                <p className="text-xs text-gray-400 mt-1">Приказ: {pos.order_number}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>
            )}

            {/* ===== ОКЛАД (только edit) ===== */}
            {isEdit && (
              <TabsContent value="salary" className="mt-0">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">История оклада</h3>
                    <Button
                      size="sm"
                      onClick={() => setShowSalaryForm(!showSalaryForm)}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Добавить
                    </Button>
                  </div>

                  {/* Текущий оклад */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                    <p className="text-sm text-gray-500 mb-1">Текущий оклад</p>
                    <div className="flex gap-6">
                      <div>
                        <p className="text-2xl font-bold text-gray-900">
                          {Number(employee.salary_full).toLocaleString('ru-RU')} ₽
                        </p>
                        <p className="text-xs text-gray-500">Полный</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-gray-600">
                          {Number(employee.salary_official).toLocaleString('ru-RU')} ₽
                        </p>
                        <p className="text-xs text-gray-500">Официальный</p>
                      </div>
                    </div>
                  </div>

                  {showSalaryForm && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Оклад полный (₽) *</Label>
                          <Input
                            type="number"
                            value={newSalary.salary_full || ''}
                            onChange={(e) =>
                              setNewSalary((p) => ({ ...p, salary_full: Number(e.target.value) }))
                            }
                          />
                        </div>
                        <div>
                          <Label>Оклад официальный (₽) *</Label>
                          <Input
                            type="number"
                            value={newSalary.salary_official || ''}
                            onChange={(e) =>
                              setNewSalary((p) => ({ ...p, salary_official: Number(e.target.value) }))
                            }
                          />
                        </div>
                        <div>
                          <Label>Дата вступления в силу *</Label>
                          <Input
                            type="date"
                            value={newSalary.effective_date}
                            onChange={(e) =>
                              setNewSalary((p) => ({ ...p, effective_date: e.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <Label>Причина</Label>
                          <Input
                            value={newSalary.reason || ''}
                            onChange={(e) =>
                              setNewSalary((p) => ({ ...p, reason: e.target.value }))
                            }
                            placeholder="Повышение, индексация..."
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => createSalaryMutation.mutate(newSalary)}
                          disabled={createSalaryMutation.isPending}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {createSalaryMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4 mr-1" />
                          )}
                          Сохранить
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setShowSalaryForm(false)}>
                          Отмена
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* History table */}
                  {employee.salary_history.length > 0 && (
                    <div className="border rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-4 py-2 font-medium text-gray-600">Дата</th>
                            <th className="text-right px-4 py-2 font-medium text-gray-600">Полный</th>
                            <th className="text-right px-4 py-2 font-medium text-gray-600">Официальный</th>
                            <th className="text-left px-4 py-2 font-medium text-gray-600">Причина</th>
                          </tr>
                        </thead>
                        <tbody>
                          {employee.salary_history.map((sh, idx) => (
                            <tr key={sh.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-4 py-2">
                                {new Date(sh.effective_date).toLocaleDateString('ru-RU')}
                              </td>
                              <td className="px-4 py-2 text-right font-mono">
                                {Number(sh.salary_full).toLocaleString('ru-RU')} ₽
                              </td>
                              <td className="px-4 py-2 text-right font-mono">
                                {Number(sh.salary_official).toLocaleString('ru-RU')} ₽
                              </td>
                              <td className="px-4 py-2 text-gray-500">{sh.reason || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </TabsContent>
            )}

            {/* ===== БАНКОВСКИЕ РЕКВИЗИТЫ ===== */}
            <TabsContent value="bank" className="mt-0">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Landmark className="w-5 h-5 text-blue-600" />
                  Банковские реквизиты
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Наименование банка</Label>
                    <Input
                      value={formData.bank_name || ''}
                      onChange={(e) => handleFieldChange('bank_name', e.target.value)}
                      placeholder="ПАО Сбербанк"
                    />
                  </div>
                  <div>
                    <Label>БИК</Label>
                    <Input
                      value={formData.bank_bik || ''}
                      onChange={(e) => handleFieldChange('bank_bik', e.target.value)}
                      placeholder="044525225"
                      maxLength={9}
                    />
                  </div>
                  <div>
                    <Label>Корр. счёт</Label>
                    <Input
                      value={formData.bank_corr_account || ''}
                      onChange={(e) => handleFieldChange('bank_corr_account', e.target.value)}
                      placeholder="30101810400000000225"
                      maxLength={20}
                    />
                  </div>
                  <div>
                    <Label>Расчётный счёт</Label>
                    <Input
                      value={formData.bank_account || ''}
                      onChange={(e) => handleFieldChange('bank_account', e.target.value)}
                      placeholder="40817810099910004312"
                      maxLength={20}
                    />
                  </div>
                  <div>
                    <Label>Номер карты</Label>
                    <Input
                      value={formData.bank_card_number || ''}
                      onChange={(e) => handleFieldChange('bank_card_number', e.target.value)}
                      placeholder="4276 1234 5678 9012"
                      maxLength={19}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ===== ДОСТУП ERP ===== */}
            <TabsContent value="access" className="mt-0">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-blue-600" />
                  Разграничение доступа по разделам ERP
                </h3>
                <p className="text-sm text-gray-500">
                  Настройте уровень доступа сотрудника к каждому разделу системы.
                  Действует только если сотрудник привязан к учётной записи ERP.
                </p>
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Раздел</th>
                        <th className="text-center px-4 py-3 font-medium text-gray-600 w-28">
                          <span className="flex items-center justify-center gap-1">
                            <BadgeMinus className="w-4 h-4 text-gray-400" /> Нет
                          </span>
                        </th>
                        <th className="text-center px-4 py-3 font-medium text-gray-600 w-28">
                          <span className="flex items-center justify-center gap-1">
                            <Search className="w-4 h-4 text-blue-500" /> Чтение
                          </span>
                        </th>
                        <th className="text-center px-4 py-3 font-medium text-gray-600 w-28">
                          <span className="flex items-center justify-center gap-1">
                            <Pencil className="w-4 h-4 text-green-500" /> Редакт.
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ERP_SECTIONS.map((section, idx) => {
                        const currentLevel = formData.erp_permissions?.[section.code] || 'none';
                        return (
                          <tr key={section.code} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-4 py-3 font-medium">{section.label}</td>
                            {(['none', 'read', 'edit'] as ERPPermissionLevel[]).map((level) => (
                              <td key={level} className="text-center px-4 py-3">
                                <input
                                  type="radio"
                                  name={`perm-${section.code}`}
                                  checked={currentLevel === level}
                                  onChange={() => handlePermissionChange(section.code, level)}
                                  className="w-4 h-4 cursor-pointer accent-blue-600"
                                  aria-label={`${section.label}: ${level}`}
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* ===== КОНТРАГЕНТ (только edit) ===== */}
            {isEdit && (
              <TabsContent value="counterparty" className="mt-0">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Link2 className="w-5 h-5 text-blue-600" />
                    Привязка к контрагенту
                  </h3>
                  <p className="text-sm text-gray-500">
                    Для выплаты зарплаты сотруднику необходимо привязать его к контрагенту.
                  </p>

                  {employee.counterparty ? (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <div className="flex items-center gap-2">
                        <BadgeCheck className="w-5 h-5 text-green-600" />
                        <span className="font-medium">Привязан к контрагенту:</span>
                        <span className="text-blue-600">{employee.counterparty_name}</span>
                        <span className="text-gray-400">(ID: {employee.counterparty})</span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <p className="text-amber-700 mb-3">Контрагент не привязан</p>
                      <Button
                        onClick={() => createCounterpartyMutation.mutate()}
                        disabled={createCounterpartyMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {createCounterpartyMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4 mr-1" />
                        )}
                        Создать контрагента из сотрудника
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
            )}
          </div>
        </Tabs>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Сохранение...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-1" /> {isEdit ? 'Сохранить' : 'Создать'}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
