'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import newsService, {
  type EditorialAuthor,
} from '../../services/newsService';

/**
 * Специальное sentinel-значение, используемое как value в Radix Select,
 * т.к. пустая строка в value запрещена. Маппится в `null` на backend.
 */
const NONE_VALUE = '__none__';

export interface EditorialAuthorPickerProps {
  value: number | null;
  onChange: (authorId: number | null) => void;
}

/**
 * Dropdown «Редактор» (FK на NewsAuthor). Backend endpoint ещё может
 * не быть смержен (Петя делает параллельно) — тогда рисуем graceful
 * empty state с подсказкой «продолжайте без автора».
 */
export default function EditorialAuthorPicker({
  value,
  onChange,
}: EditorialAuthorPickerProps) {
  const [authors, setAuthors] = useState<EditorialAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await newsService.getEditorialAuthors();
        if (!cancelled) setAuthors(list);
      } catch (e) {
        if (!cancelled) {
          console.warn('Не удалось загрузить список авторов:', e);
          setError('Список авторов недоступен');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Если endpoint ещё не готов — показываем сообщение и позволяем
  // сохранить без автора (value=null).
  const hasAuthors = authors.length > 0;

  const selectValue = value == null ? NONE_VALUE : String(value);

  return (
    <div>
      <Label htmlFor="editorial-author">Редактор (публичная подпись)</Label>
      <Select
        value={selectValue}
        disabled={loading || !hasAuthors}
        onValueChange={(v) => {
          onChange(v === NONE_VALUE ? null : Number(v));
        }}
      >
        <SelectTrigger id="editorial-author" className="mt-1">
          <SelectValue
            placeholder={
              loading
                ? 'Загрузка...'
                : hasAuthors
                  ? 'Не выбран'
                  : 'Нет доступных авторов'
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>— Без автора —</SelectItem>
          {authors.map((a) => (
            <SelectItem key={a.id} value={String(a.id)}>
              {a.name}
              {a.role ? ` · ${a.role}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p className="text-xs text-muted-foreground mt-1">
          {error}. Сохраните без автора, подпись появится после добавления
          редактора в админке.
        </p>
      )}
      {!loading && !error && !hasAuthors && (
        <p className="text-xs text-muted-foreground mt-1">
          Список авторов пуст. Добавьте авторов в Django-admin.
        </p>
      )}
      <p className="text-sm text-muted-foreground mt-1">
        Отображаемый автор на публичной странице (avatar + имя + роль).
        Можно оставить пустым — тогда подпись скрывается.
      </p>
    </div>
  );
}
