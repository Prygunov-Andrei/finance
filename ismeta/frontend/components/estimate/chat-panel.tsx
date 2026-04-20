"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bot, Loader2, Send, Sparkles, User, Wrench, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { agentApi, ApiError } from "@/lib/api/client";
import { getWorkspaceId } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import type {
  ChatMessage,
  ChatToolCall,
  UUID,
} from "@/lib/api/types";

interface Props {
  estimateId: UUID;
  open: boolean;
  onClose: () => void;
}

export function ChatPanel({ estimateId, open, onClose }: Props) {
  const workspaceId = getWorkspaceId();
  const qc = useQueryClient();
  const [draft, setDraft] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const historyQ = useQuery({
    queryKey: ["chat-history", estimateId, workspaceId],
    queryFn: () => agentApi.getHistory(estimateId, workspaceId),
    enabled: open,
  });

  const send = useMutation({
    mutationFn: (content: string) =>
      agentApi.sendMessage(estimateId, content, workspaceId),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["chat-history", estimateId, workspaceId],
      });
      setDraft("");
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError) {
        toast.error(e.problem?.detail ?? "ИИ не ответил");
      } else {
        toast.error("ИИ не ответил");
      }
    },
  });

  const validate = useMutation({
    mutationFn: () => agentApi.validate(estimateId, workspaceId),
    onError: (e: unknown) => {
      if (e instanceof ApiError) {
        toast.error(e.problem?.detail ?? "Не удалось проверить смету");
      } else {
        toast.error("Не удалось проверить смету");
      }
    },
  });

  // Esc для закрытия
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Auto-scroll к последнему сообщению
  React.useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [historyQ.data, send.isPending, open]);

  const messages = historyQ.data ?? [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || send.isPending) return;
    send.mutate(text);
  };

  if (!open) return null;

  return (
    <aside
      role="complementary"
      aria-label="ИИ-помощник"
      data-testid="chat-panel"
      className="flex w-96 shrink-0 flex-col border-l bg-card"
    >
      <div className="flex h-12 items-center justify-between border-b px-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">ИИ-помощник</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => validate.mutate()}
            disabled={validate.isPending}
            title="Проверить смету на ошибки"
          >
            {validate.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span className="ml-1 text-xs">Проверить</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Закрыть чат"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {validate.data ? (
        <div className="border-b px-3 py-2 text-sm">
          <div className="mb-1 font-medium">
            {validate.data.issues.length > 0
              ? `Найдено ${validate.data.issues.length} замечаний`
              : "Ошибок не найдено"}
          </div>
          {validate.data.issues.length > 0 ? (
            <ul className="space-y-1">
              {validate.data.issues.map((issue: any, i: number) => (
                <li key={i} className="flex items-start gap-1.5 text-xs">
                  <AlertTriangle className={cn(
                    "mt-0.5 h-3 w-3 shrink-0",
                    issue.severity === "error" ? "text-rose-600" :
                    issue.severity === "warning" ? "text-amber-600" : "text-sky-600"
                  )} />
                  <span>
                    <span className="font-medium">{issue.item_name}</span>
                    {" — "}{issue.message}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{validate.data.summary}</p>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">
            Токены: {validate.data.tokens_used} · ${validate.data.cost_usd?.toFixed(4)}
          </p>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto px-3 py-3"
        data-testid="chat-messages"
      >
        {historyQ.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="h-16 w-2/3 ml-auto" />
          </div>
        ) : messages.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Задайте вопрос по смете. Я умею искать позиции, сверять цены
            с рынком и предлагать аналоги.
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </ul>
        )}
        {send.isPending ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Помощник печатает…
          </div>
        ) : null}
      </div>

      <form
        onSubmit={submit}
        className="flex items-end gap-2 border-t p-3"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(e);
            }
          }}
          placeholder="Введите сообщение… (Enter — отправить, Shift+Enter — перенос)"
          rows={2}
          disabled={send.isPending}
          aria-label="Сообщение ИИ-помощнику"
          className="min-h-[40px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
        <Button
          type="submit"
          size="icon"
          disabled={send.isPending || draft.trim().length === 0}
          aria-label="Отправить"
        >
          {send.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </aside>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <li
      data-role={message.role}
      className={cn(
        "flex flex-col gap-2",
        isUser ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "flex max-w-[85%] gap-2 rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "border bg-muted/40 text-foreground",
        )}
      >
        <span className="mt-0.5 shrink-0">
          {isUser ? (
            <User className="h-3.5 w-3.5 opacity-70" aria-hidden />
          ) : (
            <Bot className="h-3.5 w-3.5 opacity-70" aria-hidden />
          )}
        </span>
        <div className="whitespace-pre-wrap break-words">
          {message.content || (!isUser ? "(пустой ответ)" : "")}
        </div>
      </div>
      {message.tool_calls && message.tool_calls.length > 0 ? (
        <ul
          className="ml-6 space-y-1"
          data-testid={`tool-calls-${message.id}`}
        >
          {message.tool_calls.map((tc, i) => (
            <ToolCallBadge key={i} call={tc} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ToolCallBadge({ call }: { call: ChatToolCall }) {
  const preview = formatArgs(call.arguments);
  return (
    <li
      data-tool-name={call.name}
      className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 text-xs text-muted-foreground"
    >
      <Wrench className="h-3 w-3" aria-hidden />
      <span className="font-mono">{call.name}</span>
      {preview ? (
        <span className="truncate opacity-70" title={preview}>
          {preview}
        </span>
      ) : null}
    </li>
  );
}

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args).slice(0, 3);
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${k}=${stringify(v)}`).join(", ");
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return `"${v.slice(0, 24)}"`;
  return String(v).slice(0, 24);
}
