// src/components/ui/Button.tsx
import { ButtonHTMLAttributes } from "react";
import s from "./Button.module.css";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  block?: boolean;
}

export default function Button({ variant = "primary", block, className = "", ...rest }: Props) {
  return (
    <button
      type="button"
      className={`${s.btn} ${s[variant]} ${block ? s.block : ""} ${className}`}
      {...rest}
    />
  );
}