// src/pages/Rendiciones.tsx
import { useEffect, useState, FormEvent } from "react";
import { api, RendicionFila, LineaRendicion, MesRendicion, money, hoyISO, ejercicioDe, anioEjercicioActual, nombreMes } from "../api";
import Layout from "../components/Layout";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import DataTable, { Column } from "../components/ui/DataTable";
import { Field, SelectField } from "../components/ui/Field";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import IconButton from "../components/ui/IconButton";
import { DocumentIcon, CheckIcon, TrashIcon, PrinterIcon } from "../components/icons";
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
  const [modo, setModo] = useState<"anual" | "personalizado">("anual");
  const [anioEjercicio, setAnioEjercicio] = useState(anioEjercicioActual());
  const [periodo, setPeriodo] = useState(ejercicioDe(anioEjercicioActual()).nombre);
  const [desde, setDesde] = useState(ejercicioDe(anioEjercicioActual()).desde);
  const [hasta, setHasta] = useState(ejercicioDe(anioEjercicioActual()).hasta);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pantalla Detalle / Planilla
  const [rendicionSeleccionada, setRendicionSeleccionada] = useState<RendicionFila | null>(null);
  const [detalle, setDetalle] = useState<LineaRendicion[]>([]);
  const [meses, setMeses] = useState<MesRendicion[]>([]);
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
    setMeses([]);
    if (idSeleccionada === undefined) return;
    api.detalleRendicion(idSeleccionada).then(setDetalle).catch(console.error);
    api.detalleMensualRendicion(idSeleccionada).then(setMeses).catch(console.error);
  }, [idSeleccionada]);

  const lineasIngreso = detalle.filter((l) => l.tipo === "Ingreso");
  const lineasEgreso = detalle.filter((l) => l.tipo === "Egreso");

  // Detalle mes a mes con el saldo acumulado del período
  let acumulado = 0;
  const filasMensuales = meses.map((m) => {
    acumulado += m.ingresos - m.egresos;
    return { ...m, saldoMes: m.ingresos - m.egresos, acumulado };
  });

  // La rendición anual va por ejercicio, del 1° de mayo al 30 de abril
  const ejerciciosDisponibles = Array.from({ length: 4 }, (_, i) => anioEjercicioActual() - i);

  const elegirEjercicio = (anioInicio: number) => {
    const ej = ejercicioDe(anioInicio);
    setAnioEjercicio(anioInicio);
    setPeriodo(ej.nombre);
    setDesde(ej.desde);
    setHasta(ej.hasta);
  };

  const cambiarModo = (valor: string) => {
    const nuevo = valor === "personalizado" ? "personalizado" : "anual";
    setModo(nuevo);
    if (nuevo === "anual") {
      elegirEjercicio(anioEjercicio);
    } else {
      setPeriodo("");
      setDesde(`${hoyISO().slice(0, 8)}01`);
      setHasta(hoyISO());
    }
  };

  const abrirNuevaRendicion = () => {
    setModo("anual");
    elegirEjercicio(anioEjercicioActual());
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
    if (desde > hasta) {
      setError("La fecha desde no puede ser posterior a la fecha hasta.");
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

  const imprimirRendicion = () => {
    if (!rendicionSeleccionada) return;
    const escapar = (valor: string) => valor.replace(/[&<>"']/g, (caracter) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[caracter] || caracter));
    const filas = (lineas: LineaRendicion[], vacio: string) => (
      lineas.length
        ? lineas.map((linea) => `<tr><td>${escapar(linea.categoria)}</td><td>${escapar(money(linea.total))}</td></tr>`).join("")
        : `<tr><td colspan="2" class="muted">${vacio}</td></tr>`
    );
    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, { position: "fixed", width: "1px", height: "1px", border: "0", opacity: "0" });
    document.body.appendChild(iframe);
    iframe.contentDocument?.open();
    iframe.contentDocument?.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Planilla de rendición</title>
      <style>
        @page { size: A4 portrait; margin: 16mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #1a1a1a; margin: 0; }
        h1 { text-align: center; font-size: 21px; margin: 0 0 5px; }
        .subtitle { text-align: center; color: #4b5563; margin-bottom: 18px; }
        .meta { display: flex; justify-content: space-between; gap: 12px; padding: 9px; background: #f3f4f6; border-radius: 4px; font-size: 11px; margin-bottom: 18px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
        h2 { font-size: 14px; padding-bottom: 6px; border-bottom: 2px solid; margin: 0 0 8px; }
        .income { color: #15803d; border-color: #15803d; } .expense { color: #b91c1c; border-color: #b91c1c; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        td { padding: 6px 0; border-bottom: 1px dotted #d1d5db; } td:last-child { text-align: right; font-weight: 600; }
        .total { font-weight: 700; border-top: 2px solid; } .total.income { color: #15803d; } .total.expense { color: #b91c1c; }
        .muted { color: #6b7280; } .balance { margin-top: 20px; padding: 12px; background: #f3f4f6; display: flex; justify-content: space-between; font-weight: 700; }
        .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 60px; text-align: center; font-size: 11px; }
        .signatures span { display: block; border-top: 1px solid #9ca3af; padding-top: 7px; }
        .monthly { margin-top: 22px; page-break-inside: avoid; } .monthly h2 { color: #1f2937; border-color: #1f2937; }
        .monthly th { font-size: 11px; text-align: right; padding: 5px 0; border-bottom: 1px solid #9ca3af; } .monthly th:first-child { text-align: left; }
        .monthly td { text-align: right; font-weight: 400; } .monthly td:first-child { text-align: left; } .monthly .total td { font-weight: 700; }
      </style></head><body>
      <h1>Planilla de Rendición de Cuentas</h1>
      <div class="subtitle">Asociación Cooperadora Escolar — ${escapar(rendicionSeleccionada.periodo)}</div>
      <div class="meta"><span>Período: ${escapar(rendicionSeleccionada.desde)} al ${escapar(rendicionSeleccionada.hasta)}</span><span>Generada por: ${escapar(rendicionSeleccionada.generadaPor)}</span><span>Estado: ${escapar(rendicionSeleccionada.estado)}</span></div>
      <div class="grid">
        <section><h2 class="income">I. INGRESOS</h2><table>${filas(lineasIngreso, "Sin ingresos en el período")}<tr class="total income"><td>TOTAL INGRESOS</td><td>+ ${escapar(money(rendicionSeleccionada.totalIngresos))}</td></tr></table></section>
        <section><h2 class="expense">II. EGRESOS</h2><table>${filas(lineasEgreso, "Sin egresos en el período")}<tr class="total expense"><td>TOTAL EGRESOS</td><td>- ${escapar(money(rendicionSeleccionada.totalEgresos))}</td></tr></table></section>
      </div>
      <div class="balance"><span>SALDO FINAL DEL PERÍODO</span><span>${escapar(money(rendicionSeleccionada.saldoPeriodo))}</span></div>
      ${filasMensuales.length > 1 ? `<section class="monthly"><h2>III. DETALLE MENSUAL</h2><table>
        <tr><th>Mes</th><th>Ingresos</th><th>Egresos</th><th>Saldo del mes</th><th>Saldo acumulado</th></tr>
        ${filasMensuales.map((m) => `<tr><td>${escapar(nombreMes(m.mes))}</td><td>${escapar(money(m.ingresos))}</td><td>${escapar(money(m.egresos))}</td><td>${escapar(money(m.saldoMes))}</td><td>${escapar(money(m.acumulado))}</td></tr>`).join("")}
        <tr class="total"><td>TOTAL</td><td>${escapar(money(rendicionSeleccionada.totalIngresos))}</td><td>${escapar(money(rendicionSeleccionada.totalEgresos))}</td><td></td><td>${escapar(money(rendicionSeleccionada.saldoPeriodo))}</td></tr>
      </table></section>` : ""}
      <div class="signatures"><span>Tesorero/a</span><span>Presidente</span><span>Revisor de Cuentas</span></div>
      </body></html>`);
    iframe.contentDocument?.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1000);
    }, 100);
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
      minWidth: 140,
      flex: true,
      render: (r) => (
        <div>
          <strong>{r.periodo}</strong>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--color-text-muted)" }}>
            {r.desde} al {r.hasta}
          </div>
        </div>
      ),
    },
    { header: "Generada el", width: 100, render: (r) => r.generadaEn },
    {
      header: "Ingresos",
      width: 130,
      render: (r) => <span style={{ color: "var(--color-ok)", fontWeight: 600 }}>+ {money(r.totalIngresos)}</span>,
    },
    {
      header: "Egresos",
      width: 130,
      render: (r) => <span style={{ color: "var(--color-danger)", fontWeight: 600 }}>- {money(r.totalEgresos)}</span>,
    },
    {
      header: "Saldo",
      width: 130,
      render: (r) => (
        <strong style={{ color: r.saldoPeriodo >= 0 ? "var(--color-ok)" : "var(--color-danger)" }}>
          {money(r.saldoPeriodo)}
        </strong>
      ),
    },
    {
      header: "Estado",
      width: 100,
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
              <div className={s.formRow}>
                <SelectField
                  label="Tipo de rendición"
                  value={modo}
                  options={[
                    { value: "anual", label: "Ejercicio anual (mayo a abril)" },
                    { value: "personalizado", label: "Período personalizado" },
                  ]}
                  onChange={cambiarModo}
                  width={300}
                />
                {modo === "anual" && (
                  <SelectField
                    label="Ejercicio"
                    value={String(anioEjercicio)}
                    options={ejerciciosDisponibles.map((anio) => ({
                      value: String(anio),
                      label: `${anio}/${anio + 1}${anio === anioEjercicioActual() ? " (en curso)" : ""}`,
                    }))}
                    onChange={(v) => elegirEjercicio(Number(v))}
                    width={220}
                  />
                )}
              </div>

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
                  disabled={modo === "anual"}
                  width={220}
                  required
                />
                <Field
                  label="Fecha hasta"
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  disabled={modo === "anual"}
                  width={220}
                  required
                />
              </div>
              {modo === "anual" && (
                <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--color-text-muted)" }}>
                  La planilla suma los movimientos del ejercicio y los detalla mes por mes; los meses sin movimientos figuran en 0.
                </p>
              )}
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
          <Button variant="secondary" onClick={imprimirRendicion} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <PrinterIcon size={16} /> Imprimir planilla
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

          {filasMensuales.length > 1 && (
            <div style={{ marginTop: "var(--space-6)" }}>
              <div className={s.sheetColTitle}>III. DETALLE MENSUAL</div>
              <table className={s.sheetTable}>
                <thead>
                  <tr style={{ fontSize: "var(--fs-sm)", color: "var(--color-text-muted)" }}>
                    <th style={{ textAlign: "left" }}>Mes</th>
                    <th style={{ textAlign: "right" }}>Ingresos</th>
                    <th style={{ textAlign: "right" }}>Egresos</th>
                    <th style={{ textAlign: "right" }}>Saldo del mes</th>
                    <th style={{ textAlign: "right" }}>Saldo acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {filasMensuales.map((m) => (
                    <tr key={m.mes} style={m.ingresos === 0 && m.egresos === 0 ? { color: "var(--color-text-hint)" } : undefined}>
                      <td>{nombreMes(m.mes)}</td>
                      <td style={{ textAlign: "right" }}>{money(m.ingresos)}</td>
                      <td style={{ textAlign: "right" }}>{money(m.egresos)}</td>
                      <td style={{ textAlign: "right" }}>{money(m.saldoMes)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{money(m.acumulado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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
