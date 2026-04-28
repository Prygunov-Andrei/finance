"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, importApi, llmProfileApi } from "@/lib/api/client";
import { getWorkspaceId } from "@/lib/workspace";
import type { LLMProfile, RecognitionJob, UUID } from "@/lib/api/types";

interface Props {
  estimateId: UUID;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Stage = "choose" | "submitting";

export function PdfImportDialog({ estimateId, open, onOpenChange }: Props) {
  const workspaceId = getWorkspaceId();
  const qc = useQueryClient();
  const [stage, setStage] = React.useState<Stage>("choose");
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [selectedProfileId, setSelectedProfileId] = React.useState<string>("");

  const profilesQ = useQuery({
    queryKey: ["llm-profiles"],
    queryFn: () => llmProfileApi.list(workspaceId),
    // Settings ничего не invalidate'ает между сессиями — staleTime подавляет
    // лишний refetch при каждом open диалога.
    staleTime: 60_000,
  });

  // Preselect default-профиль при открытии. Если данных ещё нет — выберем
  // как только список придёт. Если default-а нет — берём первый профиль.
  React.useEffect(() => {
    if (!open) return;
    if (selectedProfileId) return;
    const profiles = profilesQ.data;
    if (!profiles || profiles.length === 0) return;
    const def =
      profiles.find((p: LLMProfile) => p.is_default) ?? profiles[0];
    if (def) setSelectedProfileId(String(def.id));
  }, [open, profilesQ.data, selectedProfileId]);

  React.useEffect(() => {
    if (!open) setStage("choose");
  }, [open]);

  const submit = useMutation({
    mutationFn: ({ file }: { file: File }) =>
      importApi.uploadPdfAsync(
        estimateId,
        file,
        workspaceId,
        selectedProfileId ? Number(selectedProfileId) : null,
      ),
    onSuccess: (job: RecognitionJob, vars) => {
      const profile = profilesQ.data?.find(
        (p) => String(p.id) === selectedProfileId,
      );
      // «Модель + цена ненавязчиво везде» — даже на старте показываем какая
      // модель будет распознавать; цену запросим из job.llm_costs по завершению.
      toast.success(`Распознавание «${vars.file.name}» запущено`, {
        description: profile
          ? `Модель: ${profile.name} · ${profile.extract_model}`
          : "Можете продолжать работу — следите за прогрессом в шапке.",
        duration: 5_000,
      });
      qc.invalidateQueries({ queryKey: ["recognition-jobs"] });
      qc.invalidateQueries({
        queryKey: ["recognition-jobs", "for-estimate", job.estimate_id],
      });
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      setStage("choose");
      if (e instanceof ApiError) {
        toast.error(e.problem?.detail ?? e.message ?? "Ошибка запуска распознавания");
      } else {
        toast.error("Не удалось запустить распознавание PDF");
      }
    },
  });

  const handleFile = React.useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        toast.error("Нужен файл .pdf");
        return;
      }
      setStage("submitting");
      submit.mutate({ file });
    },
    [submit],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const profiles = profilesQ.data ?? [];
  const noProfiles = profilesQ.isSuccess && profiles.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Загрузить PDF-спецификацию</DialogTitle>
          <DialogDescription>
            Распознавание идёт в фоне. После запуска можно сразу продолжать
            работать — прогресс будет в шапке.
          </DialogDescription>
        </DialogHeader>

        {stage === "choose" && (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <label
                htmlFor="pdf-import-profile"
                className="text-xs font-medium text-foreground/80"
              >
                Модель распознавания
              </label>
              {profilesQ.isLoading ? (
                <div className="flex h-9 items-center rounded-md border border-input px-3 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Загрузка профилей…
                </div>
              ) : noProfiles ? (
                <div
                  className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
                  data-testid="pdf-import-no-profiles"
                >
                  Нет настроенных LLM-профилей.{" "}
                  <Link
                    href="/settings/llm"
                    className="font-medium underline underline-offset-2"
                    onClick={() => onOpenChange(false)}
                  >
                    Создать профиль
                  </Link>{" "}
                  и вернуться сюда.
                </div>
              ) : (
                <select
                  id="pdf-import-profile"
                  value={selectedProfileId}
                  onChange={(e) => setSelectedProfileId(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="pdf-import-profile-select"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name}
                      {p.is_default ? " · default" : ""}
                      {" — "}
                      {p.extract_model}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => !noProfiles && inputRef.current?.click()}
              aria-disabled={noProfiles}
              className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/30 p-8 text-center transition-colors ${
                noProfiles
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer hover:border-primary/50 hover:bg-accent/30"
              }`}
              data-testid="pdf-import-dropzone"
            >
              <FileText className="h-10 w-10 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">
                Перетащите PDF сюда или нажмите для выбора
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                disabled={noProfiles}
                data-testid="pdf-import-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  // сбросить input, чтобы повторный выбор того же файла снова сработал
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        )}

        {stage === "submitting" && (
          <div
            data-testid="pdf-import-submitting"
            className="flex flex-col items-center gap-3 py-8"
          >
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-sm font-medium">Запускаем распознавание…</div>
          </div>
        )}

        <DialogFooter>
          {stage === "choose" && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
