"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ResizableSidebar } from "@/components/ui/resizable-sidebar";
import { ApiError, itemApi, sectionApi } from "@/lib/api/client";
import { getWorkspaceId } from "@/lib/workspace";
import { pluralizeSections } from "@/lib/i18n";
import { cn, formatCurrency } from "@/lib/utils";
import type { EstimateItem, EstimateSection, UUID } from "@/lib/api/types";

const SIDEBAR_WIDTH_STORAGE_KEY = "ismeta.sidebar.sections.width";

interface Props {
  estimateId: UUID;
  sections: EstimateSection[];
  selectedId: UUID | null;
  onSelect: (id: UUID | null) => void;
  /**
   * Суммы по каждому section.id — рендерятся справа под именем раздела.
   */
  subtotals?: Record<UUID, number>;
  totalAll?: number;
  /**
   * UI-09 (#47): количество items в каждом разделе (после фильтра is_deleted).
   * Если не передано — счётчик не рисуется.
   */
  itemCounts?: Record<UUID, number>;
  totalItemCount?: number;
  /**
   * UI-09 (#48): полный список items по всем разделам — нужен для merge,
   * чтобы собрать items из "чужих" разделов и перевесить их на первый.
   * Если не передано — UI merge не активируется (чекбоксы скрыты).
   */
  items?: EstimateItem[];
}

