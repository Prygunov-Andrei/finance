"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
} from "@tanstack/react-table";
import { Plus, Search, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditableCell } from "./editable-cell";
import { MaterialPickerCell } from "./material-picker-cell";
import { ProcurementStatusSelect } from "./procurement-status-select";
import type { EquipmentTrack } from "./track-tabs";
import { techSpecsTitle } from "./tech-specs";
import { computeMerged, isSameSection } from "./merge-rows";
import { ApiError, itemApi } from "@/lib/api/client";
import { getWorkspaceId } from "@/lib/workspace";
import { cn, formatCurrency, formatDecimal } from "@/lib/utils";
import {
  MATCH_SOURCE_LABELS,
  type CreateItemDto,
  type EstimateItem,
  type EstimateItemTechSpecs,
  type EstimateSection,
  type ProcurementStatus,
  type UUID,
} from "@/lib/api/types";

/**
 * UI-08: ключ для localStorage. Суффикс `v1` — версионирование, чтобы при
 * изменении state-shape старые значения просто игнорировались.
 */
export const COLUMN_SIZING_STORAGE_KEY = "ismeta.estimate-table.column-widths.v1";

interface Props {
  estimateId: UUID;
  items: EstimateItem[];
  isLoading?: boolean;
  activeSectionId: UUID | null;
  fallbackSectionId: UUID | null;
  track?: EquipmentTrack;
  highlightItemId?: UUID | null;
  /** Список секций сметы — нужен для поиска по section.name и для рендера hint про другие разделы. */
  sections?: EstimateSection[];
  /**
   * Items по всем секциям (уже с применённым track-фильтром) — нужен для
   * подсчёта «+N совпадений в других разделах». Если не передано —
   * hint не показывается.
   */
  allItemsForSearch?: EstimateItem[];
  /** Сброс выбранной секции (переключение на «Все разделы»). Вызывается по клику на hint. */
  onClearSection?: () => void;
}

