// src/components/Layout.tsx
import { ReactNode } from "react";
import { useApp } from "../context";
import Sidebar from "./Sidebar";
import s from "./Layout.module.css";

interface Props {
  title: string;
  action?: ReactNode;
  headerExtra?: ReactNode;
  flushContentTop?: boolean;
  hideContentOverflow?: boolean;
  footer?: ReactNode;
  children?: ReactNode;
}

export default function Layout({
  title,
  action,
  headerExtra,
  flushContentTop = false,
  hideContentOverflow = false,
  footer,
  children,
}: Props) {
  const { sidebarCollapsed } = useApp();

  return (
    <div className={`${s.shell} ${sidebarCollapsed ? s.shellCollapsed : ""}`}>
      <Sidebar />
      <div className={s.main}>
        <header className={s.header}>
          <h1 className={s.title}>{title}</h1>
          {action || headerExtra}
        </header>
        <main className={`${s.content} ${flushContentTop ? s.contentFlushTop : ""} ${hideContentOverflow ? s.contentNoOverflow : ""}`}>{children}</main>
        {footer && <footer className={s.footer}>{footer}</footer>}
      </div>
    </div>
  );
}