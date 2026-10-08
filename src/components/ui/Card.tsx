// src/components/ui/Card.tsx
import { ReactNode } from "react";
import s from "./Card.module.css";

interface Props { title?: string; compact?: boolean; className?: string; children: ReactNode }

export default function Card({ title, compact, className = "", children }: Props) {
  return (
    <section className={`${s.card} ${compact ? s.compact : ""} ${className}`}>
      {title && <h2 className={s.title}>{title}</h2>}
      {children}
    </section>
  );
}