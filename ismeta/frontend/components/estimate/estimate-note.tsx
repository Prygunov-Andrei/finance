"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { StickyNote } from "lucide-react";
import { toast } from "sonner";

import { estimateApi, ApiError } from "@/lib/api/client";
import { getWorkspaceId } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import type { Estimate } from "@/lib/api/types";

const AUTOSAVE_DEBOUNCE_MS = 800;
const MAX_NOTE_LEN = 5000;

interface Props {
  estimate: Estimate;
}

export function EstimateNote({ estimate }: Props) {
  const qc = useQueryClient();
  const workspaceId = getWorkspaceId();
  const [value, setValue] = React.useState(estimate.note ?? "");
  const [collapsed, setCollapsed] = React.useState(!estimate.note);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionRef = React.useRef(estimate.version);

  React.useEffect(() => {
    setValue(estimate.note ?? "");
  }, [estimate.note]);

  React.useEffect(() => {
    versionRef.current = estimate.version;
  }, [estimate.version]);

  const save = useMutation({
    mutationFn: (note: string) =>
      estimateApi.update(estimate.id, { note }, versionRef.current, workspaceId),
    onSuccess: (updated) => {
      versionRef.current = updated.version;
      qc.setQueryData(["estimate", estimate.id, workspaceId], updated);
    },
    onError: (e: unknown) => {
      const detail =
        e instanceof ApiError
          ? (e.problem?.detail ?? e.problem?.title ?? "Ошибка сохранения заметки")
          : "Ошибка сохранения заметки";
      toast.error(detail);
    },
  });

  const onChange = (raw: string) => {
    const next = raw.length > MAX_NOTE_LEN ? raw.slice(0, MAX_NOTE_LEN) : raw;
    setValue(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(
      () => save.mutate(next),
      AUTOSAVE_DEBOUNCE_MS,
    );
  };

  React.useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 transition-colors hover:bg-amber-100"
        data-testid="estimate-note-expand"
      >
        <StickyNote className="h-3.5 w-3.5" />
        <span>{value ? "Заметка" : "+ Заметка"}</span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "relative w-72 rounded-md border border-amber-300 bg-amber-50 p-2 shadow-sm",
      )}
      data-testid="estimate-note"
    >
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-900">
          <StickyNote className="h-3.5 w-3.5" />
          Заметка
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-xs text-amber-700 hover:text-amber-900"
          data-testid="estimate-note-collapse"
        >
          свернуть
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Напишите что-нибудь (Ctrl+Enter — свернуть)…"
        className="w-full resize-y rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        rows={4}
        maxLength={MAX_NOTE_LEN}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            setCollapsed(true);
          }
        }}
        data-testid="estimate-note-textarea"
      />
      <div className="mt-1 flex items-center justify-between text-[10px] text-amber-700">
        <span data-testid="estimate-note-status">
          {save.isPending ? "Сохраняется…" : save.isSuccess ? "Сохранено" : ""}
        </span>
        <span data-testid="estimate-note-counter">
          {value.length} / {MAX_NOTE_LEN}
        </span>
      </div>
    </div>
  );
}
