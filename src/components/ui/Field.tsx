// src/components/ui/Field.tsx
import { InputHTMLAttributes } from "react";
import s from "./Field.module.css";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  width?: number | string;
}

export function Field({ label, width, ...rest }: FieldProps) {
  return (
    <label className={s.field} style={{ width }}>
      <span className={s.label}>{label}</span>
      <input className={s.control} {...rest} />
    </label>
  );
}

export type SelectOption = string | { value: string; label: string };

interface SelectProps {
  label: string;
  value: string;
  options: readonly SelectOption[] | SelectOption[];
  width?: number | string;
  required?: boolean;
  onChange: (v: string) => void;
}

export function SelectField({ label, value, options, width, onChange, required }: SelectProps) {
  const currentOpt = options.find((o) => (typeof o === "string" ? o === value : o.value === value));
  const currentLabel = currentOpt
    ? typeof currentOpt === "string"
      ? currentOpt
      : currentOpt.label
    : value;

  return (
    <label className={s.field} style={{ width }}>
      <span className={s.label}>{label}</span>
      <span className={`${s.control} ${s.select}`}>
        {currentLabel || "Seleccionar..."} ▾
        <select
          className={s.native}
          value={value}
          required={required}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => {
            const val = typeof o === "string" ? o : o.value;
            const lab = typeof o === "string" ? o : o.label;
            return (
              <option key={val} value={val}>
                {lab}
              </option>
            );
          })}
        </select>
      </span>
    </label>
  );
}