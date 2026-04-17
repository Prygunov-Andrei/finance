"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { z } from "zod";

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
import { estimateApi, ApiError } from "@/lib/api/client";
import { getWorkspaceId } from "@/lib/workspace";

const Schema = z.object({
  name: z.string().min(1, "Укажите название"),
  folder_name: z.string().optional(),
});

export function NewEstimateDialog() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [folder, setFolder] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const router = useRouter();
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: () => {
      const parsed = Schema.safeParse({ name, folder_name: folder });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Некорректные данные");
      }
      return estimateApi.create(
        { name: parsed.data.name, folder_name: parsed.data.folder_name || undefined },
        getWorkspaceId(),
      );
    },
    onSuccess: (est) => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      setOpen(false);
      setName("");
      setFolder("");
      setError(null);
      router.push(`/estimates/${est.id}`);
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError) {
        setError(e.problem?.detail ?? e.message);
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Не удалось создать смету");
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Новая смета
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новая смета</DialogTitle>
          <DialogDescription>
            Создайте пустую смету — разделы и строки добавите в редакторе.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Название *</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, Вентиляция корпус А"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Папка (необязательно)</span>
            <Input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="Например, 2026 / ТЦ Атриум"
            />
          </label>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={create.isPending}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Создаётся..." : "Создать"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
