// src/components/ui/DataTable.tsx
import { CSSProperties, ReactNode } from "react";
import s from "./DataTable.module.css";

export interface Column<T> {
  key?: string;
  header: string;
  width?: number;
  minWidth?: number;
  flex?: boolean;
  align?: "left" | "center" | "right";
  render?: (row: T) => ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  data?: T[];
  rows?: T[];
  rowKey?: (row: T) => string | number;
  rightPad?: number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

export default function DataTable<T>({
  columns,
  data,
  rows,
  rowKey,
  rightPad = 16,
  onRowClick,
  emptyMessage = "No se encontraron resultados",
}: Props<T>) {
  const items = data || rows || [];

  const style = {
    "--cols": columns
      .map((c) => {
        if (c.flex) {
          return `minmax(${c.minWidth || c.width || 120}px, 1fr)`;
        }
        if (c.width) {
          return `${c.width}px`;
        }
        return `minmax(${c.minWidth || 100}px, 1fr)`;
      })
      .join(" "),
    "--pr": `${rightPad}px`,
  } as CSSProperties;

  const defaultGetKey = (row: T, idx: number): string | number => {
    if (row && typeof row === "object" && "id" in (row as Record<string, unknown>)) {
      return String((row as Record<string, unknown>).id);
    }
    return idx;
  };

  const getKey = rowKey || defaultGetKey;

  return (
    <div className={s.table} style={style} role="table">
      <div className={`${s.row} ${s.head}`} role="row">
        {columns.map((c, i) => (
          <div
            key={i}
            className={s.cell}
            role="columnheader"
            style={c.align ? { textAlign: c.align, justifyContent: c.align === "center" ? "center" : c.align === "right" ? "flex-end" : "flex-start" } : undefined}
          >
            {c.header || "\u200b"}
          </div>
        ))}
      </div>
      {items.length === 0 ? (
        <div className={s.empty}>{emptyMessage}</div>
      ) : (
        items.map((r, idx) => (
          <div
            key={getKey(r, idx)}
            className={`${s.row} ${onRowClick ? s.clickable : ""}`}
            role="row"
            onClick={() => onRowClick && onRowClick(r)}
          >
            {columns.map((c, i) => (
              <div
                key={i}
                className={s.cell}
                role="cell"
                style={c.align ? { textAlign: c.align, justifyContent: c.align === "center" ? "center" : c.align === "right" ? "flex-end" : "flex-start" } : undefined}
              >
                {c.render
                  ? c.render(r)
                  : c.key && typeof r === "object" && r !== null
                  ? String((r as Record<string, unknown>)[c.key] ?? "")
                  : null}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}