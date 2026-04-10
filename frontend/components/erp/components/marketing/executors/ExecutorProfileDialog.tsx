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
import type { ExecutorProfileDetail, CreateExecutorProfileData, UpdateExecutorProfileData } from '@/lib/api/types/marketing';

interface Props {
  profile?: ExecutorProfileDetail;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ExecutorProfileDialog({ profile, onSuccess, onCancel }: Props) {
  const isEdit = !!profile;

  // Counterparty fields (only for create)
  const [name, setName] = useState(profile?.counterparty?.name || '');
  const [inn, setInn] = useState(profile?.counterparty?.inn || '');
  const [legalForm, setLegalForm] = useState(profile?.counterparty?.legal_form || 'fiz');

  // Profile fields
  const [phone, setPhone] = useState(profile?.phone || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [telegramUsername, setTelegramUsername] = useState(profile?.telegram_username || '');
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp || '');
  const [contactPerson, setContactPerson] = useState(profile?.contact_person || '');
  const [city, setCity] = useState(profile?.city || '');
  const [region, setRegion] = useState(profile?.region || '');
  const [specializations, setSpecializations] = useState<string[]>(profile?.specializations || []);
  const [hourlyRate, setHourlyRate] = useState(profile?.hourly_rate || '');
  const [dailyRate, setDailyRate] = useState(profile?.daily_rate || '');
  const [teamSize, setTeamSize] = useState(profile?.team_size?.toString() || '');
  const [experienceYears, setExperienceYears] = useState(profile?.experience_years?.toString() || '');
  const [isPotential, setIsPotential] = useState(profile?.is_potential ?? true);
  const [isAvailable, setIsAvailable] = useState(profile?.is_available ?? true);
  const [notes, setNotes] = useState(profile?.notes || '');

  const toggleSpec = (value: string) => {
    setSpecializations(prev =>
      prev.includes(value)
        ? prev.filter(s => s !== value)
        : [...prev, value]
    );
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateExecutorProfileData) => api.marketing.createExecutorProfile(data),
    onSuccess: () => {
      toast.success('Исполнитель добавлен');
      onSuccess();
    },
    onError: (err: Error) => toast.error(`Ошибка: ${err.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateExecutorProfileData) => api.marketing.updateExecutorProfile(profile!.id, data),
    onSuccess: () => {
      toast.success('Профиль обновлён');
      onSuccess();
    },
    onError: (err: Error) => toast.error(`Ошибка: ${err.message}`),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const profileData = {
      phone,
      email,
      telegram_username: telegramUsername,
      whatsapp,
      contact_person: contactPerson,
      city,
      region,
      specializations,
      hourly_rate: hourlyRate || null,
      daily_rate: dailyRate || null,
      team_size: teamSize ? parseInt(teamSize) : null,
      experience_years: experienceYears ? parseInt(experienceYears) : null,
      is_potential: isPotential,
      is_available: isAvailable,
      notes,
    };

    if (isEdit) {
      updateMutation.mutate(profileData);
    } else {
      if (!name.trim()) {
        toast.error('Укажите наименование');
        return;
      }
      if (!inn.trim()) {
        toast.error('Укажите ИНН');
        return;
      }
      createMutation.mutate({
        name,
        inn,
        legal_form: legalForm,
        ...profileData,
      });
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Основные данные (только при создании) */}
      {!isEdit && (
        <div className="space-y-3">
          <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Контрагент</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="name">Наименование *</Label>
              <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="ИП Иванов И.И." />
            </div>
            <div>
              <Label htmlFor="inn">ИНН *</Label>
              <Input id="inn" value={inn} onChange={e => setInn(e.target.value)} placeholder="123456789012" />
            </div>
          </div>
          <div>
            <Label htmlFor="legalForm">Правовая форма</Label>
            <select
              id="legalForm"
              className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              value={legalForm}
              onChange={e => setLegalForm(e.target.value)}
            >
              <option value="fiz">Физ. лицо</option>
              <option value="self_employed">Самозанятый</option>
              <option value="ip">ИП</option>
              <option value="ooo">ООО</option>
            </select>
          </div>
        </div>
      )}

      {/* Контакты */}
      <div className="space-y-3">
        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Контакты</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="phone">Телефон</Label>
            <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+79001234567" />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="mail@example.com" />
          </div>
          <div>
            <Label htmlFor="telegram">Telegram</Label>
            <Input id="telegram" value={telegramUsername} onChange={e => setTelegramUsername(e.target.value)} placeholder="@username" />
          </div>
          <div>
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input id="whatsapp" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="+79001234567" />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="contactPerson">Контактное лицо</Label>
            <Input id="contactPerson" value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="Иванов Иван" />
          </div>
        </div>
      </div>

      {/* Специализации */}
      <div className="space-y-3">
        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Специализации</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {EXECUTOR_SPECIALIZATIONS.map(spec => (
            <label key={spec.value} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={specializations.includes(spec.value)}
                onCheckedChange={() => toggleSpec(spec.value)}
              />
              {spec.label}
            </label>
          ))}
        </div>
      </div>

      {/* Местоположение */}
      <div className="space-y-3">
        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Местоположение</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="city">Город</Label>
            <Input id="city" value={city} onChange={e => setCity(e.target.value)} placeholder="Москва" />
          </div>
          <div>
            <Label htmlFor="region">Регион</Label>
            <Input id="region" value={region} onChange={e => setRegion(e.target.value)} placeholder="Московская область" />
          </div>
        </div>
      </div>

      {/* Расценки */}
      <div className="space-y-3">
        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Расценки и опыт</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label htmlFor="hourlyRate">Ставка/час (руб)</Label>
            <Input id="hourlyRate" type="number" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} placeholder="800" />
          </div>
          <div>
            <Label htmlFor="dailyRate">Ставка/день (руб)</Label>
            <Input id="dailyRate" type="number" value={dailyRate} onChange={e => setDailyRate(e.target.value)} placeholder="5000" />
          </div>
          <div>
            <Label htmlFor="teamSize">Бригада (чел)</Label>
            <Input id="teamSize" type="number" value={teamSize} onChange={e => setTeamSize(e.target.value)} placeholder="3" />
          </div>
          <div>
            <Label htmlFor="experienceYears">Стаж (лет)</Label>
            <Input id="experienceYears" type="number" value={experienceYears} onChange={e => setExperienceYears(e.target.value)} placeholder="5" />
          </div>
        </div>
      </div>

      {/* Статусы */}
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={isPotential} onCheckedChange={(v) => setIsPotential(v === true)} />
          Потенциальный исполнитель
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={isAvailable} onCheckedChange={(v) => setIsAvailable(v === true)} />
          Доступен для работы
        </label>
      </div>

      {/* Заметки */}
      <div>
        <Label htmlFor="notes">Заметки</Label>
        <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Свободные заметки..." />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Отмена</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
        </Button>
      </div>
    </form>
  );
}
