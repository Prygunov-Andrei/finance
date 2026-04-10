'use client';

import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Search, ArrowLeftRight, SearchCode } from 'lucide-react';
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
import { WorkItemPicker } from './WorkItemPicker';

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
  onApply: (accepted: Array<{ item_id: number; work_item_id: number | null; work_price?: string }>, rejected?: Array<{ item_id: number; work_item_id: number }>) => void;
}

export function WorkMatchingResults({ results: initialResults, stats, manHoursTotal, onApply }: Props) {
  // Mutable local state for results (to allow alternative selection)
  const [results, setResults] = useState<WorkMatchingResult[]>(initialResults);

  const [accepted, setAccepted] = useState<Set<number>>(() => {
    const set = new Set<number>();
    for (const r of initialResults) {
      if (r.matched_work && r.confidence >= 0.7) set.add(r.item_id);
    }
    return set;
  });
  // Track which items were initially auto-accepted (for rejection detection)
  const [initiallyAccepted] = useState<Set<number>>(() => {
    const set = new Set<number>();
    for (const r of initialResults) {
      if (r.matched_work && r.confidence >= 0.7) set.add(r.item_id);
    }
    return set;
  });

  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [searchFilter, setSearchFilter] = useState('');
  const [pickerItemId, setPickerItemId] = useState<number | null>(null);
  const [pickerItemName, setPickerItemName] = useState('');

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

  const selectAlternative = useCallback((itemId: number, alt: WorkMatchingAlternative) => {
    setResults((prev) =>
      prev.map((r) => {
        if (r.item_id !== itemId) return r;

        const oldMatch = r.matched_work;
        const newMatch = {
          id: alt.id,
          name: alt.name,
          article: alt.article,
          section_name: alt.section_name || '',
          hours: alt.hours || '0',
          required_grade: alt.required_grade || '',
          unit: alt.unit || '',
          calculated_cost: alt.calculated_cost ?? null,
        };

        // Move old match to alternatives (if it existed), remove selected alt
        const newAlternatives = r.alternatives.filter((a) => a.id !== alt.id);
        if (oldMatch) {
          newAlternatives.unshift({
            id: oldMatch.id,
            name: oldMatch.name,
            article: oldMatch.article,
            hours: oldMatch.hours,
            unit: oldMatch.unit,
            section_name: oldMatch.section_name,
            required_grade: oldMatch.required_grade,
            calculated_cost: oldMatch.calculated_cost,
            confidence: r.confidence,
          });
        }

        return {
          ...r,
          matched_work: newMatch,
          alternatives: newAlternatives.slice(0, 5),
          confidence: alt.confidence,
          source: 'manual' as WorkMatchingSource,
        };
      }),
    );
    // Auto-accept the item
    setAccepted((prev) => new Set(prev).add(itemId));
  }, []);

  const handlePickerSelect = useCallback((workItem: {
    id: number; name: string; article: string; hours: string;
    unit: string; section_name: string; required_grade: string;
    calculated_cost: string | null;
  }) => {
    if (pickerItemId === null) return;
    selectAlternative(pickerItemId, {
      id: workItem.id,
      name: workItem.name,
      article: workItem.article,
      hours: workItem.hours,
      unit: workItem.unit,
      section_name: workItem.section_name,
      required_grade: workItem.required_grade,
      calculated_cost: workItem.calculated_cost,
      confidence: 1.0,
    });
    setPickerItemId(null);
  }, [pickerItemId, selectAlternative]);

  const handleApply = () => {
    const acceptedItems = results
      .filter((r) => accepted.has(r.item_id) && r.matched_work)
      .map((r) => ({
        item_id: r.item_id,
        work_item_id: r.matched_work!.id,
        work_price: r.matched_work!.calculated_cost || undefined,
      }));

    // Collect rejected items: those that were initially auto-accepted but user unchecked
    const rejectedItems = results
      .filter((r) => initiallyAccepted.has(r.item_id) && !accepted.has(r.item_id) && r.matched_work)
      .map((r) => ({
        item_id: r.item_id,
        work_item_id: r.matched_work!.id,
      }));

    onApply(acceptedItems, rejectedItems.length > 0 ? rejectedItems : undefined);
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
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => {
              const cfg = SOURCE_CONFIG[r.source] || SOURCE_CONFIG.unmatched;
              const hasAlternatives = r.alternatives && r.alternatives.length > 0;
              const isExpanded = expandedRows.has(r.item_id);

              return (
                <React.Fragment key={r.item_id}>
                  <TableRow className={r.source === 'unmatched' ? 'bg-red-50 dark:bg-red-950/20' : ''}>
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
                    <TableCell className="px-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => { setPickerItemId(r.item_id); setPickerItemName(r.item_name); }}
                        title="Подобрать вручную"
                      >
                        <SearchCode className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {/* Expandable alternatives */}
                  {isExpanded && hasAlternatives && (
                    <AlternativesRows
                      alternatives={r.alternatives}
                      itemId={r.item_id}
                      onSelect={(alt) => selectAlternative(r.item_id, alt)}
                    />
                  )}
                </React.Fragment>
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

      {/* Work item picker dialog */}
      <WorkItemPicker
        open={pickerItemId !== null}
        onOpenChange={(open) => { if (!open) setPickerItemId(null); }}
        onSelect={handlePickerSelect}
        itemName={pickerItemName}
      />
    </div>
  );
}

import React from 'react';

function AlternativesRows({
  alternatives,
  itemId,
  onSelect,
}: {
  alternatives: WorkMatchingAlternative[];
  itemId: number;
  onSelect: (alt: WorkMatchingAlternative) => void;
}) {
  return (
    <>
      {alternatives.map((alt) => (
        <TableRow key={`${itemId}-alt-${alt.id}`} className="bg-muted/30">
          <TableCell>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => onSelect(alt)}
              title="Выбрать эту работу"
            >
              <ArrowLeftRight className="h-3 w-3" />
            </Button>
          </TableCell>
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
          <TableCell className="text-xs text-muted-foreground">
            {alt.hours || ''}
          </TableCell>
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
