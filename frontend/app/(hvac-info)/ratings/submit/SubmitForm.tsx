'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';

import type { RatingBrandOption } from '@/lib/api/types/rating';

const IONIZER_CHOICES = ['Нет', 'ПДС', 'Серебро', 'Биоклимат'];
const RUSSIAN_REMOTE_CHOICES = ['Нет', 'Только пульт', 'Экран и пульт'];
const UV_LAMP_CHOICES = ['Нет', 'Есть'];
const DRAIN_HEATER_CHOICES = ['Нет', 'Есть'];

const MAX_PHOTOS = 20;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

type FormState = {
  brand: string;
  custom_brand_name: string;
  series: string;
  inner_unit: string;
  outer_unit: string;
  compressor_model: string;
  nominal_capacity_watt: string;
  price: string;
  drain_pan_heater: string;
  erv: boolean | null;
  fan_speed_outdoor: boolean | null;
  remote_backlight: boolean | null;
  fan_speeds_indoor: string;
  fine_filters: string;
  ionizer_type: string;
  russian_remote: string;
  uv_lamp: string;
  inner_he_length_mm: string;
  inner_he_tube_count: string;
  inner_he_tube_diameter_mm: string;
  outer_he_length_mm: string;
  outer_he_tube_count: string;
  outer_he_tube_diameter_mm: string;
  outer_he_thickness_mm: string;
  video_url: string;
  buy_url: string;
  supplier_url: string;
  submitter_email: string;
  consent: boolean;
  website: string;
};

const INITIAL: FormState = {
  brand: '',
  custom_brand_name: '',
  series: '',
  inner_unit: '',
  outer_unit: '',
  compressor_model: '',
  nominal_capacity_watt: '',
  price: '',
  drain_pan_heater: '',
  erv: null,
  fan_speed_outdoor: null,
  remote_backlight: null,
  fan_speeds_indoor: '',
  fine_filters: '',
  ionizer_type: '',
  russian_remote: '',
  uv_lamp: '',
  inner_he_length_mm: '',
  inner_he_tube_count: '',
  inner_he_tube_diameter_mm: '',
  outer_he_length_mm: '',
  outer_he_tube_count: '',
  outer_he_tube_diameter_mm: '',
  outer_he_thickness_mm: '',
  video_url: '',
  buy_url: '',
  supplier_url: '',
  submitter_email: '',
  consent: false,
  website: '',
};

const REQUIRED_STRING_FIELDS: Array<keyof FormState> = [
  'inner_unit',
  'outer_unit',
  'compressor_model',
  'nominal_capacity_watt',
  'drain_pan_heater',
  'fan_speeds_indoor',
  'fine_filters',
  'ionizer_type',
  'russian_remote',
  'uv_lamp',
  'inner_he_length_mm',
  'inner_he_tube_count',
  'inner_he_tube_diameter_mm',
  'outer_he_length_mm',
  'outer_he_tube_count',
  'outer_he_tube_diameter_mm',
  'outer_he_thickness_mm',
  'submitter_email',
];

type FieldErrors = Record<string, string[]>;

