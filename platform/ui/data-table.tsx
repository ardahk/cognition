import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function DataTable<T>({
  rows,
  columns,
  rowHref,
  empty,
}: {
  rows: T[];
  columns: { header: ReactNode; cell: (row: T) => ReactNode; className?: string }[];
  rowHref?: (row: T) => string;
  empty?: ReactNode;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((c, i) => (
            <TableHead key={i} className={c.className}>
              {c.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
              {empty ?? 'No rows'}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row, ri) => {
            const href = rowHref?.(row);
            return (
              <TableRow key={ri}>
                {columns.map((c, ci) => (
                  <TableCell key={ci} className={c.className}>
                    {href ? (
                      <Link href={href} className="block">
                        {c.cell(row)}
                      </Link>
                    ) : (
                      c.cell(row)
                    )}
                  </TableCell>
                ))}
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
