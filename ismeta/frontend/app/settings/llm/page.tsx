"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LlmProfileForm } from "@/components/settings/llm-profile-form";
import { ApiError, llmProfileApi } from "@/lib/api/client";
import { getWorkspaceId } from "@/lib/workspace";
import type { LLMProfile } from "@/lib/api/types";

export default function LlmProfilesPage() {
  const workspaceId = getWorkspaceId();
  const qc = useQueryClient();

  const profilesQ = useQuery({
    queryKey: ["llm-profiles"],
    queryFn: () => llmProfileApi.list(workspaceId),
  });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LLMProfile | null>(null);

  const profiles = profilesQ.data ?? [];

  const setDefault = useMutation({
    mutationFn: (id: number) => llmProfileApi.setDefault(id, workspaceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["llm-profiles"] });
      toast.success("Профиль установлен по умолчанию");
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiError
          ? (e.problem?.detail ?? e.message)
          : (e as Error).message ?? "ошибка";
      toast.error(msg);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => llmProfileApi.remove(id, workspaceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["llm-profiles"] });
      toast.success("Профиль удалён");
    },
    onError: (e: unknown) => {
      // Backend возвращает 409 если пытаемся удалить default-профиль.
      if (e instanceof ApiError && e.status === 409) {
        toast.error(
          "Нельзя удалить профиль по умолчанию. Сначала установите другой default.",
        );
        return;
      }
      const msg =
        e instanceof ApiError
          ? (e.problem?.detail ?? e.message)
          : (e as Error).message ?? "ошибка";
      toast.error(msg);
    },
  });

  const onCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const onEdit = (profile: LLMProfile) => {
    setEditing(profile);
    setFormOpen(true);
  };

  const onDelete = (profile: LLMProfile) => {
    if (typeof window === "undefined") return;
    const ok = window.confirm(`Удалить профиль «${profile.name}»?`);
    if (ok) remove.mutate(profile.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Модели распознавания LLM</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Настройка профилей LLM для распознавания PDF/Excel-спецификаций.
            Профиль по умолчанию используется автоматически при загрузке файлов.
          </p>
        </div>
        <Button
          onClick={onCreate}
          size="sm"
          data-testid="llm-profile-create"
        >
          <Plus className="h-4 w-4" />
          Добавить профиль
        </Button>
      </div>

      {profilesQ.isLoading && (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Загрузка профилей…
        </div>
      )}

      {profilesQ.isError && (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          data-testid="llm-profiles-error"
        >
          Не удалось загрузить профили:{" "}
          {(profilesQ.error as Error)?.message ?? "ошибка"}
        </div>
      )}

      {profilesQ.isSuccess && profiles.length === 0 && (
        <div
          className="flex flex-col items-center gap-3 rounded-md border border-dashed py-12 text-center"
          data-testid="llm-profiles-empty"
        >
          <div className="text-sm font-medium">Профилей пока нет</div>
          <div className="text-xs text-muted-foreground">
            Создайте первый профиль, чтобы начать распознавать спецификации.
          </div>
          <Button
            size="sm"
            onClick={onCreate}
            data-testid="llm-profile-create-empty"
          >
            <Plus className="h-4 w-4" />
            Создать первый профиль
          </Button>
        </div>
      )}

      {profilesQ.isSuccess && profiles.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Модель extract</TableHead>
                <TableHead className="text-center">Vision</TableHead>
                <TableHead>Default</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((profile) => (
                <TableRow key={profile.id} data-testid={`llm-profile-row-${profile.id}`}>
                  <TableCell className="font-medium">{profile.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {profile.base_url}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {profile.extract_model}
                  </TableCell>
                  <TableCell className="text-center">
                    {profile.vision_supported ? (
                      <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {profile.is_default && (
                      <Badge variant="secondary" data-testid={`llm-profile-default-${profile.id}`}>
                        Default
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Действия"
                          data-testid={`llm-profile-actions-${profile.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(profile)}>
                          <Pencil className="h-3.5 w-3.5" />
                          Редактировать
                        </DropdownMenuItem>
                        {!profile.is_default && (
                          <DropdownMenuItem
                            onClick={() => setDefault.mutate(profile.id)}
                          >
                            <Star className="h-3.5 w-3.5" />
                            Сделать по умолчанию
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(profile)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Удалить
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <LlmProfileForm
        open={formOpen}
        profile={editing}
        isFirstProfile={profiles.length === 0}
        onOpenChange={setFormOpen}
      />
    </div>
  );
}