function resolveBackendBase(): string {
  if (typeof window === 'undefined') return '';
  return (process.env.NEXT_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
}

export function isFormReady(
  state: FormState,
  photos: File[],
): boolean {
  if (!state.consent) return false;
  if (photos.length < 1 || photos.length > MAX_PHOTOS) return false;
  if (!state.brand && !state.custom_brand_name.trim()) return false;
  for (const field of REQUIRED_STRING_FIELDS) {
    const v = state[field];
    if (typeof v !== 'string' || v.trim() === '') return false;
  }
  if (state.erv === null) return false;
  if (state.fan_speed_outdoor === null) return false;
  if (state.remote_backlight === null) return false;
  return true;
}

export function validatePhotos(files: File[]): string | null {
  if (files.length < 1) return 'Загрузите хотя бы одно фото.';
  if (files.length > MAX_PHOTOS) return `Максимум ${MAX_PHOTOS} фото.`;
  for (const f of files) {
    if (f.size > MAX_PHOTO_BYTES) {
      return `Файл «${f.name}» превышает 10 МБ.`;
    }
  }
  return null;
}

type Props = { brands: RatingBrandOption[] };

export default function SubmitForm({ brands }: Props) {
  const [state, setState] = useState<FormState>(INITIAL);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [clientError, setClientError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [photos]);

  useEffect(() => {
    if (successEmail == null) return;
    const t = window.setTimeout(() => setSuccessEmail(null), 10_000);
    return () => window.clearTimeout(t);
  }, [successEmail]);

  const setField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        if (!prev[key as string]) return prev;
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
    },
    [],
  );

  const handlePhotoAdd = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const added = Array.from(e.target.files ?? []);
      if (added.length === 0) return;
      const merged = [...photos, ...added].slice(0, MAX_PHOTOS + 1);
      const err = validatePhotos(merged);
      if (err) {
        setClientError(err);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      setClientError(null);
      setPhotos(merged);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [photos],
  );

  const removePhoto = useCallback((idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
    setClientError(null);
  }, []);

  const resetForm = useCallback(() => {
    setState(INITIAL);
    setPhotos([]);
    setErrors({});
    setClientError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;

      if (state.website.trim() !== '') {
        setClientError('Форма содержит признаки автоматической отправки.');
        return;
      }
      const photoErr = validatePhotos(photos);
      if (photoErr) {
        setClientError(photoErr);
        return;
      }
      if (!isFormReady(state, photos)) {
        setClientError('Заполните все обязательные поля.');
        return;
      }

      setSubmitting(true);
      setClientError(null);
      setErrors({});

      const fd = new FormData();
      if (state.brand) fd.append('brand', state.brand);
      if (state.custom_brand_name.trim())
        fd.append('custom_brand_name', state.custom_brand_name.trim());
      for (const key of [
        'series',
        'inner_unit',
        'outer_unit',
        'compressor_model',
        'nominal_capacity_watt',
        'price',
        'drain_pan_heater',
        'fan_speeds_indoor',
        'fine_filters',
        'ionizer_type',
        'russian_remote',
        'uv_lamp',
        'inner_he_length_mm',
        'inner_he_tube_count',
        'inner_he_tube_diameter_mm',
        'outer_he_length_mm',
        'outer_he_tube_count',
        'outer_he_tube_diameter_mm',
        'outer_he_thickness_mm',
        'video_url',
        'buy_url',
        'supplier_url',
        'submitter_email',
      ] as const) {
        const v = state[key];
        if (typeof v === 'string' && v !== '') fd.append(key, v);
      }
      fd.append('erv', state.erv ? 'true' : 'false');
      fd.append('fan_speed_outdoor', state.fan_speed_outdoor ? 'true' : 'false');
      fd.append('remote_backlight', state.remote_backlight ? 'true' : 'false');
      fd.append('consent', state.consent ? 'true' : 'false');
      fd.append('website', '');
      photos.forEach((f) => fd.append('photos', f));

      const url = `${resolveBackendBase()}/api/public/v1/rating/submissions/`;
      try {
        const res = await fetch(url, { method: 'POST', body: fd });
        if (res.ok) {
          const email = state.submitter_email;
          resetForm();
          setSuccessEmail(email);
          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        } else if (res.status === 429) {
          setClientError(
            'Слишком много заявок с этого IP. Попробуйте через час.',
          );
        } else if (res.status === 400) {
          let body: unknown = null;
          try {
            body = await res.json();
          } catch {
            body = null;
          }
          if (body && typeof body === 'object') {
            const normalized: FieldErrors = {};
            for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
              if (Array.isArray(v)) {
                normalized[k] = v.map((x) => String(x));
              } else if (typeof v === 'string') {
                normalized[k] = [v];
              }
            }
            setErrors(normalized);
            setClientError('Проверьте выделенные поля.');
          } else {
            setClientError('Проверьте форму.');
          }
        } else {
          setClientError('Что-то пошло не так. Попробуйте позже.');
        }
      } catch {
        setClientError('Сеть недоступна. Попробуйте позже.');
      } finally {
        setSubmitting(false);
      }
    },
    [photos, resetForm, state, submitting],
  );

  const ready = useMemo(() => isFormReady(state, photos), [state, photos]);

  return (
    <main
      className="rt-submit-root"
      style={{ padding: '28px 40px 60px', maxWidth: 960, margin: '0 auto' }}
    >
      {successEmail != null && (
        <div
          role="status"
          data-testid="submit-success"
          style={{
            padding: '14px 18px',
            marginBottom: 18,
            background: 'hsl(var(--rt-accent-bg))',
            border: '1px solid hsl(var(--rt-accent))',
            borderRadius: 4,
            color: 'hsl(var(--rt-accent))',
            fontWeight: 500,
          }}
        >
          Заявка отправлена на модерацию. Проверьте почту{' '}
          <span style={{ fontFamily: 'var(--rt-font-mono)' }}>
            {successEmail}
          </span>{' '}
          — результат рассмотрения придёт туда.
        </div>
      )}

      <div
        style={{
          marginTop: 0,
          padding: '14px 16px',
          borderLeft: '3px solid hsl(var(--rt-accent))',
          background: 'hsl(var(--rt-accent-bg))',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--rt-font-mono)',
            fontSize: 11,
            fontWeight: 600,
            color: 'hsl(var(--rt-accent))',
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            margin: 0,
          }}
        >
          Раздел «Самые тихие» — отдельно
        </p>
        <p
          style={{
            fontSize: 12,
            lineHeight: 1.6,
            color: 'hsl(var(--rt-ink-80))',
            margin: '6px 0 0',
          }}
        >
          Чтобы кондиционер попал в рейтинг «Самые тихие», необходимо привезти
          его в лабораторию «Август-климат» для замера уровня шума. Оставьте
          заявку по e-mail:{' '}
          <span style={{ fontFamily: 'var(--rt-font-mono)' }}>
            7883903@gmail.com
          </span>
          .
        </p>
      </div>

      <div
        style={{
          marginTop: 28,
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        {[
          ['01', 'Модель'],
          ['02', 'Характеристики'],
          ['03', 'Теплообменник внутр.'],
          ['04', 'Теплообменник наруж.'],
          ['05', 'Подтверждение'],
        ].map(([n, t]) => (
          <span
            key={n}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              border: '1px solid hsl(var(--rt-border-subtle))',
              borderRadius: 3,
              background: 'transparent',
              color: 'hsl(var(--rt-ink-60))',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--rt-font-mono)',
                fontSize: 10,
                letterSpacing: 1,
              }}
            >
              {n}
            </span>
            <span style={{ fontSize: 11 }}>{t}</span>
          </span>
        ))}
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <HoneypotInput
          value={state.website}
          onChange={(v) => setField('website', v)}
        />

        <Section num="01" title="Модель кондиционера">
          <Row cols="1fr 1fr">
            <Field label="Бренд" required error={errors.brand?.[0]}>
              <Select
                value={state.brand}
                onChange={(v) => setField('brand', v)}
                options={[
                  { value: '', label: 'Другой (указать вручную)' },
                  ...brands.map((b) => ({
                    value: String(b.id),
                    label: b.name,
                  })),
                ]}
                placeholder="Выберите бренд…"
              />
            </Field>
            <Field
              label="Если «Другой» — укажите название"
              error={errors.custom_brand_name?.[0]}
            >
              <TextInput
                value={state.custom_brand_name}
                onChange={(v) => setField('custom_brand_name', v)}
                placeholder="—"
                disabled={!!state.brand}
              />
            </Field>
          </Row>
          <Row cols="1fr 1fr">
            <Field label="Серия" error={errors.series?.[0]}>
              <TextInput
                value={state.series}
                onChange={(v) => setField('series', v)}
                placeholder="—"
              />
            </Field>
            <div />
          </Row>
          <Row cols="1fr 1fr">
            <Field
              label="Модель внутреннего блока"
              required
              error={errors.inner_unit?.[0]}
            >
              <TextInput
                value={state.inner_unit}
                onChange={(v) => setField('inner_unit', v)}
                placeholder="Например: MSAG1-09HRN1"
              />
            </Field>
            <Field
              label="Модель наружного блока"
              required
              error={errors.outer_unit?.[0]}
            >
              <TextInput
                value={state.outer_unit}
                onChange={(v) => setField('outer_unit', v)}
                placeholder="Например: MSAG1-09HRN1-O"
              />
            </Field>
          </Row>
          <Row cols="1fr 1fr 1fr">
            <Field
              label="Модель компрессора"
              required
              error={errors.compressor_model?.[0]}
            >
              <TextInput
                value={state.compressor_model}
                onChange={(v) => setField('compressor_model', v)}
                placeholder="Например: QXC-19K"
              />
            </Field>
            <Field
              label="Холодопроизводительность"
              required
              error={errors.nominal_capacity_watt?.[0]}
            >
              <TextInput
                value={state.nominal_capacity_watt}
                onChange={(v) => setField('nominal_capacity_watt', v)}
                placeholder="2640"
                unit="Вт"
                type="number"
                inputMode="numeric"
              />
            </Field>
            <Field label="Цена" error={errors.price?.[0]}>
              <TextInput
                value={state.price}
                onChange={(v) => setField('price', v)}
                placeholder="—"
                unit="₽"
                type="number"
                inputMode="numeric"
              />
            </Field>
          </Row>
        </Section>

        <Section num="02" title="Характеристики">
          <Field
            label="Обогрев поддона"
            required
            error={errors.drain_pan_heater?.[0]}
          >
            <RadioGroup
              options={DRAIN_HEATER_CHOICES.map((v) => ({
                value: v,
                label: v,
              }))}
              value={state.drain_pan_heater}
              onChange={(v) => setField('drain_pan_heater', v)}
            />
          </Field>
          <Field label="Наличие ЭРВ" required error={errors.erv?.[0]}>
            <BoolRadio
              value={state.erv}
              onChange={(v) => setField('erv', v)}
            />
          </Field>
          <Field
            label="Регулировка оборотов вент. наруж. блока"
            required
            error={errors.fan_speed_outdoor?.[0]}
          >
            <BoolRadio
              value={state.fan_speed_outdoor}
              onChange={(v) => setField('fan_speed_outdoor', v)}
            />
          </Field>
          <Field
            label="Подсветка экрана пульта"
            required
            error={errors.remote_backlight?.[0]}
          >
            <BoolRadio
              value={state.remote_backlight}
              onChange={(v) => setField('remote_backlight', v)}
            />
          </Field>

          <Row cols="1fr 1fr">
            <Field
              label="Кол-во скоростей вент. внутр. блока"
              required
              error={errors.fan_speeds_indoor?.[0]}
            >
              <TextInput
                value={state.fan_speeds_indoor}
                onChange={(v) => setField('fan_speeds_indoor', v)}
                placeholder="3"
                unit="шт."
                type="number"
                inputMode="numeric"
              />
            </Field>
            <Field
              label="Фильтры тонкой очистки"
              required
              error={errors.fine_filters?.[0]}
            >
              <RadioGroup
                options={[
                  { value: '0', label: '0' },
                  { value: '1', label: '1' },
                  { value: '2', label: '2' },
                ]}
                value={state.fine_filters}
                onChange={(v) => setField('fine_filters', v)}
              />
            </Field>
          </Row>

          <Row cols="1fr 1fr">
            <Field
              label="Ионизатор"
              required
              error={errors.ionizer_type?.[0]}
            >
              <Select
                value={state.ionizer_type}
                onChange={(v) => setField('ionizer_type', v)}
                options={IONIZER_CHOICES.map((v) => ({ value: v, label: v }))}
                placeholder="Выберите…"
              />
            </Field>
            <Field
              label="Русифицированный пульт"
              required
              error={errors.russian_remote?.[0]}
            >
              <Select
                value={state.russian_remote}
                onChange={(v) => setField('russian_remote', v)}
                options={RUSSIAN_REMOTE_CHOICES.map((v) => ({
                  value: v,
                  label: v,
                }))}
                placeholder="Выберите…"
              />
            </Field>
          </Row>

          <Row cols="1fr 1fr">
            <Field
              label="УФ-лампа"
              required
              error={errors.uv_lamp?.[0]}
            >
              <Select
                value={state.uv_lamp}
                onChange={(v) => setField('uv_lamp', v)}
                options={UV_LAMP_CHOICES.map((v) => ({ value: v, label: v }))}
                placeholder="Выберите…"
              />
            </Field>
            <div />
          </Row>
        </Section>

        <Section num="03" title="Теплообменник внутреннего блока">
          <Row cols="1fr 1fr 1fr">
            <Field
              label="Длина"
              required
              error={errors.inner_he_length_mm?.[0]}
            >
              <TextInput
                value={state.inner_he_length_mm}
                onChange={(v) => setField('inner_he_length_mm', v)}
                placeholder="780"
                unit="мм"
                type="number"
                inputMode="decimal"
              />
            </Field>
            <Field
              label="Кол-во трубок"
              required
              error={errors.inner_he_tube_count?.[0]}
            >
              <TextInput
                value={state.inner_he_tube_count}
                onChange={(v) => setField('inner_he_tube_count', v)}
                placeholder="16"
                unit="шт."
                type="number"
                inputMode="numeric"
              />
            </Field>
            <Field
              label="Диаметр трубок"
              required
              error={errors.inner_he_tube_diameter_mm?.[0]}
            >
              <TextInput
                value={state.inner_he_tube_diameter_mm}
                onChange={(v) => setField('inner_he_tube_diameter_mm', v)}
                placeholder="7"
                unit="мм"
                type="number"
                inputMode="decimal"
              />
            </Field>
          </Row>
        </Section>

        <Section num="04" title="Теплообменник наружного блока">
          <Row cols="1fr 1fr">
            <Field
              label="Длина"
              required
              error={errors.outer_he_length_mm?.[0]}
            >
              <TextInput
                value={state.outer_he_length_mm}
                onChange={(v) => setField('outer_he_length_mm', v)}
                placeholder="820"
                unit="мм"
                type="number"
                inputMode="decimal"
              />
            </Field>
            <Field
              label="Кол-во трубок"
              required
              error={errors.outer_he_tube_count?.[0]}
            >
              <TextInput
                value={state.outer_he_tube_count}
                onChange={(v) => setField('outer_he_tube_count', v)}
                placeholder="22"
                unit="шт."
                type="number"
                inputMode="numeric"
              />
            </Field>
          </Row>
          <Row cols="1fr 1fr">
            <Field
              label="Диаметр трубок"
              required
              error={errors.outer_he_tube_diameter_mm?.[0]}
            >
              <TextInput
                value={state.outer_he_tube_diameter_mm}
                onChange={(v) => setField('outer_he_tube_diameter_mm', v)}
                placeholder="7"
                unit="мм"
                type="number"
                inputMode="decimal"
              />
            </Field>
            <Field
              label="Толщина"
              required
              error={errors.outer_he_thickness_mm?.[0]}
            >
              <TextInput
                value={state.outer_he_thickness_mm}
                onChange={(v) => setField('outer_he_thickness_mm', v)}
                placeholder="28"
                unit="мм"
                type="number"
                inputMode="decimal"
              />
            </Field>
          </Row>
        </Section>

        <Section num="05" title="Подтверждение замеров">
          <Field
            label={`Фото измерений (1–${MAX_PHOTOS})`}
            required
            error={errors.photos?.[0]}
          >
            <div>
              <label
                htmlFor="rt-photos-input"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '22px 16px',
                  border: '1.5px dashed hsl(var(--rt-border))',
                  borderRadius: 4,
                  background: 'hsl(var(--rt-paper))',
                  cursor: 'pointer',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    background: 'hsl(var(--rt-chip))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    color: 'hsl(var(--rt-ink-60))',
                  }}
                >
                  +
                </span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>
                    Нажмите, чтобы выбрать файлы
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      marginTop: 3,
                      color: 'hsl(var(--rt-ink-60))',
                    }}
                  >
                    JPG, PNG до 10 МБ каждый · максимум {MAX_PHOTOS} файлов
                  </div>
                </div>
              </label>
              <input
                ref={fileInputRef}
                id="rt-photos-input"
                data-testid="submit-photos"
                type="file"
                accept="image/jpeg,image/png"
                multiple
                onChange={handlePhotoAdd}
                style={{ display: 'none' }}
              />
              {photos.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    marginTop: 12,
                  }}
                >
                  {photos.map((f, i) => (
                    <div
                      key={`${f.name}-${i}`}
                      style={{
                        position: 'relative',
                        width: 80,
                        height: 80,
                        borderRadius: 4,
                        overflow: 'hidden',
                        border: '1px solid hsl(var(--rt-border-subtle))',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previews[i]}
                        alt={f.name}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        aria-label={`Удалить фото ${f.name}`}
                        style={{
                          position: 'absolute',
                          top: 2,
                          right: 2,
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          border: 'none',
                          background: 'rgba(0,0,0,0.55)',
                          color: '#fff',
                          fontSize: 12,
                          lineHeight: 1,
                          cursor: 'pointer',
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Field>

          <Field label="Ссылка на видео измерений" error={errors.video_url?.[0]}>
            <TextInput
              value={state.video_url}
              onChange={(v) => setField('video_url', v)}
              placeholder="https://…"
              type="url"
            />
          </Field>

          <Row cols="1fr 1fr">
            <Field label="Где купить" error={errors.buy_url?.[0]}>
              <TextInput
                value={state.buy_url}
                onChange={(v) => setField('buy_url', v)}
                placeholder="https://…"
                type="url"
              />
            </Field>
            <Field label="Сайт поставщика" error={errors.supplier_url?.[0]}>
              <TextInput
                value={state.supplier_url}
                onChange={(v) => setField('supplier_url', v)}
                placeholder="https://…"
                type="url"
              />
            </Field>
          </Row>

          <Field
            label="E-mail"
            required
            error={errors.submitter_email?.[0]}
          >
            <TextInput
              value={state.submitter_email}
              onChange={(v) => setField('submitter_email', v)}
              placeholder="you@example.com"
              type="email"
              inputMode="email"
            />
          </Field>
        </Section>

        <div
          style={{
            marginTop: 32,
            padding: '22px 24px',
            background: 'hsl(var(--rt-alt))',
            borderRadius: 4,
          }}
        >
          <label
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              data-testid="submit-consent"
              checked={state.consent}
              onChange={(e) => setField('consent', e.target.checked)}
              style={{ marginTop: 3, accentColor: 'hsl(var(--rt-accent))' }}
            />
            <span
              style={{
                fontSize: 12,
                lineHeight: 1.55,
                color: 'hsl(var(--rt-ink-80))',
              }}
            >
              Я даю согласие на обработку персональных данных в соответствии с
              Федеральным законом №152-ФЗ «О персональных данных».{' '}
              <span style={{ color: 'hsl(var(--rt-accent))' }}>*</span>
            </span>
          </label>
          {errors.consent?.[0] ? (
            <p
              style={{
                marginTop: 8,
                marginLeft: 30,
                color: 'hsl(var(--rt-bad))',
                fontSize: 11,
              }}
            >
              {errors.consent[0]}
            </p>
          ) : null}
          <p
            style={{
              fontSize: 11,
              color: 'hsl(var(--rt-ink-60))',
              margin: '10px 0 0 30px',
              fontStyle: 'italic',
            }}
          >
            Заявка рассматривается администратором перед добавлением в рейтинг.
          </p>

          {clientError ? (
            <p
              role="alert"
              data-testid="submit-error"
              style={{
                marginTop: 12,
                marginLeft: 30,
                color: 'hsl(var(--rt-bad))',
                fontSize: 12,
              }}
            >
              {clientError}
            </p>
          ) : null}

          <div
            style={{
              marginTop: 16,
              marginLeft: 30,
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="submit"
              data-testid="submit-button"
              disabled={!ready || submitting}
              style={{
                padding: '11px 22px',
                fontSize: 13,
                fontWeight: 500,
                background:
                  !ready || submitting
                    ? 'hsl(var(--rt-ink-25))'
                    : 'hsl(var(--rt-ink))',
                color: 'hsl(var(--rt-paper))',
                border: 'none',
                borderRadius: 3,
                cursor: !ready || submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Отправляем…' : 'Отправить заявку →'}
            </button>
            <button
              type="button"
              disabled
              title="Сохранение черновика появится позже"
              style={{
                padding: '11px 18px',
                fontSize: 12,
                background: 'transparent',
                border: '1px solid hsl(var(--rt-border))',
                color: 'hsl(var(--rt-ink-40))',
                borderRadius: 3,
                cursor: 'not-allowed',
              }}
            >
              Сохранить черновик
            </button>
          </div>
        </div>
      </form>

      <style>{`
        @media (max-width: 899px) {
          .rt-submit-root { padding: 24px 20px 48px !important; }
          .rt-submit-row { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}

function HoneypotInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      name="website"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden
      data-testid="submit-honeypot"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        position: 'absolute',
        left: '-9999px',
        width: 1,
        height: 1,
        opacity: 0,
      }}
    />
  );
}

function Section({
  num,
  title,
  children,
}: {
  num: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        marginTop: 28,
        paddingTop: 22,
        borderTop: '1px solid hsl(var(--rt-border-subtle))',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          marginBottom: 18,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--rt-font-mono)',
            fontSize: 10,
            fontWeight: 600,
            color: 'hsl(var(--rt-accent))',
            letterSpacing: 1.2,
          }}
        >
          {num}
        </span>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{title}</h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {children}
      </div>
    </div>
  );
}

function Row({
  cols,
  children,
}: {
  cols: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rt-submit-row"
      style={{
        display: 'grid',
        gridTemplateColumns: cols,
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'hsl(var(--rt-ink-80))',
          }}
        >
          {label}
          {required ? (
            <span
              style={{ color: 'hsl(var(--rt-accent))', marginLeft: 2 }}
            >
              *
            </span>
          ) : null}
        </span>
      </div>
      {children}
      {error ? (
        <p
          role="alert"
          style={{
            fontSize: 11,
            color: 'hsl(var(--rt-bad))',
            margin: '4px 0 0',
          }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  unit,
  type = 'text',
  inputMode,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  unit?: string;
  type?: string;
  inputMode?:
    | 'text'
    | 'numeric'
    | 'decimal'
    | 'email'
    | 'url'
    | 'tel'
    | 'search';
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 38,
        background: 'hsl(var(--rt-paper))',
        border: '1px solid hsl(var(--rt-border))',
        borderRadius: 3,
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        disabled={disabled}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: 12,
          fontFamily: 'var(--rt-font-sans)',
          color: 'hsl(var(--rt-ink))',
          minWidth: 0,
        }}
      />
      {unit ? (
        <span
          style={{
            fontFamily: 'var(--rt-font-mono)',
            fontSize: 11,
            color: 'hsl(var(--rt-ink-40))',
            marginLeft: 6,
          }}
        >
          {unit}
        </span>
      ) : null}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        height: 38,
        background: 'hsl(var(--rt-paper))',
        border: '1px solid hsl(var(--rt-border))',
        borderRadius: 3,
        padding: '0 12px',
        fontSize: 12,
        fontFamily: 'var(--rt-font-sans)',
        color: value ? 'hsl(var(--rt-ink))' : 'hsl(var(--rt-ink-40))',
        appearance: 'none',
      }}
    >
      <option value="" disabled hidden>
        {placeholder ?? 'Выберите…'}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function RadioGroup({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        border: '1px solid hsl(var(--rt-border))',
        borderRadius: 3,
        overflow: 'hidden',
        width: 'fit-content',
      }}
    >
      {options.map((o, i) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              padding: '9px 16px',
              background: active ? 'hsl(var(--rt-ink))' : 'hsl(var(--rt-paper))',
              color: active
                ? 'hsl(var(--rt-paper))'
                : 'hsl(var(--rt-ink-80))',
              border: 'none',
              borderLeft: i > 0 ? '1px solid hsl(var(--rt-border))' : 'none',
              fontSize: 12,
              fontWeight: active ? 500 : 400,
              cursor: 'pointer',
            }}
            aria-pressed={active}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function BoolRadio({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <RadioGroup
      options={[
        { value: 'false', label: 'Нет' },
        { value: 'true', label: 'Есть' },
      ]}
      value={value === null ? '' : value ? 'true' : 'false'}
      onChange={(v) => onChange(v === 'true')}
    />
  );
}
