"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, importApi } from "@/lib/api/client";
import { getWorkspaceId } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import type {
  ImportResult,
  PdfImportPreview,
  PdfItem,
  UUID,
} from "@/lib/api/types";

interface Props {
  estimateId: UUID;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ACCEPT = ".pdf,application/pdf";

function isPdf(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(".pdf") ||
    file.type === "application/pdf"
  );
}

type Stage = "choose" | "uploading" | "preview" | "result";

export function PdfImportDialog({ estimateId, open, onOpenChange }: Props) {
  const workspaceId = getWorkspaceId();
  const qc = useQueryClient();
  const [file, setFile] = React.useState<File | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [stage, setStage] = React.useState<Stage>("choose");
  const [preview, setPreview] = React.useState<PdfImportPreview | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const upload = useMutation({
    mutationFn: (f: File) => importApi.uploadPdf(estimateId, f, workspaceId),
    onSuccess: (data) => {
      setPreview(data);
      setStage("preview");
    },
    onError: (e: unknown) => {
      setStage("choose");
      if (e instanceof ApiError) {
        toast.error(e.problem?.detail ?? "Распознавание не удалось");
      } else {
        toast.error("Распознавание не удалось");
      }
    },
  });

  const apply = useMutation({
    mutationFn: (items: PdfItem[]) =>
      importApi.applyPdf(estimateId, preview?.session_id ?? "", items, workspaceId),
    onSuccess: (data) => {
      setResult(data);
      setStage("result");
      qc.invalidateQueries({ queryKey: ["estimate-items", estimateId] });
      qc.invalidateQueries({ queryKey: ["estimate", estimateId] });
      if (data.created + data.updated > 0) {
        toast.success(`Добавлено из PDF: ${data.created + data.updated}`);
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
      toast.error("Не удалось применить распознанные позиции");
    },
  });

  const reset = React.useCallback(() => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setStage("choose");
    upload.reset();
    apply.reset();
    if (inputRef.current) inputRef.current.value = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const first = files[0]!;
    if (!isPdf(first)) {
      toast.error("Нужен файл .pdf");
      return;
    }
    setFile(first);
    setStage("uploading");
    upload.mutate(first);
  };

  const submitApply = () => {
    if (!preview || preview.items.length === 0) return;
    apply.mutate(preview.items);
  };

  const changeFile = () => {
    setFile(null);
    setPreview(null);
    setStage("choose");
    upload.reset();
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="pdf-import-dialog"
        data-stage={stage}
        className={stage === "preview" ? "max-w-3xl" : undefined}
      >
        <DialogHeader>
          <DialogTitle>
            {stage === "result"
              ? "Результат импорта"
              : stage === "preview"
                ? "Предпросмотр распознавания"
                : stage === "uploading"
                  ? "Распознавание…"
                  : "Загрузить PDF"}
          </DialogTitle>
          <DialogDescription>
            {stage === "result"
              ? "Позиции добавлены в смету."
              : stage === "preview"
                ? "Проверьте распознанные позиции перед применением."
                : stage === "uploading"
                  ? "ИИ читает спецификацию — это может занять несколько минут."
                  : "Загрузите PDF со спецификацией оборудования."}
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
            inputRef={inputRef}
            onInputChange={(e) => handleFiles(e.target.files)}
          />
        ) : null}

        {stage === "uploading" ? <UploadingView fileName={file?.name ?? ""} /> : null}

        {stage === "preview" && preview ? (
          <PdfPreviewView preview={preview} />
        ) : null}

        {stage === "result" && result ? <ResultView result={result} /> : null}

        <DialogFooter>
          {stage === "choose" ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
          ) : null}

          {stage === "uploading" ? (
            <Button
              variant="outline"
              onClick={() => {
                upload.reset();
                changeFile();
              }}
            >
              Отмена
            </Button>
          ) : null}

          {stage === "preview" ? (
            <>
              <Button
                variant="ghost"
                onClick={changeFile}
                disabled={apply.isPending}
                data-testid="pdf-preview-cancel"
              >
                <X className="h-4 w-4" />
                Сменить файл
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={apply.isPending}
              >
                Отмена
              </Button>
              <Button
                onClick={submitApply}
                disabled={
                  apply.isPending ||
                  !preview ||
                  preview.items.length === 0
                }
                data-testid="pdf-preview-apply"
              >
                {apply.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Применить ({preview?.items.length ?? 0})
              </Button>
            </>
          ) : null}

          {stage === "result" ? (
            <>
              <Button variant="outline" onClick={reset}>
                <RefreshCw className="h-4 w-4" />
                Ещё PDF
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
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  inputRef,
  onInputChange,
}: {
  file: File | null;
  isDragging: boolean;
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
        data-testid="pdf-import-dropzone"
        data-dragging={isDragging || undefined}
        className={cn(
          "flex min-h-[140px] w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 bg-muted/20 hover:border-muted-foreground/50",
        )}
      >
        <FileText
          className={cn(
            "h-8 w-8",
            file ? "text-primary" : "text-muted-foreground",
          )}
          aria-hidden
        />
        {file ? (
          <>
            <span className="font-medium">{file.name}</span>
            <span className="text-xs text-muted-foreground">
              {Math.round(file.size / 1024)} КБ
            </span>
          </>
        ) : (
          <>
            <span className="font-medium">Перетащите .pdf файл сюда</span>
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
        aria-label="Выбрать .pdf файл"
        onChange={onInputChange}
        className="sr-only"
      />
      <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
        ИИ распознаёт оборудование, модели и количества. Распознавание
        занимает ~1 минуту на 10 страниц. После обработки увидите список
        позиций с уверенностью, можно удалить лишние до применения.
      </div>
    </div>
  );
}

function UploadingView({ fileName }: { fileName: string }) {
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    const iv = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(iv);
  }, []);

  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-10 text-center text-sm"
      data-testid="pdf-uploading"
      aria-live="polite"
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      <div>
        <div className="font-medium">Распознаём «{fileName}»…</div>
        <div
          className="mt-1 text-xs text-muted-foreground"
          data-testid="pdf-elapsed"
        >
          Прошло: {formatElapsed(elapsed)}. Это может занять несколько минут.
        </div>
      </div>
    </div>
  );
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m} мин ${s} сек` : `${s} сек`;
}

function PdfPreviewView({ preview }: { preview: PdfImportPreview }) {
  const meta = preview.document_meta;
  const progress =
    meta.pages_total > 0 ? meta.pages_processed / meta.pages_total : 1;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div
        className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/20 p-3 text-xs"
        data-testid="pdf-meta"
      >
        <span>
          Страниц:{" "}
          <span className="font-medium text-foreground" data-testid="pdf-pages">
            {meta.pages_processed} из {meta.pages_total}
          </span>
        </span>
        <span>
          Уверенность:{" "}
          <span className="font-medium text-foreground">
            {(meta.confidence * 100).toFixed(0)}%
          </span>
        </span>
        <span className="ml-auto text-muted-foreground">
          {Math.round(meta.processing_time_ms / 1000)} сек · ${meta.cost_usd.toFixed(3)}
        </span>
      </div>

      {progress < 1 ? (
        <div
          role="alert"
          className="rounded-md border border-amber-400/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/40 dark:bg-amber-950/30 dark:text-amber-100"
        >
          Распознано не всё ({meta.pages_processed} из {meta.pages_total}).
          Остальные страницы можно загрузить отдельным PDF.
        </div>
      ) : null}

      {preview.items.length === 0 ? (
        <div
          className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground"
          data-testid="pdf-empty"
        >
          В документе не найдено позиций оборудования.
        </div>
      ) : (
        <div className="max-h-80 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead className="w-12">Стр.</TableHead>
                <TableHead>Наименование</TableHead>
                <TableHead className="w-20">Ед.изм.</TableHead>
                <TableHead className="w-20 text-right">Кол-во</TableHead>
                <TableHead className="w-24">Уверенность</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.items.map((it, i) => (
                <PdfItemRow key={i} item={it} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function PdfItemRow({ item }: { item: PdfItem }) {
  const confidenceClass =
    item.confidence >= 0.8
      ? "text-emerald-800 dark:text-emerald-300"
      : item.confidence >= 0.5
        ? "text-amber-800 dark:text-amber-300"
        : "text-rose-800 dark:text-rose-300";

  return (
    <TableRow
      data-row-kind="pdf-item"
      data-confidence-bucket={
        item.confidence >= 0.8
          ? "high"
          : item.confidence >= 0.5
            ? "medium"
            : "low"
      }
    >
      <TableCell className="text-xs text-muted-foreground tabular-nums">
        {item.source_page ?? "—"}
      </TableCell>
      <TableCell className="font-medium">
        {item.model_name || item.raw_name}
        {item.section_name ? (
          <div className="text-xs text-muted-foreground">
            {item.section_name}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {item.unit}
      </TableCell>
      <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
      <TableCell className={cn("text-xs tabular-nums", confidenceClass)}>
        {(item.confidence * 100).toFixed(0)}%
      </TableCell>
    </TableRow>
  );
}

function ResultView({ result }: { result: ImportResult }) {
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
        <span className="font-medium tabular-nums">{result.updated}</span>
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
    </div>
  );
}
