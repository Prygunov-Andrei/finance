import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { api, type ContractText } from '@/lib/api';
import { CONSTANTS } from '../../constants';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Save, Eye, Edit2, Plus, History } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

type ContractTextEditorProps = {
  contractId: number;
  amendmentId?: number;
};

export const ContractTextEditor: React.FC<ContractTextEditorProps> = ({
  contractId,
  amendmentId,
}) => {
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [content, setContent] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);

  const { data: texts = [], isLoading } = useQuery({
    queryKey: ['contract-texts', contractId],
    queryFn: () => api.getContractTexts(contractId),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const currentText = selectedVersionId
    ? texts.find((t: ContractText) => t.id === selectedVersionId)
    : texts[0];

  const createTextMutation = useMutation({
    mutationFn: () =>
      api.createContractText({
        contract: contractId,
        content_md: content,
        amendment: amendmentId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-texts', contractId] });
      setEditMode(false);
      toast.success('Версия текста сохранена');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка'),
  });

  const updateTextMutation = useMutation({
    mutationFn: () => {
      if (!currentText) throw new Error('Нет текста для обновления');
      return api.updateContractText(currentText.id, { content_md: content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-texts', contractId] });
      setEditMode(false);
      toast.success('Текст обновлён');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка'),
  });

  const handleStartEdit = useCallback(() => {
    setContent(currentText?.content_md || '');
    setEditMode(true);
  }, [currentText]);

  const handleSave = useCallback(() => {
    if (currentText) {
      updateTextMutation.mutate();
    } else {
      createTextMutation.mutate();
    }
  }, [currentText, updateTextMutation, createTextMutation]);

  const handleNewVersion = useCallback(() => {
    setContent(currentText?.content_md || '');
    createTextMutation.mutate();
  }, [currentText, createTextMutation]);

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {texts.length > 0 && (
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <select
              className="border rounded-md px-2 py-1 text-sm bg-background"
              value={selectedVersionId || texts[0]?.id || ''}
              onChange={(e) => setSelectedVersionId(Number(e.target.value))}
            >
              {texts.map((t: ContractText) => (
                <option key={t.id} value={t.id}>
                  v{t.version} — {formatDate(t.created_at)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="ml-auto flex gap-2">
          {!editMode ? (
            <>
              <Button size="sm" variant="outline" onClick={handleStartEdit}>
                <Edit2 className="h-4 w-4 mr-1" />
                {texts.length > 0 ? 'Редактировать' : 'Создать'}
              </Button>
              {texts.length > 0 && (
                <Button size="sm" variant="outline" onClick={handleNewVersion}>
                  <Plus className="h-4 w-4 mr-1" />
                  Новая версия
                </Button>
              )}
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>
                Отмена
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={createTextMutation.isPending || updateTextMutation.isPending}
              >
                {(createTextMutation.isPending || updateTextMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                )}
                <Save className="h-4 w-4 mr-1" />
                Сохранить
              </Button>
            </>
          )}
        </div>
      </div>

      {editMode ? (
        <Tabs defaultValue="edit">
          <TabsList>
            <TabsTrigger value="edit">
              <Edit2 className="h-4 w-4 mr-1" />
              Редактор
            </TabsTrigger>
            <TabsTrigger value="preview">
              <Eye className="h-4 w-4 mr-1" />
              Предпросмотр
            </TabsTrigger>
          </TabsList>
          <TabsContent value="edit">
            <textarea
              className="w-full min-h-[400px] border rounded-md p-4 text-sm font-mono bg-background resize-y"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Введите текст договора в формате Markdown..."
            />
          </TabsContent>
          <TabsContent value="preview">
            <div className="prose prose-sm max-w-none border rounded-md p-6 bg-white min-h-[400px]">
              <ReactMarkdown>{content || '*Пустой текст*'}</ReactMarkdown>
            </div>
          </TabsContent>
        </Tabs>
      ) : currentText ? (
        <div className="prose prose-sm max-w-none border rounded-md p-6 bg-white">
          <ReactMarkdown>{currentText.content_md}</ReactMarkdown>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground border rounded-md">
          Текст договора ещё не добавлен.
          <br />
          <Button size="sm" className="mt-3" onClick={handleStartEdit}>
            <Plus className="h-4 w-4 mr-1" />
            Добавить текст
          </Button>
        </div>
      )}
    </div>
  );
};
