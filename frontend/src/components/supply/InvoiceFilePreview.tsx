import React, { useState, useEffect } from 'react';
import { FileText, FileSpreadsheet, Download, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import * as XLSX from 'xlsx';

interface InvoiceFilePreviewProps {
  url: string | null;
  className?: string;
}

function isPdf(url: string): boolean {
  return url.toLowerCase().endsWith('.pdf') || url.includes('/pdf');
}

function isImage(url: string): boolean {
  return /\.(png|jpg|jpeg|gif|webp|bmp|tiff)$/i.test(url);
}

function isExcel(url: string): boolean {
  return /\.(xlsx?|xls)$/i.test(url);
}

/**
 * DRF возвращает абсолютный URL (http://localhost:8000/media/...).
 * Для работы через Vite proxy нужен относительный путь (/media/...).
 */
function toRelativeUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      return parsed.pathname;
    }
  } catch {
    // не URL — вернуть как есть
  }
  return url;
}

/** Стили для Excel-таблицы, имитирующие внешний вид Excel */
const EXCEL_STYLES = `
  <style>
    body { margin: 0; padding: 8px; font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; }
    table { border-collapse: collapse; width: 100%; }
    td, th {
      border: 1px solid #d4d4d4;
      padding: 2px 4px;
      text-align: left;
      vertical-align: top;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 300px;
    }
    th { background: #f0f0f0; font-weight: 600; }
    tr:nth-child(even) { background: #fafafa; }
    tr:hover { background: #e8f0fe; }
  </style>
`;

function ExcelPreview({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadExcel() {
      try {
        setLoading(true);
        setError(null);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buf = await resp.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const tableHtml = XLSX.utils.sheet_to_html(ws, { editable: false });
        if (!cancelled) setHtml(tableHtml);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Ошибка загрузки');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadExcel();
    return () => { cancelled = true; };
  }, [url]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin mb-3" />
        <p className="text-sm">Загрузка Excel...</p>
      </div>
    );
  }

  if (error || !html) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <FileSpreadsheet className="w-16 h-16 mb-4 opacity-40 text-green-600" />
        <p className="text-sm mb-4">{error || 'Не удалось загрузить файл'}</p>
        <Button variant="outline" size="sm" asChild>
          <a href={url} download>
            <Download className="w-4 h-4 mr-2" />
            Скачать файл
          </a>
        </Button>
      </div>
    );
  }

  const srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8">${EXCEL_STYLES}</head><body>${html}</body></html>`;

  return (
    <iframe
      srcDoc={srcdoc}
      className="w-full h-full min-h-[600px] rounded border bg-white"
      title="Счёт (Excel)"
      sandbox="allow-same-origin"
    />
  );
}

export function InvoiceFilePreview({ url, className = '' }: InvoiceFilePreviewProps) {
  if (!url) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FileText className="w-12 h-12 mb-3 opacity-40" />
          <p className="text-sm">Файл не загружен</p>
        </CardContent>
      </Card>
    );
  }

  const fileUrl = toRelativeUrl(url);

  return (
    <Card className={`h-full flex flex-col ${className}`}>
      <CardHeader className="py-2 px-3 flex-none">
        <CardTitle className="text-sm flex items-center justify-between">
          Документ
          {isExcel(fileUrl) ? (
            <a
              href={fileUrl}
              download
              className="text-xs text-blue-600 hover:underline font-normal"
            >
              Скачать файл
            </a>
          ) : (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline font-normal"
            >
              Открыть в новом окне
            </a>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-1 flex-1 min-h-0">
        {isPdf(fileUrl) ? (
          <iframe
            src={fileUrl}
            className="w-full h-full min-h-[600px] rounded border"
            title="Счёт (PDF)"
          />
        ) : isImage(fileUrl) ? (
          <img
            src={fileUrl}
            alt="Счёт"
            className="w-full object-contain max-h-full rounded"
          />
        ) : isExcel(fileUrl) ? (
          <ExcelPreview url={fileUrl} />
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileText className="w-16 h-16 mb-4 opacity-40" />
            <p className="text-sm mb-4">Превью недоступно</p>
            <Button variant="outline" size="sm" asChild>
              <a href={fileUrl} download>
                <Download className="w-4 h-4 mr-2" />
                Скачать файл
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
