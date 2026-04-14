'use client';

import { AlertTriangle, Circle, RefreshCw, Sparkles, Wrench } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CommitEntry,
  CommitGroups,
  GROUP_LABELS,
  Release,
  useVersion,
} from '@/lib/api/version';

const GROUP_ORDER: (keyof CommitGroups)[] = ['features', 'fixes', 'refactors', 'other'];

const GROUP_ICONS: Record<keyof CommitGroups, typeof Sparkles> = {
  features: Sparkles,
  fixes: Wrench,
  refactors: RefreshCw,
  other: Circle,
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function CommitRow({ commit }: { commit: CommitEntry }) {
  return (
    <li className="flex items-baseline gap-2 text-sm leading-relaxed">
      {commit.scope && (
        <Badge variant="secondary" className="shrink-0 text-[11px] font-mono">
          {commit.scope}
        </Badge>
      )}
      <span className="flex-1">
        {commit.breaking && (
          <span className="mr-1 inline-flex items-center gap-0.5 text-xs font-semibold text-destructive">
            <AlertTriangle className="h-3 w-3" />
            BREAKING
          </span>
        )}
        {commit.subject}
      </span>
      {commit.sha && (
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{commit.sha}</span>
      )}
    </li>
  );
}

function ReleaseCard({ release }: { release: Release }) {
  const nonEmptyGroups = GROUP_ORDER.filter((key) => release.groups[key]?.length);

  return (
    <Card className="border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-lg">{release.version}</span>
          <span className="text-sm font-normal text-muted-foreground">
            {formatDate(release.released_at)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {release.description && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{release.description}</ReactMarkdown>
          </div>
        )}
        {nonEmptyGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Изменений в этом релизе не зафиксировано.
          </p>
        ) : (
          nonEmptyGroups.map((key) => {
            const Icon = GROUP_ICONS[key];
            const items = release.groups[key];
            return (
              <section key={key} className="space-y-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className="h-4 w-4" />
                  {GROUP_LABELS[key]}
                  <span className="text-xs font-normal text-muted-foreground">
                    · {items.length}
                  </span>
                </h4>
                <ul className="space-y-1.5 pl-6">
                  {items.map((commit, idx) => (
                    <CommitRow key={`${commit.sha}-${idx}`} commit={commit} />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

interface ChangelogViewProps {
  limit?: number;
  showHeader?: boolean;
}

export function ChangelogView({ limit, showHeader = true }: ChangelogViewProps) {
  const { data, isLoading, isError, error } = useVersion();

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">Загрузка истории релизов...</div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
        Не удалось загрузить changelog: {error instanceof Error ? error.message : 'неизвестная ошибка'}
      </div>
    );
  }

  const releases = limit ? data?.releases.slice(0, limit) : data?.releases;

  return (
    <div className="space-y-4">
      {showHeader && data?.current && (
        <div className="flex items-baseline gap-3">
          <span className="text-sm text-muted-foreground">Текущая версия:</span>
          <Badge variant="outline" className="font-mono">
            {data.current}
          </Badge>
        </div>
      )}
      {!releases || releases.length === 0 ? (
        <div className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Пока нет записей о релизах. Первая запись появится после следующего деплоя.
        </div>
      ) : (
        <div className="space-y-3">
          {releases.map((release) => (
            <ReleaseCard key={release.version} release={release} />
          ))}
        </div>
      )}
    </div>
  );
}
