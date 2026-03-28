import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ClipboardPaste, Loader2, Upload, Wand2, Hammer, ArrowDownToLine, Settings2, Percent } from 'lucide-react';

type EditorToolbarProps = {
  itemsCount: number;
  selectedCount: number;
  moveTargetPosition: string;
  onMoveTargetPositionChange: (value: string) => void;
  onAddClick: () => void;
  onPasteClick: () => void;
  onImportClick: () => void;
  onAutoMatchClick: () => void;
  onWorkMatchingClick: () => void;
  onMoveSelected: () => void;
  onMergeSelected: () => void;
  onDeleteSelected: () => void;
  onBulkMarkupClick?: () => void;
  onOpenColumnConfig?: () => void;
  bulkMovePending: boolean;
  mergePending: boolean;
};

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  itemsCount,
  selectedCount,
  moveTargetPosition,
  onMoveTargetPositionChange,
  onAddClick,
  onPasteClick,
  onImportClick,
  onAutoMatchClick,
  onWorkMatchingClick,
  onMoveSelected,
  onMergeSelected,
  onDeleteSelected,
  onBulkMarkupClick,
  onOpenColumnConfig,
  bulkMovePending,
  mergePending,
}) => {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button size="sm" onClick={onAddClick}>
        <Plus className="h-4 w-4 mr-1" />
        Строка
      </Button>
      <Button size="sm" variant="outline" onClick={onPasteClick}>
        <ClipboardPaste className="h-4 w-4 mr-1" />
        Вставить из Excel
      </Button>
      <Button size="sm" variant="outline" onClick={onImportClick}>
        <Upload className="h-4 w-4 mr-1" />
        Импорт файла
      </Button>
      {itemsCount > 0 && (
        <>
          <Button size="sm" variant="outline" onClick={onAutoMatchClick}>
            <Wand2 className="h-4 w-4 mr-1" />
            Подобрать цены
          </Button>
          <Button size="sm" variant="outline" onClick={onWorkMatchingClick}>
            <Hammer className="h-4 w-4 mr-1" />
            Подобрать работы
          </Button>
        </>
      )}
      {selectedCount > 0 && (
        <>
          <div className="flex items-center gap-1">
            <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
            <Input
              type="number"
              min={1}
              max={itemsCount}
              value={moveTargetPosition}
              onChange={(e) => onMoveTargetPositionChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onMoveSelected(); }}
              placeholder={`Позиция 1–${itemsCount}`}
              className="h-8 w-36 text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={onMoveSelected}
              disabled={bulkMovePending || !moveTargetPosition}
            >
              {bulkMovePending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Перенести (${selectedCount})`}
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={onMergeSelected}
            disabled={mergePending || selectedCount < 2}
          >
            {mergePending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Объединить (${selectedCount})`}
          </Button>
          {onBulkMarkupClick && (
            <Button size="sm" variant="outline" onClick={onBulkMarkupClick}>
              <Percent className="h-4 w-4 mr-1" />
              Наценка ({selectedCount})
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={onDeleteSelected}>
            <Trash2 className="h-4 w-4 mr-1" />
            Удалить ({selectedCount})
          </Button>
        </>
      )}
      <div className="ml-auto flex items-center gap-3">
        {onOpenColumnConfig && (
          <Button size="sm" variant="outline" onClick={onOpenColumnConfig} title="Настройка столбцов">
            <Settings2 className="h-4 w-4" />
          </Button>
        )}
        <Badge variant="secondary">{itemsCount} строк</Badge>
      </div>
    </div>
  );
};
