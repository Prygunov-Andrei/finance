"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { estimateApi } from "@/lib/api/client";
import { getWorkspaceId } from "@/lib/workspace";
import { EstimatesTable } from "./estimates-table";
import { NewEstimateDialog } from "./new-estimate-dialog";
import { StatusFilter, type StatusTab } from "./status-filter";

export default function EstimatesPage() {
  const [tab, setTab] = React.useState<StatusTab>("all");
  const [search, setSearch] = React.useState("");
  const workspaceId = getWorkspaceId();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["estimates", workspaceId, tab],
    queryFn: () =>
      estimateApi.list(workspaceId, {
        status: tab === "all" ? undefined : tab,
      }),
  });

  const filtered = React.useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.folder_name ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <div className="container py-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Сметы</h1>
          <p className="text-sm text-muted-foreground">
            Все сметы workspace — создание, фильтрация, экспорт в Excel.
          </p>
        </div>
        <NewEstimateDialog />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusFilter value={tab} onChange={setTab} />
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию или папке..."
            className="pl-9"
          />
        </div>
      </div>

      {isError && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Не удалось загрузить сметы: {error instanceof Error ? error.message : "неизвестная ошибка"}
        </div>
      )}

      <EstimatesTable data={filtered} isLoading={isLoading} />
    </div>
  );
}
