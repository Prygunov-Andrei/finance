'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

import { api } from '@/lib/api';
import { EXECUTOR_SPECIALIZATIONS } from '@/constants';

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

export function CampaignEditor({ onSuccess, onCancel }: Props) {
  const [name, setName] = useState('');
  const [campaignType, setCampaignType] = useState<'email' | 'sms'>('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Фильтры
  const [filterSpecs, setFilterSpecs] = useState<string[]>([]);
  const [filterCities, setFilterCities] = useState('');
  const [filterPotential, setFilterPotential] = useState<boolean | null>(null);
  const [filterAvailable, setFilterAvailable] = useState<boolean | null>(true);

  const toggleSpec = (value: string) => {
    setFilterSpecs(prev =>
      prev.includes(value) ? prev.filter(s => s !== value) : [...prev, value]
    );
  };

  const createMutation = useMutation({
    mutationFn: () => api.marketing.createCampaign({
      name,
      campaign_type: campaignType,
      subject: campaignType === 'email' ? subject : undefined,
      body,
      filter_specializations: filterSpecs.length > 0 ? filterSpecs : undefined,
      filter_cities: filterCities.trim()
        ? filterCities.split(',').map(c => c.trim()).filter(Boolean)
        : undefined,
      filter_is_potential: filterPotential,
      filter_is_available: filterAvailable,
    }),
    onSuccess: () => {
      toast.success('Рассылка создана');
      onSuccess();
    },
    onError: (err: Error) => toast.error(`Ошибка: ${err.message}`),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !body.trim()) {
      toast.error('Заполните название и текст');
      return;
    }
    createMutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Основное */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Название *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Предложение на объект..." />
        </div>
        <div>
          <Label>Тип</Label>
          <select
            className="w-full h-10 rounded-md border bg-background px-3 text-sm"
            value={campaignType}
            onChange={e => setCampaignType(e.target.value as 'email' | 'sms')}
          >
            <option value="email">Email-рассылка</option>
            <option value="sms">SMS-рассылка</option>
          </select>
        </div>
      </div>

      {campaignType === 'email' && (
        <div>
          <Label>Тема письма</Label>
          <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Предложение работы от Август Климат" />
        </div>
      )}

      <div>
        <Label>Текст сообщения *</Label>
        <Textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={campaignType === 'sms' ? 3 : 6}
          placeholder={campaignType === 'sms' ? 'SMS до 160 символов' : 'Текст email...'}
        />
        {campaignType === 'sms' && (
          <p className="text-xs text-muted-foreground mt-1">{body.length}/160 символов</p>
        )}
      </div>

      {/* Фильтры получателей */}
      <div className="space-y-3 border-t pt-4">
        <h3 className="font-medium text-sm text-muted-foreground uppercase">Фильтры получателей</h3>

        <div>
          <Label className="text-xs">Специализации</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
            {EXECUTOR_SPECIALIZATIONS.map(spec => (
              <label key={spec.value} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={filterSpecs.includes(spec.value)}
                  onCheckedChange={() => toggleSpec(spec.value)}
                />
                {spec.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-xs">Города (через запятую)</Label>
          <Input value={filterCities} onChange={e => setFilterCities(e.target.value)} placeholder="Москва, Санкт-Петербург" />
        </div>

        <div className="flex gap-6">
          <div>
            <Label className="text-xs">Статус</Label>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={filterPotential === null ? '' : filterPotential.toString()}
              onChange={e => setFilterPotential(e.target.value === '' ? null : e.target.value === 'true')}
            >
              <option value="">Все</option>
              <option value="true">Только потенциальные</option>
              <option value="false">Только действующие</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Доступность</Label>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={filterAvailable === null ? '' : filterAvailable.toString()}
              onChange={e => setFilterAvailable(e.target.value === '' ? null : e.target.value === 'true')}
            >
              <option value="">Все</option>
              <option value="true">Только доступные</option>
              <option value="false">Только недоступные</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Отмена</Button>
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Создание...' : 'Создать черновик'}
        </Button>
      </div>
    </form>
  );
}
