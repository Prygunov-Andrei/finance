"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError, estimateApi, importApi } from "@/lib/api/client";
import { getWorkspaceId } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import type { PdfItem } from "@/lib/api/types";

const ACCEPT = ".pdf,application/pdf";

function isPdf(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(".pdf") ||
    file.type === "application/pdf"
  );
}

function stripExt(name: string): string {
  return name.replace(/\.pdf$/i, "").trim();
}

export function ImportNewPdfEstimateDialog() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const qc = useQueryClient();
  const workspaceId = getWorkspaceId();

  const reset = React.useCallback(() => {
    setName("");
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const submit = useMutation({
    mutationFn: async (args: { name: string; file: File }) => {
      if (!args.name.trim()) throw new Error("Укажите название");
      const estimate = await estimateApi.create(
        { name: args.name.trim() },
        workspaceId,
      );
      // Запустим распознавание; результат применим сразу без ручного review
      // (flow «из пустого состояния» — минимум кликов для демо).
      try {
        const result = await importApi.uploadPdf(
          estimate.id,
          args.file,
          workspaceId,
        );
        return { estimate, count: result.created };
      } catch (e) {
        if (e instanceof ApiError) {
          // Распознавание не удалось — смета всё равно создана
          toast.info(
            `Смета создана, но распознавание не удалось: ${e.problem?.detail ?? "ошибка"}`,
          );
          return { estimate, count: 0 };
        }
        throw e;
      }
    },
    onSuccess: ({ estimate, count }) => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      if (count > 0) {
        toast.success(`Смета «${estimate.name}» создана, распознано ${count} позиций`);
      } else {
        toast.success(`Смета «${estimate.name}» создана`);
      }
      setOpen(false);
      reset();
      router.push(`/estimates/${estimate.id}`);
    },
    onError: (e: unknown) => {
      if (e instanceof Error) toast.error(e.message);
      else toast.error("Распознавание не удалось");
    },
  });

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const first = files[0]!;
    if (!isPdf(first)) {
      toast.error("Нужен файл .pdf");
      return;
    }
    setFile(first);
    if (!name.trim()) setName(stripExt(first.name));
  };

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="import-new-pdf-trigger">
          <FileText className="h-4 w-4" />
          Загрузить PDF
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="import-new-pdf-dialog">
        <DialogHeader>
          <DialogTitle>Загрузить спецификацию (PDF)</DialogTitle>
          <DialogDescription>
            ИИ распознает оборудование и модели из PDF, создаст смету
            и подставит позиции.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return;
            submit.mutate({ name, file });
          }}
          className="flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Название *</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, Спецификация ОВиК корпус А"
              disabled={submit.isPending}
              aria-label="Название сметы"
            />
          </label>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
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
            data-testid="import-new-pdf-dropzone"
            data-dragging={isDragging || undefined}
            className={cn(
              "flex min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-4 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 bg-muted/20 hover:border-muted-foreground/50",
            )}
          >
            <FileText
              className={cn(
                "h-7 w-7",
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
            onChange={(e) => handleFiles(e.target.files)}
            className="sr-only"
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => close(false)}
              disabled={submit.isPending}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={!file || !name.trim() || submit.isPending}
              data-testid="import-new-pdf-submit"
            >
              {submit.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Распознать и создать
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
