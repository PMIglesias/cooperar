// src/pages/Dashboard.tsx
import { useEffect, useState } from "react";
import { api, money, signedMoney, ResumenInicio } from "../api";
import { useApp } from "../context";
import Layout from "../components/Layout";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import s from "./Dashboard.module.css";

export default function Dashboard() {
  const { navigate } = useApp();
  const [r, setR] = useState<ResumenInicio | null>(null);

  useEffect(() => { api.resumenInicio().then(setR).catch(console.error); }, []);

  const stats = r && [
    ["Saldo de caja", money(r.saldoCaja)],
    ["Cuotas cobradas (mes)", `${r.cuotasCobradas} de ${r.cuotasTotal}`],
    ["Asociados con deuda", String(r.conDeuda)],
    ["Próxima reunión", r.proximaReunion ?? "—"],
  ];

  return (
    <Layout title="Inicio">
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
          <Button block onClick={() => navigate("cuotas")}>Registrar pago de cuota</Button>
          <Button block variant="secondary" onClick={() => navigate("caja")}>Nuevo movimiento de caja</Button>
          <Button block variant="secondary" onClick={() => navigate("asociados")}>Nuevo asociado</Button>
          <Button block variant="secondary" onClick={() => navigate("usuarios")}>Copia de seguridad</Button>
        </div>
      </div>
      <p className={s.note}>
        Última copia de seguridad: {r?.ultimaCopia ?? "sin copias"} · Se recomienda una copia semanal
      </p>
    </Layout>
  );
}