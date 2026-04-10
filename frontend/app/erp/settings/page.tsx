'use client';
import { Suspense } from 'react';
import { Settings } from '@/components/erp/components/Settings';

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Загрузка настроек...</div>}>
      <Settings />
    </Suspense>
  );
}
