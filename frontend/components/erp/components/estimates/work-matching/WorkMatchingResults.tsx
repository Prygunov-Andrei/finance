'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  WorkMatchingAlternative,
  WorkMatchingResult,
  WorkMatchingSource,
} from '@/lib/api/types/estimates';

const SOURCE_CONFIG: Record<WorkMatchingSource, { label: string; color: string }> = {
  default: { label: 'По умолч.', color: 'bg-emerald-600 text-white' },
  history: { label: 'История', color: 'bg-green-500 text-white' },
  pricelist: { label: 'Прайс', color: 'bg-blue-500 text-white' },
  knowledge: { label: 'Знания', color: 'bg-cyan-500 text-white' },
  category: { label: 'Категория', color: 'bg-yellow-500 text-black' },
  fuzzy: { label: 'Fuzzy', color: 'bg-orange-500 text-white' },
  llm: { label: 'LLM', color: 'bg-purple-500 text-white' },
  web: { label: 'Web', color: 'bg-pink-500 text-white' },
  unmatched: { label: 'Не найдено', color: 'bg-red-500 text-white' },
};

const SOURCE_LABELS: Record<string, string> = {
  default: 'По умолч.', history: 'История', pricelist: 'Прайс',
  knowledge: 'База знаний', category: 'Категория', fuzzy: 'Fuzzy',
  llm: 'LLM', web: 'Web', unmatched: 'Не найдено',
};

interface Props {
  results: WorkMatchingResult[];
  stats: Record<string, number>;
  manHoursTotal: string;
  onApply: (accepted: Array<{ item_id: number; work_item_id: number | null; work_price?: string }>) => void;
}

export function WorkMatchingResults({ results, stats, manHoursTotal, onApply }: Props) {
  const [accepted, setAccepted] = useState<Set<number>>(() => {
    const set = new Set<number>();
    for (const r of results) {
      if (r.matched_work && r.confidence >= 0.7) set.add(r.item_id);
    }
    return set;
  });
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [searchFilter, setSearchFilter] = useState('');

  const toggle = (id: number) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const acceptAll70 = () => {
    const set = new Set<number>();
    for (const r of results) {
      if (r.matched_work && r.confidence >= 0.7) set.add(r.item_id);
    }
    setAccepted(set);
  };

  const handleApply = () => {
    const items = results
      .filter((r) => accepted.has(r.item_id) && r.matched_work)
      .map((r) => ({
        item_id: r.item_id,
        work_item_id: r.matched_work!.id,
        work_price: r.matched_work!.calculated_cost || undefined,
      }));
    onApply(items);
  };

  const matched = results.filter((r) => r.source !== 'unmatched').length;
  const total = results.length;
  const matchPct = total > 0 ? Math.round((matched / total) * 100) : 0;

  const filtered = searchFilter
    ? results.filter((r) =>
        r.item_name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (r.matched_work?.name || '').toLowerCase().includes(searchFilter.toLowerCase()))
    : results;

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">Найдено: {matched}/{total} ({matchPct}%)</Badge>
        <Badge variant="outline">Принято: {accepted.size}</Badge>
        <Badge variant="outline">Чел-часы: {manHoursTotal}</Badge>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={acceptAll70}>
          Принять все &gt;70%
        </Button>
      </div>

      {/* Stats breakdown by source */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(stats).map(([source, count]) =>
          count > 0 ? (
            <Badge key={source} className={`text-xs ${SOURCE_CONFIG[source as WorkMatchingSource]?.color || 'bg-muted'}`}>
              {SOURCE_LABELS[source] || source}: {count}
            </Badge>
          ) : null,
        )}
      </div>

      {/* Search filter */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8 h-9"
          placeholder="Поиск по позиции или работе..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
        />
      </div>

      {/* Results table */}
      <div className="max-h-[50vh] overflow-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="w-6" />
              <TableHead>Позиция сметы</TableHead>
              <TableHead>Работа</TableHead>
              <TableHead className="w-20">Арт.</TableHead>
              <TableHead className="w-16">Часы</TableHead>
              <TableHead className="w-20">Источник</TableHead>
              <TableHead className="w-16">Увер.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => {
              const cfg = SOURCE_CONFIG[r.source];
              const hasAlternatives = r.alternatives && r.alternatives.length > 0;
              const isExpanded = expandedRows.has(r.item_id);

              return (
                <>
                  <TableRow key={r.item_id} className={r.source === 'unmatched' ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                    <TableCell>
                      {r.matched_work && (
                        <Checkbox checked={accepted.has(r.item_id)} onCheckedChange={() => toggle(r.item_id)} />
                      )}
                    </TableCell>
                    <TableCell className="px-0">
                      {hasAlternatives && (
                        <button onClick={() => toggleExpand(r.item_id)} className="p-0.5 hover:bg-muted rounded">
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs">{r.item_name}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs">
                      {r.matched_work?.name || <span className="text-red-500 italic">не найдено</span>}
                    </TableCell>
                    <TableCell className="text-xs">{r.matched_work?.article || ''}</TableCell>
                    <TableCell className="text-xs">{r.matched_work?.hours || ''}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${cfg.color}`}>{cfg.label}</Badge>
                    </TableCell>
                    <TableCell><ConfidenceBadge value={r.confidence} /></TableCell>
                  </TableRow>
                  {/* Expandable alternatives */}
                  {isExpanded && hasAlternatives && (
                    <AlternativesRows
                      alternatives={r.alternatives}
                      itemId={r.item_id}
                      onSelect={(altId) => {
                        // User picked an alternative — not yet implemented (would need WorkItem details fetch)
                        // For now just show them
                      }}
                    />
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Apply button */}
      <div className="flex justify-end gap-2">
        <Button onClick={handleApply} disabled={accepted.size === 0}>
          Применить ({accepted.size})
        </Button>
      </div>
    </div>
  );
}

function AlternativesRows({
  alternatives,
  itemId,
  onSelect,
}: {
  alternatives: WorkMatchingAlternative[];
  itemId: number;
  onSelect: (altId: number) => void;
}) {
  return (
    <>
      {alternatives.map((alt) => (
        <TableRow key={`${itemId}-alt-${alt.id}`} className="bg-muted/30">
          <TableCell />
          <TableCell />
          <TableCell className="text-xs text-muted-foreground pl-6">
            Альтернатива
          </TableCell>
          <TableCell className="text-xs text-muted-foreground">
            {alt.name}
          </TableCell>
          <TableCell className="text-xs text-muted-foreground">
            {alt.article}
          </TableCell>
          <TableCell />
          <TableCell />
          <TableCell>
            <ConfidenceBadge value={alt.confidence} />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  if (pct >= 80) return <Badge className="bg-green-100 text-green-800 text-[10px]">{pct}%</Badge>;
  if (pct >= 60) return <Badge className="bg-yellow-100 text-yellow-800 text-[10px]">{pct}%</Badge>;
  return <Badge className="bg-red-100 text-red-800 text-[10px]">{pct}%</Badge>;
}
