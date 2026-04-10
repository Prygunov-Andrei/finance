import type { ProjectNote } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export function generateNotesMarkdown(projectName: string, notes: ProjectNote[]): string {
  const lines = [`# Замечания к проекту ${projectName}\n`];
  for (const note of notes) {
    lines.push(`## ${note.author.username} — ${formatDate(note.created_at)}\n`);
    lines.push(note.text);
    lines.push('\n---\n');
  }
  return lines.join('\n');
}

export function downloadNotesAsMarkdown(projectName: string, cipher: string | number, notes: ProjectNote[]) {
  const md = generateNotesMarkdown(projectName, notes);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `замечания-${cipher}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
