import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { DataTable, createSelectColumn, type ColumnDef } from '../components/ui/data-table';

interface TestRow {
  id: number;
  name: string;
  amount: number;
  category: string;
}

const testData: TestRow[] = [
  { id: 1, name: 'Кабель ВВГнг 3x1.5', amount: 1500, category: 'Кабель' },
  { id: 2, name: 'Автомат АВВ 16А', amount: 800, category: 'Автоматы' },
  { id: 3, name: 'Розетка Schneider', amount: 350, category: 'ЭУИ' },
  { id: 4, name: 'Щит ЩРН-12', amount: 2200, category: 'Щиты' },
  { id: 5, name: 'Кабель ВВГнг 5x2.5', amount: 3200, category: 'Кабель' },
];

const columns: ColumnDef<TestRow, any>[] = [
  { accessorKey: 'id', header: '№' },
  { accessorKey: 'name', header: 'Наименование' },
  { accessorKey: 'amount', header: 'Сумма' },
  { accessorKey: 'category', header: 'Категория' },
];

describe('DataTable', () => {
  it('renders all rows', () => {
    render(<DataTable columns={columns} data={testData} />);
    expect(screen.getByText('Кабель ВВГнг 3x1.5')).toBeTruthy();
    expect(screen.getByText('Автомат АВВ 16А')).toBeTruthy();
    expect(screen.getByText('Розетка Schneider')).toBeTruthy();
    expect(screen.getByText('Щит ЩРН-12')).toBeTruthy();
    expect(screen.getByText('Кабель ВВГнг 5x2.5')).toBeTruthy();
  });

  it('renders column headers', () => {
    render(<DataTable columns={columns} data={testData} />);
    expect(screen.getByText('Наименование')).toBeTruthy();
    expect(screen.getByText('Сумма')).toBeTruthy();
    expect(screen.getByText('Категория')).toBeTruthy();
  });

  it('shows empty message when no data', () => {
    render(<DataTable columns={columns} data={[]} emptyMessage="Пусто" />);
    expect(screen.getByText('Пусто')).toBeTruthy();
  });

  it('shows default empty message', () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText('Нет данных')).toBeTruthy();
  });

  it('sorts by column when clicked', async () => {
    render(<DataTable columns={columns} data={testData} enableSorting />);

    const rowsBefore = screen.getAllByRole('row').slice(1);
    const firstNameBefore = rowsBefore[0].querySelectorAll('td')[1]?.textContent;

    const header = screen.getByText('Наименование');
    await userEvent.click(header);

    const rowsAfter = screen.getAllByRole('row').slice(1);
    const firstNameAfter = rowsAfter[0].querySelectorAll('td')[1]?.textContent;
    expect(firstNameAfter).toBe('Автомат АВВ 16А');
    expect(firstNameBefore).not.toBe(firstNameAfter);
  });

  it('filters with global search', async () => {
    render(
      <DataTable
        columns={columns}
        data={testData}
        enableFiltering
      />,
    );
    const input = screen.getByPlaceholderText('Поиск...');
    await userEvent.type(input, 'Кабель');

    expect(screen.getByText('Кабель ВВГнг 3x1.5')).toBeTruthy();
    expect(screen.getByText('Кабель ВВГнг 5x2.5')).toBeTruthy();
    expect(screen.queryByText('Автомат АВВ 16А')).toBeNull();
  });

  it('shows filtered count', async () => {
    render(
      <DataTable
        columns={columns}
        data={testData}
        enableFiltering
      />,
    );
    expect(screen.getByText('5 из 5')).toBeTruthy();

    const input = screen.getByPlaceholderText('Поиск...');
    await userEvent.type(input, 'Кабель');
    expect(screen.getByText('2 из 5')).toBeTruthy();
  });

  it('enables row selection with select column', async () => {
    const onSelectionChange = vi.fn();
    const columnsWithSelect = [createSelectColumn<TestRow>(), ...columns];

    render(
      <DataTable
        columns={columnsWithSelect}
        data={testData}
        enableRowSelection
        onRowSelectionChange={onSelectionChange}
        getRowId={(row) => String(row.id)}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThan(0);

    await userEvent.click(checkboxes[1]);
    expect(onSelectionChange).toHaveBeenCalled();
  });

  it('handles editable cells', async () => {
    const onCellEdit = vi.fn();
    const editableColumns: ColumnDef<TestRow, any>[] = [
      { accessorKey: 'id', header: '№' },
      {
        accessorKey: 'name',
        header: 'Наименование',
        meta: { editable: true, type: 'text' },
      },
      { accessorKey: 'amount', header: 'Сумма' },
    ];

    render(
      <DataTable
        columns={editableColumns}
        data={testData}
        onCellEdit={onCellEdit}
      />,
    );

    const editableCell = screen.getByText('Кабель ВВГнг 3x1.5');
    await userEvent.click(editableCell);

    const input = screen.getByDisplayValue('Кабель ВВГнг 3x1.5');
    await userEvent.clear(input);
    await userEvent.type(input, 'Новый кабель');
    fireEvent.blur(input);

    expect(onCellEdit).toHaveBeenCalledWith(0, 'name', 'Новый кабель');
  });

  it('applies custom row class', () => {
    render(
      <DataTable
        columns={columns}
        data={testData}
        rowClassName={(row) =>
          row.original.category === 'Кабель' ? 'bg-blue-50' : undefined
        }
      />,
    );

    const rows = screen.getAllByRole('row');
    const dataRows = rows.slice(1);
    expect(dataRows[0].className).toContain('bg-blue-50');
    expect(dataRows[1].className).not.toContain('bg-blue-50');
  });

  it('renders footer content', () => {
    render(
      <DataTable
        columns={columns}
        data={testData}
        footerContent={<span>Итого: 8050</span>}
      />,
    );
    expect(screen.getByText('Итого: 8050')).toBeTruthy();
  });

  it('renders with virtualization enabled (no crash)', () => {
    const largeData = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      name: `Item ${i + 1}`,
      amount: (i + 1) * 100,
      category: `Cat ${i % 5}`,
    }));

    const { container } = render(
      <DataTable
        columns={columns}
        data={largeData}
        enableVirtualization
      />,
    );
    expect(container.querySelector('table')).toBeTruthy();
  });
});
