import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { generateNotesMarkdown } from '../notes-export';

// ── Markdown рендеринг ──────────────────────────────────────────────

describe('Markdown рендеринг замечаний', () => {
  const renderMarkdown = (text: string) =>
    render(
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    );

  it('рендерит жирный текст', () => {
    renderMarkdown('**жирный**');
    const strong = screen.getByText('жирный');
    expect(strong.tagName).toBe('STRONG');
  });

  it('рендерит курсив', () => {
    renderMarkdown('*курсив*');
    const em = screen.getByText('курсив');
    expect(em.tagName).toBe('EM');
  });

  it('рендерит списки', () => {
    renderMarkdown('- пункт 1\n- пункт 2');
    expect(screen.getByText('пункт 1')).toBeDefined();
    expect(screen.getByText('пункт 2')).toBeDefined();
  });

  it('рендерит заголовки', () => {
    renderMarkdown('## Заголовок');
    const heading = screen.getByText('Заголовок');
    expect(heading.tagName).toBe('H2');
  });

  it('рендерит inline-код', () => {
    renderMarkdown('текст `код` текст');
    const code = screen.getByText('код');
    expect(code.tagName).toBe('CODE');
  });

  it('рендерит plain text без Markdown корректно (обратная совместимость)', () => {
    renderMarkdown('Обычный текст замечания без форматирования');
    expect(screen.getByText('Обычный текст замечания без форматирования')).toBeDefined();
  });

  it('рендерит GFM таблицы', () => {
    renderMarkdown('| Колонка 1 | Колонка 2 |\n|---|---|\n| Значение 1 | Значение 2 |');
    expect(screen.getByText('Колонка 1')).toBeDefined();
    expect(screen.getByText('Значение 2')).toBeDefined();
  });
});

// ── Переключение вкладок Редактор/Предпросмотр ─────────────────────

describe('Вкладки Редактор/Предпросмотр', () => {
  const NoteEditorTabs = ({ text }: { text: string }) => (
    <Tabs defaultValue="editor">
      <TabsList>
        <TabsTrigger value="editor">Редактор</TabsTrigger>
        <TabsTrigger value="preview">Предпросмотр</TabsTrigger>
      </TabsList>
      <TabsContent value="editor">
        <textarea data-testid="note-textarea" defaultValue={text} />
      </TabsContent>
      <TabsContent value="preview" forceMount>
        <div data-testid="note-preview">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      </TabsContent>
    </Tabs>
  );

  it('по умолчанию показывает вкладку Редактор', () => {
    render(<NoteEditorTabs text="**тест**" />);
    expect(screen.getByTestId('note-textarea')).toBeDefined();
  });

  it('содержит обе вкладки', () => {
    render(<NoteEditorTabs text="**жирный**" />);
    expect(screen.getByText('Редактор')).toBeDefined();
    expect(screen.getByText('Предпросмотр')).toBeDefined();
  });

  it('preview рендерит markdown-контент', () => {
    render(<NoteEditorTabs text="**жирный**" />);
    const preview = screen.getByTestId('note-preview');
    expect(preview.querySelector('strong')?.textContent).toBe('жирный');
  });
});

// ── Экспорт .md ────────────────────────────────────────────────────

describe('Экспорт замечаний в .md', () => {
  const notes = [
    {
      id: 1,
      project: 10,
      author: { id: 1, username: 'Иванов' },
      text: '**Важное** замечание',
      created_at: '2026-03-31T10:00:00Z',
      updated_at: '2026-03-31T10:00:00Z',
    },
    {
      id: 2,
      project: 10,
      author: { id: 2, username: 'Петров' },
      text: 'Второе замечание',
      created_at: '2026-03-31T11:00:00Z',
      updated_at: '2026-03-31T11:00:00Z',
    },
  ];

  it('генерирует корректный markdown с заголовком проекта', () => {
    const md = generateNotesMarkdown('Проект отопления', notes);
    expect(md).toContain('# Замечания к проекту Проект отопления');
  });

  it('включает авторов замечаний', () => {
    const md = generateNotesMarkdown('Проект', notes);
    expect(md).toContain('Иванов');
    expect(md).toContain('Петров');
  });

  it('включает текст замечаний', () => {
    const md = generateNotesMarkdown('Проект', notes);
    expect(md).toContain('**Важное** замечание');
    expect(md).toContain('Второе замечание');
  });

  it('разделяет замечания горизонтальной линией', () => {
    const md = generateNotesMarkdown('Проект', notes);
    expect(md).toContain('---');
  });

  it('возвращает только заголовок для пустого списка', () => {
    const md = generateNotesMarkdown('Проект', []);
    expect(md).toContain('# Замечания к проекту Проект');
    expect(md).not.toContain('---');
  });
});
