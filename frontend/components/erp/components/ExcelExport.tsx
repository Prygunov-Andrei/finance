import { Download } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface ExcelExportProps {
  data: any[];
  filename: string;
  sheetName?: string;
  buttonText?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'default' | 'lg';
}

export function ExcelExport({
  data,
  filename,
  sheetName = 'Sheet1',
  buttonText = 'Экспорт в Excel',
  variant = 'outline',
  size = 'sm',
}: ExcelExportProps) {
  const handleExport = () => {
    try {
      if (!data || data.length === 0) {
        toast.error('Нет данных для экспорта');
        return;
      }

      toast.info('Экспорт начат...');

      // Создаем рабочую книгу
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

      // Генерируем файл и скачиваем
      XLSX.writeFile(workbook, `${filename}.xlsx`);

      toast.success('Файл успешно экспортирован');
    } catch (error) {
      toast.error('Ошибка при экспорте файла');
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleExport}
      className="gap-2"
    >
      <Download className="w-4 h-4" />
      {buttonText}
    </Button>
  );
}
