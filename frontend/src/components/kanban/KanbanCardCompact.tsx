import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { ArrowRightFromLine } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import type { KanbanCard, CardColor } from '../../lib/kanbanApi';

type TunnelActionProp = {
  label: string;
  onTunnel: (cardId: string) => void;
} | null;

type Props = {
  card: KanbanCard;
  index: number;
  onDoubleClick: (card: KanbanCard) => void;
  tunnelAction?: TunnelActionProp;
};

const COLOR_STYLES: Record<string, React.CSSProperties> = {
  red: { borderLeft: '4px solid #fca5a5', backgroundColor: 'rgba(254,226,226,0.6)' },
  yellow: { borderLeft: '4px solid #fcd34d', backgroundColor: 'rgba(254,249,195,0.6)' },
  blue: { borderLeft: '4px solid #93c5fd', backgroundColor: 'rgba(219,234,254,0.6)' },
  green: { borderLeft: '4px solid #86efac', backgroundColor: 'rgba(220,252,231,0.6)' },
};

const isOverdue = (dueDate: string | null) => {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d < today;
};

export const KanbanCardCompact = ({ card, index, onDoubleClick, tunnelAction }: Props) => {
  const color = (card.meta?.color as CardColor) || null;
  const objectName = card.meta?.erp_object_name || '';
  const systemName = card.meta?.system_name || '';
  const colorStyle = color ? COLOR_STYLES[color] || {} : {};

  return (
    <Draggable draggableId={card.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          style={{ ...colorStyle, ...provided.draggableProps.style }}
          className={`rounded-md border p-2.5 cursor-grab select-none transition-shadow ${
            snapshot.isDragging ? 'shadow-lg ring-2 ring-primary/30' : 'hover:shadow-sm'
          }`}
          onDoubleClick={() => onDoubleClick(card)}
          role="button"
          tabIndex={0}
          aria-label={`Карточка: ${card.title}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onDoubleClick(card);
          }}
        >
          <div className="flex items-start justify-between gap-1.5">
            <div className="font-medium text-sm leading-snug truncate">{card.title}</div>
            {isOverdue(card.due_date) && (
              <Badge variant="destructive" className="text-[10px] px-1 py-0 shrink-0">!</Badge>
            )}
          </div>

          {objectName && (
            <div className="text-xs text-muted-foreground truncate mt-0.5">{objectName}</div>
          )}

          {systemName && (
            <div className="text-xs text-muted-foreground/70 truncate">{systemName}</div>
          )}

          {tunnelAction && (
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-1.5 h-6 text-[11px] gap-1"
              onClick={(e) => {
                e.stopPropagation();
                tunnelAction.onTunnel(card.id);
              }}
              aria-label={tunnelAction.label}
              tabIndex={0}
            >
              <ArrowRightFromLine className="w-3 h-3" />
              {tunnelAction.label}
            </Button>
          )}
        </div>
      )}
    </Draggable>
  );
};
