"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileText, Loader2 } from "lucide-react";
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
import { ApiError, importApi } from "@/lib/api/client";
import { getWorkspaceId } from "@/lib/workspace";
import type { ImportResult, PdfProbeResponse, UUID } from "@/lib/api/types";

interface Props {
  estimateId: UUID;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Stage = "choose" | "probing" | "uploading" | "result";

const HINTS_TEXT = [
  "Извлекаем текст таблиц",
  "Парсим строки спецификации",
  "Определяем разделы",
  "Группируем одинаковые позиции",
  "Сохраняем в смету",
];

const HINTS_VISION = [
  "Рендерим страницы PDF",
  "LLM анализирует страницы",
  "Извлекаем позиции оборудования",
  "Проверяем дубликаты",
  "Сохраняем в смету",
];

const HINT_INTERVAL_MS = 2500;
const FALLBACK_ESTIMATED_SECONDS = 45;

function formatMmSs(totalSeconds: number): string {
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function PdfImportDialog({ estimateId, open, onOpenChange }: Props) {
  const workspaceId = getWorkspaceId();
  const qc = useQueryClient();
  const [stage, setStage] = React.useState<Stage>("choose");
  const [, setFile] = React.useState<File | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [elapsed, setElapsed] = React.useState(0);
  const [probe, setProbe] = React.useState<PdfProbeResponse | null>(null);
  const [hintIndex, setHintIndex] = React.useState(0);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const hintTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const clearTimers = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (hintTimerRef.current) {
      clearInterval(hintTimerRef.current);
      hintTimerRef.current = null;
    }
  }, []);

  const reset = React.useCallback(() => {
    setStage("choose");
    setFile(null);
    setResult(null);
    setElapsed(0);
    setProbe(null);
    setHintIndex(0);
    clearTimers();
  }, [clearTimers]);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  React.useEffect(() => () => clearTimers(), [clearTimers]);

  const hints = probe?.has_text_layer === false ? HINTS_VISION : HINTS_TEXT;
  const estimatedSeconds = probe?.estimated_seconds ?? FALLBACK_ESTIMATED_SECONDS;
  const progressPct = Math.min(100, Math.round((elapsed / Math.max(1, estimatedSeconds)) * 100));

  const upload = useMutation({
    mutationFn: (f: File) => importApi.uploadPdf(estimateId, f, workspaceId),
    onSuccess: (data) => {
      clearTimers();
      setResult(data);
      setStage("result");
      qc.invalidateQueries({ queryKey: ["estimate-items", estimateId] });
      qc.invalidateQueries({ queryKey: ["estimate-sections", estimateId] });
      qc.invalidateQueries({ queryKey: ["estimate", estimateId] });
      toast.success(`Распознано: ${data.created} позиций`);
    },
    onError: (e: unknown) => {
      clearTimers();
      setStage("choose");
      if (e instanceof ApiError) {
        toast.error(e.problem?.detail ?? e.message ?? "Ошибка распознавания");
      } else {
        toast.error("Ошибка распознавания PDF");
      }
    },
  });

  const startUploading = (f: File, probeData: PdfProbeResponse | null) => {
    setProbe(probeData);
    setStage("uploading");
    setElapsed(0);
    setHintIndex(0);
    timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
    const hintList = probeData?.has_text_layer === false ? HINTS_VISION : HINTS_TEXT;
    hintTimerRef.current = setInterval(() => {
      setHintIndex((i) => (i + 1) % hintList.length);
    }, HINT_INTERVAL_MS);
    upload.mutate(f);
  };

  const handleFile = async (f: File) => {
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Нужен файл .pdf");
      return;
    }
    setFile(f);
    setStage("probing");
    try {
      const probeData = await importApi.probePdf(estimateId, f, workspaceId);
      startUploading(f, probeData);
    } catch {
      // Probe failure — fallback: start uploading without estimate.
      startUploading(f, null);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) void handleFile(f);
  };

  const pagesLabel = probe ? `${probe.pages_total} ${pluralPages(probe.pages_total)}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Загрузить PDF-спецификацию</DialogTitle>
          <DialogDescription>
            ИИ распознает позиции из PDF и добавит в смету.
          </DialogDescription>
        </DialogHeader>

        {stage === "choose" && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/30 p-8 text-center transition-colors hover:border-primary/50 hover:bg-accent/30"
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
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </div>
        )}

        {stage === "probing" && (
          <div
            data-testid="pdf-import-probing"
            className="flex flex-col items-center gap-3 py-8"
          >
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-sm font-medium">Анализируем PDF…</div>
          </div>
        )}

        {stage === "uploading" && (
          <div
            data-testid="pdf-import-uploading"
            className="flex flex-col gap-3 py-4"
          >
            <div className="text-sm font-medium">
              {pagesLabel
                ? `PDF-спецификация, ${pagesLabel}`
                : "Распознаём PDF…"}
            </div>
            <div className="text-xs text-muted-foreground">
              Примерное время ≈ {estimatedSeconds} сек
              {probe?.has_text_layer === false ? " (Vision-режим)" : ""}
            </div>

            <div
              data-testid="pdf-import-progress"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2 w-full overflow-hidden rounded-full bg-secondary"
            >
              <div
                className="h-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span data-testid="pdf-import-elapsed">
                Прошло: {formatMmSs(elapsed)} / ~{formatMmSs(estimatedSeconds)}
              </span>
              <span>{progressPct}%</span>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span
                data-testid="pdf-import-hint"
                className="text-sm text-foreground"
              >
                {hints[hintIndex]}
              </span>
            </div>
          </div>
        )}

        {stage === "result" && result && (
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-green-600">✓ Создано: {result.created} позиций</span>
              {result.sections ? <span className="text-muted-foreground">({result.sections} разделов)</span> : null}
            </div>
            {result.pages_summary && result.pages_summary.some((p) => p.suspicious) && (
              <div
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
                data-testid="pdf-import-suspicious-warning"
              >
                <div className="flex items-center gap-2 font-medium text-amber-900">
                  <AlertTriangle className="h-4 w-4" />
                  Возможны пропущенные позиции
                </div>
                <div className="mt-1 text-xs text-amber-800">
                  На страницах{" "}
                  <span className="font-mono">
                    {result.pages_summary
                      .filter((p) => p.suspicious)
                      .map((p) => p.page)
                      .join(", ")}
                  </span>{" "}
                  система распознала меньше позиций чем насчитала проверка по
                  изображению. Сверьте вручную с оригиналом PDF.
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-amber-700">
                  {result.pages_summary
                    .filter((p) => p.suspicious)
                    .map((p) => (
                      <li key={p.page}>
                        стр. {p.page}: распознано {p.parsed_count}, проверка «видит» {p.expected_count_vision}
                        {p.retried ? " (retry не помог)" : ""}
                      </li>
                    ))}
                </ul>
              </div>
            )}
            {result.pages_total ? (
              <div className="text-xs text-muted-foreground">
                Обработано страниц: {result.pages_processed ?? 0} из {result.pages_total}
              </div>
            ) : null}
            {result.errors && result.errors.length > 0 && (
              <div className="space-y-1">
                <div className="text-sm font-medium text-amber-600">Предупреждения:</div>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {result.errors.map((err, i) => <li key={i}>• {err}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {stage === "result" ? (
            <Button onClick={() => onOpenChange(false)}>Закрыть</Button>
          ) : stage === "choose" ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function pluralPages(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "страница";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "страницы";
  return "страниц";
}
