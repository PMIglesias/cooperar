// src/components/ui/IconButton.tsx
import { ButtonHTMLAttributes, ReactNode } from "react";
import s from "./IconButton.module.css";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label?: string;
  title: string;
  variant?: "default" | "primary" | "danger" | "success";
  square?: boolean;
}

export default function IconButton({
  icon,
  label,
  title,
  variant = "default",
  square = false,
  className = "",
  ...rest
}: Props) {
  return (
    <button
      type="button"
      title={title}
      aria-label={label || title}
      className={`${s.iconBtn} ${variant !== "default" ? s[variant] : ""} ${square || !label ? s.square : ""} ${className}`}
      {...rest}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}
