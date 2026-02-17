import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { kanbanApi } from '../../lib/kanbanApi';
import type { Counterparty, ConstructionObject } from '../../lib/api';
import { useObjects, useCounterparties } from '../../hooks/useReferenceData';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { PlusCircle } from 'lucide-react';
import { QuickCreateCounterpartyDialog } from './QuickCreateCounterpartyDialog';
import { QuickCreateObjectDialog } from './QuickCreateObjectDialog';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  firstColumnId: string;
  cardType: string;
  onCreated: () => void;
};

type FormData = {
  title: string;
  objectId: string;
  objectName: string;
  systemName: string;
  counterpartyId: string;
  counterpartyName: string;
  contactsInfo: string;
  comments: string;
};

const EMPTY_FORM: FormData = {
  title: '',
  objectId: '',
  objectName: '',
  systemName: '',
  counterpartyId: '',
  counterpartyName: '',
  contactsInfo: '',
  comments: '',
};

export const CreateCommercialCardDialog = ({
  open,
  onOpenChange,
  boardId,
  firstColumnId,
  cardType,
  onCreated,
}: Props) => {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [isQuickCreateCPOpen, setIsQuickCreateCPOpen] = useState(false);
  const [isQuickCreateObjOpen, setIsQuickCreateObjOpen] = useState(false);

  const { data: objectsData } = useObjects();
  const objects = Array.isArray(objectsData)
    ? objectsData
    : (objectsData as any)?.results ?? [];

  const { data: counterpartiesData } = useCounterparties();
  const allCounterparties = Array.isArray(counterpartiesData)
    ? counterpartiesData
    : (counterpartiesData as any)?.results ?? [];
  const potentialCustomers = allCounterparties.filter(
    (c: any) => c.type === 'potential_customer' || c.type === 'customer',
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const card = await kanbanApi.createCard({
        board: boardId,
        column: firstColumnId,
        type: cardType,
        title: form.title.trim(),
        description: '',
        meta: {
          erp_object_id: form.objectId ? Number(form.objectId) : null,
          erp_object_name: form.objectName,
          system_name: form.systemName,
        },
      });

      await kanbanApi.createCommercialCase({
        card: card.id,
        erp_object_id: form.objectId ? Number(form.objectId) : null,
        erp_object_name: form.objectName,
        system_name: form.systemName,
        erp_counterparty_id: form.counterpartyId ? Number(form.counterpartyId) : null,
        erp_counterparty_name: form.counterpartyName,
        erp_tkp_ids: [],
        contacts_info: form.contactsInfo,
        comments: form.comments,
      });

      return card;
    },
    onSuccess: () => {
      setForm(EMPTY_FORM);
      onCreated();
    },
  });

  const handleObjectChange = (value: string) => {
    const obj = objects.find((o: any) => String(o.id) === value);
    setForm((prev) => ({
      ...prev,
      objectId: value,
      objectName: obj?.name || '',
    }));
  };

  const handleCounterpartyChange = (value: string) => {
    const cp = potentialCustomers.find((c: any) => String(c.id) === value);
    setForm((prev) => ({
      ...prev,
      counterpartyId: value,
      counterpartyName: cp?.name || '',
      contactsInfo: prev.contactsInfo || cp?.contact_info || '',
    }));
  };

  const handleCounterpartyCreated = (cp: Counterparty) => {
    setForm((prev) => ({
      ...prev,
      counterpartyId: String(cp.id),
      counterpartyName: cp.name,
      contactsInfo: prev.contactsInfo || cp.contact_info || '',
    }));
  };

  const handleObjectCreated = (obj: ConstructionObject) => {
    setForm((prev) => ({
      ...prev,
      objectId: String(obj.id),
      objectName: obj.name,
    }));
  };

  const handleClose = () => {
    setForm(EMPTY_FORM);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-[560px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Новая карточка</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Title */}
            <div className="space-y-1.5">
              <label htmlFor="cc-title" className="text-sm font-medium">
                Название <span className="text-destructive">*</span>
              </label>
              <Input
                id="cc-title"
                placeholder="Например: КП для ООО «Ромашка»"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                autoFocus
              />
            </div>

            {/* Object */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Объект</label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={() => setIsQuickCreateObjOpen(true)}
                  tabIndex={0}
                  aria-label="Создать новый объект"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Новый
                </Button>
              </div>
              <Select value={form.objectId} onValueChange={handleObjectChange}>
                <SelectTrigger aria-label="Выбрать объект">
                  <SelectValue placeholder="Выберите объект" />
                </SelectTrigger>
                <SelectContent>
                  {objects.map((obj: any) => (
                    <SelectItem key={obj.id} value={String(obj.id)}>
                      {obj.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* System */}
            <div className="space-y-1.5">
              <label htmlFor="cc-system" className="text-sm font-medium">Система</label>
              <Input
                id="cc-system"
                placeholder="Например: Вентиляция, Кондиционирование"
                value={form.systemName}
                onChange={(e) => setForm((p) => ({ ...p, systemName: e.target.value }))}
              />
            </div>

            {/* Counterparty */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Потенциальный заказчик</label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={() => setIsQuickCreateCPOpen(true)}
                  tabIndex={0}
                  aria-label="Создать нового потенциального заказчика"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Новый
                </Button>
              </div>
              <Select value={form.counterpartyId} onValueChange={handleCounterpartyChange}>
                <SelectTrigger aria-label="Выбрать заказчика">
                  <SelectValue placeholder="Выберите контрагента" />
                </SelectTrigger>
                <SelectContent>
                  {potentialCustomers.map((cp: any) => (
                    <SelectItem key={cp.id} value={String(cp.id)}>
                      {cp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Contacts */}
            <div className="space-y-1.5">
              <label htmlFor="cc-contacts" className="text-sm font-medium">Контакты</label>
              <Textarea
                id="cc-contacts"
                placeholder="ФИО, телефон, email..."
                value={form.contactsInfo}
                onChange={(e) => setForm((p) => ({ ...p, contactsInfo: e.target.value }))}
                rows={3}
              />
            </div>

            {/* Comments */}
            <div className="space-y-1.5">
              <label htmlFor="cc-comments" className="text-sm font-medium">Комментарии</label>
              <Textarea
                id="cc-comments"
                placeholder="Дополнительная информация..."
                value={form.comments}
                onChange={(e) => setForm((p) => ({ ...p, comments: e.target.value }))}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose} tabIndex={0} aria-label="Отмена">
              Отмена
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!form.title.trim() || createMutation.isPending}
              tabIndex={0}
              aria-label="Создать карточку"
            >
              {createMutation.isPending ? 'Создание...' : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuickCreateObjectDialog
        open={isQuickCreateObjOpen}
        onOpenChange={setIsQuickCreateObjOpen}
        onCreated={handleObjectCreated}
      />

      <QuickCreateCounterpartyDialog
        open={isQuickCreateCPOpen}
        onOpenChange={setIsQuickCreateCPOpen}
        onCreated={handleCounterpartyCreated}
      />
    </>
  );
};
