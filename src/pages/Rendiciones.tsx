// src/pages/Rendiciones.tsx
import { useEffect, useState, FormEvent } from "react";
import { api, RendicionFila, LineaRendicion, money } from "../api";
import Layout from "../components/Layout";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import DataTable, { Column } from "../components/ui/DataTable";
import { Field, SelectField } from "../components/ui/Field";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import IconButton from "../components/ui/IconButton";
import { DocumentIcon, CheckIcon, TrashIcon } from "../components/icons";
import { useApp } from "../context";
import s from "./Rendiciones.module.css";

export default function Rendiciones() {
  const { usuario } = useApp();
  const puedeCrear = usuario.rol === "Tesorero" || usuario.rol === "Superadmin";
  const puedeAprobar = usuario.rol === "Presidente" || usuario.rol === "Superadmin";
  const [vista, setVista] = useState<"lista" | "nuevo" | "detalle">("lista");

  const [rendiciones, setRendiciones] = useState<RendicionFila[]>([]);
  const [estadoFiltro, setEstadoFiltro] = useState("Todos");
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(false);

  // Formulario Nueva Rendición
  const [periodo, setPeriodo] = useState("3° Trimestre 2026");
  const [desde, setDesde] = useState("2026-07-01");
  const [hasta, setHasta] = useState("2026-09-30");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pantalla Detalle / Planilla
  const [rendicionSeleccionada, setRendicionSeleccionada] = useState<RendicionFila | null>(null);
  const [detalle, setDetalle] = useState<LineaRendicion[]>([]);
  const [aprobando, setAprobando] = useState(false);
  const [rendicionParaEliminar, setRendicionParaEliminar] = useState<{ id: number; periodo: string } | null>(null);

  const cargarRendiciones = () => {
    setLoading(true);
    api.listarRendiciones()
      .then(setRendiciones)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    cargarRendiciones();
  }, []);

  // Detalle por categoría de la planilla: sale de los mismos movimientos que los totales
  const idSeleccionada = rendicionSeleccionada?.id;
  useEffect(() => {
    setDetalle([]);
    if (idSeleccionada === undefined) return;
    api.detalleRendicion(idSeleccionada).then(setDetalle).catch(console.error);
  }, [idSeleccionada]);

  const lineasIngreso = detalle.filter((l) => l.tipo === "Ingreso");
  const lineasEgreso = detalle.filter((l) => l.tipo === "Egreso");

  const abrirNuevaRendicion = () => {
    setPeriodo("3° Trimestre 2026");
    setDesde("2026-07-01");
    setHasta("2026-09-30");
    setError(null);
    setVista("nuevo");
  };

  const guardarRendicion = async (e: FormEvent) => {
    e.preventDefault();
    if (!periodo.trim()) {
      setError("Debe indicar el nombre del período.");
      return;
    }
    if (!desde || !hasta) {
      setError("Debe completar el rango de fechas desde y hasta.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.crearRendicion({
        periodo: periodo.trim(),
        desde,
        hasta,
      });
      cargarRendiciones();
      setVista("lista");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const aprobarRendicion = async (id: number) => {
    setAprobando(true);
    try {
      await api.aprobarRendicion(id);
      if (rendicionSeleccionada && rendicionSeleccionada.id === id) {
        setRendicionSeleccionada({
          ...rendicionSeleccionada,
          estado: "Aprobada",
          aprobadaPor: "Presidente",
          aprobadaEn: new Date().toLocaleDateString("es-AR"),
        });
      }
      cargarRendiciones();
    } catch (err) {
      console.error(err);
    } finally {
      setAprobando(false);
    }
  };

  const confirmarEliminarRendicion = async () => {
    if (!rendicionParaEliminar) return;
    try {
      await api.eliminarRendicion(rendicionParaEliminar.id);
      if (rendicionSeleccionada && rendicionSeleccionada.id === rendicionParaEliminar.id) {
        setRendicionSeleccionada(null);
        setVista("lista");
      }
      setRendicionParaEliminar(null);
      cargarRendiciones();
    } catch (err) {
      console.error(err);
    }
  };

  const rendicionesFiltradas = rendiciones.filter((r) => {
    const matchEstado = estadoFiltro === "Todos" || r.estado === estadoFiltro;
    const matchBusqueda =
      !busqueda ||
      r.periodo.toLowerCase().includes(busqueda.toLowerCase()) ||
      r.generadaPor.toLowerCase().includes(busqueda.toLowerCase());
    return matchEstado && matchBusqueda;
  });

  const columns: Column<RendicionFila>[] = [
    {
      header: "Período",
      minWidth: 150,
      flex: true,
      render: (r) => <strong>{r.periodo}</strong>,
    },
    {
      header: "Rango de fechas",
      minWidth: 180,
      flex: true,
      render: (r) => (
        <span>
          {r.desde} al {r.hasta}
        </span>
      ),
    },
    { header: "Generada el", minWidth: 120, flex: true, render: (r) => r.generadaEn },
    {
      header: "Ingresos",
      minWidth: 120,
      flex: true,
      render: (r) => <span style={{ color: "var(--color-ok)", fontWeight: 600 }}>+ {money(r.totalIngresos)}</span>,
    },
    {
      header: "Egresos",
      minWidth: 120,
      flex: true,
      render: (r) => <span style={{ color: "var(--color-danger)", fontWeight: 600 }}>- {money(r.totalEgresos)}</span>,
    },
    {
      header: "Saldo",
      minWidth: 130,
      flex: true,
      render: (r) => (
        <strong style={{ color: r.saldoPeriodo >= 0 ? "var(--color-ok)" : "var(--color-danger)" }}>
          {money(r.saldoPeriodo)}
        </strong>
      ),
    },
    {
      header: "Estado",
      minWidth: 110,
      flex: true,
      render: (r) => (
        <Badge tone={r.estado === "Aprobada" ? "ok" : "warn"}>
          {r.estado === "Aprobada" ? "Aprobada" : "Borrador"}
        </Badge>
      ),
    },
    {
      header: "Acciones",
      width: 130,
      align: "center",
      render: (r) => (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 32px)",
            gap: "6px",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <IconButton
              icon={<DocumentIcon />}
              title="Ver balance de rendición"
              variant="primary"
              square
              onClick={(e) => {
                e.stopPropagation();
                setRendicionSeleccionada(r);
                setVista("detalle");
              }}
            />
          </div>
          <div style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {puedeAprobar && r.estado === "Borrador" && (
              <IconButton
                icon={<CheckIcon />}
                title="Aprobar rendición formalmente"
                variant="success"
                square
                onClick={(e) => {
                  e.stopPropagation();
                  aprobarRendicion(r.id);
                }}
              />
            )}
          </div>
          <div style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {puedeCrear && r.estado === "Borrador" && (
              <IconButton
                icon={<TrashIcon />}
                title="Eliminar rendición"
                variant="danger"
                square
                onClick={(e) => {
                  e.stopPropagation();
                  setRendicionParaEliminar({ id: r.id, periodo: r.periodo });
                }}
              />
            )}
          </div>
        </div>
      ),
    },
  ];

  // -------------------------------------------------------------
  // PANTALLA 1: LISTADO DE RENDICIONES
  // -------------------------------------------------------------
  if (vista === "lista") {
    return (
      <Layout
        title="Rendiciones de cuentas"
        action={puedeCrear ? <Button onClick={abrirNuevaRendicion}>+ Generar rendición</Button> : undefined}
      >
        <div className={s.filters}>
          <Field
            label="Buscar por período"
            type="search"
            placeholder="Escribí un período…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            width={340}
          />
          <SelectField
            label="Filtrar por estado"
            value={estadoFiltro}
            options={["Todos", "Aprobada", "Borrador"]}
            onChange={setEstadoFiltro}
            width={200}
          />
        </div>

        <DataTable
          columns={columns}
          rows={rendicionesFiltradas}
          rowKey={(r) => r.id}
          emptyMessage={loading ? "Cargando rendiciones..." : "No se encontraron rendiciones registradas."}
          onRowClick={(r) => {
            setRendicionSeleccionada(r);
            setVista("detalle");
          }}
        />

        <ConfirmDialog
          isOpen={rendicionParaEliminar !== null}
          title="Eliminar rendición de cuentas"
          message={
            rendicionParaEliminar ? (
              <>
                ¿Está seguro de que desea eliminar la rendición{" "}
                <strong>"{rendicionParaEliminar.periodo}"</strong>?
              </>
            ) : null
          }
          confirmLabel="Eliminar rendición"
          cancelLabel="Cancelar"
          variant="danger"
          onConfirm={confirmarEliminarRendicion}
          onCancel={() => setRendicionParaEliminar(null)}
        />
      </Layout>
    );
  }

  // -------------------------------------------------------------
  // PANTALLA 2: GENERAR RENDICIÓN
  // -------------------------------------------------------------
  if (vista === "nuevo") {
    return (
      <Layout
        title="Rendiciones › Generar rendición"
        action={
          <Button variant="secondary" onClick={() => setVista("lista")}>
            ← Volver al listado
          </Button>
        }
      >
        <form onSubmit={guardarRendicion} className={s.formContainer}>
          {error && <div className={s.errorMsg}>{error}</div>}

          <Card title="Parámetros del balance">
            <div className={s.formFields}>
              <Field
                label="Nombre del período / Ejercicio"
                placeholder="Ej: 3° Trimestre 2026 (Jul-Sep)"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                width="100%"
                required
              />

              <div className={s.formRow}>
                <Field
                  label="Fecha desde"
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  width={220}
                  required
                />
                <Field
                  label="Fecha hasta"
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  width={220}
                  required
                />
              </div>
            </div>
          </Card>

          <div className={s.actionRow}>
            <Button type="submit" disabled={saving}>
              {saving ? "Generando..." : "Generar balance"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setVista("lista")}
              disabled={saving}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Layout>
    );
  }

  // -------------------------------------------------------------
  // PANTALLA 3: PLANILLA DE BALANCE
  // -------------------------------------------------------------
  return (
    <Layout
      title="Rendiciones › Planilla de balance"
      action={
        <div style={{ display: "flex", gap: "var(--space-4)" }}>
          <Button variant="secondary" onClick={() => window.print()}>
            🖨️ Imprimir planilla
          </Button>
          <Button variant="secondary" onClick={() => setVista("lista")}>
            ← Volver al listado
          </Button>
        </div>
      }
    >
      {rendicionSeleccionada && (
        <div className={s.sheetPaper}>
          <div className={s.sheetHeader}>
            <div className={s.sheetTitle}>Planilla de Rendición de Cuentas</div>
            <div className={s.sheetSubtitle}>Asociación Cooperadora Escolar — {rendicionSeleccionada.periodo}</div>
            <div className={s.sheetMeta}>
              <span>Período: {rendicionSeleccionada.desde} al {rendicionSeleccionada.hasta}</span>
              <span>Generada por: {rendicionSeleccionada.generadaPor}</span>
              <span>Estado: {rendicionSeleccionada.estado} {rendicionSeleccionada.aprobadaPor ? `(${rendicionSeleccionada.aprobadaPor})` : ""}</span>
            </div>
          </div>

          <div className={s.sheetGrid}>
            <div>
              <div className={`${s.sheetColTitle} ${s.sheetColIngresos}`}>I. INGRESOS</div>
              <table className={s.sheetTable}>
                <tbody>
                  {lineasIngreso.length === 0 && (
                    <tr>
                      <td colSpan={2} style={{ color: "var(--color-text-hint)" }}>Sin ingresos en el período</td>
                    </tr>
                  )}
                  {lineasIngreso.map((l) => (
                    <tr key={l.categoria}>
                      <td>{l.categoria}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{money(l.total)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "2px solid var(--color-ok)" }}>
                    <td><strong>TOTAL INGRESOS</strong></td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: "var(--color-ok)" }}>
                      + {money(rendicionSeleccionada.totalIngresos)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <div className={`${s.sheetColTitle} ${s.sheetColEgresos}`}>II. EGRESOS</div>
              <table className={s.sheetTable}>
                <tbody>
                  {lineasEgreso.length === 0 && (
                    <tr>
                      <td colSpan={2} style={{ color: "var(--color-text-hint)" }}>Sin egresos en el período</td>
                    </tr>
                  )}
                  {lineasEgreso.map((l) => (
                    <tr key={l.categoria}>
                      <td>{l.categoria}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{money(l.total)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "2px solid var(--color-danger)" }}>
                    <td><strong>TOTAL EGRESOS</strong></td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: "var(--color-danger)" }}>
                      - {money(rendicionSeleccionada.totalEgresos)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className={s.sheetTotalBox}>
            <span className={s.sheetTotalLabel}>SALDO FINAL DEL PERÍODO</span>
            <span className={s.sheetTotalValue}>
              {money(rendicionSeleccionada.saldoPeriodo)}
            </span>
          </div>

          <div className={s.sheetSignatures}>
            <div className={s.signBox}>Tesorero/a</div>
            <div className={s.signBox}>Presidente</div>
            <div className={s.signBox}>Revisor de Cuentas</div>
          </div>

          <div style={{ marginTop: "var(--space-5)", display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            {puedeAprobar && rendicionSeleccionada.estado === "Borrador" && (
              <Button
                onClick={() => aprobarRendicion(rendicionSeleccionada.id)}
                disabled={aprobando}
              >
                {aprobando ? "Aprobando..." : "✓ Aprobar rendición formalmente"}
              </Button>
            )}
            {puedeCrear && rendicionSeleccionada.estado === "Borrador" && (
              <Button
                variant="danger"
                onClick={() =>
                  setRendicionParaEliminar({
                    id: rendicionSeleccionada.id,
                    periodo: rendicionSeleccionada.periodo,
                  })
                }
              >
                Eliminar rendición
              </Button>
            )}
          </div>

          <ConfirmDialog
            isOpen={rendicionParaEliminar !== null}
            title="Eliminar rendición de cuentas"
            message={
              rendicionParaEliminar ? (
                <>
                  ¿Está seguro de que desea eliminar la rendición{" "}
                  <strong>"{rendicionParaEliminar.periodo}"</strong>?
                </>
              ) : null
            }
            confirmLabel="Eliminar rendición"
            cancelLabel="Cancelar"
            variant="danger"
            onConfirm={confirmarEliminarRendicion}
            onCancel={() => setRendicionParaEliminar(null)}
          />
        </div>
      )}
    </Layout>
  );
}
