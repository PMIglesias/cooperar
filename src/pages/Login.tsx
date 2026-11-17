// src/pages/Login.tsx
import { FormEvent, useState, useEffect } from "react";
import { api, Usuario } from "../api";
import { LogoMark } from "../components/icons";
import { Field } from "../components/ui/Field";
import Button from "../components/ui/Button";
import s from "./Login.module.css";

export default function Login({ onLogin }: { onLogin: (u: Usuario) => void }) {
  const [dni, setDni] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [logoBase64, setLogoBase64] = useState<string>("");

  useEffect(() => {
    api.obtenerConfiguracion("logo_cooperadora")
      .then((val) => {
        if (val) setLogoBase64(val);
      })
      .catch(() => {});
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      onLogin(await api.login(dni, clave));
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
    }
  };

  return (
    <div className={s.page}>
      <form className={s.card} onSubmit={submit}>
        <div className={s.logoWrapper}>
          {logoBase64 ? (
            <img src={logoBase64} alt="Logo Cooperadora" className={s.logoImg} />
          ) : (
            <LogoMark size={90} color="var(--color-primary)" />
          )}
        </div>
        <h1 className={s.brand}>Cooperar</h1>
        <p className={s.subtitle}>Gestión de la cooperadora escolar</p>
        <Field
          label="DNI"
          placeholder="Ej.: 10000001"
          value={dni}
          onChange={(e) => setDni(e.target.value)}
          width={420}
          autoFocus
        />
        <Field
          label="Contraseña"
          type="password"
          placeholder="••••••••"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          width={420}
        />
        <Button type="submit" block style={{ width: 420 }}>Entrar</Button>
        <p className={error ? s.error : s.hint}>
          {error ?? "¿Olvidaste tu contraseña? Pedile al administrador que la restablezca."}
        </p>
      </form>
      <p className={s.footer}>Puente Digital · Cooperar v1.0 · Datos guardados en esta PC</p>
    </div>
  );
}