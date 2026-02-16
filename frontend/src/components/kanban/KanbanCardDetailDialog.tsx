import React, { useEffect, useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  kanbanApi,
  KanbanCard,
  KanbanColumn,
  CommercialCase,
  CardColor,
  KanbanAttachment,
} from '../../lib/kanbanApi';
import { api } from '../../lib/api';
import type { Counterparty, ConstructionObject } from '../../lib/api';
import { useObjects, useCounterparties } from '../../hooks/useReferenceData';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { PlusCircle } from 'lucide-react';
import { toast } from 'sonner';
import { QuickCreateCounterpartyDialog } from './QuickCreateCounterpartyDialog';
import { QuickCreateObjectDialog } from './QuickCreateObjectDialog';

type Props = {
  card: KanbanCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allColumns: KanbanColumn[];
  onUpdated: () => void;
};

const COLORS: { value: CardColor; label: string; bg: string; border: string; dashed?: boolean }[] = [
  { value: null, label: 'Без цвета', bg: '#e5e7eb', border: '#9ca3af', dashed: true },
  { value: 'red', label: 'Красный', bg: '#fca5a5', border: '#f87171' },
  { value: 'yellow', label: 'Жёлтый', bg: '#fcd34d', border: '#fbbf24' },
  { value: 'blue', label: 'Голубой', bg: '#93c5fd', border: '#60a5fa' },
  { value: 'green', label: 'Зелёный', bg: '#86efac', border: '#4ade80' },
];

