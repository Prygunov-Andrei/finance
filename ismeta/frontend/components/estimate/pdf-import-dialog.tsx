"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Upload } from "lucide-react";
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
import type { ImportResult, UUID } from "@/lib/api/types";

interface Props {
  estimateId: UUID;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Stage = "choose" | "uploading" | "result";

export function PdfImportDialog({ estimateId, open, onOpenChange }: Props) {
  const workspaceId = getWorkspaceId();
  const qc = useQueryClient();
  const [stage, setStage] = React.useState<Stage>("choose");
  const [file, setFile] = React.useState<File | null>(null);
  const [result, setResult] = React.useState<(ImportResult & { pages_total?: number; pages_processed?: number }) | null>(null);
  const [elapsed, setElapsed] = React.useState(0);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setStage("choose");
    setFile(null);
    setResult(null);
    setElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  React.useEffect(() => {
    if (!open) reset();
  }, [open]);

  const upload = useMutation({
    mutationFn: (f: File) => importApi.uploadPdf(estimateId, f, workspaceId),
    onSuccess: (data) => {
      if (timerRef.current) clearInterval(timerRef.current);
      setResult(data);
      setStage("result");
      qc.invalidateQueries({ queryKey: ["estimate-items", estimateId] });
      qc.invalidateQueries({ queryKey: ["estimate", estimateId] });
      toast.success(`Распознано: ${data.created} позиций`);
    },
    onError: (e: unknown) => {
      if (timerRef.current) clearInterval(timerRef.current);
      setStage("choose");
      if (e instanceof ApiError) {
        toast.error(e.problem?.detail ?? e.message ?? "Ошибка распознавания");
      } else {
        toast.error("Ошибка распознавания PDF");
      }
    },
  });

  const handleFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Нужен файл .pdf");
      return;
    }
    setFile(f);
    setStage("uploading");
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
    upload.mutate(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

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
                if (f) handleFile(f);
              }}
            />
          </div>
        )}

        {stage === "uploading" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-sm font-medium">Распознавание...</div>
            <div className="text-xs text-muted-foreground">
              Прошло: {Math.floor(elapsed / 60)} мин {elapsed % 60} сек
            </div>
            <div className="text-xs text-muted-foreground">
              Обычно занимает 1-3 минуты
            </div>
          </div>
        )}

        {stage === "result" && result && (
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-green-600">✓ Создано: {result.created} позиций</span>
              {result.sections ? <span className="text-muted-foreground">({result.sections} разделов)</span> : null}
            </div>
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
