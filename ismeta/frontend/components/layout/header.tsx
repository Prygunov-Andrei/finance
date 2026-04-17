import { ThemeToggle } from "./theme-toggle";

export function Header({ workspaceName = "Август Климат" }: { workspaceName?: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background px-6">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Workspace:</span>
        <span className="text-sm font-medium">{workspaceName}</span>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <div
          className="h-8 w-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium"
          aria-label="Профиль"
        >
          A
        </div>
      </div>
    </header>
  );
}
