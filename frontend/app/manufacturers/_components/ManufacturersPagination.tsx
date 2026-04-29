import Link from 'next/link';

interface Props {
  currentPage: number;
  totalPages: number;
}

function pageHref(page: number): string {
  return page === 1 ? '/manufacturers' : `/manufacturers/page/${page}`;
}

function buildWindow(current: number, total: number): Array<number | 'gap'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: Array<number | 'gap'> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push('gap');
  for (let p = start; p <= end; p++) out.push(p);
  if (end < total - 1) out.push('gap');
  out.push(total);
  return out;
}

export default function ManufacturersPagination({ currentPage, totalPages }: Props) {
  if (totalPages <= 1) return null;
  const windowItems = buildWindow(currentPage, totalPages);
  const prev = currentPage > 1 ? currentPage - 1 : null;
  const next = currentPage < totalPages ? currentPage + 1 : null;

  return (
    <nav
      aria-label="Пагинация"
      className="mt-10 flex flex-wrap items-center justify-center gap-2 text-sm"
    >
      {prev !== null ? (
        <Link
          href={pageHref(prev)}
          rel="prev"
          className="rounded-md border border-border px-3 py-2 text-foreground hover:bg-muted"
        >
          ← Назад
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className="rounded-md border border-border px-3 py-2 text-muted-foreground opacity-50"
        >
          ← Назад
        </span>
      )}

      <ul className="flex flex-wrap items-center gap-1">
        {windowItems.map((item, idx) =>
          item === 'gap' ? (
            <li key={`gap-${idx}`} className="px-2 text-muted-foreground">
              …
            </li>
          ) : item === currentPage ? (
            <li key={item}>
              <span
                aria-current="page"
                className="rounded-md border border-primary bg-primary px-3 py-2 font-semibold text-primary-foreground"
              >
                {item}
              </span>
            </li>
          ) : (
            <li key={item}>
              <Link
                href={pageHref(item)}
                className="rounded-md border border-border px-3 py-2 text-foreground hover:bg-muted"
              >
                {item}
              </Link>
            </li>
          ),
        )}
      </ul>

      {next !== null ? (
        <Link
          href={pageHref(next)}
          rel="next"
          className="rounded-md border border-border px-3 py-2 text-foreground hover:bg-muted"
        >
          Вперёд →
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className="rounded-md border border-border px-3 py-2 text-muted-foreground opacity-50"
        >
          Вперёд →
        </span>
      )}

      <span className="ml-2 text-xs text-muted-foreground">
        Стр. {currentPage} из {totalPages}
      </span>
    </nav>
  );
}
