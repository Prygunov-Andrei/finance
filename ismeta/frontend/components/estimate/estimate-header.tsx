"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Download,
  GitBranch,
  Loader2,
  MessageSquare,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/app/estimates/status-badge";
import { ApiError, estimateApi, matchingApi } from "@/lib/api/client";
import { getWorkspaceId } from "@/lib/workspace";
import { downloadBlob, cn } from "@/lib/utils";
import type { Estimate } from "@/lib/api/types";

interface Props {
  estimate: Estimate;
  onOpenValidate?: () => void;
  onOpenChat?: () => void;
}

export function EstimateHeader({ estimate, onOpenValidate, onOpenChat }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const workspaceId = getWorkspaceId();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(estimate.name);

  React.useEffect(() => {
    setName(estimate.name);
  }, [estimate.name]);

  const rename = useMutation({
    mutationFn: (next: string) =>
      estimateApi.update(
        estimate.id,
        { name: next },
        estimate.version,
        workspaceId,
      ),
    onSuccess: (updated) => {
      qc.setQueryData(["estimate", estimate.id, workspaceId], updated);
      qc.invalidateQueries({ queryKey: ["estimates"] });
      setEditing(false);
      toast.success("Название обновлено");
    },
    onError: (e: unknown) => {
      setName(estimate.name);
      setEditing(false);
      if (e instanceof ApiError && e.status === 409) {
        toast.error("Кто-то обновил смету. Обновите страницу.");
      } else {
        toast.error("Не удалось переименовать смету");
      }
    },
  });

  const exportXlsx = useMutation({
    mutationFn: () => estimateApi.exportXlsx(estimate.id, workspaceId),
    onSuccess: (blob) => {
      downloadBlob(blob, `${estimate.name || "estimate"}.xlsx`);
    },
    onError: () => toast.error("Не удалось скачать Excel"),
  });

  const createVersion = useMutation({
    mutationFn: () => estimateApi.createVersion(estimate.id, workspaceId),
    onSuccess: (next) => {
      toast.success(`Создана версия v${next.version_number}`);
      qc.invalidateQueries({ queryKey: ["estimates"] });
      router.push(`/estimates/${next.id}`);
    },
    onError: () => toast.error("Не удалось создать версию"),
  });

  const startMatching = useMutation({
    mutationFn: () => matchingApi.start(estimate.id, workspaceId),
    onSuccess: (session) => {
      if (session.results.length === 0) {
        toast.info("Нет позиций для подбора. Добавьте строки в смету.");
        return;
      }
      qc.setQueryData(
        ["matching", estimate.id, session.session_id, workspaceId],
        session,
      );
      router.push(`/estimates/${estimate.id}/matching/${session.session_id}`);
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError) {
        toast.error(e.problem?.detail ?? "Не удалось запустить подбор");
      } else {
        toast.error("Не удалось запустить подбор");
      }
    },
  });

  const archive = useMutation({
    mutationFn: () => estimateApi.archive(estimate.id, workspaceId),
    onSuccess: () => {
      toast.success("Смета архивирована");
      qc.invalidateQueries({ queryKey: ["estimates"] });
      router.push("/estimates");
    },
    onError: () => toast.error("Не удалось архивировать смету"),
  });

  const commitName = () => {
    const next = name.trim();
    if (!next || next === estimate.name) {
      setName(estimate.name);
      setEditing(false);
      return;
    }
    rename.mutate(next);
  };

  return (
    <div className="flex flex-col gap-3 border-b bg-background px-6 py-4">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/estimates">
            <ArrowLeft className="h-4 w-4" />
            Назад
          </Link>
        </Button>
        <span className="text-sm text-muted-foreground">/ Смета</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {editing ? (
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") {
                  setName(estimate.name);
                  setEditing(false);
                }
              }}
              disabled={rename.isPending}
              className="max-w-xl text-xl font-semibold"
              aria-label="Название сметы"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={cn(
                "truncate rounded px-1 text-2xl font-semibold tracking-tight text-left hover:bg-accent/40",
                rename.isPending && "opacity-60",
              )}
              title="Клик — переименовать"
            >
              {estimate.name}
            </button>
          )}
          <span
            className="shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium text-muted-foreground"
            title={`version ${estimate.version}`}
          >
            v{estimate.version_number}
          </span>
          <StatusBadge status={estimate.status} />
        </div>
        <div className="flex items-center gap-2">
          {onOpenValidate ? (
            <Button variant="outline" onClick={onOpenValidate}>
              <Sparkles className="h-4 w-4" />
              Проверить ИИ
            </Button>
          ) : null}
          {onOpenChat ? (
            <Button variant="outline" onClick={onOpenChat}>
              <MessageSquare className="h-4 w-4" />
              ИИ-помощник
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={() => startMatching.mutate()}
            disabled={startMatching.isPending}
          >
            {startMatching.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            Подобрать работы
          </Button>
          <Button
            variant="outline"
            onClick={() => exportXlsx.mutate()}
            disabled={exportXlsx.isPending}
          >
            {exportXlsx.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Скачать Excel
          </Button>
          <Button
            variant="outline"
            onClick={() => createVersion.mutate()}
            disabled={createVersion.isPending}
          >
            {createVersion.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GitBranch className="h-4 w-4" />
            )}
            Создать версию
          </Button>
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => {
              if (window.confirm("Архивировать смету? Она исчезнет из списка.")) {
                archive.mutate();
              }
            }}
            disabled={archive.isPending || estimate.status === "transmitted"}
            title={estimate.status === "transmitted" ? "Переданная смета не может быть архивирована" : "Архивировать смету"}
          >
            {archive.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            Архивировать
          </Button>
        </div>
      </div>
      {estimate.status === "transmitted" ? (
        <div
          role="alert"
          data-testid="transmitted-warning"
          className="flex items-center gap-2 rounded-md border border-amber-400/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Данные в ERP устарели: после изменения смету нужно передать заново
            (&laquo;Создать версию&raquo; → отправка в ERP).
          </span>
        </div>
      ) : null}
    </div>
  );
}
