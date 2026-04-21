"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import { materialApi } from "@/lib/api/client";
import { cn, formatCurrency } from "@/lib/utils";
import type { MaterialSearchHit } from "@/lib/api/types";

interface Props {
  value: string;
  workspaceId: string;
  /** Подсказка для поиска — обычно это `item.name`. */
  initialQuery?: string;
  disabled?: boolean;
  /**
   * Прямое редактирование цены (fallback). Вызывается когда пользователь
   * сам вводит число в input без выбора материала из справочника.
   */
  onCommitPrice: (nextPrice: string) => void;
  /**
   * Вызывается при выборе материала из справочника. Получает весь hit,
   * чтобы родитель мог, если нужно, сохранить дополнительные поля
   * (название, бренд, модель в tech_specs).
   */
  onPick: (material: MaterialSearchHit) => void;
}

const DEBOUNCE_MS = 250;

export function MaterialPickerCell({
  value,
  workspaceId,
  initialQuery = "",
  disabled,
  onCommitPrice,
  onPick,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = React.useState(initialQuery);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  // Debounce query → debouncedQuery. Только debouncedQuery триггерит запрос.
  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, open]);

  // При открытии — подставляем initialQuery (подсказка на базе item.name).
  React.useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setDebouncedQuery(initialQuery);
      setActiveIndex(0);
    }
  }, [open, initialQuery]);

  // Click outside — закрывает popover.
  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const trimmed = debouncedQuery.trim();
  const searchQ = useQuery({
    queryKey: ["materials-search", workspaceId, trimmed],
    queryFn: () => materialApi.search(trimmed, workspaceId),
    enabled: open && trimmed.length > 0,
    staleTime: 15_000,
  });

  const results = searchQ.data?.results ?? [];

  const pick = (hit: MaterialSearchHit) => {
    setOpen(false);
    onPick(hit);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = results[activeIndex];
      if (picked) {
        pick(picked);
        return;
      }
      // Нет выбора — коммит текущего значения как числа (прямое редактирование).
      const n = Number.parseFloat(query.replace(",", "."));
      if (Number.isFinite(n) && n >= 0) {
        setOpen(false);
        onCommitPrice(String(n));
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        data-testid="material-picker-trigger"
        onClick={() => !disabled && setOpen(true)}
        className={cn(
          "block w-full truncate rounded px-2 py-1 text-right text-sm tabular-nums transition-colors",
          !disabled && "hover:bg-accent/50",
          disabled && "cursor-default opacity-70",
        )}
      >
        {value && value !== "0" && value !== "0.00" ? (
          formatCurrency(value)
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </button>
    );
  }

  return (
    <div ref={rootRef} className="relative" data-testid="material-picker">
      <Input
        autoFocus
        type="text"
        value={query}
        placeholder="Поиск по справочнику…"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        className="h-8 px-2 text-sm"
        data-testid="material-picker-input"
      />
      <div
        role="listbox"
        aria-label="Результаты поиска материалов"
        data-testid="material-picker-listbox"
        className="absolute left-0 top-[calc(100%+2px)] z-30 max-h-64 w-[320px] overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md"
      >
        {trimmed.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Начните вводить название или бренд…
          </div>
        ) : searchQ.isFetching && results.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">Поиск…</div>
        ) : results.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Ничего не найдено
          </div>
        ) : (
          results.map((hit, i) => {
            const active = i === activeIndex;
            return (
              <button
                key={hit.id}
                type="button"
                role="option"
                aria-selected={active}
                data-testid={`material-picker-option-${i}`}
                onClick={() => pick(hit)}
                onMouseEnter={() => setActiveIndex(i)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                  active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{hit.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[hit.brand, hit.model_name, hit.unit]
                      .filter((s) => s && String(s).trim())
                      .join(" · ")}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs tabular-nums">
                  <div className="font-medium">{formatCurrency(hit.price)}</div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
