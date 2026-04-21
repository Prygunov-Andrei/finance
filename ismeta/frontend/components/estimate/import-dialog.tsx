"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
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
import { PreviewTable } from "./preview-table";
import { ApiError, importApi } from "@/lib/api/client";
import { getWorkspaceId } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { parseXlsxPreview, type PreviewResult } from "@/lib/excel/preview";
import type { ImportResult, UUID } from "@/lib/api/types";

interface Props {
  estimateId: UUID;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function isXlsx(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(".xlsx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

type Stage = "choose" | "preview" | "result";

export function ImportDialog({ estimateId, open, onOpenChange }: Props) {
  const workspaceId = getWorkspaceId();
  const qc = useQueryClient();
  const [file, setFile] = React.useState<File | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [stage, setStage] = React.useState<Stage>("choose");
  const [preview, setPreview] = React.useState<PreviewResult | null>(null);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const parseMut = useMutation({
    mutationFn: (f: File) => parseXlsxPreview(f),
    onSuccess: (data) => {
      setPreview(data);
      setParseError(null);
      setStage("preview");
    },
    onError: (e: unknown) => {
      setParseError(
        e instanceof Error ? e.message : "Не удалось прочитать файл",
      );
      setPreview(null);
      setStage("preview");
    },
  });

  const upload = useMutation({
    mutationFn: (f: File) => importApi.uploadExcel(estimateId, f, workspaceId),
    onSuccess: (data) => {
      setResult(data);
      setStage("result");
      qc.invalidateQueries({ queryKey: ["estimate-items", estimateId] });
      qc.invalidateQueries({ queryKey: ["estimate", estimateId] });
      const updated = data.updated ?? 0;
      if (data.created + updated > 0) {
        toast.success(
          `Импорт: +${data.created} новых, ~${updated} обновлено`,
        );
      }
    },
    onError: (e: unknown) => {
      if (
        e instanceof ApiError &&
        e.problem &&
        typeof e.problem === "object" &&
        Array.isArray((e.problem as { errors?: unknown }).errors)
      ) {
        const p = e.problem as unknown as ImportResult;
        setResult({
          created: p.created ?? 0,
          updated: p.updated ?? 0,
          errors: p.errors,
        });
        setStage("result");
        return;
      }
      if (e instanceof ApiError) {
        toast.error(e.problem?.detail ?? "Не удалось импортировать файл");
      } else {
        toast.error("Не удалось импортировать файл");
      }
    },
  });

  const reset = React.useCallback(() => {
    setFile(null);
    setPreview(null);
    setParseError(null);
    setResult(null);
    setStage("choose");
    parseMut.reset();
    upload.reset();
    if (inputRef.current) inputRef.current.value = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const first = files[0]!;
    if (!isXlsx(first)) {
      toast.error("Нужен файл .xlsx");
      return;
    }
    setFile(first);
    parseMut.mutate(first);
  };

  const apply = () => {
    if (!file) return;
    upload.mutate(file);
  };

  const changeFile = () => {
    setFile(null);
    setPreview(null);
    setParseError(null);
    setStage("choose");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="import-dialog"
        data-stage={stage}
        className={stage === "preview" ? "max-w-3xl" : undefined}
      >
        <DialogHeader>
          <DialogTitle>
            {stage === "result"
              ? "Результат импорта"
              : stage === "preview"
                ? "Предпросмотр импорта"
                : "Импорт Excel"}
          </DialogTitle>
          <DialogDescription>
            {stage === "result"
              ? "Изменения применены к смете."
              : stage === "preview"
                ? "Проверьте, что будет создано и обновлено, перед применением."
                : "Загрузите .xlsx файл с позициями сметы."}
          </DialogDescription>
        </DialogHeader>

        {stage === "choose" ? (
          <ChooseView
            file={file}
            isDragging={isDragging}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            isParsing={parseMut.isPending}
            inputRef={inputRef}
            onInputChange={(e) => handleFiles(e.target.files)}
          />
        ) : null}

        {stage === "preview" ? (
          parseError ? (
            <div
              role="alert"
              data-testid="preview-parse-error"
              className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              Не удалось прочитать файл: {parseError}
            </div>
          ) : preview ? (
            <PreviewTable rows={preview.rows} summary={preview.summary} />
          ) : null
        ) : null}

        {stage === "result" && result ? <ResultView result={result} /> : null}

        <DialogFooter>
          {stage === "choose" ? (
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={parseMut.isPending}
            >
              Отмена
            </Button>
          ) : null}

          {stage === "preview" ? (
            <>
              <Button
                variant="ghost"
                onClick={changeFile}
                disabled={upload.isPending}
                data-testid="preview-cancel"
              >
                <X className="h-4 w-4" />
                Сменить файл
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={upload.isPending}
              >
                Отмена
              </Button>
              <Button
                onClick={apply}
                disabled={
                  upload.isPending ||
                  Boolean(parseError) ||
                  !preview ||
                  preview.rows.length === 0 ||
                  preview.summary.create + preview.summary.update === 0
                }
                data-testid="preview-apply"
              >
                {upload.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Применить{" "}
                {preview
                  ? `(${preview.summary.create + preview.summary.update})`
                  : ""}
              </Button>
            </>
          ) : null}

          {stage === "result" ? (
            <>
              <Button variant="outline" onClick={reset}>
                <RefreshCw className="h-4 w-4" />
                Импортировать ещё
              </Button>
              <Button onClick={() => onOpenChange(false)}>Закрыть</Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChooseView({
  file,
  isDragging,
  isParsing,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  inputRef,
  onInputChange,
}: {
  file: File | null;
  isDragging: boolean;
  isParsing: boolean;
  onDragOver: React.DragEventHandler;
  onDragLeave: React.DragEventHandler;
  onDrop: React.DragEventHandler;
  onClick: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onInputChange: React.ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onClick}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        data-testid="import-dropzone"
        data-dragging={isDragging || undefined}
        className={cn(
          "flex min-h-[140px] w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 bg-muted/20 hover:border-muted-foreground/50",
        )}
      >
        <FileSpreadsheet
          className={cn(
            "h-8 w-8",
            file ? "text-primary" : "text-muted-foreground",
          )}
          aria-hidden
        />
        {isParsing ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">
              Читаем файл…
            </span>
          </>
        ) : file ? (
          <>
            <span className="font-medium">{file.name}</span>
            <span className="text-xs text-muted-foreground">
              {Math.round(file.size / 1024)} КБ
            </span>
          </>
        ) : (
          <>
            <span className="font-medium">Перетащите .xlsx файл сюда</span>
            <span className="text-xs text-muted-foreground">
              или нажмите, чтобы выбрать
            </span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        aria-label="Выбрать .xlsx файл"
        onChange={onInputChange}
        className="sr-only"
      />
      <FormatHint />
    </div>
  );
}

function FormatHint() {
  return (
    <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
      <div className="font-medium text-foreground">Формат листа</div>
      <div className="mt-1">
        Наименование · Ед.изм. · Кол-во · Цена оборуд. · Цена мат. · Цена
        работ
      </div>
      <div className="mt-1">
        Строки с <strong>row_id</strong> (7-я колонка) обновляются,
        без row_id — создаются. Строки без цен/количества — названия
        разделов.
      </div>
    </div>
  );
}

function ResultView({ result }: { result: ImportResult }) {
  const updated = result.updated ?? 0;
  const hasChanges = result.created + updated > 0;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2" data-testid="result-created">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
        <span>Создано:</span>
        <span className="font-medium tabular-nums">{result.created}</span>
      </div>
      <div className="flex items-center gap-2" data-testid="result-updated">
        <RefreshCw className="h-4 w-4 text-sky-600" aria-hidden />
        <span>Обновлено:</span>
        <span className="font-medium tabular-nums">{updated}</span>
      </div>
      {result.errors.length > 0 ? (
        <div className="flex flex-col gap-2" data-testid="result-errors">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <span>Ошибки: {result.errors.length}</span>
          </div>
          <ul className="max-h-40 list-disc space-y-1 overflow-auto rounded-md border bg-muted/20 p-3 pl-6 text-xs">
            {result.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {!hasChanges && result.errors.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
          Файл не содержал позиций.
        </div>
      ) : null}
    </div>
  );
}
