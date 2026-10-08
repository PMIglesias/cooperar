// src/components/ui/Badge.tsx
import { ReactNode, CSSProperties } from "react";
import s from "./Badge.module.css";

export type Tone = "ok" | "danger" | "warn" | "primary" | "info";

export default function Badge({
  tone,
  children,
  style,
}: {
  tone: Tone;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return <span className={`${s.badge} ${s[tone] || s.primary}`} style={style}>{children}</span>;
}