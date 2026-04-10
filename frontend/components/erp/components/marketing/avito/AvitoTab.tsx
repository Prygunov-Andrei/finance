'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AvitoIncomingTab } from './AvitoIncomingTab';
import { AvitoPublishedTab } from './AvitoPublishedTab';

export function AvitoTab() {
  const [subTab, setSubTab] = useState<'incoming' | 'published'>('incoming');

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={subTab === 'incoming' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setSubTab('incoming')}
        >
          Входящие объявления
        </Button>
        <Button
          variant={subTab === 'published' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setSubTab('published')}
        >
          Наши объявления
        </Button>
      </div>

      {subTab === 'incoming' ? <AvitoIncomingTab /> : <AvitoPublishedTab />}
    </div>
  );
}
