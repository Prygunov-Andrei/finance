"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Download, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "./status-badge";
import { estimateApi } from "@/lib/api/client";
import { getWorkspaceId } from "@/lib/workspace";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { EstimateListItem } from "@/lib/api/types";

interface Props {
  data: EstimateListItem[];
  isLoading?: boolean;
}

export function EstimatesTable({ data, isLoading }: Props) {
  const router = useRouter();

  const columns = React.useMemo<ColumnDef<EstimateListItem>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Название",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Статус",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "folder_name",
        header: "Папка",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.folder_name || "—"}
          </span>
        ),
      },
      {
        accessorKey: "total_amount",
        header: () => <span className="block text-right">Итого</span>,
        cell: ({ row }) => (
          <span className="block text-right font-medium tabular-nums">
            {formatCurrency(row.original.total_amount)}
          </span>
        ),
      },
      {
        accessorKey: "updated_at",
        header: "Обновлено",
        cell: ({ row }) => (
          <span className="text-muted-foreground whitespace-nowrap">
            {formatDate(row.original.updated_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div
            className="flex items-center justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              aria-label="Скачать Excel"
              title="Скачать Excel"
              onClick={() => void downloadXlsx(row.original)}
            >
              <Download className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Ещё">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => router.push(`/estimates/${row.original.id}`)}
                >
                  Открыть
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void downloadXlsx(row.original)}
                >
                  Скачать Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [router],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => (
                <TableHead key={h.id}>
                  {h.isPlaceholder
                    ? null
                    : flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={`skel-${i}`}>
                {columns.map((_c, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                Смет не найдено
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => router.push(`/estimates/${row.original.id}`)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

async function downloadXlsx(est: EstimateListItem) {
  const blob = await estimateApi.exportXlsx(est.id, getWorkspaceId());
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${est.name || "estimate"}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
