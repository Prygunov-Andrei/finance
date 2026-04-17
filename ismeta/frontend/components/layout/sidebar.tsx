"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/estimates", label: "Сметы", icon: FileSpreadsheet },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r bg-card">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="h-7 w-7 rounded bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
          IS
        </div>
        <span className="font-semibold tracking-tight">ISMeta</span>
      </div>
      <nav className="flex-1 p-2">
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3 text-xs text-muted-foreground">
        dev · v0.1
      </div>
    </aside>
  );
}
