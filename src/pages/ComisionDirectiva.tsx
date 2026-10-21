// src/pages/ComisionDirectiva.tsx
import { useEffect, useState, FormEvent } from "react";
import Layout from "../components/Layout";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import DataTable, { Column } from "../components/ui/DataTable";
import IconButton from "../components/ui/IconButton";
import { EditIcon, TrashIcon } from "../components/icons";
import { Field, SelectField } from "../components/ui/Field";
import { useApp } from "../context";
import {
  api,
  MiembroComisionFila,
  PersonalEstablecimientoFila,
  DatosInstitucionales,
  AsociadoFila,
} from "../api";
import s from "./ComisionDirectiva.module.css";

const OPCIONES_VINCULO = [
  { value: "NINGUNO", label: "Sin vinculación directa con la nómina" },
  { value: "ASESOR", label: "Vinculado a: ASESOR (Fila 16 de Nómina)" },
  { value: "REV_CTAS_DOC_TIT", label: "Vinculado a: REV. DE CUENTAS TITULAR DOCENTE (Fila 13)" },
  { value: "REV_CTAS_DOC_SUP", label: "Vinculado a: REV. DE CUENTAS SUPLENTE DOCENTE (Fila 15)" },
];

export default function ComisionDirectiva() {
  const { usuario } = useApp();
  const [activeTab, setActiveTab] = useState<"autoridades" | "establecimiento" | "cooperadora">("autoridades");
  const [comision, setComision] = useState<MiembroComisionFila[]>([]);
  const [personal, setPersonal] = useState<PersonalEstablecimientoFila[]>([]);
  const [institucion, setInstitucion] = useState<DatosInstitucionales | null>(null);
  const [asociados, setAsociados] = useState<AsociadoFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingInst, setSavingInst] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal para editar integrante de Comisión
  const [miembroEditando, setMiembroEditando] = useState<MiembroComisionFila | null>(null);

  // Modal para crear/editar personal del establecimiento
  const [personalEditando, setPersonalEditando] = useState<PersonalEstablecimientoFila | null>(null);

  const puedeEditar = usuario.rol === "Secretaria" || usuario.rol === "Superadmin";

  const cargarDatos = async () => {
    try {
      setLoading(true);
      setError(null);
      const [com, pers, inst, asocs] = await Promise.all([
        api.listarComisionDirectiva(),
        api.listarPersonalEstablecimiento(),
        api.obtenerDatosInstitucionales(),
        api.listarAsociados({ busqueda: "", estadoCuotas: "todos", estado: "activo" }),
      ]);
      setComision(com);
      setPersonal(pers);
      setInstitucion(inst);
      setAsociados(asocs);
    } catch (err: any) {
      setError(err?.message || "Error al cargar la información institucional");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const handleGuardarMiembroModal = async (e: FormEvent) => {
    e.preventDefault();
    if (!miembroEditando || !puedeEditar) return;
    try {
      await api.guardarMiembroComision(miembroEditando);
      setComision((prev) =>
        prev.map((m) => (m.id === miembroEditando.id ? miembroEditando : m))
      );
      setMensajeExito(`Autoridad "${miembroEditando.cargo}" actualizada con éxito.`);
      setMiembroEditando(null);
    } catch (err: any) {
      setError(err?.message || "Error al actualizar autoridad");
    }
  };

  const handleGuardarPersonalModal = async (e: FormEvent) => {
    e.preventDefault();
    if (!personalEditando || !puedeEditar) return;
    try {
      const guardado = await api.guardarPersonalEstablecimiento(personalEditando);
      setPersonal((prev) => {
        const idx = prev.findIndex((p) => p.id === guardado.id);
        if (idx >= 0) {
          const copia = [...prev];
          copia[idx] = guardado;
          return copia;
        }
        return [...prev, guardado];
      });
      // Recargar comisión por si hubo sincronización de vínculos
      const comActualizada = await api.listarComisionDirectiva();
      setComision(comActualizada);
      setMensajeExito(`Personal "${guardado.nombre}" guardado y vinculado correctamente.`);
      setPersonalEditando(null);
    } catch (err: any) {
      setError(err?.message || "Error al guardar personal");
    }
  };

  const handleEliminarPersonal = async (p: PersonalEstablecimientoFila) => {
    if (!puedeEditar) return;
    if (!confirm(`¿Desea eliminar a "${p.nombre}" del registro del establecimiento?`)) return;
    try {
      await api.eliminarPersonalEstablecimiento(p.id);
      setPersonal((prev) => prev.filter((item) => item.id !== p.id));
      setMensajeExito(`Personal "${p.nombre}" eliminado correctamente.`);
    } catch (err: any) {
      setError(err?.message || "Error al eliminar personal");
    }
  };

  const handleSeleccionarAsociado = async (asociadoIdStr: string) => {
    if (!miembroEditando) return;
    if (!asociadoIdStr) {
      setMiembroEditando({
        ...miembroEditando,
        asociadoId: null,
      });
      return;
    }
    const asocId = parseInt(asociadoIdStr, 10);
    const encontrado = asociados.find((a) => a.id === asocId);
    if (!encontrado) return;

    let tel = encontrado.telefono || "";
    let email = "";
    try {
      const detalle = await api.obtenerAsociado(asocId);
      tel = detalle.telefono || tel;
      email = detalle.email || "";
    } catch {
      // Ignorar fallback
    }

    setMiembroEditando({
      ...miembroEditando,
      asociadoId: asocId,
      nombre: encontrado.apellidoNombre,
      dni: encontrado.dni,
      cuil: `20-${encontrado.dni}-3`,
      telefono: tel || miembroEditando.telefono,
      email: email || miembroEditando.email,
    });
  };

  const handleGuardarInstitucion = async (e: FormEvent) => {
    e.preventDefault();
    if (!institucion || !puedeEditar) return;
    try {
      setSavingInst(true);
      setError(null);
      await api.guardarDatosInstitucionales(institucion);
      setMensajeExito("Datos guardados correctamente.");
    } catch (err: any) {
      setError(err?.message || "Error al guardar datos institucionales");
    } finally {
      setSavingInst(false);
    }
  };

  // Opciones para el selector de asociados en el modal
  const opcionesAsociados = [
    { value: "", label: "-- Ingreso manual / No vinculado --" },
    ...asociados.map((a) => ({
      value: String(a.id),
      label: `${a.apellidoNombre} (DNI ${a.dni})`,
    })),
  ];

  // Definición de columnas con DataTable nativo de la app
  const columns: Column<MiembroComisionFila>[] = [
    {
      header: "N°",
      width: 50,
      render: (m) => <span style={{ color: "var(--color-text-muted)", fontWeight: 600 }}>{m.orden}°</span>,
    },
    {
      header: "Cargo",
      width: 170,
      render: (m) => (
        <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>
          {m.cargo}
        </span>
      ),
    },
    {
      header: "Apellido y Nombre",
      width: 220,
      flex: true,
      render: (m) => (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px" }}>
          <strong>{m.nombre}</strong>
          {m.asociadoId ? <span className={s.asociadoBadge}>Socio en BD</span> : null}
        </div>
      ),
    },
    {
      header: "DNI",
      width: 110,
      render: (m) => m.dni,
    },
    {
      header: "CUIL",
      width: 140,
      render: (m) => m.cuil,
    },
    {
      header: "Domicilio / Localidad",
      width: 220,
      render: (m) => (m.domicilio ? `${m.domicilio}, ${m.localidad}` : m.localidad),
    },
    {
      header: "Teléfono",
      width: 130,
      render: (m) => m.telefono || "—",
    },
    {
      header: "Vencimiento",
      width: 120,
      render: (m) => <Badge tone="warn">{m.vencimiento}</Badge>,
    },
    ...(puedeEditar
      ? [
          {
            header: "Acciones",
            width: 85,
            align: "center" as const,
            render: (m: MiembroComisionFila) => (
              <IconButton
                icon={<EditIcon size={16} />}
                variant="primary"
                title={`Editar autoridad: ${m.cargo}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setMiembroEditando({ ...m });
                }}
              />
            ),
          },
        ]
      : []),
  ];

  // Columnas para la tabla de Personal del Establecimiento
  const columnsPersonal: Column<PersonalEstablecimientoFila>[] = [
    {
      header: "Cargo Escolar",
      width: 170,
      render: (p) => <strong>{p.cargo}</strong>,
    },
    {
      header: "Nombre y Apellido",
      minWidth: 180,
      flex: true,
      render: (p) => <span>{p.nombre}</span>,
    },
    {
      header: "DNI",
      width: 120,
      render: (p) => <code>{p.dni}</code>,
    },
    {
      header: "Teléfono",
      width: 130,
      render: (p) => p.telefono || "—",
    },
    {
      header: "Email",
      minWidth: 170,
      flex: true,
      render: (p) => p.email || "—",
    },
    {
      header: "Vínculo con Nómina Oficial",
      width: 220,
      render: (p) => {
        if (p.vinculoNomina === "ASESOR") {
          return <span className={s.vinculoBadge}>Asesor Escolar (Fila 16)</span>;
        }
        if (p.vinculoNomina === "REV_CTAS_DOC_TIT") {
          return <span className={s.vinculoBadge}>Rev. Cuentas Docente Tit. (Fila 13)</span>;
        }
        if (p.vinculoNomina === "REV_CTAS_DOC_SUP") {
          return <span className={s.vinculoBadge}>Rev. Cuentas Docente Sup. (Fila 15)</span>;
        }
        return <span className={s.sinVinculoBadge}>Sin vinculación</span>;
      },
    },
    ...(puedeEditar
      ? [
          {
            header: "Acciones",
            width: 90,
            align: "center" as const,
            render: (p: PersonalEstablecimientoFila) => (
              <div style={{ display: "flex", gap: "6px", alignItems: "center", justifyContent: "center" }}>
                <IconButton
                  icon={<EditIcon size={16} />}
                  variant="primary"
                  title={`Editar datos de ${p.nombre}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPersonalEditando({ ...p });
                  }}
                />
                <IconButton
                  icon={<TrashIcon size={16} />}
                  variant="danger"
                  title={`Eliminar a ${p.nombre}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEliminarPersonal(p);
                  }}
                />
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <Layout title="Comisión Directiva e Institución">
      <div className={s.container}>
        {mensajeExito && <div className="alert alert-success">{mensajeExito}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        {/* Pestañas de Navegación: Separación de Autoridades, Establecimiento y Cooperadora */}
        <div className={s.tabNav}>
          <button
            type="button"
            className={`${s.tabBtn} ${activeTab === "autoridades" ? s.tabBtnActive : ""}`}
            onClick={() => {
              setActiveTab("autoridades");
              setMensajeExito(null);
            }}
          >
            👥 Nómina de Autoridades
          </button>
          <button
            type="button"
            className={`${s.tabBtn} ${activeTab === "establecimiento" ? s.tabBtnActive : ""}`}
            onClick={() => {
              setActiveTab("establecimiento");
              setMensajeExito(null);
            }}
          >
            🏫 Establecimiento Educativo
          </button>
          <button
            type="button"
            className={`${s.tabBtn} ${activeTab === "cooperadora" ? s.tabBtnActive : ""}`}
            onClick={() => {
              setActiveTab("cooperadora");
              setMensajeExito(null);
            }}
          >
            🏛️ Asociación Cooperadora
          </button>
        </div>

        {/* TAB 1: AUTORIDADES DE LA COMISIÓN DIRECTIVA */}
        {activeTab === "autoridades" && (
          <>
            <p className={s.summary}>
              {comision.length} integrantes y autoridades oficiales registradas para el ejercicio anual.
              {!puedeEditar && " (Modo sólo lectura para su rol)"}
            </p>

            <DataTable
              columns={columns}
              rows={comision}
              rowKey={(m) => m.id}
              emptyMessage={loading ? "Cargando autoridades..." : "No se encontraron integrantes registrados."}
              onRowClick={puedeEditar ? (m) => setMiembroEditando({ ...m }) : undefined}
            />
          </>
        )}

        {/* TAB 2: ESTABLECIMIENTO EDUCATIVO Y EQUIPO DIRECTIVO / DOCENTE */}
        {activeTab === "establecimiento" && institucion && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <form onSubmit={handleGuardarInstitucion}>
              <Card title="Datos del Establecimiento Escolar">
                <div className={s.configGrid}>
                  <Field
                    label="Distrito Escolar"
                    disabled={!puedeEditar}
                    value={institucion.distrito}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, distrito: e.target.value })
                    }
                    required
                  />
                  <Field
                    label="Escuela y Número"
                    disabled={!puedeEditar}
                    value={institucion.numeroEscuela}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, numeroEscuela: e.target.value })
                    }
                    required
                  />
                  <Field
                    label="Nombre de la Escuela"
                    disabled={!puedeEditar}
                    value={institucion.nombreEscuela}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, nombreEscuela: e.target.value })
                    }
                    required
                  />
                  <Field
                    label="Número C.U.E."
                    disabled={!puedeEditar}
                    value={institucion.cue}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, cue: e.target.value })
                    }
                    required
                  />
                  <Field
                    label="Domicilio del Establecimiento"
                    disabled={!puedeEditar}
                    value={institucion.domicilioEscuela}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, domicilioEscuela: e.target.value })
                    }
                    required
                  />
                  <Field
                    label="Barrio / Paraje"
                    disabled={!puedeEditar}
                    value={institucion.barrio}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, barrio: e.target.value })
                    }
                  />
                  <Field
                    label="Localidad"
                    disabled={!puedeEditar}
                    value={institucion.localidad}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, localidad: e.target.value })
                    }
                    required
                  />
                  <Field
                    label="Teléfono Institucional"
                    disabled={!puedeEditar}
                    value={institucion.telefonoEscuela}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, telefonoEscuela: e.target.value })
                    }
                  />
                </div>

                {puedeEditar && (
                  <div className={s.formActions}>
                    <Button type="submit" disabled={savingInst}>
                      {savingInst ? "Guardando..." : "Guardar Datos del Establecimiento"}
                    </Button>
                  </div>
                )}
              </Card>
            </form>

            <Card title="Equipo Directivo, Secretarios y Docentes">
              <div className={s.sectionTopBar}>
                <p className={s.summary}>
                  Personal del establecimiento registrado. Los cargos vinculados se sincronizan automáticamente con la Nómina Oficial de la Asamblea y Comisión Directiva.
                </p>
                {puedeEditar && (
                  <Button
                    type="button"
                    onClick={() =>
                      setPersonalEditando({
                        id: 0,
                        cargo: "Docente de Grado",
                        nombre: "",
                        dni: "",
                        telefono: "",
                        email: "",
                        vinculoNomina: "NINGUNO",
                      })
                    }
                  >
                    + Nuevo integrante
                  </Button>
                )}
              </div>

              <DataTable
                columns={columnsPersonal}
                rows={personal}
                rowKey={(p) => p.id}
                emptyMessage={loading ? "Cargando personal..." : "No hay personal registrado en el establecimiento."}
              />
            </Card>
          </div>
        )}

        {/* TAB 3: ASOCIACIÓN COOPERADORA Y CUENTAS BANCARIAS */}
        {activeTab === "cooperadora" && institucion && (
          <form onSubmit={handleGuardarInstitucion}>
            <Card title="Datos Legales de la Asociación Cooperadora">
              <div className={s.configGrid}>
                <Field
                  label="Nombre de la Asociación Cooperadora"
                  disabled={!puedeEditar}
                  value={institucion.asociacionNombre}
                  onChange={(e) =>
                    setInstitucion({ ...institucion, asociacionNombre: e.target.value })
                  }
                  required
                />
                <Field
                  label="C.U.I.T. Cooperadora"
                  disabled={!puedeEditar}
                  value={institucion.cuit}
                  onChange={(e) =>
                    setInstitucion({ ...institucion, cuit: e.target.value })
                  }
                  required
                />
                <Field
                  label="Correo Electrónico de la Cooperadora"
                  type="email"
                  disabled={!puedeEditar}
                  value={institucion.emailInstitucional}
                  onChange={(e) =>
                    setInstitucion({ ...institucion, emailInstitucional: e.target.value })
                  }
                />
              </div>
            </Card>

            <div style={{ marginTop: "var(--space-6)" }}>
              <Card title="Datos de Cuenta Bancaria Oficial (P.I.A.)">
                <div className={s.configGrid}>
                  <Field
                    label="Entidad Bancaria"
                    disabled={!puedeEditar}
                    value={institucion.bancoNombre}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, bancoNombre: e.target.value })
                    }
                  />
                  <Field
                    label="Sucursal Bancaria"
                    disabled={!puedeEditar}
                    value={institucion.bancoSucursal}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, bancoSucursal: e.target.value })
                    }
                  />
                  <Field
                    label="Número de Cuenta Corriente"
                    disabled={!puedeEditar}
                    value={institucion.cuentaCorriente}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, cuentaCorriente: e.target.value })
                    }
                  />
                  <Field
                    label="C.B.U. (22 dígitos)"
                    disabled={!puedeEditar}
                    value={institucion.cbu}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, cbu: e.target.value })
                    }
                  />
                  <Field
                    label="Alias de la Cuenta"
                    disabled={!puedeEditar}
                    value={institucion.alias}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, alias: e.target.value })
                    }
                  />
                </div>
              </Card>
            </div>

            <div style={{ marginTop: "var(--space-6)" }}>
              <Card title="Valores Oficiales de Cuota Social">
                <div className={s.configGrid}>
                  <Field
                    label="Valor Cuota Social Mensual ($)"
                    type="number"
                    min="0"
                    step="100"
                    disabled={!puedeEditar}
                    value={institucion.cuotaMensual}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, cuotaMensual: e.target.value })
                    }
                    required
                  />
                  <Field
                    label="Valor Cuota Social Anual ($)"
                    type="number"
                    min="0"
                    step="100"
                    disabled={!puedeEditar}
                    value={institucion.cuotaAnual}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, cuotaAnual: e.target.value })
                    }
                    required
                  />
                </div>
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--color-text-muted)", display: "block", marginTop: "var(--space-2)" }}>
                  💡 Este valor es el arancel societario oficial fijado en Asamblea. Se utilizará como sugerido por defecto en los registros de pago y en la Planilla de Información Anual (P.I.A.).
                </span>
              </Card>
            </div>

            {puedeEditar && (
              <div className={s.formActions}>
                <Button type="submit" disabled={savingInst}>
                  {savingInst ? "Guardando..." : "Guardar Datos de la Cooperadora"}
                </Button>
              </div>
            )}
          </form>
        )}
      </div>

      {/* MODAL DE EDICIÓN CON LOS COMPONENTES ESTÉTICOS DE LA APP */}
      {miembroEditando && (
        <div className={s.modalOverlay}>
          <div className={s.modalCard}>
            <div className={s.modalHeader}>
              <h3 className={s.modalTitle}>
                Editar Autoridad: {miembroEditando.cargo}
              </h3>
              <button
                type="button"
                className={s.modalClose}
                onClick={() => setMiembroEditando(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarMiembroModal}>
              <div className={s.modalBody}>
                <SelectField
                  label="Vincular con Asociado del padrón:"
                  value={miembroEditando.asociadoId ? String(miembroEditando.asociadoId) : ""}
                  options={opcionesAsociados}
                  onChange={handleSeleccionarAsociado}
                  width="100%"
                />

                <Field
                  label="Apellido y Nombre:"
                  required
                  value={miembroEditando.nombre}
                  onChange={(e) =>
                    setMiembroEditando({ ...miembroEditando, nombre: e.target.value })
                  }
                  width="100%"
                />

                <div className={s.modalRow}>
                  <Field
                    label="DNI:"
                    required
                    value={miembroEditando.dni}
                    onChange={(e) =>
                      setMiembroEditando({ ...miembroEditando, dni: e.target.value })
                    }
                  />
                  <Field
                    label="CUIL:"
                    required
                    value={miembroEditando.cuil}
                    onChange={(e) =>
                      setMiembroEditando({ ...miembroEditando, cuil: e.target.value })
                    }
                  />
                </div>

                <div className={s.modalRow}>
                  <Field
                    label="Domicilio:"
                    required
                    value={miembroEditando.domicilio}
                    onChange={(e) =>
                      setMiembroEditando({ ...miembroEditando, domicilio: e.target.value })
                    }
                  />
                  <Field
                    label="Localidad:"
                    required
                    value={miembroEditando.localidad}
                    onChange={(e) =>
                      setMiembroEditando({ ...miembroEditando, localidad: e.target.value })
                    }
                  />
                </div>

                <div className={s.modalRow}>
                  <Field
                    label="Teléfono:"
                    value={miembroEditando.telefono}
                    onChange={(e) =>
                      setMiembroEditando({ ...miembroEditando, telefono: e.target.value })
                    }
                  />
                  <Field
                    label="Vencimiento Mandato:"
                    value={miembroEditando.vencimiento}
                    onChange={(e) =>
                      setMiembroEditando({ ...miembroEditando, vencimiento: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className={s.modalFooter}>
                <Button
                  variant="secondary"
                  onClick={() => setMiembroEditando(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  Guardar Cambios
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE PERSONAL DEL ESTABLECIMIENTO */}
      {personalEditando && (
        <div className={s.modalOverlay}>
          <div className={s.modalCard}>
            <div className={s.modalHeader}>
              <h3 className={s.modalTitle}>
                {personalEditando.id === 0 ? "Nuevo Integrante del Establecimiento" : `Editar Personal: ${personalEditando.nombre}`}
              </h3>
              <button
                type="button"
                className={s.modalClose}
                onClick={() => setPersonalEditando(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarPersonalModal}>
              <div className={s.modalBody}>
                <div className={s.modalRow}>
                  <Field
                    label="Cargo en el Establecimiento:"
                    placeholder="Ej. Director/a, Vicedirector/a, Secretario/a, Docente 4° A"
                    required
                    value={personalEditando.cargo}
                    onChange={(e) =>
                      setPersonalEditando({ ...personalEditando, cargo: e.target.value })
                    }
                  />
                  <Field
                    label="DNI:"
                    required
                    value={personalEditando.dni}
                    onChange={(e) =>
                      setPersonalEditando({ ...personalEditando, dni: e.target.value })
                    }
                  />
                </div>

                <Field
                  label="Apellido y Nombre:"
                  placeholder="Ej. Prof. María Rodríguez"
                  required
                  value={personalEditando.nombre}
                  onChange={(e) =>
                    setPersonalEditando({ ...personalEditando, nombre: e.target.value })
                  }
                  width="100%"
                />

                <div className={s.modalRow}>
                  <Field
                    label="Teléfono:"
                    value={personalEditando.telefono}
                    onChange={(e) =>
                      setPersonalEditando({ ...personalEditando, telefono: e.target.value })
                    }
                  />
                  <Field
                    label="Correo Electrónico:"
                    type="email"
                    value={personalEditando.email}
                    onChange={(e) =>
                      setPersonalEditando({ ...personalEditando, email: e.target.value })
                    }
                  />
                </div>

                <SelectField
                  label="Vincular con la Nómina Oficial de Comisión Directiva:"
                  value={personalEditando.vinculoNomina}
                  options={OPCIONES_VINCULO}
                  onChange={(val) =>
                    setPersonalEditando({ ...personalEditando, vinculoNomina: val })
                  }
                  width="100%"
                />
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--color-text-muted)" }}>
                  💡 Si vinculas este integrante, sus datos actualizarán en tiempo real la fila correspondiente en la Nómina Oficial (Asesor, Revisor de Cuentas Docente Titular o Suplente).
                </span>
              </div>

              <div className={s.modalFooter}>
                <Button
                  variant="secondary"
                  onClick={() => setPersonalEditando(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {personalEditando.id === 0 ? "Agregar Integrante" : "Guardar Cambios"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
