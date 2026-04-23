"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type InputType = "text" | "number";

interface Props {
  value: string;
  type?: InputType;
  align?: "left" | "right";
  disabled?: boolean;
  display?: (v: string) => React.ReactNode;
  onCommit: (next: string) => void;
  /**
   * Дополнительные классы для display-кнопки. По умолчанию применяется
   * `truncate` (однострочный ellipsis), но для колонок с переносом текста
   * (UI-08 — name, comments) нужен `whitespace-normal break-words`.
   */
  className?: string;
}

export function EditableCell({
  value,
  type = "text",
  align = "left",
  disabled,
  display,
  onCommit,
  className,
}: Props) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <Input
        autoFocus
        type={type}
        step={type === "number" ? "any" : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") cancel();
        }}
        className={cn(
          "h-8 px-2 text-sm",
          align === "right" && "text-right tabular-nums",
        )}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && setEditing(true)}
      className={cn(
        "block w-full rounded px-2 py-1 text-left text-sm transition-colors",
        // Если вызывающий не задал свой вариант переноса — оставляем truncate
        // (однострочный ellipsis), чтобы числовые/короткие колонки не прыгали.
        !className && "truncate",
        align === "right" && "text-right tabular-nums",
        !disabled && "hover:bg-accent/50",
        disabled && "cursor-default opacity-70",
        className,
      )}
    >
      {display ? display(value) : value || <span className="text-muted-foreground">—</span>}
    </button>
  );
}
