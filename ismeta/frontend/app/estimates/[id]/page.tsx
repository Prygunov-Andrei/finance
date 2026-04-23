"use client";

import * as React from "react";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/skeleton";
import { ChatPanel } from "@/components/estimate/chat-panel";
import { EstimateHeader } from "@/components/estimate/estimate-header";
import { ImportDialog } from "@/components/estimate/import-dialog";
import { MaterialsMatchingDialog } from "@/components/estimate/materials-matching-dialog";
import { PdfImportDialog } from "@/components/estimate/pdf-import-dialog";
import { ItemsTable } from "@/components/estimate/items-table";
import { ProcurementSummary } from "@/components/estimate/procurement-summary";
import { SectionsPanel } from "@/components/estimate/sections-panel";
import { TrackTabs, type EquipmentTrack } from "@/components/estimate/track-tabs";
import { ValidationReportDialog } from "@/components/estimate/validation-report-dialog";
import { useEquipmentTrack } from "@/lib/hooks/use-equipment-track";
import { estimateApi } from "@/lib/api/client";
import { getWorkspaceId } from "@/lib/workspace";
import type { UUID } from "@/lib/api/types";

interface Props {
  params: Promise<{ id: string }>;
}

export default function EstimateDetailPage({ params }: Props) {
  const { id } = use(params);
  const workspaceId = getWorkspaceId();
  const [sectionId, setSectionId] = React.useState<UUID | null>(null);
  const [track, setTrack] = useEquipmentTrack();
  const [validateOpen, setValidateOpen] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [pdfImportOpen, setPdfImportOpen] = React.useState(false);
  const [materialsMatchOpen, setMaterialsMatchOpen] = React.useState(false);
  const [highlightItemId, setHighlightItemId] =
    React.useState<UUID | null>(null);

  const estimateQ = useQuery({
    queryKey: ["estimate", id, workspaceId],
    queryFn: () => estimateApi.get(id, workspaceId),
  });

  const sectionsQ = useQuery({
    queryKey: ["estimate-sections", id, workspaceId],
    queryFn: () => estimateApi.sections(id, workspaceId),
  });

  const itemsQ = useQuery({
    queryKey: ["estimate-items", id, workspaceId, sectionId],
    queryFn: () =>
      estimateApi.items(id, workspaceId, sectionId ?? undefined),
    enabled: sectionsQ.isSuccess,
  });

  const allItems = itemsQ.data ?? [];

  // Отдельный запрос без section-фильтра — нужен для subtotals в sections
  // panel и для ProcurementSummary. Дешевле, чем рефакторить items table
  // на клиентскую фильтрацию.
  const allItemsQ = useQuery({
    queryKey: ["estimate-items", id, workspaceId, null],
    queryFn: () => estimateApi.items(id, workspaceId),
    enabled: sectionsQ.isSuccess && sectionId !== null,
  });
  const allEstimateItems = React.useMemo(
    () => (sectionId === null ? allItems : (allItemsQ.data ?? allItems)),
    [allItems, allItemsQ.data, sectionId],
  );

  const sectionSubtotals = React.useMemo(() => {
    const map: Record<string, number> = {};
    let total = 0;
    for (const it of allEstimateItems) {
      const v = Number.parseFloat(it.total) || 0;
      map[it.section] = (map[it.section] ?? 0) + v;
      total += v;
    }
    return { map, total };
  }, [allEstimateItems]);

  // UI-09 (#47): счётчики items per section. Считаем по allEstimateItems —
  // включает все секции, независимо от активного фильтра.
  const sectionItemCounts = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of allEstimateItems) {
      map[it.section] = (map[it.section] ?? 0) + 1;
    }
    return { map, total: allEstimateItems.length };
  }, [allEstimateItems]);

  const trackCounts = React.useMemo<Record<EquipmentTrack, number>>(() => {
    let key = 0;
    for (const it of allItems) if (it.is_key_equipment) key++;
    return {
      all: allItems.length,
      standard: allItems.length - key,
      key,
    };
  }, [allItems]);

  const filteredItems = React.useMemo(() => {
    if (track === "all") return allItems;
    if (track === "key") return allItems.filter((i) => i.is_key_equipment);
    return allItems.filter((i) => !i.is_key_equipment);
  }, [allItems, track]);

  // Items по всем секциям, но уже с применённым track-фильтром — нужно
  // ItemsTable для hint «+N совпадений в других разделах». Должен
  // подсвечивать только то, что user может реально увидеть на этом же
  // треке оборудования.
  const allItemsForSearch = React.useMemo(() => {
    if (track === "all") return allEstimateItems;
    if (track === "key")
      return allEstimateItems.filter((i) => i.is_key_equipment);
    return allEstimateItems.filter((i) => !i.is_key_equipment);
  }, [allEstimateItems, track]);

  const selectFromValidate = React.useCallback(
    (itemId: UUID) => {
      // Сброс фильтра раздела — позиция может быть в другом разделе
      setSectionId(null);
      setTrack("all");
      setHighlightItemId(itemId);
      // Снять подсветку через 3 сек
      window.setTimeout(() => setHighlightItemId(null), 3000);
    },
    [setTrack],
  );

  if (estimateQ.isError) {
    return (
      <div className="container py-10">
        <h1 className="text-xl font-semibold text-destructive">
          Смета не найдена
        </h1>
        <p className="mt-2 text-muted-foreground">
          {estimateQ.error instanceof Error
            ? estimateQ.error.message
            : "Неизвестная ошибка"}
        </p>
      </div>
    );
  }

  if (!estimateQ.data) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const sections = sectionsQ.data ?? [];
  const firstSectionId = sections[0]?.id ?? null;

  return (
    <div className="flex h-full flex-col">
      <EstimateHeader
        estimate={estimateQ.data}
        onOpenValidate={() => setValidateOpen(true)}
        onOpenChat={() => setChatOpen(true)}
        onOpenImport={() => setImportOpen(true)}
        onOpenPdfImport={() => setPdfImportOpen(true)}
        onOpenMaterialsMatch={() => setMaterialsMatchOpen(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        <SectionsPanel
          estimateId={id}
          sections={sections}
          selectedId={sectionId}
          onSelect={setSectionId}
          subtotals={sectionSubtotals.map}
          totalAll={sectionSubtotals.total}
          itemCounts={sectionItemCounts.map}
          totalItemCount={sectionItemCounts.total}
          items={allEstimateItems}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-background px-6 py-3">
            <TrackTabs
              value={track}
              onChange={setTrack}
              counts={trackCounts}
            />
            <ProcurementSummary
              items={allItems}
              className="w-full max-w-xs shrink-0 md:w-80"
            />
          </div>
          <ItemsTable
            estimateId={id}
            items={filteredItems}
            isLoading={itemsQ.isLoading || sectionsQ.isLoading}
            activeSectionId={sectionId}
            fallbackSectionId={firstSectionId}
            track={track}
            highlightItemId={highlightItemId}
            sections={sections}
            allItemsForSearch={allItemsForSearch}
            onClearSection={() => setSectionId(null)}
          />
        </div>
        <ChatPanel
          estimateId={id}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
        />
      </div>
      <ValidationReportDialog
        estimateId={id}
        open={validateOpen}
        onOpenChange={setValidateOpen}
        onSelectItem={selectFromValidate}
      />
      <ImportDialog
        estimateId={id}
        open={importOpen}
        onOpenChange={setImportOpen}
      />
      <PdfImportDialog
        estimateId={id}
        open={pdfImportOpen}
        onOpenChange={setPdfImportOpen}
      />
      <MaterialsMatchingDialog
        estimateId={id}
        items={allItems}
        open={materialsMatchOpen}
        onOpenChange={setMaterialsMatchOpen}
      />
    </div>
  );
}
