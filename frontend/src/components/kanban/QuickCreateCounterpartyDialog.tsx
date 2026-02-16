import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Counterparty } from '../../lib/api';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (counterparty: Counterparty) => void;
};

type FormState = {
  name: string;
  inn: string;
  kpp: string;
  contactInfo: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  inn: '',
  kpp: '',
  contactInfo: '',
};

export const QuickCreateCounterpartyDialog = ({ open, onOpenChange, onCreated }: Props) => {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const createMutation = useMutation({
    mutationFn: async () => {
      return api.createCounterparty({
        name: form.name.trim(),
        inn: form.inn.trim(),
        kpp: form.kpp.trim() || undefined,
        type: 'potential_customer',
        legal_form: 'ooo',
        contact_info: form.contactInfo.trim() || undefined,
      });
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['counterparties'] });
      toast.success(`Контрагент «${created.name}» создан`);
      setForm(EMPTY_FORM);
      onCreated(created);
      onOpenChange(false);
    },
    onError: (err: any) => {
      const detail = err?.message || 'Не удалось создать контрагента';
      toast.error(detail);
    },
  });

  const handleClose = () => {
    setForm(EMPTY_FORM);
    onOpenChange(false);
  };

  const isValid = form.name.trim().length > 0 && form.inn.trim().length >= 10;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Новый потенциальный заказчик</DialogTitle>
          <DialogDescription>
            Быстрое создание контрагента с типом «Потенциальный заказчик»
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="qc-cp-name">
              Название <span className="text-destructive">*</span>
            </Label>
            <Input
              id="qc-cp-name"
              placeholder="ООО «Ромашка»"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qc-cp-inn">
              ИНН <span className="text-destructive">*</span>
            </Label>
            <Input
              id="qc-cp-inn"
              placeholder="1234567890"
              value={form.inn}
              onChange={(e) => setForm((p) => ({ ...p, inn: e.target.value }))}
              maxLength={12}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qc-cp-kpp">КПП</Label>
            <Input
              id="qc-cp-kpp"
              placeholder="123456789"
              value={form.kpp}
              onChange={(e) => setForm((p) => ({ ...p, kpp: e.target.value }))}
              maxLength={9}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qc-cp-contact">Контактная информация</Label>
            <Textarea
              id="qc-cp-contact"
              placeholder="ФИО, телефон, email..."
              value={form.contactInfo}
              onChange={(e) => setForm((p) => ({ ...p, contactInfo: e.target.value }))}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} tabIndex={0} aria-label="Отмена">
            Отмена
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!isValid || createMutation.isPending}
            tabIndex={0}
            aria-label="Создать контрагента"
          >
            {createMutation.isPending ? 'Создание...' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
