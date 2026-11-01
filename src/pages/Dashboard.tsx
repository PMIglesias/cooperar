// src/pages/Dashboard.tsx
import { useEffect, useState } from "react";
import { api, money, signedMoney, ResumenInicio, AuditoriaFila } from "../api";
import { useApp } from "../context";
import Layout from "../components/Layout";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import DataTable, { Column } from "../components/ui/DataTable";
import s from "./Dashboard.module.css";
import { descripcionAuditoria } from "./Historial";

export default function Dashboard() {
  const { usuario, navigate } = useApp();
  const [r, setR] = useState<ResumenInicio | null>(null);
  const [respaldando, setRespaldando] = useState(false);
  const [mensajeRespaldo, setMensajeRespaldo] = useState<string | null>(null);
  const [auditoria, setAuditoria] = useState<AuditoriaFila[]>([]);

  const cargar = () => { api.resumenInicio().then(setR).catch(console.error); };
  useEffect(() => {
    cargar();
    if (usuario.rol === "Superadmin") {
      api.listarAuditoria().then(setAuditoria).catch(console.error);
    }
  }, [usuario.rol]);

  const columnasAuditoria: Column<AuditoriaFila>[] = [
    { header: "Fecha y hora", minWidth: 155, flex: true, render: (e) => e.fechaHora },
    { header: "Usuario", minWidth: 170, flex: true, render: (e) => e.usuario },
    { header: "Qué pasó", minWidth: 260, flex: true, render: descripcionAuditoria },
  ];

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
          {usuario.rol === "Tesorero" && (
            <>
              <Button block onClick={() => navigate("cuotas")}>Registrar pago de cuota</Button>
              <Button block variant="secondary" onClick={() => navigate("caja")}>Nuevo movimiento de caja</Button>
            </>
          )}
          {usuario.rol === "Secretaria" && (
            <Button block variant="secondary" onClick={() => navigate("asociados")}>Nuevo asociado</Button>
          )}
          {usuario.rol === "Secretaria" && (
            <>
              <Button block variant="secondary" onClick={() => navigate("reuniones")}>Gestionar reuniones y actas</Button>
              <Button block variant="secondary" onClick={() => navigate("documentacion")}>Gestionar documentación</Button>
            </>
          )}
          {usuario.rol === "Presidente" && (
            <>
              <Button block variant="secondary" onClick={() => navigate("reuniones")}>Programar reunión</Button>
              <Button block variant="secondary" onClick={() => navigate("documentacion")}>Documentación de Asambleas</Button>
              <Button block variant="secondary" onClick={() => navigate("rendiciones")}>Revisar rendiciones</Button>
            </>
          )}
          {usuario.rol === "Tesorero" && (
            <Button block variant="secondary" onClick={() => navigate("rendiciones")}>Gestionar rendiciones</Button>
          )}
          {usuario.rol === "Superadmin" && (
            <>
              <Button block variant="secondary" onClick={() => navigate("usuarios")}>Usuarios y respaldo</Button>
              <Button block variant="secondary" onClick={() => navigate("historial")}>Historial de cambios</Button>
            </>
          )}
          {usuario.rol === "Asesor" && (
            <>
              <Button block variant="secondary" onClick={() => navigate("asociados")}>Consultar asociados</Button>
              <Button block variant="secondary" onClick={() => navigate("comision")}>Consultar comisión e institución</Button>
              <Button block variant="secondary" onClick={() => navigate("caja")}>Consultar caja</Button>
              <Button block variant="secondary" onClick={() => navigate("rendiciones")}>Consultar rendiciones</Button>
              <Button block variant="secondary" onClick={() => navigate("reuniones")}>Consultar reuniones y actas</Button>
            </>
          )}
        </div>
      </div>
      {usuario.rol === "Superadmin" && (
        <Card title="Resumen del historial de cambios">
          <DataTable
            columns={columnasAuditoria}
            rows={auditoria.slice(0, 5)}
            rowKey={(e) => e.id}
            emptyMessage="No hay cambios registrados."
          />
        </Card>
      )}

    </Layout>
  );
}