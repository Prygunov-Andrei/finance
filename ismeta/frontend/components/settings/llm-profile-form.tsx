"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { ApiError, llmProfileApi } from "@/lib/api/client";
import { getWorkspaceId } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import type { LLMProfile, LLMProfileCreate } from "@/lib/api/types";

interface Props {
  open: boolean;
  profile: LLMProfile | null; // null → create
  onOpenChange: (open: boolean) => void;
  isFirstProfile?: boolean; // первый профиль автоматически = default
}

const PRESETS = [
  { id: "openai", label: "OpenAI", base_url: "https://api.openai.com" },
  { id: "deepseek", label: "DeepSeek", base_url: "https://api.deepseek.com" },
  { id: "custom", label: "Custom", base_url: "" },
] as const;

type PresetId = (typeof PRESETS)[number]["id"];

function detectPreset(url: string): PresetId {
  for (const p of PRESETS) {
    if (p.id !== "custom" && p.base_url === url) return p.id;
  }
  return "custom";
}

interface FormState {
  name: string;
  preset: PresetId;
  base_url: string;
  api_key: string;
  extract_model: string;
  multimodal_model: string;
  classify_model: string;
  vision_supported: boolean;
  is_default: boolean;
}

function initialState(profile: LLMProfile | null, isFirstProfile: boolean): FormState {
  if (!profile) {
    return {
      name: "",
      preset: "openai",
      base_url: "https://api.openai.com",
      api_key: "",
      extract_model: "",
      multimodal_model: "",
      classify_model: "",
      vision_supported: true,
      is_default: isFirstProfile,
    };
  }
  return {
    name: profile.name,
    preset: detectPreset(profile.base_url),
    base_url: profile.base_url,
    api_key: "", // не заполняем, ключ скрыт; пустой = не менять при update
    extract_model: profile.extract_model,
    multimodal_model: profile.multimodal_model ?? "",
    classify_model: profile.classify_model ?? "",
    vision_supported: profile.vision_supported,
    is_default: profile.is_default,
  };
}

