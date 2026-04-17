"use client";

import { cn } from "@/lib/utils";
import type { EstimateStatus } from "@/lib/api/types";

export type StatusTab = "all" | Extract<EstimateStatus, "draft" | "in_progress" | "ready">;

const TABS: { key: StatusTab; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "draft", label: "Черновик" },
  { key: "in_progress", label: "В работе" },
  { key: "ready", label: "Готова" },
];

interface Props {
  value: StatusTab;
  onChange: (next: StatusTab) => void;
}

export function StatusFilter({ value, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md border bg-muted/30 p-1">
      {TABS.map((tab) => {
        const active = value === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              "rounded px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={active}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