function highlightMatch(
  text: string,
  normalizedQuery: string,
): React.ReactNode {
  if (!normalizedQuery || !text) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(normalizedQuery);
  if (idx < 0) return text;
  const end = idx + normalizedQuery.length;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-700/70">
        {text.slice(idx, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

function itemMatches(
  item: EstimateItem,
  sectionName: string | undefined,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) return true;
  const specs = item.tech_specs ?? {};
  const parts: string[] = [
    item.name,
    item.unit,
    typeof specs.model_name === "string" ? specs.model_name : "",
    typeof specs.brand === "string" ? specs.brand : "",
    typeof specs.manufacturer === "string" ? (specs.manufacturer as string) : "",
    typeof specs.comments === "string" ? specs.comments : "",
    typeof specs.system === "string" ? specs.system : "",
    sectionName ?? "",
  ];
  const haystack = parts.filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(normalizedQuery);
}

export function ItemsTable({
  estimateId,
  items,
  isLoading,
  activeSectionId,
  fallbackSectionId,
  track = "all",
  highlightItemId = null,
  sections,
  allItemsForSearch,
  onClearSection,
}: Props) {
  const qc = useQueryClient();
  const workspaceId = getWorkspaceId();

  // UI-08 column widths: глобальный persist по пользователю (не per-смета).
  // Ключ версионируется — если позже поменяем state-shape, поднимем до v2 и
  // старые значения не поломают parse.
  //
  // Инициализация пустым объектом, а не lazy-initializer-с-localStorage —
  // иначе SSR отдаст {} а client hydrate'нёт на {name:650} → mismatch
  // warning и потенциальный flash обратно к дефолтам. Загрузку делаем в
  // useEffect после mount, это даёт один короткий flick'er (≤1 paint), но
  // SSR стабилен.
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>(
    {},
  );
  const [sizingHydrated, setSizingHydrated] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(COLUMN_SIZING_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setColumnSizing(parsed as ColumnSizingState);
        }
      }
    } catch {
      // parse error или storage disabled — остаёмся на дефолтах
    }
    setSizingHydrated(true);
  }, []);

  const saveTimer = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    // Не пишем обратно до того как подгрузили сохранённое — иначе первый
    // mount с дефолтным {} перетрёт валидное значение в storage.
    if (!sizingHydrated) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          COLUMN_SIZING_STORAGE_KEY,
          JSON.stringify(columnSizing),
        );
      } catch {
        // quota exceeded / disabled — тихо пропускаем
      }
    }, 300);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [columnSizing, sizingHydrated]);

  // UI-07 Items Search: локальный query + 200ms debounce. URL state
  // намеренно не трогаем — поиск только на клиенте, чтобы не плодить
  // истории браузера при каждом нажатии.
  const [searchQuery, setSearchQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);

  const normalizedQuery = debouncedQuery.toLowerCase().trim();
  const hasQuery = normalizedQuery.length > 0;

  const sectionsById = React.useMemo(() => {
    const m = new Map<UUID, EstimateSection>();
    for (const s of sections ?? []) m.set(s.id, s);
    return m;
  }, [sections]);

  const matches = React.useCallback(
    (item: EstimateItem) =>
      itemMatches(item, sectionsById.get(item.section)?.name, normalizedQuery),
    [sectionsById, normalizedQuery],
  );

  const visibleItems = React.useMemo(
    () => (hasQuery ? items.filter(matches) : items),
    [items, matches, hasQuery],
  );

  // Hint «+N совпадений в других разделах» — только когда выбрана конкретная
  // секция и есть что-то найденное за её пределами (в рамках активного track).
  const otherSectionMatches = React.useMemo(() => {
    if (!hasQuery || !activeSectionId || !allItemsForSearch) return 0;
    let n = 0;
    for (const it of allItemsForSearch) {
      if (it.section === activeSectionId) continue;
      if (matches(it)) n++;
    }
    return n;
  }, [hasQuery, activeSectionId, allItemsForSearch, matches]);

  const invalidate = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["estimate-items", estimateId] });
    qc.invalidateQueries({ queryKey: ["estimate", estimateId] });
  }, [qc, estimateId]);

  React.useEffect(() => {
    if (!highlightItemId) return;
    const el = document.getElementById(`item-row-${highlightItemId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightItemId]);

  const update = useMutation({
    mutationFn: ({
      item,
      patch,
    }: {
      item: EstimateItem;
      patch: Partial<EstimateItem>;
    }) => itemApi.update(item.id, patch, item.version, workspaceId),
    onSuccess: () => {
      invalidate();
      toast.success("Итоги пересчитаны", { id: "items-recalc" });
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.status === 409) {
        toast.error("Кто-то обновил эту строку. Обновите страницу.");
      } else if (e instanceof ApiError) {
        toast.error(e.problem?.detail ?? "Ошибка сохранения");
      } else {
        toast.error("Не удалось сохранить изменение");
      }
      invalidate();
    },
  });

  const create = useMutation({
    mutationFn: (data: CreateItemDto) =>
      itemApi.create(estimateId, data, workspaceId),
    onSuccess: () => {
      invalidate();
      toast.success("Позиция добавлена");
    },
    onError: () => toast.error("Не удалось добавить позицию"),
  });

  const remove = useMutation({
    mutationFn: (item: EstimateItem) =>
      itemApi.softDelete(item.id, item.version, workspaceId),
    onSuccess: () => {
      invalidate();
      toast.success("Позиция удалена");
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.status === 409) {
        toast.error("Кто-то обновил строку. Обновите страницу.");
      } else {
        toast.error("Не удалось удалить позицию");
      }
      invalidate();
    },
  });

  const commitField = React.useCallback(
    (item: EstimateItem, field: keyof EstimateItem, raw: string) => {
      const isNumeric =
        field === "quantity" ||
        field === "equipment_price" ||
        field === "material_price" ||
        field === "work_price";
      if (isNumeric) {
        const n = Number.parseFloat(raw.replace(",", "."));
        if (!Number.isFinite(n) || n < 0) {
          toast.error("Нужно неотрицательное число");
          return;
        }
        update.mutate({ item, patch: { [field]: String(n) } as Partial<EstimateItem> });
      } else {
        update.mutate({ item, patch: { [field]: raw } as Partial<EstimateItem> });
      }
    },
    [update],
  );

  const commitTechSpec = React.useCallback(
    (item: EstimateItem, key: keyof EstimateItemTechSpecs, raw: string) => {
      // Клиентский merge: backend-сериализатор PATCH-ит JSONField как replace,
      // поэтому читаем текущий tech_specs и отправляем объединённый объект,
      // чтобы не потерять произвольные ключи (flow, power и т.п.).
      const next: EstimateItemTechSpecs = { ...item.tech_specs, [key]: raw };
      update.mutate({ item, patch: { tech_specs: next } });
    },
    [update],
  );

  const toggleKeyEquipment = React.useCallback(
    (item: EstimateItem) => {
      update.mutate({
        item,
        patch: { is_key_equipment: !item.is_key_equipment },
      });
    },
    [update],
  );

  const setProcurementStatus = React.useCallback(
    (item: EstimateItem, next: ProcurementStatus) => {
      update.mutate({ item, patch: { procurement_status: next } });
    },
    [update],
  );

  const [selectedIds, setSelectedIds] = React.useState<Set<UUID>>(
    () => new Set(),
  );
  const [lastClickedId, setLastClickedId] = React.useState<UUID | null>(null);
  const [mergeDialogOpen, setMergeDialogOpen] = React.useState(false);

  // Чистим выделение если строка выделения исчезла из visibleItems (после
  // merge/delete/смены track/section или когда элемент скрылся по search-
  // фильтру). Оставляем только валидные id.
  React.useEffect(() => {
    const valid = new Set(visibleItems.map((it) => it.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<UUID>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [visibleItems]);

  const selectedItems = React.useMemo(
    () => visibleItems.filter((it) => selectedIds.has(it.id)),
    [visibleItems, selectedIds],
  );

  const allSelected =
    visibleItems.length > 0 &&
    visibleItems.every((it) => selectedIds.has(it.id));
  const someSelected =
    selectedIds.size > 0 && selectedIds.size < visibleItems.length;

  const sameSection = React.useMemo(
    () => isSameSection(visibleItems, selectedIds),
    [visibleItems, selectedIds],
  );

  const toggleSelect = React.useCallback(
    (itemId: UUID, shift: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shift && lastClickedId && lastClickedId !== itemId) {
          const lastIdx = visibleItems.findIndex(
            (it) => it.id === lastClickedId,
          );
          const curIdx = visibleItems.findIndex((it) => it.id === itemId);
          if (lastIdx !== -1 && curIdx !== -1) {
            const [from, to] =
              lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
            for (let i = from; i <= to; i++) next.add(visibleItems[i].id);
            return next;
          }
        }
        if (next.has(itemId)) next.delete(itemId);
        else next.add(itemId);
        return next;
      });
      setLastClickedId(itemId);
    },
    [visibleItems, lastClickedId],
  );

  const toggleSelectAll = React.useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size > 0) return new Set();
      return new Set(visibleItems.map((it) => it.id));
    });
    setLastClickedId(null);
  }, [visibleItems]);

  const clearSelection = React.useCallback(() => {
    setSelectedIds(new Set());
    setLastClickedId(null);
  }, []);

  const mergeRows = useMutation({
    mutationFn: async ({
      first,
      others,
    }: {
      first: EstimateItem;
      others: EstimateItem[];
    }) => {
      const patch = computeMerged([first, ...others]);
      await itemApi.update(first.id, patch, first.version, workspaceId);
      for (const other of others) {
        await itemApi.softDelete(other.id, other.version, workspaceId);
      }
      return { count: others.length + 1 };
    },
    onSuccess: (data) => {
      invalidate();
      toast.success(`Объединено ${data.count} строк в одну`);
      setSelectedIds(new Set());
      setLastClickedId(null);
      setMergeDialogOpen(false);
    },
    onError: (e: unknown) => {
      const detail =
        e instanceof ApiError
          ? (e.problem?.detail ?? "Ошибка сервера")
          : e instanceof Error
            ? e.message
            : "Неизвестная ошибка";
      toast.error(`Не удалось объединить: ${detail}`);
      invalidate();
      setMergeDialogOpen(false);
    },
  });

  const columns = React.useMemo<ColumnDef<EstimateItem>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <input
            type="checkbox"
            aria-label="Выделить все строки"
            className="h-4 w-4 cursor-pointer rounded border-muted-foreground/40 accent-primary"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={toggleSelectAll}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        cell: ({ row }) => {
          const id = row.original.id;
          const checked = selectedIds.has(id);
          return (
            <input
              type="checkbox"
              aria-label={`Выделить строку ${row.index + 1}`}
              className="h-4 w-4 cursor-pointer rounded border-muted-foreground/40 accent-primary"
              checked={checked}
              onChange={() => {
                /* управляется onClick */
              }}
              onClick={(e) => {
                e.stopPropagation();
                toggleSelect(id, e.shiftKey);
              }}
            />
          );
        },
        size: 40,
        enableResizing: false,
      },
      {
        id: "row",
        header: "№",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {row.index + 1}
          </span>
        ),
        size: 44,
        enableResizing: false,
      },
      {
        id: "key_toggle",
        header: () => (
          <span className="sr-only">Основное оборудование</span>
        ),
        cell: ({ row }) => {
          const on = row.original.is_key_equipment;
          return (
            <button
              type="button"
              onClick={() => toggleKeyEquipment(row.original)}
              aria-pressed={on}
              aria-label={
                on
                  ? "Снять признак основного оборудования"
                  : "Отметить как основное оборудование"
              }
              title={
                on
                  ? "Основное оборудование"
                  : "Отметить как основное оборудование"
              }
              className="rounded p-1 hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={update.isPending}
            >
              <Star
                className={cn(
                  "h-4 w-4 transition-colors",
                  on
                    ? "fill-amber-400 text-amber-500"
                    : "text-muted-foreground",
                )}
              />
            </button>
          );
        },
        size: 44,
        enableResizing: false,
      },
      {
        accessorKey: "name",
        header: "Наименование",
        size: 500,
        minSize: 200,
        maxSize: 900,
        cell: ({ row }) => (
          <EditableCell
            value={row.original.name}
            className="whitespace-normal break-words"
            display={
              hasQuery
                ? (v) =>
                    v ? (
                      highlightMatch(v, normalizedQuery)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )
                : undefined
            }
            onCommit={(next) => commitField(row.original, "name", next)}
          />
        ),
      },
      {
        id: "model_name",
        header: () => (
          <span title="Тип, марка, обозначение">Модель</span>
        ),
        cell: ({ row }) => {
          const value =
            typeof row.original.tech_specs?.model_name === "string"
              ? row.original.tech_specs.model_name
              : "";
          return (
            <EditableCell
              value={value}
              display={
                hasQuery
                  ? (v) =>
                      v ? (
                        highlightMatch(v, normalizedQuery)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )
                  : undefined
              }
              onCommit={(next) =>
                commitTechSpec(row.original, "model_name", next)
              }
            />
          );
        },
        size: 160,
        minSize: 100,
        maxSize: 400,
      },
      {
        accessorKey: "unit",
        header: "Ед.изм.",
        cell: ({ row }) => (
          <EditableCell
            value={row.original.unit}
            onCommit={(next) => commitField(row.original, "unit", next)}
          />
        ),
        size: 80,
        minSize: 60,
        maxSize: 150,
      },
      {
        accessorKey: "quantity",
        header: () => <span className="block text-right">Кол-во</span>,
        cell: ({ row }) => (
          <EditableCell
            value={row.original.quantity}
            type="number"
            align="right"
            display={(v) => formatDecimal(v)}
            onCommit={(next) => commitField(row.original, "quantity", next)}
          />
        ),
        size: 90,
        minSize: 70,
        maxSize: 150,
      },
      {
        accessorKey: "equipment_price",
        header: () => <span className="block text-right">Цена обор.</span>,
        cell: ({ row }) => (
          <EditableCell
            value={row.original.equipment_price}
            type="number"
            align="right"
            display={(v) => formatCurrency(v)}
            onCommit={(next) => commitField(row.original, "equipment_price", next)}
          />
        ),
        size: 110,
        minSize: 90,
        maxSize: 180,
      },
      {
        accessorKey: "material_price",
        header: () => <span className="block text-right">Цена мат.</span>,
        cell: ({ row }) => (
          <MaterialPickerCell
            value={row.original.material_price}
            workspaceId={workspaceId}
            initialQuery={row.original.name}
            onCommitPrice={(next) =>
              commitField(row.original, "material_price", next)
            }
            onPick={(material) => {
              // При выборе из справочника — сохраняем цену. Название/бренд
              // позиции не перезаписываем: оператор искал под существующий
              // item.name, сам выбрал конкретный материал из справочника,
              // значит цена — единственное что точно надо синхронизировать.
              // material_id логически — source-of-truth, но текущая модель
              // EstimateItem не хранит FK на Material, поэтому пробрасываем
              // только price.
              commitField(row.original, "material_price", material.price);
            }}
          />
        ),
        size: 110,
        minSize: 90,
        maxSize: 180,
      },
      {
        accessorKey: "work_price",
        header: () => <span className="block text-right">Цена работ</span>,
        cell: ({ row }) => (
          <EditableCell
            value={row.original.work_price}
            type="number"
            align="right"
            display={(v) => formatCurrency(v)}
            onCommit={(next) => commitField(row.original, "work_price", next)}
          />
        ),
        size: 110,
        minSize: 90,
        maxSize: 180,
      },
      {
        accessorKey: "total",
        header: () => <span className="block text-right">Итого</span>,
        cell: ({ row }) => (
          <span className="block px-2 text-right text-sm font-medium tabular-nums">
            {formatCurrency(row.original.total)}
          </span>
        ),
        size: 120,
        minSize: 100,
        maxSize: 200,
      },
      {
        accessorKey: "match_source",
        header: "Подбор",
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.match_source === "unmatched" ? "outline" : "secondary"
            }
          >
            {MATCH_SOURCE_LABELS[row.original.match_source]}
          </Badge>
        ),
        size: 130,
        minSize: 100,
        maxSize: 200,
      },
      ...(track === "key"
        ? [
            {
              id: "procurement_status",
              accessorKey: "procurement_status",
              header: "Статус закупки",
              cell: ({ row }) => (
                <ProcurementStatusSelect
                  value={row.original.procurement_status}
                  onChange={(next) =>
                    setProcurementStatus(row.original, next)
                  }
                  disabled={update.isPending}
                />
              ),
              size: 150,
              minSize: 120,
              maxSize: 220,
            } satisfies ColumnDef<EstimateItem>,
          ]
        : []),
      {
        id: "comments",
        header: "Примечание",
        size: 200,
        minSize: 120,
        maxSize: 500,
        cell: ({ row }) => {
          const value =
            typeof row.original.tech_specs?.comments === "string"
              ? row.original.tech_specs.comments
              : "";
          return (
            <div
              className="max-w-full whitespace-pre-wrap break-words"
              title={value || undefined}
              data-testid="item-comments"
            >
              <EditableCell
                value={value}
                className="whitespace-normal break-words"
                display={
                  hasQuery
                    ? (v) =>
                        v ? (
                          highlightMatch(v, normalizedQuery)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )
                    : undefined
                }
                onCommit={(next) =>
                  commitTechSpec(row.original, "comments", next)
                }
              />
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Удалить позицию"
            onClick={() => remove.mutate(row.original)}
            disabled={remove.isPending}
          >
            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
          </Button>
        ),
        size: 48,
        enableResizing: false,
      },
    ],
    [
      commitField,
      commitTechSpec,
      remove,
      toggleKeyEquipment,
      setProcurementStatus,
      track,
      update.isPending,
      workspaceId,
      selectedIds,
      allSelected,
      someSelected,
      toggleSelect,
      toggleSelectAll,
      hasQuery,
      normalizedQuery,
    ],
  );

  const table = useReactTable({
    data: visibleItems,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // UI-08: resize по hover-handle справа от заголовка. onEnd — финальный
    // commit при отпускании мыши (persist сработает один раз, а не на каждый
    // пиксель drag).
    columnResizeMode: "onEnd",
    enableColumnResizing: true,
    state: {
      columnSizing,
    },
    onColumnSizingChange: setColumnSizing,
  });

  // Totals считаем по видимой выборке: при активном поиске пользователь ждёт
  // сумму именно по найденным позициям — иначе счётчики внизу расходятся с
  // тем что он видит в таблице.
  const totals = React.useMemo(() => {
    let equipment = 0;
    let material = 0;
    let work = 0;
    let total = 0;
    for (const it of visibleItems) {
      equipment += Number.parseFloat(it.equipment_total) || 0;
      material += Number.parseFloat(it.material_total) || 0;
      work += Number.parseFloat(it.work_total) || 0;
      total += Number.parseFloat(it.total) || 0;
    }
    return { equipment, material, work, total };
  }, [visibleItems]);

  const sectionIdForNew = activeSectionId ?? fallbackSectionId;
  const canAdd = Boolean(sectionIdForNew);

  const showBulkToolbar = selectedIds.size >= 2;
  const mergeDisabled = !sameSection;
  const mergeDisabledTooltip = mergeDisabled
    ? "Строки должны быть в одной секции"
    : undefined;
  const mergePreview = React.useMemo(() => {
    if (selectedItems.length < 2) return null;
    // Порядок превью — по sort_order в пределах текущей подборки items.
    const sorted = [...selectedItems].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    return {
      first: sorted[0],
      others: sorted.slice(1),
      merged: computeMerged(sorted),
      all: sorted,
    };
  }, [selectedItems]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {showBulkToolbar && (
        <div
          className="sticky top-0 z-20 flex items-center gap-3 border-b bg-primary/5 px-4 py-2 text-sm"
          data-testid="merge-toolbar"
          role="toolbar"
          aria-label="Действия с выделенными строками"
        >
          <span className="font-medium">
            Выделено: {selectedIds.size}{" "}
            {selectedIds.size === 1
              ? "строка"
              : selectedIds.size < 5
                ? "строки"
                : "строк"}
          </span>
          <Button
            size="sm"
            variant="default"
            onClick={() => setMergeDialogOpen(true)}
            disabled={mergeDisabled || mergeRows.isPending}
            title={mergeDisabledTooltip}
            data-testid="merge-button"
          >
            Объединить
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={clearSelection}
            disabled={mergeRows.isPending}
          >
            Отмена
          </Button>
          {mergeDisabled && (
            <span className="text-xs text-muted-foreground">
              Строки должны быть в одной секции
            </span>
          )}
        </div>
      )}
      <div
        className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-2 text-sm"
        data-testid="items-search-toolbar"
      >
        <div className="relative flex min-w-[240px] flex-1 items-center">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2 h-4 w-4 text-muted-foreground"
          />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по строкам сметы…"
            aria-label="Поиск по строкам сметы"
            data-testid="items-search-input"
            className="h-8 w-full rounded-md border bg-background pl-7 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                searchInputRef.current?.focus();
              }}
              aria-label="Очистить поиск"
              data-testid="items-search-clear"
              className="absolute right-1 rounded p-1 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {hasQuery && (
          <span
            className="shrink-0 tabular-nums text-muted-foreground"
            data-testid="items-search-counter"
          >
            Найдено: {visibleItems.length} из {items.length}
          </span>
        )}
        {hasQuery && otherSectionMatches > 0 && (
          <button
            type="button"
            onClick={() => onClearSection?.()}
            disabled={!onClearSection}
            data-testid="items-search-other-sections"
            className="shrink-0 rounded text-xs text-primary underline-offset-2 hover:underline disabled:cursor-default disabled:text-muted-foreground disabled:no-underline"
            title={
              onClearSection
                ? "Переключиться на «Все разделы», чтобы увидеть эти совпадения"
                : undefined
            }
          >
            +{otherSectionMatches}{" "}
            {otherSectionMatches === 1
              ? "совпадение"
              : otherSectionMatches < 5
                ? "совпадения"
                : "совпадений"}{" "}
            в других разделах
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        <Table
          // UI-08: table-layout: fixed обязателен чтобы браузер соблюдал
          // `width` на <th>. При auto-layout ширины пересчитываются по
          // контенту — resize через setState тогда не даёт визуального
          // эффекта. width=totalSize — сумма всех колонок (TanStack
          // возвращает её из table.getTotalSize()).
          style={{ tableLayout: "fixed", width: table.getTotalSize() }}
        >
          <TableHeader className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => {
                  const canResize = h.column.getCanResize();
                  const isResizing = h.column.getIsResizing();
                  return (
                    <TableHead
                      key={h.id}
                      style={{ width: h.getSize() }}
                      className="relative"
                    >
                      {h.isPlaceholder
                        ? null
                        : flexRender(
                            h.column.columnDef.header,
                            h.getContext(),
                          )}
                      {canResize && (
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Изменить ширину столбца ${h.column.id}`}
                          data-testid={`resize-handle-${h.column.id}`}
                          onMouseDown={h.getResizeHandler()}
                          onTouchStart={h.getResizeHandler()}
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            "absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none",
                            "hover:bg-primary/40",
                            isResizing && "bg-primary",
                          )}
                        />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skel-${i}`}>
                  {columns.map((_c, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  {hasQuery ? (
                    <div
                      className="flex flex-col items-center justify-center gap-2"
                      data-testid="items-search-empty"
                    >
                      <span>
                        Ничего не найдено по запросу «{debouncedQuery.trim()}»
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSearchQuery("")}
                        data-testid="items-search-empty-clear"
                      >
                        Очистить поиск
                      </Button>
                    </div>
                  ) : (
                    "В этом разделе пока нет позиций"
                  )}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                const isHighlighted =
                  highlightItemId !== null &&
                  row.original.id === highlightItemId;
                const isSelected = selectedIds.has(row.original.id);
                const specsTitle = techSpecsTitle(row.original.tech_specs);
                return (
                  <TableRow
                    key={row.id}
                    id={`item-row-${row.original.id}`}
                    data-highlighted={isHighlighted || undefined}
                    data-selected={isSelected || undefined}
                    title={specsTitle}
                    className={cn(
                      isHighlighted &&
                        "animate-pulse bg-amber-100/60 dark:bg-amber-900/30",
                      isSelected &&
                        !isHighlighted &&
                        "bg-primary/10 dark:bg-primary/20",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="p-1 align-top">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
            <TableRow>
              <TableCell colSpan={columns.length} className="p-0">
                <Button
                  variant="ghost"
                  className="h-10 w-full justify-start gap-2 rounded-none text-sm text-muted-foreground"
                  disabled={!canAdd || create.isPending}
                  title={
                    canAdd
                      ? undefined
                      : "Сначала создайте раздел, чтобы добавить позицию"
                  }
                  onClick={() => {
                    if (!sectionIdForNew) return;
                    create.mutate({
                      section_id: sectionIdForNew,
                      name: "Новая позиция",
                      unit: "шт",
                      quantity: 1,
                      equipment_price: 0,
                      material_price: 0,
                      work_price: 0,
                      sort_order: items.length,
                    });
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Добавить позицию
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              Объединить {selectedItems.length} строк{" "}
              {selectedItems.length === 1
                ? "у"
                : selectedItems.length < 5
                  ? "и"
                  : ""}
              ?
            </DialogTitle>
            <DialogDescription>
              Значения «Наименование», «Модель» и «Примечание» будут склеены
              через пробел. Остальные поля берутся из первой строки. Остальные
              строки будут удалены.
            </DialogDescription>
          </DialogHeader>

          {mergePreview && (
            <div
              className="space-y-3 text-sm"
              data-testid="merge-preview"
            >
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Наименование
                </div>
                <div
                  className="whitespace-pre-wrap break-words rounded border bg-muted/30 px-3 py-2"
                  data-testid="merge-preview-name"
                >
                  {mergePreview.merged.name || (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Модель
                </div>
                <div
                  className="whitespace-pre-wrap break-words rounded border bg-muted/30 px-3 py-2"
                  data-testid="merge-preview-model"
                >
                  {(mergePreview.merged.tech_specs.model_name as string) || (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Примечание
                </div>
                <div
                  className="whitespace-pre-wrap break-words rounded border bg-muted/30 px-3 py-2"
                  data-testid="merge-preview-comments"
                >
                  {(mergePreview.merged.tech_specs.comments as string) || (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Ед.изм.:{" "}
                  <span className="font-medium text-foreground">
                    {mergePreview.first.unit || "—"}
                  </span>
                </span>
                <span>
                  Кол-во:{" "}
                  <span className="font-medium text-foreground">
                    {formatDecimal(mergePreview.first.quantity)}
                  </span>
                </span>
                <span className="italic">(взято из первой строки)</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Удаляются строки:{" "}
                {mergePreview.others
                  .map((it) => {
                    const idx = items.findIndex((x) => x.id === it.id);
                    return idx >= 0 ? `${idx + 1}-я` : "";
                  })
                  .filter(Boolean)
                  .join(", ")}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMergeDialogOpen(false)}
              disabled={mergeRows.isPending}
            >
              Отмена
            </Button>
            <Button
              variant="default"
              onClick={() => {
                if (!mergePreview) return;
                mergeRows.mutate({
                  first: mergePreview.first,
                  others: mergePreview.others,
                });
              }}
              disabled={mergeRows.isPending || !mergePreview}
              data-testid="merge-confirm"
            >
              {mergeRows.isPending ? "Объединяем…" : "Объединить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-end gap-6 border-t bg-muted/30 px-6 py-3 text-sm tabular-nums">
        <span className="text-muted-foreground">
          Оборудование:{" "}
          <span className="font-medium text-foreground">
            {formatCurrency(totals.equipment)}
          </span>
        </span>
        <span className="text-muted-foreground">
          Материалы:{" "}
          <span className="font-medium text-foreground">
            {formatCurrency(totals.material)}
          </span>
        </span>
        <span className="text-muted-foreground">
          Работы:{" "}
          <span className="font-medium text-foreground">
            {formatCurrency(totals.work)}
          </span>
        </span>
        <span className="text-base font-semibold">
          Итого: {formatCurrency(totals.total)}
        </span>
      </div>
    </div>
  );
}
