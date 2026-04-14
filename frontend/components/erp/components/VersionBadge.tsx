'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/components/ui/utils';
import { useVersion } from '@/lib/api/version';

import { ChangelogView } from './ChangelogView';

interface VersionBadgeProps {
  /**
   * `inline` — просто кликабельная строка "Версия · v1.2.3" (для пунктов в меню/списках).
   * `chip` — только Badge с версией (для компактных мест в UI).
   */
  variant?: 'inline' | 'chip';
  className?: string;
  /** Отключает клик + Dialog (например, если badge уже внутри DropdownMenuItem). */
  renderTriggerOnly?: boolean;
}

export function VersionBadge({
  variant = 'inline',
  className,
  renderTriggerOnly = false,
}: VersionBadgeProps) {
  const { data } = useVersion();
  const [open, setOpen] = useState(false);

  const current = data?.current ?? 'dev';

  const content =
    variant === 'chip' ? (
      <Badge variant="outline" className={cn('font-mono text-xs', className)}>
        {current}
      </Badge>
    ) : (
      <span
        className={cn(
          'inline-flex w-full items-center gap-2 text-sm',
          !renderTriggerOnly && 'cursor-pointer',
          className,
        )}
      >
        <Info className="h-4 w-4" />
        <span>Версия</span>
        <Badge variant="outline" className="ml-auto font-mono text-xs">
          {current}
        </Badge>
      </span>
    );

  if (renderTriggerOnly) {
    return content;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-2 rounded-md px-2 py-1 transition hover:bg-muted',
          variant === 'chip' ? '' : 'w-full',
        )}
      >
        {content}
      </button>
      <ChangelogDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

interface ChangelogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangelogDialog({ open, onOpenChange }: ChangelogDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>История релизов</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto pr-2" style={{ maxHeight: 'calc(85vh - 120px)' }}>
          <ChangelogView limit={10} showHeader />
        </div>
      </DialogContent>
    </Dialog>
  );
}
