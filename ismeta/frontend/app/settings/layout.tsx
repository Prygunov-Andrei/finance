import * as React from "react";

import { ClientTabLink } from "./_tab-link";

const TABS = [{ href: "/settings/llm", label: "Модели LLM" }] as const;

// Settings layout с верхними табами. Пока вкладка одна — список расширим
// когда появятся другие settings-разделы (workspace, профиль и т.п.).
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight">Настройки</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Настройки workspace и распознавания.
        </p>
        <nav
          className="-mb-4 -mx-6 mt-3 flex gap-1 border-b px-6"
          aria-label="Settings tabs"
        >
          {TABS.map((tab) => (
            <ClientTabLink key={tab.href} href={tab.href} label={tab.label} />
          ))}
        </nav>
      </div>
      <div className="flex-1 overflow-y-auto p-6">{children}</div>
    </div>
  );
}
