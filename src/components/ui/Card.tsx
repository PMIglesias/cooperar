// src/components/ui/Card.tsx
import { ReactNode } from "react";
import s from "./Card.module.css";

interface Props { title?: string; actions?: ReactNode; compact?: boolean; className?: string; children: ReactNode }

export default function Card({ title, actions, compact, className = "", children }: Props) {
  return (
    <section className={`${s.card} ${compact ? s.compact : ""} ${className}`}>
      {(title || actions) && (
        <div className={s.header}>
          {title && <h2 className={s.title}>{title}</h2>}
          {actions && <div className={s.actions}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}