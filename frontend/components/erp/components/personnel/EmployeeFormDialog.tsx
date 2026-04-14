import { useState, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  api, EmployeeDetail, CreateEmployeeData, CreatePositionRecordData, CreateSalaryRecordData,
  LegalEntity, ERP_PERMISSION_TREE, ERPPermissionLevel, ERPPermissions,
} from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  UserCircle, Briefcase, Banknote, Landmark, ShieldCheck, Link2, Plus, Loader2,
  Search, Pencil, Save, X, Building2, BadgeCheck, BadgeMinus, UserPlus, KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';

import { PositionRecordsTab } from './PositionRecordsTab';
import { SalaryHistoryTab } from './SalaryHistoryTab';
import { CreateUserDialog } from './CreateUserDialog';

const defaultErpPermissions = (existing?: ERPPermissions): ERPPermissions => {
  const perms: ERPPermissions = {};
  ERP_PERMISSION_TREE.forEach((section) => {
    perms[section.code] = existing?.[section.code] || 'none';
    section.children.forEach((child) => {
      const key = `${section.code}.${child.code}`;
      perms[key] = existing?.[key] || 'none';
    });
  });
  return perms;
};

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeDetail | null;
  legalEntities: LegalEntity[];
}

export function EmployeeFormDialog({ open, onOpenChange, employee, legalEntities }: EmployeeFormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!employee;
  const [activeTab, setActiveTab] = useState('main');

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
    erp_permissions: defaultErpPermissions(employee?.erp_permissions),
    is_active: employee?.is_active ?? true,
  }));

  const { data: allEmployees = [] } = useQuery({
    queryKey: ['employees', '', 'all', 'all'],
    queryFn: () => api.personnel.getEmployees(),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users-for-link'],
    queryFn: async () => { const res = await api.auth.getUsers(); return res.results || []; },
  });
  const allUsers = (usersData || []) as Array<{ id: number; username: string; first_name: string; last_name: string }>;

  const linkedUserIds = new Set(allEmployees.filter((e) => e.id !== employee?.id && e.user).map((e) => e.user));
  const availableUsers = allUsers.filter((u) => !linkedUserIds.has(u.id) || u.id === formData.user);

  const saveMutation = useMutation({
    mutationFn: (data: CreateEmployeeData) => isEdit ? api.personnel.updateEmployee(employee!.id, data) : api.personnel.createEmployee(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['employees'] }); toast.success(isEdit ? 'Сотрудник обновлён' : 'Сотрудник создан'); onOpenChange(false); },
    onError: (e: Error) => toast.error(`Ошибка: ${e?.message}`),
  });

  const createCounterpartyMutation = useMutation({
    mutationFn: () => api.personnel.createCounterpartyFromEmployee(employee!.id),
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ['employees'] }); queryClient.invalidateQueries({ queryKey: ['counterparties'] }); toast.success(data.message); handleFieldChange('counterparty', data.id); },
    onError: (e: Error) => toast.error(`Ошибка: ${e?.message}`),
  });

  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  const setPasswordMutation = useMutation({
    mutationFn: () => api.personnel.setEmployeePassword(employee!.id, {
      new_password: newPassword,
      new_password_confirm: newPasswordConfirm,
    }),
    onSuccess: () => {
      toast.success('Пароль установлен');
      setNewPassword('');
      setNewPasswordConfirm('');
    },
    onError: (e: Error) => toast.error(`Ошибка: ${e?.message}`),
  });

  const handleSave = () => { if (!formData.full_name.trim()) { toast.error('Укажите ФИО сотрудника'); return; } saveMutation.mutate(formData); };
  const handleFieldChange = (field: keyof CreateEmployeeData, value: CreateEmployeeData[keyof CreateEmployeeData]) => { setFormData((prev) => ({ ...prev, [field]: value })); };
  const handlePermissionChange = (section: string, level: ERPPermissionLevel) => { setFormData((prev) => ({ ...prev, erp_permissions: { ...prev.erp_permissions, [section]: level } })); };
  const supervisorOptions = allEmployees.filter((e) => e.id !== employee?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserCircle className="w-5 h-5" />{isEdit ? `Сотрудник: ${employee.full_name}` : 'Новый сотрудник'}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="flex flex-wrap mb-4">
            <TabsTrigger value="main" className="flex items-center gap-1.5"><UserCircle className="w-4 h-4" /> Основное</TabsTrigger>
            {isEdit && (<TabsTrigger value="positions" className="flex items-center gap-1.5"><Briefcase className="w-4 h-4" /> Должности</TabsTrigger>)}
            {isEdit && (<TabsTrigger value="salary" className="flex items-center gap-1.5"><Banknote className="w-4 h-4" /> Оклад</TabsTrigger>)}
            <TabsTrigger value="bank" className="flex items-center gap-1.5"><Landmark className="w-4 h-4" /> Банк. реквизиты</TabsTrigger>
            <TabsTrigger value="access" className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Доступ ERP</TabsTrigger>
            {isEdit && (<TabsTrigger value="counterparty" className="flex items-center gap-1.5"><Link2 className="w-4 h-4" /> Контрагент</TabsTrigger>)}
          </TabsList>

          <div className="flex-1 overflow-auto min-h-[420px]">
            {/* Main Tab */}
            <TabsContent value="main" className="mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><Label>ФИО *</Label><Input value={formData.full_name} onChange={(e) => handleFieldChange('full_name', e.target.value)} placeholder="Иванов Иван Иванович" /></div>
                <div className="col-span-2">
                  <Label>Учётная запись (User)</Label>
                  <div className="flex gap-2">
                    <Select value={formData.user ? String(formData.user) : '_none'} onValueChange={(v) => handleFieldChange('user', v === '_none' ? null : Number(v))}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Не привязана" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">— Не привязана —</SelectItem>
                        {availableUsers.map((u) => (<SelectItem key={u.id} value={String(u.id)}>{u.username}{u.first_name || u.last_name ? ` (${[u.first_name, u.last_name].filter(Boolean).join(' ')})` : ''}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    {isEdit && !formData.user && (
                      <Button type="button" variant="outline" onClick={() => setCreateUserDialogOpen(true)} className="shrink-0">
                        <UserPlus className="w-4 h-4 mr-1" /> Создать
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Привязка к учётной записи даёт сотруднику возможность входить в систему и определяет его права доступа</p>
                </div>
                {isEdit && (
                  <div className="col-span-2 rounded-xl border border-dashed border-border p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-primary" />
                      <Label className="mb-0">Пароль доступа</Label>
                    </div>
                    {!formData.user ? (
                      <p className="text-xs text-muted-foreground">
                        Сначала создайте или привяжите учётную запись, затем можно будет задать пароль.
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="new_password" className="text-xs">Новый пароль</Label>
                            <Input id="new_password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Минимум 8 символов" autoComplete="new-password" />
                          </div>
                          <div>
                            <Label htmlFor="new_password_confirm" className="text-xs">Повторите пароль</Label>
                            <Input id="new_password_confirm" type="password" value={newPasswordConfirm} onChange={(e) => setNewPasswordConfirm(e.target.value)} placeholder="Повтор" autoComplete="new-password" />
                          </div>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <p className="text-xs text-muted-foreground">После установки сотрудник сможет войти в систему.</p>
                          <Button
                            type="button"
                            onClick={() => setPasswordMutation.mutate()}
                            disabled={!newPassword || !newPasswordConfirm || setPasswordMutation.isPending}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            {setPasswordMutation.isPending ? (<><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Сохранение...</>) : (<><KeyRound className="w-4 h-4 mr-1" /> Установить пароль</>)}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div><Label>Дата рождения</Label><Input type="date" value={formData.date_of_birth || ''} onChange={(e) => handleFieldChange('date_of_birth', e.target.value || null)} /></div>
                <div>
                  <Label>Пол</Label>
                  <Select value={formData.gender || 'none'} onValueChange={(v) => handleFieldChange('gender', v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Не указан" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Не указан</SelectItem><SelectItem value="M">Мужской</SelectItem><SelectItem value="F">Женский</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>Текущая должность</Label><Input value={formData.current_position || ''} onChange={(e) => handleFieldChange('current_position', e.target.value)} placeholder="Менеджер проекта" /></div>
                <div><Label>Дата приёма на работу</Label><Input type="date" value={formData.hire_date || ''} onChange={(e) => handleFieldChange('hire_date', e.target.value || null)} /></div>
                <div><Label>Оклад полный (P)</Label><Input type="number" value={formData.salary_full || ''} onChange={(e) => handleFieldChange('salary_full', Number(e.target.value))} /></div>
                <div><Label>Оклад официальный (P)</Label><Input type="number" value={formData.salary_official || ''} onChange={(e) => handleFieldChange('salary_official', Number(e.target.value))} /></div>
                <div className="col-span-2">
                  <Label>Руководители</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {(formData.supervisor_ids || []).map((sid) => {
                      const sup = allEmployees.find((e) => e.id === sid);
                      return sup ? (
                        <span key={sid} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-sm px-2 py-1 rounded-full">
                          {sup.full_name}
                          <button type="button" onClick={() => handleFieldChange('supervisor_ids', (formData.supervisor_ids || []).filter((id) => id !== sid))} className="hover:text-red-500" aria-label={`Убрать руководителя ${sup.full_name}`} tabIndex={0}><X className="w-3 h-3" /></button>
                        </span>
                      ) : null;
                    })}
                    <Select value="" onValueChange={(v) => { const id = Number(v); if (id && !(formData.supervisor_ids || []).includes(id)) { handleFieldChange('supervisor_ids', [...(formData.supervisor_ids || []), id]); } }}>
                      <SelectTrigger className="w-[200px] h-8"><SelectValue placeholder="+ Добавить" /></SelectTrigger>
                      <SelectContent>{supervisorOptions.filter((e) => !(formData.supervisor_ids || []).includes(e.id)).map((e) => (<SelectItem key={e.id} value={String(e.id)}>{e.full_name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="col-span-2"><Label>Обязанности</Label><Textarea value={formData.responsibilities || ''} onChange={(e) => handleFieldChange('responsibilities', e.target.value)} placeholder="Описание обязанностей сотрудника..." rows={4} className="resize-y" /></div>
                <div className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="is_active" checked={formData.is_active ?? true} onChange={(e) => handleFieldChange('is_active', e.target.checked)} className="rounded" />
                  <Label htmlFor="is_active" className="cursor-pointer">Активен (работает)</Label>
                </div>
              </div>
            </TabsContent>

            {/* Positions Tab */}
            {isEdit && (
              <TabsContent value="positions" className="mt-0">
                <PositionRecordsTab employee={employee!} legalEntities={legalEntities} />
              </TabsContent>
            )}

            {/* Salary Tab */}
            {isEdit && (
              <TabsContent value="salary" className="mt-0">
                <SalaryHistoryTab employee={employee!} />
              </TabsContent>
            )}

            {/* Bank Tab */}
            <TabsContent value="bank" className="mt-0">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2"><Landmark className="w-5 h-5 text-primary" />Банковские реквизиты</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2"><Label>Наименование банка</Label><Input value={formData.bank_name || ''} onChange={(e) => handleFieldChange('bank_name', e.target.value)} placeholder="ПАО Сбербанк" /></div>
                  <div><Label>БИК</Label><Input value={formData.bank_bik || ''} onChange={(e) => handleFieldChange('bank_bik', e.target.value)} placeholder="044525225" maxLength={9} /></div>
                  <div><Label>Корр. счёт</Label><Input value={formData.bank_corr_account || ''} onChange={(e) => handleFieldChange('bank_corr_account', e.target.value)} placeholder="30101810400000000225" maxLength={20} /></div>
                  <div><Label>Расчётный счёт</Label><Input value={formData.bank_account || ''} onChange={(e) => handleFieldChange('bank_account', e.target.value)} placeholder="40817810099910004312" maxLength={20} /></div>
                  <div><Label>Номер карты</Label><Input value={formData.bank_card_number || ''} onChange={(e) => handleFieldChange('bank_card_number', e.target.value)} placeholder="4276 1234 5678 9012" maxLength={19} /></div>
                </div>
              </div>
            </TabsContent>

            {/* Access Tab */}
            <TabsContent value="access" className="mt-0">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" />Разграничение доступа по разделам ERP</h3>
                <p className="text-sm text-muted-foreground">Настройте уровень доступа сотрудника к каждому разделу и подразделу системы. При изменении уровня раздела все подразделы обновятся каскадно.</p>
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Раздел</th>
                        <th className="text-center px-4 py-3 font-medium text-muted-foreground w-28"><span className="flex items-center justify-center gap-1"><BadgeMinus className="w-4 h-4 text-muted-foreground" /> Нет</span></th>
                        <th className="text-center px-4 py-3 font-medium text-muted-foreground w-28"><span className="flex items-center justify-center gap-1"><Search className="w-4 h-4 text-blue-500" /> Чтение</span></th>
                        <th className="text-center px-4 py-3 font-medium text-muted-foreground w-28"><span className="flex items-center justify-center gap-1"><Pencil className="w-4 h-4 text-green-500" /> Редакт.</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ERP_PERMISSION_TREE.map((section, idx) => {
                        const sectionLevel = formData.erp_permissions?.[section.code] || 'none';
                        const hasChildren = section.children.length > 0;
                        const handleSectionChange = (level: ERPPermissionLevel) => {
                          setFormData((prev) => {
                            const updated = { ...prev.erp_permissions, [section.code]: level };
                            section.children.forEach((child) => { updated[`${section.code}.${child.code}`] = level; });
                            return { ...prev, erp_permissions: updated };
                          });
                        };
                        return (
                          <Fragment key={section.code}>
                            <tr className={idx % 2 === 0 ? 'bg-card' : 'bg-muted'}>
                              <td className="px-4 py-3 font-semibold">{section.label}</td>
                              {(['none', 'read', 'edit'] as ERPPermissionLevel[]).map((level) => (
                                <td key={level} className="text-center px-4 py-3">
                                  <input type="radio" name={`perm-${section.code}`} checked={sectionLevel === level} onChange={() => handleSectionChange(level)} className="w-4 h-4 cursor-pointer accent-blue-600" aria-label={`${section.label}: ${level}`} />
                                </td>
                              ))}
                            </tr>
                            {hasChildren && section.children.map((child) => {
                              const childKey = `${section.code}.${child.code}`;
                              const childLevel = formData.erp_permissions?.[childKey] || sectionLevel;
                              return (
                                <tr key={childKey} className="bg-card/50">
                                  <td className="pl-10 pr-4 py-2 text-muted-foreground"><span className="text-muted-foreground mr-2">L</span>{child.label}</td>
                                  {(['none', 'read', 'edit'] as ERPPermissionLevel[]).map((level) => (
                                    <td key={level} className="text-center px-4 py-2">
                                      <input type="radio" name={`perm-${childKey}`} checked={childLevel === level} onChange={() => handlePermissionChange(childKey, level)} className="w-4 h-4 cursor-pointer accent-blue-500" aria-label={`${child.label}: ${level}`} />
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* Counterparty Tab */}
            {isEdit && (
              <TabsContent value="counterparty" className="mt-0">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2"><Link2 className="w-5 h-5 text-primary" />Привязка к контрагенту</h3>
                  <p className="text-sm text-muted-foreground">Для выплаты зарплаты сотруднику необходимо привязать его к контрагенту.</p>
                  {employee.counterparty ? (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                      <div className="flex items-center gap-2">
                        <BadgeCheck className="w-5 h-5 text-green-600" />
                        <span className="font-medium">Привязан к контрагенту:</span>
                        <span className="text-primary">{employee.counterparty_name}</span>
                        <span className="text-muted-foreground">(ID: {employee.counterparty})</span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <p className="text-amber-700 mb-3">Контрагент не привязан</p>
                      <Button onClick={() => createCounterpartyMutation.mutate()} disabled={createCounterpartyMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                        {createCounterpartyMutation.isPending ? (<Loader2 className="w-4 h-4 mr-1 animate-spin" />) : (<Plus className="w-4 h-4 mr-1" />)}
                        Создать контрагента из сотрудника
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
            )}
          </div>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
            {saveMutation.isPending ? (<><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Сохранение...</>) : (<><Save className="w-4 h-4 mr-1" /> {isEdit ? 'Сохранить' : 'Создать'}</>)}
          </Button>
        </div>

        {isEdit && employee && (
          <CreateUserDialog
            open={createUserDialogOpen}
            onOpenChange={setCreateUserDialogOpen}
            employeeId={employee.id}
            employeeFullName={employee.full_name}
            onSuccess={(userId) => handleFieldChange('user', userId)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
