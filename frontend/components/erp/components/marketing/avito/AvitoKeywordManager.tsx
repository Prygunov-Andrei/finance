'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

import { api } from '@/lib/api';
import { CONSTANTS } from '@/constants';

export function AvitoKeywordManager() {
  const queryClient = useQueryClient();
  const [newKeyword, setNewKeyword] = useState('');

  const { data: keywords = [] } = useQuery({
    queryKey: ['avito-keywords'],
    queryFn: () => api.marketing.getAvitoKeywords(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const createMutation = useMutation({
    mutationFn: (keyword: string) => api.marketing.createAvitoKeyword(keyword),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avito-keywords'] });
      setNewKeyword('');
      toast.success('Ключевое слово добавлено');
    },
    onError: (err: Error) => toast.error(`Ошибка: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.marketing.deleteAvitoKeyword(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avito-keywords'] });
    },
  });

  const handleAdd = () => {
    const trimmed = newKeyword.trim();
    if (!trimmed) return;
    createMutation.mutate(trimmed);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={newKeyword}
          onChange={e => setNewKeyword(e.target.value)}
          placeholder="Новое ключевое слово..."
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          className="max-w-xs"
        />
        <Button size="sm" onClick={handleAdd} disabled={createMutation.isPending || !newKeyword.trim()}>
          <Plus className="w-4 h-4 mr-1" /> Добавить
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {keywords.map(kw => (
          <Badge key={kw.id} variant="secondary" className="flex items-center gap-1 pr-1">
            {kw.keyword}
            {kw.results_count > 0 && (
              <span className="text-xs opacity-60 ml-1">({kw.results_count})</span>
            )}
            <button
              onClick={() => deleteMutation.mutate(kw.id)}
              className="ml-1 hover:text-red-500 rounded"
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
        {keywords.length === 0 && (
          <span className="text-sm text-muted-foreground">Нет ключевых слов</span>
        )}
      </div>
    </div>
  );
}
