// src/pages/Dashboard.tsx
import { useEffect, useState } from "react";
import { api, money, signedMoney, ResumenInicio } from "../api";
import { useApp } from "../context";
import Layout from "../components/Layout";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import s from "./Dashboard.module.css";

export default function Dashboard() {
  const { usuario, navigate } = useApp();
  const [r, setR] = useState<ResumenInicio | null>(null);
  const [respaldando, setRespaldando] = useState(false);
  const [mensajeRespaldo, setMensajeRespaldo] = useState<string | null>(null);

  const cargar = () => { api.resumenInicio().then(setR).catch(console.error); };
  useEffect(cargar, []);

  // HU09: la Presidencia respalda en un clic desde el inicio (no tiene acceso a Usuarios y respaldo)
  const crearCopia = async () => {
    setRespaldando(true);
    try {
      const res = await api.crearCopiaSeguridad();
      setMensajeRespaldo(res.mensaje);
      cargar();
    } catch (err) {
      setMensajeRespaldo(String(err));
    } finally {
      setRespaldando(false);
    }
  };

  const stats = r && [
    ["Saldo de caja", money(r.saldoCaja)],
    ["Cuotas cobradas (mes)", `${r.cuotasCobradas} de ${r.cuotasTotal}`],
    ["Asociados con deuda", String(r.conDeuda)],
    ["Próxima reunión", r.proximaReunion ?? "—"],
  ];

  return (
    <Layout
      title="Inicio"
      footer={
        <span>
          Última copia de seguridad: {r?.ultimaCopia ?? "sin copias"} · Respaldo automático activo (cada 30 min y al cerrar)
        </span>
      }
    >
      <div className={s.stats}>
        {stats?.map(([label, value]) => (
          <Card key={label} compact className={s.stat}>
            <p className={s.statLabel}>{label}</p>
            <p className={s.statValue}>{value}</p>
          </Card>
        ))}
      </div>
      <div className={s.split}>
        <Card compact title="Últimos movimientos de caja">
          <div className={s.moves}>
            {r?.ultimosMovimientos.map((m, i) => (
              <div key={i} className={s.move}>
                <span className={s.moveText}>{m.descripcion}</span>
                <span className={s.moveAmount}>{signedMoney(m.tipo, m.monto)}</span>
              </div>
            ))}
          </div>
        </Card>
        <div className={s.actions}>
          <h2 className={s.actionsTitle}>Acciones rápidas</h2>
          {(usuario.rol === "Tesorero" || usuario.rol === "Superadmin") && (
            <>
              <Button block onClick={() => navigate("cuotas")}>Registrar pago de cuota</Button>
              <Button block variant="secondary" onClick={() => navigate("caja")}>Nuevo movimiento de caja</Button>
            </>
          )}
          {(usuario.rol === "Secretaria" || usuario.rol === "Presidente" || usuario.rol === "Superadmin") && (
            <Button block variant="secondary" onClick={() => navigate("asociados")}>Nuevo asociado</Button>
          )}
          {usuario.rol === "Superadmin" && (
            <Button block variant="secondary" onClick={() => navigate("usuarios")}>Copia de seguridad</Button>
          )}
          {usuario.rol === "Presidente" && (
            <>
              <Button block variant="secondary" onClick={crearCopia} disabled={respaldando}>
                {respaldando ? "Creando copia…" : "Copia de seguridad"}
              </Button>
              {mensajeRespaldo && <p className={s.actionsTitle} style={{ fontWeight: 400 }}>{mensajeRespaldo}</p>}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}