export function LlmProfileForm({
  open,
  profile,
  onOpenChange,
  isFirstProfile = false,
}: Props) {
  const workspaceId = getWorkspaceId();
  const qc = useQueryClient();
  const isEdit = profile !== null;

  const [state, setState] = React.useState<FormState>(() =>
    initialState(profile, isFirstProfile),
  );
  const [revealKey, setRevealKey] = React.useState(false);
  const [testStatus, setTestStatus] = React.useState<
    | { kind: "idle" }
    | { kind: "ok"; models: string[] }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // На каждое открытие — пересобираем форму (иначе при re-open cache остаётся).
  React.useEffect(() => {
    if (open) {
      setState(initialState(profile, isFirstProfile));
      setRevealKey(false);
      setTestStatus({ kind: "idle" });
    }
  }, [open, profile, isFirstProfile]);

  const update = (patch: Partial<FormState>) =>
    setState((prev) => ({ ...prev, ...patch }));

  const onPresetChange = (preset: PresetId) => {
    const cfg = PRESETS.find((p) => p.id === preset)!;
    update({
      preset,
      base_url: preset === "custom" ? state.base_url : cfg.base_url,
    });
  };

  const testConnection = useMutation({
    mutationFn: () =>
      llmProfileApi.testConnection(
        { base_url: state.base_url, api_key: state.api_key },
        workspaceId,
      ),
    onSuccess: (res) => {
      if (res.ok) {
        setTestStatus({ kind: "ok", models: res.models ?? [] });
      } else {
        setTestStatus({
          kind: "error",
          message: res.error ?? `HTTP ${res.status_code ?? "?"}`,
        });
      }
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiError
          ? (e.problem?.detail ?? e.message)
          : (e as Error).message ?? "ошибка";
      setTestStatus({ kind: "error", message: msg });
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const payload: Partial<LLMProfileCreate> = {
        name: state.name.trim(),
        base_url: state.base_url.trim(),
        extract_model: state.extract_model.trim(),
        multimodal_model: state.multimodal_model.trim() || undefined,
        classify_model: state.classify_model.trim() || undefined,
        vision_supported: state.vision_supported,
        is_default: state.is_default,
      };
      // На update — отправляем api_key только если поле непустое.
      if (state.api_key.trim()) payload.api_key = state.api_key;

      if (isEdit && profile) {
        return llmProfileApi.update(profile.id, payload, workspaceId);
      }
      // На create — api_key обязателен.
      if (!payload.api_key) throw new Error("Введите API key");
      return llmProfileApi.create(payload as LLMProfileCreate, workspaceId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["llm-profiles"] });
      toast.success(isEdit ? "Профиль обновлён" : "Профиль создан");
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiError
          ? (e.problem?.detail ?? e.message)
          : (e as Error).message ?? "ошибка";
      toast.error(msg);
    },
  });

  // Validation: name + extract_model required, base_url непустой, api_key
  // обязателен только при create (или если поле заполнено явно — длина ≥ 8).
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!state.name.trim()) errors.name = "Укажите название";
  if (!state.base_url.trim()) errors.base_url = "Укажите base_url";
  if (!state.extract_model.trim())
    errors.extract_model = "Укажите модель extract";
  if (!isEdit && !state.api_key.trim()) errors.api_key = "API key обязателен";

  const canSubmit = Object.keys(errors).length === 0 && !submit.isPending;
  const canTest =
    state.base_url.trim() !== "" &&
    state.api_key.trim() !== "" &&
    !testConnection.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Редактировать LLM-профиль" : "Новый LLM-профиль"}
          </DialogTitle>
          <DialogDescription>
            Профиль используется для распознавания PDF/Excel-спецификаций.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) submit.mutate();
          }}
          data-testid="llm-profile-form"
        >
          <Field label="Название" error={errors.name} htmlFor="llm-name">
            <Input
              id="llm-name"
              value={state.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="OpenAI gpt-5.4"
              data-testid="llm-form-name"
            />
          </Field>

          <Field label="Endpoint" error={errors.base_url}>
            <div className="flex gap-2">
              <select
                value={state.preset}
                onChange={(e) => onPresetChange(e.target.value as PresetId)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                data-testid="llm-form-preset"
              >
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <Input
                value={state.base_url}
                onChange={(e) => update({ base_url: e.target.value })}
                placeholder="https://api.openai.com"
                disabled={state.preset !== "custom"}
                className="flex-1"
                data-testid="llm-form-base-url"
              />
            </div>
          </Field>

          <Field
            label="API key"
            error={errors.api_key}
            hint={
              isEdit
                ? `Текущий: ${profile?.api_key_preview}. Оставьте пустым чтобы не менять.`
                : undefined
            }
          >
            <div className="flex gap-2">
              <Input
                type={revealKey ? "text" : "password"}
                value={state.api_key}
                onChange={(e) => update({ api_key: e.target.value })}
                placeholder={isEdit ? profile?.api_key_preview : "sk-..."}
                className="flex-1"
                autoComplete="off"
                data-testid="llm-form-api-key"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setRevealKey((v) => !v)}
                aria-label={revealKey ? "Скрыть ключ" : "Показать ключ"}
              >
                {revealKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </Field>

          <Field label="Модель extract" error={errors.extract_model}>
            <Input
              value={state.extract_model}
              onChange={(e) => update({ extract_model: e.target.value })}
              placeholder="gpt-4o-mini / deepseek-chat"
              data-testid="llm-form-extract-model"
            />
          </Field>

          <Field
            label="Модель multimodal"
            hint="Если пусто — используется extract"
          >
            <Input
              value={state.multimodal_model}
              onChange={(e) => update({ multimodal_model: e.target.value })}
              placeholder="gpt-4o"
            />
          </Field>

          <Field label="Модель classify" hint="Опционально">
            <Input
              value={state.classify_model}
              onChange={(e) => update({ classify_model: e.target.value })}
              placeholder="gpt-4o-mini"
            />
          </Field>

          <div className="flex items-center justify-between rounded-md border border-input px-3 py-2">
            <div>
              <div className="font-medium">Поддержка vision</div>
              <div className="text-xs text-muted-foreground">
                Распознавание сканов через multimodal-модель
              </div>
            </div>
            <Toggle
              checked={state.vision_supported}
              onChange={(v) => update({ vision_supported: v })}
              dataTestId="llm-form-vision"
            />
          </div>

          {isEdit && (
            <div className="flex items-center justify-between rounded-md border border-input px-3 py-2">
              <div>
                <div className="font-medium">Профиль по умолчанию</div>
                <div className="text-xs text-muted-foreground">
                  Будет автоматически выбран при загрузке файлов
                </div>
              </div>
              <Toggle
                checked={state.is_default}
                onChange={(v) => update({ is_default: v })}
                dataTestId="llm-form-default"
              />
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canTest}
              onClick={() => testConnection.mutate()}
              data-testid="llm-form-test"
            >
              {testConnection.isPending && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              Тест соединения
            </Button>
            {testStatus.kind === "ok" && (
              <span
                className="text-xs text-emerald-600"
                data-testid="llm-form-test-ok"
              >
                ✓ Соединение OK
                {testStatus.models.length > 0 &&
                  ` · ${testStatus.models.length} моделей`}
              </span>
            )}
            {testStatus.kind === "error" && (
              <span
                className="text-xs text-destructive"
                data-testid="llm-form-test-error"
              >
                ✗ {testStatus.message}
              </span>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submit.isPending}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              data-testid="llm-form-submit"
            >
              {submit.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {isEdit ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-foreground/80"
      >
        {label}
      </label>
      {children}
      {error && (
        <div className="text-xs text-destructive" role="alert">
          {error}
        </div>
      )}
      {!error && hint && (
        <div className="text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  dataTestId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  dataTestId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      data-testid={dataTestId}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-4 w-4 translate-y-0 rounded-full bg-background shadow ring-0 transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
        style={{ marginTop: "1px" }}
      />
    </button>
  );
}
