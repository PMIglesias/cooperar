import { FormEvent, useState } from "react";
import { api } from "../api";
import { useApp } from "../context";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import Layout from "../components/Layout";
import s from "./Perfil.module.css";

const REQUISITOS_CLAVE = "Usá al menos 8 caracteres e incluí una mayúscula, una minúscula, un número y un símbolo.";

function claveValida(clave: string) {
  return clave.length >= 8
    && /[A-ZÁÉÍÓÚÜÑ]/.test(clave)
    && /[a-záéíóúüñ]/.test(clave)
    && /\d/.test(clave)
    && /[^A-Za-zÁÉÍÓÚÜÑa-záéíóúüñ0-9\s]/.test(clave);
}

export default function Perfil() {
  const { usuario, setUsuario } = useApp();
  const [claveActual, setClaveActual] = useState("");
  const [nuevaClave, setNuevaClave] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardarClave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMensaje(null);
    if (!claveValida(nuevaClave)) {
      setError(REQUISITOS_CLAVE);
      return;
    }
    if (nuevaClave !== confirmacion) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }

    setGuardando(true);
    try {
      const actualizada = await api.cambiarClaveUsuario(
        usuario.debeCambiarClave ? undefined : claveActual,
        nuevaClave,
      );
      setUsuario(actualizada);
      setClaveActual("");
      setNuevaClave("");
      setConfirmacion("");
      setMensaje("Contraseña actualizada correctamente.");
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Layout title="Perfil de usuario">
      <div className={s.container}>
        {usuario.debeCambiarClave && (
          <div className={s.notice}>
            Para proteger tu cuenta, antes de continuar tenés que reemplazar la contraseña temporal.
          </div>
        )}
        <Card title="Datos de la cuenta">
          <div className={s.identity}>
            <div><span>Nombre</span><strong>{usuario.nombre}</strong></div>
            <div><span>Rol</span><strong>{usuario.rol}</strong></div>
          </div>
        </Card>
        <Card title={usuario.debeCambiarClave ? "Crear contraseña personal" : "Cambiar contraseña"}>
          <form className={s.form} onSubmit={guardarClave}>
            {!usuario.debeCambiarClave && (
              <Field
                label="Contraseña actual"
                type="password"
                autoComplete="current-password"
                value={claveActual}
                onChange={(e) => setClaveActual(e.target.value)}
                required
              />
            )}
            <Field
              label="Nueva contraseña"
              type="password"
              autoComplete="new-password"
              value={nuevaClave}
              onChange={(e) => setNuevaClave(e.target.value)}
              required
            />
            <Field
              label="Confirmar nueva contraseña"
              type="password"
              autoComplete="new-password"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              required
            />
            <p className={s.help}>{REQUISITOS_CLAVE}</p>
            {error && <p className={s.error} role="alert">{error}</p>}
            {mensaje && <p className={s.success} role="status">{mensaje}</p>}
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar contraseña"}
            </Button>
          </form>
        </Card>
      </div>
    </Layout>
  );
}
