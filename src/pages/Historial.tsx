import { useEffect, useState } from "react";
import { api, AuditoriaFila } from "../api";
import { useApp } from "../context";
import Layout from "../components/Layout";
import Card from "../components/ui/Card";
import DataTable, { Column } from "../components/ui/DataTable";

const acciones: Record<string, string> = {
  CREAR: "creó",
  CREAR_ASOCIADO: "agregó un asociado",
  EDITAR: "editó",
  ACTUALIZAR: "actualizó",
  ELIMINAR: "eliminó",
  APROBAR: "aprobó",
  ANULAR: "anuló",
  GENERAR: "generó",
  REGISTRAR: "registró",
  RESPALDAR: "creó una copia de seguridad",
  CONFIGURAR: "actualizó la configuración",
};

const entidades: Record<string, string> = {
  asociado: "asociado",
  pago: "pago",
  movimiento_caja: "movimiento de caja",
  rendicion: "rendición",
  usuario: "usuario",
  miembro_comision: "integrante de la comisión",
  personal_establecimiento: "integrante del establecimiento",
  documento_asamblea: "documento de asamblea",
  reunion: "reunión",
  configuracion: "configuración",
  copia_seguridad: "copia de seguridad",
};

export function descripcionAuditoria(e: AuditoriaFila) {
  const accion = acciones[e.accion] ?? e.accion.toLowerCase();
  const entidad = entidades[e.entidad] ?? e.entidad.replace(/_/g, " ");
  if (e.accion === "CREAR" && e.entidad === "personal_establecimiento") return "agregó un integrante";
  if (e.accion === "ELIMINAR" && e.entidad === "personal_establecimiento") return "eliminó un integrante";
  return `${accion} ${entidad}`;
}

export default function Historial() {
  const { usuario } = useApp();
  const [auditoria, setAuditoria] = useState<AuditoriaFila[]>([]);

  useEffect(() => {
    if (usuario.rol === "Superadmin") {
      api.listarAuditoria().then(setAuditoria).catch(console.error);
    }
  }, [usuario.rol]);

  const columnas: Column<AuditoriaFila>[] = [
    { header: "Fecha y hora", minWidth: 155, flex: true, render: (e) => e.fechaHora },
    { header: "Usuario", minWidth: 170, flex: true, render: (e) => e.usuario },
    { header: "Qué pasó", minWidth: 260, flex: true, render: descripcionAuditoria },
    { header: "ID", width: 70, align: "center", render: (e) => e.entidadId ?? "—" },
  ];

  return (
    <Layout title="Historial de cambios">
      <Card title="Historial completo">
        <DataTable
          columns={columnas}
          rows={auditoria}
          rowKey={(e) => e.id}
          stickyHeader
          emptyMessage="No hay cambios registrados."
        />
      </Card>
    </Layout>
  );
}
