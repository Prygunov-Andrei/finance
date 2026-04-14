import { useQuery } from '@tanstack/react-query';

export interface CommitEntry {
  scope: string;
  subject: string;
  sha: string;
  author: string;
  breaking: boolean;
}

export interface CommitGroups {
  features: CommitEntry[];
  fixes: CommitEntry[];
  refactors: CommitEntry[];
  other: CommitEntry[];
}

export interface Release {
  version: string;
  released_at: string | null;
  git_sha: string;
  description: string;
  groups: CommitGroups;
}

export interface VersionInfo {
  current: string;
  releases: Release[];
}

export const GROUP_LABELS: Record<keyof CommitGroups, string> = {
  features: 'Добавлено',
  fixes: 'Исправлено',
  refactors: 'Улучшено',
  other: 'Прочее',
};

export async function fetchVersion(): Promise<VersionInfo> {
  const response = await fetch('/api/erp/version/', {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Не удалось загрузить версию: HTTP ${response.status}`);
  }
  return response.json();
}

export function useVersion() {
  return useQuery<VersionInfo>({
    queryKey: ['system', 'version'],
    queryFn: fetchVersion,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
