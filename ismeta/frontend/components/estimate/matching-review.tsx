"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge, getConfidenceLevel } from "./confidence-badge";
import { techSpecsSubLabel, techSpecsTitle } from "./tech-specs";
import { estimateApi, matchingApi } from "@/lib/api/client";
import { getWorkspaceId } from "@/lib/workspace";
import { cn, formatCurrency } from "@/lib/utils";
import type {
  EstimateItem,
  MatchingResult,
  MatchingSession,
  UUID,
} from "@/lib/api/types";

type Decision = "accept" | "reject";

interface Props {
  estimateId: UUID;
  sessionId: string;
  session: MatchingSession;
}

export function MatchingReview({ estimateId, sessionId, session }: Props) {
  const workspaceId = getWorkspaceId();
  const qc = useQueryClient();
  const router = useRouter();
  const results = session.results;

  const [activeIndex, setActiveIndex] = React.useState(0);
  const [decisions, setDecisions] = React.useState<Record<number, Decision>>({});
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());
  const gridRef = React.useRef<HTMLDivElement | null>(null);

  const confidenceOf = React.useCallback(
    (r: MatchingResult) => {
      const v = Number.parseFloat(r.match.confidence);
      return Number.isFinite(v) ? v : 0;
    },
    [],
  );

  const itemsQ = useQuery({
    queryKey: ["estimate-items", estimateId, workspaceId, null],
    queryFn: () => estimateApi.items(estimateId, workspaceId),
  });
  const itemsMap = React.useMemo(() => {
    const m = new Map<UUID, EstimateItem>();
    (itemsQ.data ?? []).forEach((it) => m.set(it.id, it));
    return m;
  }, [itemsQ.data]);

  React.useEffect(() => {
    gridRef.current?.focus();
  }, []);

  React.useEffect(() => {
    const el = document.getElementById(`match-row-${activeIndex}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const acceptedCount = React.useMemo(
    () => Object.values(decisions).filter((d) => d === "accept").length,
    [decisions],
  );

  const setDecision = React.useCallback(
    (idx: number, d: Decision | null) =>
      setDecisions((prev) => {
        const next = { ...prev };
        if (d === null) delete next[idx];
        else next[idx] = d;
        return next;
      }),
    [],
  );

  const acceptRow = React.useCallback(
    (idx: number) => setDecision(idx, "accept"),
    [setDecision],
  );
  const rejectRow = React.useCallback(
    (idx: number) => setDecision(idx, "reject"),
    [setDecision],
  );
  const toggleRow = React.useCallback(
    (idx: number) =>
      setDecisions((prev) => ({
        ...prev,
        [idx]: prev[idx] === "accept" ? "reject" : "accept",
      })),
    [],
  );

  const acceptAllHighConfidence = React.useCallback(() => {
    setDecisions((prev) => {
      const next = { ...prev };
      let count = 0;
      results.forEach((r, i) => {
        const lvl = getConfidenceLevel(confidenceOf(r), r.match.source);
        if (lvl === "high") {
          next[i] = "accept";
          count++;
        }
      });
      if (count === 0) toast.info("Нет строк с высокой уверенностью");
      else toast.success(`Приняты все уверенные: ${count}`);
      return next;
    });
  }, [results, confidenceOf]);

  const rejectAll = React.useCallback(() => setDecisions({}), []);

  const jumpNonGreen = React.useCallback(
    (dir: 1 | -1, from: number) => {
      const n = results.length;
      for (let step = 1; step <= n; step++) {
        const idx = from + dir * step;
        if (idx < 0 || idx >= n) return;
        const r = results[idx]!;
        const lvl = getConfidenceLevel(confidenceOf(r), r.match.source);
        if (lvl !== "high") {
          setActiveIndex(idx);
          return;
        }
      }
    },
    [results, confidenceOf],
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (results.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        acceptAllHighConfidence();
      } else if (e.key === "Enter") {
        e.preventDefault();
        acceptRow(activeIndex);
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "Escape") {
        e.preventDefault();
        rejectRow(activeIndex);
      } else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        toggleRow(activeIndex);
      } else if (e.key === "Tab") {
        e.preventDefault();
        jumpNonGreen(e.shiftKey ? -1 : 1, activeIndex);
      }
    },
    [
      activeIndex,
      results.length,
      acceptRow,
      rejectRow,
      toggleRow,
      acceptAllHighConfidence,
      jumpNonGreen,
    ],
  );

  const applyMut = useMutation({
    mutationFn: () => {
      const acceptedResults = Object.entries(decisions)
        .filter(([, d]) => d === "accept")
        .map(([k]) => results[Number(k)])
        .filter((r): r is MatchingResult => Boolean(r));
      return matchingApi.apply(
        estimateId,
        sessionId,
        acceptedResults,
        workspaceId,
      );
    },
    onSuccess: async (res) => {
      // refetchQueries (не просто invalidate) — чтобы badge «Подбор»
      // в items-table был актуальным к моменту навигации на смету.
      await Promise.all([
        qc.refetchQueries({
          queryKey: ["estimate-items", estimateId],
          type: "active",
        }),
        qc.refetchQueries({
          queryKey: ["estimate", estimateId],
          type: "active",
        }),
      ]);
      toast.success(`Подобрано ${res.updated} работ`);
      router.push(`/estimates/${estimateId}`);
    },
    onError: () => toast.error("Не удалось применить результаты"),
  });

  if (results.length === 0) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        Нет позиций для подбора.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <div className="text-sm text-muted-foreground">
          Групп:{" "}
          <span className="font-medium text-foreground">{session.groups}</span>
          {" · "}Позиций:{" "}
          <span className="font-medium text-foreground">
            {session.total_items}
          </span>
        </div>
        <div
          className="text-xs text-muted-foreground"
          aria-label="Горячие клавиши"
        >
          ↑↓ — выбор · Enter — ✓ · Esc — ✗ · Tab — к спорной · Space — toggle ·
          Shift+Enter — принять зелёные
        </div>
      </div>

      <div
        ref={gridRef}
        tabIndex={0}
        role="grid"
        aria-activedescendant={`match-row-${activeIndex}`}
        aria-rowcount={results.length}
        aria-label="Результаты подбора работ"
        onKeyDown={handleKeyDown}
        className="flex-1 overflow-auto focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <div
          role="row"
          className="sticky top-0 z-10 grid grid-cols-[56px_minmax(0,1fr)_minmax(0,1fr)_120px_170px_120px] border-b bg-background text-xs font-medium text-muted-foreground"
        >
          <div role="columnheader" className="px-3 py-2">
            #
          </div>
          <div role="columnheader" className="px-3 py-2">
            Позиция
          </div>
          <div role="columnheader" className="px-3 py-2">
            Подобранная работа
          </div>
          <div role="columnheader" className="px-3 py-2 text-right">
            Цена
          </div>
          <div role="columnheader" className="px-3 py-2">
            Уверенность
          </div>
          <div role="columnheader" className="px-3 py-2 text-center">
            Действие
          </div>
        </div>

        {results.map((r, i) => {
          const conf = confidenceOf(r);
          const decision = decisions[i];
          const isActive = activeIndex === i;
          const isExpanded = expanded.has(i);
          return (
            <React.Fragment key={i}>
              <div
                id={`match-row-${i}`}
                role="row"
                aria-rowindex={i + 1}
                aria-selected={isActive}
                data-decision={decision ?? "pending"}
                onClick={() => setActiveIndex(i)}
                className={cn(
                  "grid cursor-pointer grid-cols-[56px_minmax(0,1fr)_minmax(0,1fr)_120px_170px_120px] border-b transition-colors",
                  isActive && "bg-accent/40 ring-1 ring-inset ring-ring",
                  decision === "accept" &&
                    "bg-emerald-50 dark:bg-emerald-950/30",
                  decision === "reject" &&
                    "bg-rose-50 dark:bg-rose-950/30 opacity-70",
                )}
              >
                <div
                  role="gridcell"
                  className="flex items-center gap-1 px-3 py-2 text-xs text-muted-foreground"
                >
                  {r.item_count > 1 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpanded((prev) => {
                          const s = new Set(prev);
                          if (s.has(i)) s.delete(i);
                          else s.add(i);
                          return s;
                        });
                      }}
                      aria-label={
                        isExpanded ? "Свернуть группу" : "Развернуть группу"
                      }
                      aria-expanded={isExpanded}
                      className="rounded hover:bg-accent/50"
                    >
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 transition-transform",
                          isExpanded && "rotate-90",
                        )}
                      />
                    </button>
                  ) : (
                    <span className="w-4" />
                  )}
                  <span className="tabular-nums">{i + 1}</span>
                </div>
                <div
                  role="gridcell"
                  className="min-w-0 px-3 py-2 text-sm"
                  title={techSpecsTitle(itemsMap.get(r.item_ids[0]!)?.tech_specs)}
                >
                  <div className="truncate font-medium">{r.group_name}</div>
                  {(() => {
                    const sub = techSpecsSubLabel(
                      itemsMap.get(r.item_ids[0]!)?.tech_specs,
                    );
                    return sub ? (
                      <div
                        className="truncate text-xs text-muted-foreground"
                        data-testid="matching-sub-label"
                        aria-hidden="true"
                      >
                        {sub}
                      </div>
                    ) : null;
                  })()}
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {r.unit}
                    </span>
                    {r.item_count > 1 ? (
                      <Badge variant="outline">×{r.item_count}</Badge>
                    ) : null}
                  </div>
                </div>
                <div role="gridcell" className="min-w-0 px-3 py-2 text-sm">
                  {r.match.source === "unmatched" ? (
                    <span className="text-muted-foreground">
                      — не подобрано —
                    </span>
                  ) : (
                    <>
                      <div className="truncate">{r.match.work_name}</div>
                      {r.match.reasoning ? (
                        <div className="truncate text-xs text-muted-foreground">
                          {r.match.reasoning}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
                <div
                  role="gridcell"
                  className="px-3 py-2 text-right text-sm tabular-nums"
                >
                  {r.match.source === "unmatched"
                    ? "—"
                    : formatCurrency(r.match.work_price)}
                </div>
                <div role="gridcell" className="px-3 py-2">
                  <ConfidenceBadge confidence={conf} source={r.match.source} />
                </div>
                <div
                  role="gridcell"
                  className="flex items-center justify-center gap-1 px-3 py-2"
                >
                  <Button
                    type="button"
                    variant={decision === "accept" ? "default" : "outline"}
                    size="icon"
                    aria-label="Принять"
                    aria-pressed={decision === "accept"}
                    onClick={(e) => {
                      e.stopPropagation();
                      acceptRow(i);
                    }}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant={decision === "reject" ? "destructive" : "outline"}
                    size="icon"
                    aria-label="Отклонить"
                    aria-pressed={decision === "reject"}
                    onClick={(e) => {
                      e.stopPropagation();
                      rejectRow(i);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {isExpanded ? (
                <div
                  className="border-b bg-muted/20 px-14 py-2 text-xs text-muted-foreground"
                  aria-label={`Состав группы ${r.group_name}`}
                >
                  <div className="mb-1 font-medium">
                    Объединено позиций: {r.item_count}
                  </div>
                  <ul className="list-disc pl-4">
                    {r.item_ids.map((id) => {
                      const it = itemsMap.get(id);
                      return (
                        <li key={id} className="truncate">
                          {it
                            ? `${it.name} (${it.unit} × ${it.quantity})`
                            : id}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-6 py-3">
        <Button
          variant="ghost"
          onClick={rejectAll}
          disabled={Object.keys(decisions).length === 0}
        >
          Отклонить все
        </Button>
        <Button
          onClick={() => applyMut.mutate()}
          disabled={acceptedCount === 0 || applyMut.isPending}
        >
          {applyMut.isPending
            ? "Применяется..."
            : `Применить выбранные (${acceptedCount})`}
        </Button>
      </div>
    </div>
  );
}
