// src/components/ui/Modal.tsx
import { ReactNode, useEffect } from "react";
import s from "./Modal.module.css";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: "small" | "medium" | "large";
  children: ReactNode;
  footer?: ReactNode;
}

export default function Modal({ isOpen, onClose, title, size = "medium", children, footer }: Props) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true">
      <div className={`${s.dialog} ${s[size]}`}>
        <div className={s.header}>
          <h2 className={s.title}>{title}</h2>
          <button type="button" className={s.closeBtn} onClick={onClose} aria-label="Cerrar modal">
            ✕
          </button>
        </div>
        <div className={s.body}>{children}</div>
        {footer && <div className={s.footer}>{footer}</div>}
      </div>
    </div>
  );
}
