'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Minimize2, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useEstimateApi } from '@/lib/api/estimate-api-context';
import type {
  WorkMatchingProgress,
  WorkMatchingApplyItem,
} from '@/lib/api/types/estimates';
import { WorkMatchingProgressView } from './WorkMatchingProgress';
import { WorkMatchingResults } from './WorkMatchingResults';

const POLL_INTERVAL = 3000;

type Step = 'start' | 'progress' | 'results';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateId: number;
}

function playNotificationBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch { /* ignore */ }
}

export function WorkMatchingDialog({ open, onOpenChange, estimateId }: Props) {
  const estimateApi = useEstimateApi();
  const [step, setStep] = useState<Step>('start');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [progress, setProgress] = useState<WorkMatchingProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (abortRef.current) abortRef.current.abort();
    pollRef.current = null;
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // Warn before leaving during progress
  useEffect(() => {
    if (step !== 'progress') return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [step]);

  const startMatching = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await estimateApi.startWorkMatching(estimateId);
      setSessionId(result.session_id);
      setStep('progress');
      setStartedAt(Date.now());
      startPolling(result.session_id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('409') || msg.includes('ALREADY_RUNNING')) {
        setError('Подбор уже запущен для этой сметы');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const failCountRef = useRef(0);

  const startPolling = (sid: string) => {
    const poll = async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const data = await estimateApi.getWorkMatchingProgress(sid, controller.signal);
        failCountRef.current = 0;
        if (error && !error.includes('Подбор уже')) setError(null);
        setProgress(data);
        if (data.status === 'completed' || data.status === 'error') {
          stopPolling();
          // Запрашиваем полные результаты отдельным вызовом
          try {
            const fullData = await estimateApi.getWorkMatchingProgress(sid, undefined, true);
            setProgress(fullData);
          } catch { /* используем данные без results */ }
          setStep('results');
          setIsMinimized((was) => { if (was) playNotificationBeep(); return false; });
          if (!isMinimized) playNotificationBeep();
        }
        if (data.status === 'cancelled') {
          stopPolling();
          setIsMinimized(false);
          onOpenChange(false);
        }
      } catch {
        failCountRef.current++;
        if (failCountRef.current >= 10) {
          stopPolling();
          setError('Потеряно соединение с сервером. Подбор может продолжаться в фоне.');
        } else if (failCountRef.current >= 5) {
          setError('Проблемы с подключением, повторяю...');
        }
      }
    };
    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);
  };

  const cancelMatching = async () => {
    if (sessionId) await estimateApi.cancelWorkMatching(sessionId);
    stopPolling();
    setIsMinimized(false);
    onOpenChange(false);
  };

  const applyResults = async (items: WorkMatchingApplyItem[], rejected?: Array<{ item_id: number; work_item_id: number }>) => {
    if (!sessionId) return;
    setLoading(true);
    try {
      await estimateApi.applyWorkMatching(sessionId, items, rejected);
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Close/minimize logic: during progress — minimize instead of close
  const handleClose = useCallback(() => {
    if (step === 'progress' && sessionId) {
      setIsMinimized(true);
      return;
    }
    stopPolling();
    setStep('start');
    setSessionId(null);
    setProgress(null);
    setError(null);
    setIsMinimized(false);
    setStartedAt(null);
    onOpenChange(false);
  }, [step, sessionId, stopPolling, onOpenChange]);

  const handleExpand = useCallback(() => setIsMinimized(false), []);

  const pct = progress && progress.total_items > 0
    ? Math.round((progress.current_item / progress.total_items) * 100) : 0;

  // Floating chip when minimized
  const floatingChip = open && isMinimized && typeof document !== 'undefined' ? createPortal(
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-purple-600 text-white rounded-full pl-4 pr-2 py-2.5 shadow-xl cursor-pointer hover:bg-purple-700 transition-colors animate-in slide-in-from-bottom-2 fade-in duration-300"
      onClick={handleExpand}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') handleExpand(); }}
    >
      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium truncate">
          Подбор: {progress?.current_item}/{progress?.total_items} ({pct}%)
        </span>
        <div className="w-full bg-purple-400/40 rounded-full h-1 mt-1">
          <div className="bg-white rounded-full h-1 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <button
        className="ml-1 p-1.5 rounded-full hover:bg-purple-500 transition-colors"
        onClick={(e) => { e.stopPropagation(); cancelMatching(); }}
        title="Отменить подбор"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      {floatingChip}
      <Dialog open={open && !isMinimized} onOpenChange={(val) => { if (!val) handleClose(); else onOpenChange(val); }}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              Подбор работ
              {step === 'progress' && (
                <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" onClick={() => setIsMinimized(true)} title="Свернуть">
                  <Minimize2 className="h-4 w-4" />
                </Button>
              )}
            </DialogTitle>
            <DialogDescription>
              {step === 'start' && 'Система подберёт расценки на монтаж из прайс-листа'}
              {step === 'progress' && 'Идёт подбор работ...'}
              {step === 'results' && 'Результаты подбора'}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>
          )}

          {step === 'start' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                8-уровневый подбор: расценка по умолчанию, история, прайс-лист,
                база знаний, категории, fuzzy-поиск, LLM semantic, web search.
                Система учится с каждой сметой.
              </p>
              <Button onClick={startMatching} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Запустить подбор работ
              </Button>
            </div>
          )}

          {step === 'progress' && progress && (
            <div className="space-y-4">
              <WorkMatchingProgressView data={progress} startedAt={startedAt ?? undefined} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsMinimized(true)}>
                  <Minimize2 className="h-4 w-4 mr-1" />
                  Свернуть
                </Button>
                <Button variant="outline" onClick={cancelMatching}>
                  <X className="h-4 w-4 mr-1" />
                  Отменить
                </Button>
              </div>
            </div>
          )}

          {step === 'results' && progress && (
            <WorkMatchingResults
              results={progress.results}
              stats={progress.stats}
              manHoursTotal={progress.man_hours_total}
              onApply={applyResults}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