const computeSha256 = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const KanbanCardDetailDialog = ({ card, open, onOpenChange, allColumns, onUpdated }: Props) => {
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [color, setColor] = useState<CardColor>(null);
  const [objectId, setObjectId] = useState('');
  const [objectName, setObjectName] = useState('');
  const [systemName, setSystemName] = useState('');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [contactsInfo, setContactsInfo] = useState('');
  const [comments, setComments] = useState('');
  const [tkpIds, setTkpIds] = useState<number[]>([]);
  const [newTkpId, setNewTkpId] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isQuickCreateCPOpen, setIsQuickCreateCPOpen] = useState(false);
  const [isQuickCreateObjOpen, setIsQuickCreateObjOpen] = useState(false);

  const cardId = card?.id || null;

  const commercialCaseQuery = useQuery({
    queryKey: ['kanban', 'commercial-case', cardId],
    enabled: Boolean(cardId) && open,
    queryFn: () => kanbanApi.getCommercialCaseByCard(cardId as string),
  });

  const attachmentsQuery = useQuery({
    queryKey: ['kanban', 'attachments', cardId],
    enabled: Boolean(cardId) && open,
    queryFn: () => kanbanApi.getCardAttachments(cardId as string),
  });

  const { data: objectsData } = useObjects();
  const objects = Array.isArray(objectsData) ? objectsData : (objectsData as any)?.results ?? [];

  const { data: counterpartiesData } = useCounterparties();
  const allCounterparties = Array.isArray(counterpartiesData)
    ? counterpartiesData
    : (counterpartiesData as any)?.results ?? [];
  const potentialCustomers = allCounterparties.filter(
    (c: any) => c.type === 'potential_customer' || c.type === 'customer',
  );

  const tkpListQuery = useQuery({
    queryKey: ['technical-proposals-for-kanban', tkpIds],
    enabled: tkpIds.length > 0 && open,
    queryFn: () => api.getTechnicalProposals(),
    staleTime: 60_000,
  });

  const tkpItems = (tkpListQuery.data as any)?.results ?? tkpListQuery.data ?? [];
  const linkedTkps = Array.isArray(tkpItems)
    ? tkpItems.filter((t: any) => tkpIds.includes(t.id))
    : [];

  useEffect(() => {
    if (!card || !open) return;
    setTitle(card.title || '');
    setColor((card.meta?.color as CardColor) || null);
    setObjectId(card.meta?.erp_object_id ? String(card.meta.erp_object_id) : '');
    setObjectName(card.meta?.erp_object_name || '');
    setSystemName(card.meta?.system_name || '');
  }, [card, open]);

  useEffect(() => {
    const cc = commercialCaseQuery.data;
    if (!cc) return;
    setCounterpartyId(cc.erp_counterparty_id ? String(cc.erp_counterparty_id) : '');
    setCounterpartyName(cc.erp_counterparty_name || '');
    setContactsInfo(cc.contacts_info || '');
    setComments(cc.comments || '');
    setTkpIds(cc.erp_tkp_ids || []);
    if (cc.erp_object_id && !objectId) {
      setObjectId(String(cc.erp_object_id));
      setObjectName(cc.erp_object_name || '');
    }
    if (cc.system_name && !systemName) {
      setSystemName(cc.system_name);
    }
  }, [commercialCaseQuery.data]);

  const updateCardMutation = useMutation({
    mutationFn: async () => {
      if (!cardId) throw new Error('Нет ID карточки');
      await kanbanApi.updateCard(cardId, {
        title: title.trim(),
        meta: {
          ...(card?.meta || {}),
          color,
          erp_object_id: objectId ? Number(objectId) : null,
          erp_object_name: objectName,
          system_name: systemName,
        },
      });

      const cc = commercialCaseQuery.data;
      const caseData = {
        erp_object_id: objectId ? Number(objectId) : null,
        erp_object_name: objectName,
        system_name: systemName,
        erp_counterparty_id: counterpartyId ? Number(counterpartyId) : null,
        erp_counterparty_name: counterpartyName,
        erp_tkp_ids: tkpIds,
        contacts_info: contactsInfo,
        comments,
      };

      if (cc) {
        await kanbanApi.updateCommercialCase(cc.id, caseData);
      } else {
        await kanbanApi.createCommercialCase({ card: cardId, ...caseData });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kanban', 'commercial-case', cardId] });
      toast.success('Карточка сохранена');
      onUpdated();
    },
    onError: (err: any) => {
      console.error('Save card failed:', err);
      toast.error(`Ошибка сохранения: ${err?.message || 'Неизвестная ошибка'}`);
    },
  });

  const handleColorChange = useCallback(
    async (newColor: CardColor) => {
      setColor(newColor);
      if (!cardId) return;
      try {
        await kanbanApi.updateCard(cardId, {
          meta: { ...(card?.meta || {}), color: newColor },
        });
        onUpdated();
      } catch (err: any) {
        console.error('Color change failed:', err);
        toast.error(`Ошибка смены цвета: ${err?.message || 'Неизвестная ошибка'}`);
      }
    },
    [cardId, card?.meta, onUpdated],
  );

  const handleObjectChange = (value: string) => {
    const obj = objects.find((o: any) => String(o.id) === value);
    setObjectId(value);
    setObjectName(obj?.name || '');
  };

  const handleCounterpartyChange = (value: string) => {
    const cp = potentialCustomers.find((c: any) => String(c.id) === value);
    setCounterpartyId(value);
    setCounterpartyName(cp?.name || '');
    if (!contactsInfo && cp?.contact_info) setContactsInfo(cp.contact_info);
  };

  const handleCounterpartyCreated = (cp: Counterparty) => {
    setCounterpartyId(String(cp.id));
    setCounterpartyName(cp.name);
    if (!contactsInfo && cp.contact_info) setContactsInfo(cp.contact_info);
  };

  const handleObjectCreated = (obj: ConstructionObject) => {
    setObjectId(String(obj.id));
    setObjectName(obj.name);
  };

  const handleAddTkp = () => {
    const id = Number(newTkpId);
    if (id && !tkpIds.includes(id)) {
      setTkpIds((prev) => [...prev, id]);
      setNewTkpId('');
    }
  };

  const handleRemoveTkp = (id: number) => {
    setTkpIds((prev) => prev.filter((t) => t !== id));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !cardId) return;
    setIsUploading(true);
    try {
      const sha256 = await computeSha256(file);
      const initResp = await kanbanApi.initFileUpload({
        sha256,
        size_bytes: file.size,
        mime_type: file.type || 'application/octet-stream',
        original_filename: file.name,
      });

      if (!initResp.already_exists) {
        await fetch(initResp.upload_url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });
        await kanbanApi.finalizeFileUpload(initResp.file.id);
      }

      await kanbanApi.attachFileToCard(cardId, initResp.file.id, { title: file.name });
      qc.invalidateQueries({ queryKey: ['kanban', 'attachments', cardId] });
    } catch (err) {
      console.error('File upload failed:', err);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleDownload = async (attachment: KanbanAttachment) => {
    try {
      const resp = await kanbanApi.getFileDownloadUrl(attachment.file);
      window.open(resp.download_url, '_blank');
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const attachments: KanbanAttachment[] = Array.isArray(attachmentsQuery.data)
    ? attachmentsQuery.data
    : [];

  if (!card) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Карточка</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 -mt-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 text-lg font-semibold border-none px-0 h-auto focus-visible:ring-0"
            aria-label="Название карточки"
          />
          <div className="flex items-center gap-2 shrink-0">
            {COLORS.map((c) => (
              <button
                key={c.value ?? 'none'}
                type="button"
                onClick={() => handleColorChange(c.value)}
                style={{
                  width: 28,
                  height: 28,
                  minWidth: 28,
                  minHeight: 28,
                  borderRadius: '50%',
                  backgroundColor: c.bg,
                  border: `2px ${c.dashed ? 'dashed' : 'solid'} ${c.border}`,
                  transition: 'transform 0.15s',
                  transform: color === c.value ? 'scale(1.15)' : undefined,
                  boxShadow: color === c.value ? `0 0 0 2px white, 0 0 0 4px ${c.border}` : undefined,
                  cursor: 'pointer',
                }}
                title={c.label}
                aria-label={`Цвет: ${c.label}`}
                tabIndex={0}
              />
            ))}
          </div>
        </div>

        <Tabs defaultValue="main" className="mt-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="main">Основное</TabsTrigger>
            <TabsTrigger value="tkp">ТКП</TabsTrigger>
            <TabsTrigger value="files">
              Файлы{attachments.length > 0 ? ` (${attachments.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value="comments">Комментарии</TabsTrigger>
          </TabsList>

          {/* --- Основное --- */}
          <TabsContent value="main" className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Объект</label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={() => setIsQuickCreateObjOpen(true)}
                  tabIndex={0}
                  aria-label="Создать новый объект"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Новый
                </Button>
              </div>
              <Select value={objectId} onValueChange={handleObjectChange}>
                <SelectTrigger aria-label="Выбрать объект">
                  <SelectValue placeholder="Выберите объект" />
                </SelectTrigger>
                <SelectContent>
                  {objects.map((obj: any) => (
                    <SelectItem key={obj.id} value={String(obj.id)}>
                      {obj.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="detail-system" className="text-sm font-medium">Система</label>
              <Input
                id="detail-system"
                placeholder="Вентиляция, Кондиционирование..."
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Потенциальный заказчик</label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={() => setIsQuickCreateCPOpen(true)}
                  tabIndex={0}
                  aria-label="Создать нового потенциального заказчика"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Новый
                </Button>
              </div>
              <Select value={counterpartyId} onValueChange={handleCounterpartyChange}>
                <SelectTrigger aria-label="Выбрать заказчика">
                  <SelectValue placeholder="Выберите контрагента" />
                </SelectTrigger>
                <SelectContent>
                  {potentialCustomers.map((cp: any) => (
                    <SelectItem key={cp.id} value={String(cp.id)}>
                      {cp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="detail-contacts" className="text-sm font-medium">Контакты</label>
              <Textarea
                id="detail-contacts"
                placeholder="ФИО, телефон, email..."
                value={contactsInfo}
                onChange={(e) => setContactsInfo(e.target.value)}
                rows={3}
              />
            </div>
          </TabsContent>

          {/* --- ТКП --- */}
          <TabsContent value="tkp" className="space-y-4 mt-4">
            <div className="text-sm font-medium">Привязанные ТКП</div>
            {tkpIds.length === 0 && (
              <div className="text-sm text-muted-foreground">Нет привязанных ТКП</div>
            )}
            <div className="space-y-2">
              {tkpIds.map((id) => {
                const tkp = linkedTkps.find((t: any) => t.id === id);
                return (
                  <div key={id} className="flex items-center justify-between border rounded-md p-2">
                    <div className="text-sm">
                      {tkp ? (
                        <span>
                          <span className="font-medium">#{tkp.number || id}</span>
                          {' — '}
                          {tkp.name || tkp.object_name || 'Без названия'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">ТКП #{id}</span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveTkp(id)}
                      aria-label={`Отвязать ТКП ${id}`}
                      tabIndex={0}
                    >
                      Убрать
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="ID ТКП"
                value={newTkpId}
                onChange={(e) => setNewTkpId(e.target.value)}
                type="number"
                className="w-32"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTkp();
                }}
              />
              <Button
                variant="outline"
                onClick={handleAddTkp}
                disabled={!newTkpId}
                tabIndex={0}
                aria-label="Добавить ТКП"
              >
                Добавить
              </Button>
            </div>
          </TabsContent>

          {/* --- Файлы --- */}
          <TabsContent value="files" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Вложения</div>
              <label className="cursor-pointer">
                <Button variant="outline" size="sm" disabled={isUploading} asChild>
                  <span>{isUploading ? 'Загрузка...' : '+ Загрузить файл'}</span>
                </Button>
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </label>
            </div>

            {attachments.length === 0 && (
              <div className="text-sm text-muted-foreground">Нет вложений</div>
            )}

            <div className="space-y-2">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between border rounded-md p-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {att.file_mime_type?.split('/')[1]?.toUpperCase() || 'FILE'}
                    </Badge>
                    <span className="text-sm truncate">
                      {att.title || att.file_original_filename || 'Без имени'}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownload(att)}
                    tabIndex={0}
                    aria-label={`Скачать ${att.file_original_filename}`}
                  >
                    Скачать
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* --- Комментарии --- */}
          <TabsContent value="comments" className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <label htmlFor="detail-comments" className="text-sm font-medium">Комментарии</label>
              <Textarea
                id="detail-comments"
                placeholder="Заметки, история, примечания..."
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={8}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-between items-center pt-4 border-t mt-4">
          <div className="text-xs text-muted-foreground">
            {card.created_at && `Создано: ${new Date(card.created_at).toLocaleDateString('ru-RU')}`}
            {card.created_by_username && ` (${card.created_by_username})`}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              tabIndex={0}
              aria-label="Закрыть"
            >
              Закрыть
            </Button>
            <Button
              onClick={() => updateCardMutation.mutate()}
              disabled={!title.trim() || updateCardMutation.isPending}
              tabIndex={0}
              aria-label="Сохранить изменения"
            >
              {updateCardMutation.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </DialogContent>

    </Dialog>

    <QuickCreateObjectDialog
      open={isQuickCreateObjOpen}
      onOpenChange={setIsQuickCreateObjOpen}
      onCreated={handleObjectCreated}
    />

    <QuickCreateCounterpartyDialog
      open={isQuickCreateCPOpen}
      onOpenChange={setIsQuickCreateCPOpen}
      onCreated={handleCounterpartyCreated}
    />
    </>
  );
};
