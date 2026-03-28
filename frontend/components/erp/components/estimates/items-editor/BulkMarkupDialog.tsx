import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type MarkupAction = 'skip' | 'percent' | 'fixed_price' | 'fixed_amount' | 'reset';

const MARKUP_OPTIONS: { value: MarkupAction; label: string }[] = [
  { value: 'skip', label: 'Не менять' },
  { value: 'percent', label: 'Процент' },
  { value: 'fixed_price', label: 'Продажная цена' },
  { value: 'fixed_amount', label: 'Фикс. сумма' },
  { value: 'reset', label: 'Сбросить' },
];

export interface BulkMarkupData {
  item_ids: number[];
  material_markup_type?: string | null;
  material_markup_value?: string | null;
  work_markup_type?: string | null;
  work_markup_value?: string | null;
}

interface BulkMarkupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedItemIds: number[];
  onApply: (data: BulkMarkupData) => void;
}

export const BulkMarkupDialog: React.FC<BulkMarkupDialogProps> = ({
  open,
  onOpenChange,
  selectedItemIds,
  onApply,
}) => {
  const [materialAction, setMaterialAction] = useState<MarkupAction>('skip');
  const [materialValue, setMaterialValue] = useState('');
  const [workAction, setWorkAction] = useState<MarkupAction>('skip');
  const [workValue, setWorkValue] = useState('');

  const handleApply = useCallback(() => {
    const data: BulkMarkupData = { item_ids: selectedItemIds };

    if (materialAction === 'reset') {
      data.material_markup_type = null;
      data.material_markup_value = null;
    } else if (materialAction !== 'skip') {
      data.material_markup_type = materialAction;
      data.material_markup_value = materialValue || '0';
    }

    if (workAction === 'reset') {
      data.work_markup_type = null;
      data.work_markup_value = null;
    } else if (workAction !== 'skip') {
      data.work_markup_type = workAction;
      data.work_markup_value = workValue || '0';
    }

    onApply(data);
    onOpenChange(false);
    setMaterialAction('skip');
    setMaterialValue('');
    setWorkAction('skip');
    setWorkValue('');
  }, [selectedItemIds, materialAction, materialValue, workAction, workValue, onApply, onOpenChange]);

  const needsInput = (action: MarkupAction) => action !== 'skip' && action !== 'reset';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Наценка ({selectedItemIds.length} строк)</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Наценка на материалы</Label>
            <div className="flex items-center gap-2">
              <Select value={materialAction} onValueChange={(v) => setMaterialAction(v as MarkupAction)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKUP_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {needsInput(materialAction) && (
                <Input
                  type="number"
                  step="0.01"
                  value={materialValue}
                  onChange={(e) => setMaterialValue(e.target.value)}
                  placeholder="Значение"
                  className="w-32"
                />
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Наценка на работы</Label>
            <div className="flex items-center gap-2">
              <Select value={workAction} onValueChange={(v) => setWorkAction(v as MarkupAction)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKUP_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {needsInput(workAction) && (
                <Input
                  type="number"
                  step="0.01"
                  value={workValue}
                  onChange={(e) => setWorkValue(e.target.value)}
                  placeholder="Значение"
                  className="w-32"
                />
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button
            onClick={handleApply}
            disabled={materialAction === 'skip' && workAction === 'skip'}
          >
            Применить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