export function SectionsPanel({
  estimateId,
  sections,
  selectedId,
  onSelect,
  subtotals,
  totalAll,
  itemCounts,
  totalItemCount,
  items,
}: Props) {
  const qc = useQueryClient();
  const workspaceId = getWorkspaceId();

  const [addingName, setAddingName] = React.useState<string | null>(null);
  const [renamingId, setRenamingId] = React.useState<UUID | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [pendingDelete, setPendingDelete] =
    React.useState<EstimateSection | null>(null);

  // UI-09 (#48): selection разделов для merge — локальное состояние sidebar.
  const [selectedSectionIds, setSelectedSectionIds] = React.useState<
    Set<UUID>
  >(() => new Set());
  const [mergeDialogOpen, setMergeDialogOpen] = React.useState(false);

  // Чистим selection когда секция исчезла (удалена / merge'нута).
  React.useEffect(() => {
    const valid = new Set(sections.map((s) => s.id));
    setSelectedSectionIds((prev) => {
      let changed = false;
      const next = new Set<UUID>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [sections]);

  const toggleSelectSection = React.useCallback((id: UUID) => {
    setSelectedSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSectionSelection = React.useCallback(() => {
    setSelectedSectionIds(new Set());
  }, []);

  const mergeEnabled = items !== undefined && itemCounts !== undefined;

  const invalidateSections = () =>
    qc.invalidateQueries({ queryKey: ["estimate-sections", estimateId] });
  const invalidateItems = () =>
    qc.invalidateQueries({ queryKey: ["estimate-items", estimateId] });

  const create = useMutation({
    mutationFn: (name: string) =>
      sectionApi.create(
        estimateId,
        { name, sort_order: sections.length },
        workspaceId,
      ),
    onSuccess: (section) => {
      invalidateSections();
      setAddingName(null);
      onSelect(section.id);
      toast.success("Раздел добавлен");
    },
    onError: () => toast.error("Не удалось создать раздел"),
  });

  const rename = useMutation({
    mutationFn: (args: { id: UUID; name: string; version: number }) =>
      sectionApi.update(args.id, { name: args.name }, args.version, workspaceId),
    onSuccess: () => {
      invalidateSections();
      setRenamingId(null);
      toast.success("Раздел переименован");
    },
    onError: (e: unknown) => {
      setRenamingId(null);
      if (e instanceof ApiError && e.status === 409) {
        toast.error("Кто-то обновил раздел. Обновите страницу.");
        invalidateSections();
      } else {
        toast.error("Не удалось переименовать раздел");
      }
    },
  });

  const remove = useMutation({
    mutationFn: ({ id, version }: { id: UUID; version: number }) =>
      sectionApi.delete(id, version, workspaceId),
    onSuccess: (_data, { id }) => {
      invalidateSections();
      invalidateItems();
      setPendingDelete(null);
      if (selectedId === id) onSelect(null);
      toast.success("Раздел удалён");
    },
    onError: () => {
      setPendingDelete(null);
      toast.error("Не удалось удалить раздел");
    },
  });

  // UI-09 (#48): объединение разделов.
  // MVP-реализация: N PATCH items + M DELETE sections (последовательно).
  // Атомарность нестрогая: при частичном фейле invalidate + toast error.
  const mergeSections = useMutation({
    mutationFn: async ({
      target,
      source,
      sourceItems,
    }: {
      target: EstimateSection;
      source: EstimateSection[];
      sourceItems: EstimateItem[];
    }) => {
      for (const it of sourceItems) {
        await itemApi.update(
          it.id,
          { section: target.id },
          it.version,
          workspaceId,
        );
      }
      for (const s of source) {
        await sectionApi.delete(s.id, s.version, workspaceId);
      }
      return { mergedCount: source.length + 1, targetName: target.name };
    },
    onSuccess: ({ mergedCount, targetName }) => {
      invalidateSections();
      invalidateItems();
      setMergeDialogOpen(false);
      setSelectedSectionIds(new Set());
      toast.success(
        `Объединено ${mergedCount} ${pluralizeSections(mergedCount)} в «${targetName}»`,
      );
    },
    onError: (e: unknown) => {
      invalidateSections();
      invalidateItems();
      const detail =
        e instanceof ApiError
          ? (e.problem?.detail ?? "Ошибка сервера")
          : e instanceof Error
            ? e.message
            : "Неизвестная ошибка";
      toast.error(`Не удалось объединить разделы: ${detail}`);
    },
  });

  // Preview для merge-диалога: разделы сортируются по sort_order, первый —
  // target, остальные сливаются в него.
  const mergePreview = React.useMemo(() => {
    if (!items || selectedSectionIds.size < 2) return null;
    const selected = sections
      .filter((s) => selectedSectionIds.has(s.id))
      .sort((a, b) => a.sort_order - b.sort_order);
    if (selected.length < 2) return null;
    const [target, ...source] = selected;
    const sourceIds = new Set(source.map((s) => s.id));
    const sourceItems = items.filter((it) => sourceIds.has(it.section));
    const targetItemCount = itemCounts?.[target.id] ?? 0;
    const targetTotal = subtotals?.[target.id] ?? 0;
    const sourceItemCount = source.reduce(
      (sum, s) => sum + (itemCounts?.[s.id] ?? 0),
      0,
    );
    const sourceTotal = source.reduce(
      (sum, s) => sum + (subtotals?.[s.id] ?? 0),
      0,
    );
    return {
      target,
      source,
      sourceItems,
      targetItemCount,
      targetTotal,
      sourceItemCount,
      sourceTotal,
      resultItemCount: targetItemCount + sourceItemCount,
      resultTotal: targetTotal + sourceTotal,
    };
  }, [items, sections, selectedSectionIds, itemCounts, subtotals]);

  const showSectionBulkToolbar = mergeEnabled && selectedSectionIds.size >= 2;

  return (
    <ResizableSidebar
      storageKey={SIDEBAR_WIDTH_STORAGE_KEY}
      defaultWidth={256}
      minWidth={200}
      maxWidth={600}
      className="border-r bg-card"
      handleLabel="Изменить ширину панели разделов"
    >
      <div className="flex h-10 items-center justify-between border-b px-3">
        <h2 className="text-sm font-semibold">Разделы</h2>
        <span className="text-xs text-muted-foreground">{sections.length}</span>
      </div>

      {showSectionBulkToolbar && (
        <div
          className="sticky top-0 z-20 flex items-center gap-2 border-b bg-primary/5 px-3 py-2 text-xs"
          data-testid="sections-bulk-toolbar"
          role="toolbar"
          aria-label="Действия с выделенными разделами"
        >
          <span className="flex-1 font-medium">
            Выделено: {selectedSectionIds.size}{" "}
            {pluralizeSections(selectedSectionIds.size)}
          </span>
          <Button
            size="sm"
            variant="default"
            onClick={() => setMergeDialogOpen(true)}
            disabled={mergeSections.isPending || !mergePreview}
            data-testid="sections-merge-button"
          >
            Объединить
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={clearSectionSelection}
            disabled={mergeSections.isPending}
            aria-label="Снять выделение разделов"
            data-testid="sections-merge-cancel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <nav className="flex-1 overflow-auto p-2">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
            selectedId === null
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <span className="flex items-center gap-2">
            <span>Все разделы</span>
            {totalItemCount !== undefined ? (
              <span
                className="text-xs text-muted-foreground"
                data-testid="section-item-count-all"
              >
                ({totalItemCount})
              </span>
            ) : null}
          </span>
          {totalAll !== undefined ? (
            <span
              className="tabular-nums text-xs text-muted-foreground"
              data-testid="section-subtotal-all"
            >
              {formatCurrency(totalAll)}
            </span>
          ) : null}
        </button>

        <div className="mt-1 flex flex-col gap-0.5">
          {sections.map((section) => {
            const active = section.id === selectedId;
            const isRenaming = renamingId === section.id;
            const count = itemCounts?.[section.id];
            const isSectionSelected = selectedSectionIds.has(section.id);
            return (
              <div
                key={section.id}
                className={cn(
                  "group flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                {mergeEnabled && (
                  <input
                    type="checkbox"
                    aria-label={`Выделить раздел ${section.name}`}
                    data-testid={`section-checkbox-${section.id}`}
                    checked={isSectionSelected}
                    onChange={() => toggleSelectSection(section.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 shrink-0 cursor-pointer rounded border-muted-foreground/40 accent-primary"
                  />
                )}
                {isRenaming ? (
                  <Input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => {
                      const next = renameValue.trim();
                      if (!next || next === section.name) {
                        setRenamingId(null);
                        return;
                      }
                      rename.mutate({
                        id: section.id,
                        name: next,
                        version: section.version,
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="h-7 flex-1 text-sm"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(section.id)}
                    onDoubleClick={() => {
                      setRenamingId(section.id);
                      setRenameValue(section.name);
                    }}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-1 truncate rounded px-1 py-1 text-left",
                      active && "font-medium",
                    )}
                    title="Двойной клик — переименовать"
                  >
                    <span className="truncate">{section.name}</span>
                    {count !== undefined ? (
                      <span
                        className="shrink-0 text-xs text-muted-foreground"
                        data-testid={`section-item-count-${section.id}`}
                      >
                        ({count})
                      </span>
                    ) : null}
                  </button>
                )}
                {!isRenaming && subtotals && subtotals[section.id] !== undefined ? (
                  <span
                    className="shrink-0 tabular-nums text-xs text-muted-foreground"
                    data-testid={`section-subtotal-${section.id}`}
                    title="Сумма позиций раздела"
                  >
                    {formatCurrency(subtotals[section.id]!)}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDelete(section);
                  }}
                  aria-label={`Удалить раздел ${section.name}`}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            );
          })}
        </div>

        {addingName !== null ? (
          <Input
            autoFocus
            value={addingName}
            onChange={(e) => setAddingName(e.target.value)}
            onBlur={() => {
              const next = addingName.trim();
              if (next) {
                create.mutate(next);
              } else {
                setAddingName(null);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setAddingName(null);
            }}
            placeholder="Название раздела"
            className="mt-2 h-8 text-sm"
          />
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="mt-2 h-8 w-full justify-start text-sm text-muted-foreground"
            onClick={() => setAddingName("")}
            data-testid="add-section-button"
          >
            <Plus className="h-4 w-4" />
            Добавить раздел
          </Button>
        )}
      </nav>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить раздел?</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `Раздел «${pendingDelete.name}» и все его позиции будут удалены. Действие нельзя отменить.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={remove.isPending}
            >
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                pendingDelete &&
                  remove.mutate({
                    id: pendingDelete.id,
                    version: pendingDelete.version,
                  })
              }
              disabled={remove.isPending}
            >
              {remove.isPending ? "Удаляется..." : "Удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={mergeDialogOpen}
        onOpenChange={(open) => {
          if (!open && !mergeSections.isPending) setMergeDialogOpen(false);
        }}
      >
        <DialogContent className="max-w-xl" data-testid="sections-merge-dialog">
          <DialogHeader>
            <DialogTitle>
              Объединить {selectedSectionIds.size}{" "}
              {pluralizeSections(selectedSectionIds.size)}?
            </DialogTitle>
            <DialogDescription>
              Все строки объединятся в первый раздел. Остальные разделы будут
              удалены. Действие нельзя отменить.
            </DialogDescription>
          </DialogHeader>

          {mergePreview && (
            <div className="space-y-3 text-sm" data-testid="sections-merge-preview">
              <div className="rounded border bg-muted/30 px-3 py-2">
                <div className="font-medium">
                  «{mergePreview.target.name}» ({mergePreview.targetItemCount},{" "}
                  {formatCurrency(mergePreview.targetTotal)})
                </div>
                {mergePreview.source.map((s) => {
                  const c = itemCounts?.[s.id] ?? 0;
                  const t = subtotals?.[s.id] ?? 0;
                  return (
                    <div key={s.id} className="text-muted-foreground">
                      + «{s.name}» ({c}, {formatCurrency(t)})
                    </div>
                  );
                })}
              </div>
              <div className="rounded border bg-primary/10 px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Результат
                </div>
                <div
                  className="font-medium"
                  data-testid="sections-merge-result"
                >
                  «{mergePreview.target.name}» ({mergePreview.resultItemCount},{" "}
                  {formatCurrency(mergePreview.resultTotal)})
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Название сохранится от первого выделенного раздела.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMergeDialogOpen(false)}
              disabled={mergeSections.isPending}
            >
              Отмена
            </Button>
            <Button
              onClick={() => {
                if (!mergePreview) return;
                mergeSections.mutate({
                  target: mergePreview.target,
                  source: mergePreview.source,
                  sourceItems: mergePreview.sourceItems,
                });
              }}
              disabled={mergeSections.isPending || !mergePreview}
              data-testid="sections-merge-confirm"
            >
              {mergeSections.isPending ? "Объединяем…" : "Объединить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ResizableSidebar>
  );
}
