'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

interface WorkItemResult {
  id: number;
  name: string;
  article: string;
  unit: string;
  hours: string | number;
  section_name?: string;
  section?: { id: number; name: string };
  grade?: { id: number; grade: string };
  required_grade?: string | number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (workItem: {
    id: number;
    name: string;
    article: string;
    hours: string;
    unit: string;
    section_name: string;
    required_grade: string;
    calculated_cost: string | null;
  }) => void;
  itemName?: string;
}

export function WorkItemPicker({ open, onOpenChange, onSelect, itemName }: Props) {
  const [search, setSearch] = useState(itemName || '');
  const [results, setResults] = useState<WorkItemResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize search with item name
  useEffect(() => {
    if (open && itemName) {
      setSearch(itemName);
    }
  }, [open, itemName]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (search.length < 2) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`/api/erp/work-items/?search=${encodeURIComponent(search)}&page_size=20`, { headers });
        if (res.ok) {
          const data = await res.json();
          setResults(Array.isArray(data) ? data : data.results || []);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, open]);

  const handleSelect = (wi: WorkItemResult) => {
    onSelect({
      id: wi.id,
      name: wi.name,
      article: wi.article,
      hours: String(wi.hours || 0),
      unit: wi.unit || '',
      section_name: wi.section?.name || wi.section_name || '',
      required_grade: String(wi.grade?.grade || wi.required_grade || ''),
      calculated_cost: null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Подбор работы вручную</DialogTitle>
          <DialogDescription>
            Найдите и выберите подходящую расценку из каталога работ
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Поиск по наименованию или артикулу..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {loading && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            Поиск...
          </div>
        )}

        {!loading && results.length === 0 && search.length >= 2 && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            Ничего не найдено
          </div>
        )}

        {results.length > 0 && (
          <div className="max-h-[50vh] overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Артикул</TableHead>
                  <TableHead>Наименование</TableHead>
                  <TableHead className="w-24">Раздел</TableHead>
                  <TableHead className="w-16">Ед.</TableHead>
                  <TableHead className="w-16">Часы</TableHead>
                  <TableHead className="w-16">Разряд</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((wi) => (
                  <TableRow
                    key={wi.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSelect(wi)}
                  >
                    <TableCell className="text-xs font-mono">
                      {wi.article}
                    </TableCell>
                    <TableCell className="text-xs">
                      {wi.name}
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="text-[10px]">
                        {wi.section?.name || wi.section_name || ''}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{wi.unit}</TableCell>
                    <TableCell className="text-xs">{wi.hours}</TableCell>
                    <TableCell className="text-xs">
                      {wi.grade?.grade || wi.required_grade || ''}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(wi);
                        }}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
