import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type ConstructionObject } from '../../lib/api';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (object: ConstructionObject) => void;
};

type FormState = {
  name: string;
  address: string;
  description: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  address: '',
  description: '',
};

export const QuickCreateObjectDialog = ({ open, onOpenChange, onCreated }: Props) => {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const createMutation = useMutation({
    mutationFn: async () => {
      return api.createConstructionObject({
        name: form.name.trim(),
        address: form.address.trim(),
        status: 'planned',
        description: form.description.trim() || undefined,
      });
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['objects'] });
      toast.success(`Объект «${created.name}» создан`);
      setForm(EMPTY_FORM);
      onCreated(created);
      onOpenChange(false);
    },
    onError: (err: any) => {
      const detail = err?.message || 'Не удалось создать объект';
      toast.error(detail);
    },
  });

  const handleClose = () => {
    setForm(EMPTY_FORM);
    onOpenChange(false);
  };

  const isValid = form.name.trim().length > 0 && form.address.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Новый объект</DialogTitle>
          <DialogDescription>
            Быстрое создание объекта со статусом «Планируемый»
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="qc-obj-name">
              Название <span className="text-destructive">*</span>
            </Label>
            <Input
              id="qc-obj-name"
              placeholder="Название объекта"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qc-obj-address">
              Адрес <span className="text-destructive">*</span>
            </Label>
            <Input
              id="qc-obj-address"
              placeholder="Москва, ул. Строителей, д. 1"
              value={form.address}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qc-obj-desc">Описание</Label>
            <Textarea
              id="qc-obj-desc"
              placeholder="Дополнительная информация об объекте..."
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
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
            aria-label="Создать объект"
          >
            {createMutation.isPending ? 'Создание...' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
