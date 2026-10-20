// src/components/Layout.tsx
import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import s from "./Layout.module.css";

interface Props {
  title: string;
  action?: ReactNode;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}

export default function Layout({ title, action, headerExtra, footer, children }: Props) {
  return (
    <div className={s.shell}>
      <Sidebar />
      <div className={s.main}>
        <header className={s.header}>
          <h1 className={s.title}>{title}</h1>
          {action || headerExtra}
        </header>
        <main className={s.content}>{children}</main>
        {footer && <footer className={s.footer}>{footer}</footer>}
      </div>
    </div>
  );
}