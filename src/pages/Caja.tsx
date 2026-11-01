// src/pages/Caja.tsx
import { useEffect, useRef, useState, FormEvent } from "react";
import { api, MovimientoCajaFila, ResumenCaja, money, signedMoney } from "../api";
import Layout from "../components/Layout";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import DataTable, { Column } from "../components/ui/DataTable";
import { Field, SelectField } from "../components/ui/Field";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import IconButton from "../components/ui/IconButton";
import { BanIcon, EyeIcon, PrinterIcon, PaperclipIcon, SearchIcon } from "../components/icons";
import { useApp } from "../context";
import s from "./Caja.module.css";

const TIPOS_FILTRO = ["Todos", "Ingreso", "Egreso"];

const CATEGORIAS_FILTRO = [
  "Todas",
  "Cuotas",
  "Donaciones",
  "Subsidios",
  "Eventos y Festivales",
  "Mantenimiento y Reparaciones",
  "Material Didáctico y Librería",
  "Artículos de Limpieza",
  "Equipamiento y Mobiliario",
  "Otros",
];

const CATEGORIAS_INGRESO = [
  "Donaciones",
  "Subsidios",
  "Eventos y Festivales",
  "Otros Ingresos",
];

const CATEGORIAS_EGRESO = [
  "Mantenimiento y Reparaciones",
  "Material Didáctico y Librería",
  "Artículos de Limpieza",
  "Equipamiento y Mobiliario",
  "Gastos Administrativos",
  "Otros Egresos",
];

export default function Caja() {
  const { usuario } = useApp();
  const puedeOperarCaja = usuario.rol === "Tesorero" || usuario.rol === "Superadmin";
  const [vista, setVista] = useState<"lista" | "nuevo">("lista");

  const [movimientos, setMovimientos] = useState<MovimientoCajaFila[]>([]);
  const [resumen, setResumen] = useState<ResumenCaja | null>(null);
  const [tipoFiltro, setTipoFiltro] = useState("Todos");
  const [catFiltro, setCatFiltro] = useState("Todas");
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(false);

  // Formulario Nuevo Movimiento
  const [tipo, setTipo] = useState<"Ingreso" | "Egreso">("Egreso");
  const [categoria, setCategoria] = useState(CATEGORIAS_EGRESO[0]);
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  const [comprobante, setComprobante] = useState("");
  const [archivoAdjunto, setArchivoAdjunto] = useState<string | null>(null);
  const [archivoBase64, setArchivoBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Confirmación Anulación
  const [movimientoParaAnular, setMovimientoParaAnular] = useState<MovimientoCajaFila | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");

  // Modal Ver Detalle Movimiento
  const [movimientoSeleccionado, setMovimientoSeleccionado] = useState<MovimientoCajaFila | null>(null);
  const [visorArchivo, setVisorArchivo] = useState<{ nombre: string; dataUrl: string } | null>(null);
  const [imprimirAdjunto, setImprimirAdjunto] = useState(false);
  const detalleRef = useRef<HTMLDivElement | null>(null);
  const [detalleAltura, setDetalleAltura] = useState<number | null>(null);

  const cargarDatos = () => {
    setLoading(true);
    Promise.all([
      api.listarMovimientosCaja(tipoFiltro, catFiltro, busqueda),
      api.resumenCaja(),
    ])
      .then(([movs, res]) => {
        setMovimientos(movs);
        setResumen(res);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    cargarDatos();
  }, [tipoFiltro, catFiltro, busqueda]);

  const abrirNuevoMovimiento = (defaultTipo: "Ingreso" | "Egreso" = "Egreso") => {
    setTipo(defaultTipo);
    setCategoria(defaultTipo === "Ingreso" ? CATEGORIAS_INGRESO[0] : CATEGORIAS_EGRESO[0]);
    setDescripcion("");
    setMonto("");
    setComprobante("");
    setArchivoAdjunto(null);
    setArchivoBase64(null);
    setError(null);
    setVista("nuevo");
  };

  const handleArchivoSeleccionado = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError("El comprobante adjunto supera el límite de 10 MB.");
        e.target.value = "";
        return;
      }
      setArchivoAdjunto(file.name);
      if (!comprobante.trim()) {
        const nombreSinExt = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
        setComprobante(nombreSinExt);
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setArchivoBase64(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const guardarMovimiento = async (e: FormEvent) => {
    e.preventDefault();
    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) {
      setError("El monto debe ser un valor numérico mayor a cero.");
      return;
    }
    if (!descripcion.trim()) {
      setError("La descripción es obligatoria.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const compFinal = comprobante.trim() || (archivoAdjunto ? archivoAdjunto : undefined);
      await api.crearMovimientoCaja({
        tipo,
        categoria,
        descripcion: descripcion.trim(),
        monto: montoNum,
        comprobante: compFinal,
        // El archivo se guarda en la base de datos para que quede incluido en las copias de seguridad
        adjuntoNombre: archivoBase64 ? archivoAdjunto || "comprobante" : undefined,
        adjuntoDatos: archivoBase64 || undefined,
      });

      cargarDatos();
      setVista("lista");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const abrirAdjunto = async (id: number) => {
    if (visorArchivo) {
      setVisorArchivo(null);
      return;
    }
    try {
      const adjunto = await api.obtenerAdjuntoMovimiento(id);
      if (adjunto) setVisorArchivo(adjunto);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!movimientoSeleccionado || !detalleRef.current) return;
    const actualizarAltura = () => {
      if (detalleRef.current) setDetalleAltura(detalleRef.current.offsetHeight);
    };
    actualizarAltura();
    const observer = new ResizeObserver(actualizarAltura);
    observer.observe(detalleRef.current);
    return () => observer.disconnect();
  }, [movimientoSeleccionado, imprimirAdjunto]);

  const imprimirDetalleMovimiento = async () => {
    if (!movimientoSeleccionado) return;
    let adjunto: { nombre: string; dataUrl: string } | null = null;
    if (imprimirAdjunto && movimientoSeleccionado.adjuntoNombre) {
      adjunto = await api.obtenerAdjuntoMovimiento(movimientoSeleccionado.id);
    }
    const escapar = (valor: string) => valor.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c] || c));
    const adjuntoHtml = adjunto
      ? adjunto.dataUrl.startsWith("data:image/")
        ? `<div class="attachment"><h3>Comprobante adjunto</h3><img src="${adjunto.dataUrl}" alt="${escapar(adjunto.nombre)}"></div>`
        : `<div class="attachment"><h3>Comprobante adjunto</h3><div class="pdf-note">${escapar(adjunto.nombre)} (archivo PDF adjunto)</div></div>`
      : "";
    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, { position: "fixed", width: "1px", height: "1px", border: "0", opacity: "0" });
    document.body.appendChild(iframe);
    iframe.contentDocument?.open();
    iframe.contentDocument?.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Detalle del movimiento</title>
      <style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1f2937;margin:0}h1{font-size:20px;margin:0 0 14px}h3{font-size:14px;margin:14px 0 8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px}.item span{display:block;color:#6b7280;font-size:12px;font-weight:600;margin-bottom:4px}.amount{font-size:18px;font-weight:700;color:${movimientoSeleccionado.tipo === "Ingreso" ? "#15803d" : "#b91c1c"}}.description{margin-top:16px;padding:10px;background:#f3f4f6;border:1px solid #d1d5db}.attachment{margin-top:14px;page-break-inside:avoid}.attachment img{display:block;max-width:100%;max-height:145mm;object-fit:contain}.pdf-note{padding:12px;border:1px solid #d1d5db}</style></head><body>
      <h1>Detalle del Movimiento #${movimientoSeleccionado.id}</h1>
      <div class="grid"><div class="item"><span>Tipo de Movimiento</span><strong>${escapar(movimientoSeleccionado.tipo)}</strong></div><div class="item"><span>Estado</span><strong>${movimientoSeleccionado.anulado ? "Anulado" : "Efectivo / Válido"}</strong></div><div class="item"><span>Fecha del Movimiento</span><strong>${escapar(movimientoSeleccionado.fecha)}</strong></div><div class="item"><span>Registrado por</span><strong>${escapar(movimientoSeleccionado.registradoPor || "—")}</strong></div><div class="item"><span>Monto Operado</span><strong class="amount">${escapar(signedMoney(movimientoSeleccionado.tipo, movimientoSeleccionado.monto))}</strong></div><div class="item"><span>Categoría</span><strong>${escapar(movimientoSeleccionado.categoria)}</strong></div><div class="item"><span>N° de Comprobante / Factura</span><strong>${escapar(movimientoSeleccionado.comprobante || "Sin comprobante asociado")}</strong></div></div>
      <div class="description"><strong>Concepto / Descripción Detallada</strong><br>${escapar(movimientoSeleccionado.descripcion)}</div>${adjuntoHtml}</body></html>`);
    iframe.contentDocument?.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1000);
    }, 100);
  };

  const confirmarAnularMovimiento = async () => {
    if (!movimientoParaAnular) return;
    try {
      await api.anularMovimientoCaja(movimientoParaAnular.id, motivoAnulacion.trim() || undefined);
      setMovimientoParaAnular(null);
      setMotivoAnulacion("");
      cargarDatos();
    } catch (err) {
      console.error(err);
    }
  };

  const columns: Column<MovimientoCajaFila>[] = [
    { header: "Fecha", minWidth: 105, flex: true, render: (m) => m.fecha },
    {
      header: "Tipo",
      minWidth: 110,
      flex: true,
      render: (m) => (
        <Badge tone={m.tipo === "Ingreso" ? "ok" : "danger"}>
          {m.tipo === "Ingreso" ? "Ingreso" : "Egreso"}
        </Badge>
      ),
    },
    { header: "Categoría", minWidth: 150, flex: true, render: (m) => m.categoria },
    {
      header: "Descripción",
      minWidth: 240,
      flex: true,
      render: (m) => {
        // En la tabla solo mostramos la primera línea si la descripción es multilínea
        const primeraLinea = m.descripcion.split("\n")[0];
        return (
          <div>
            <span style={{ textDecoration: m.anulado ? "line-through" : "none", color: m.anulado ? "var(--color-text-hint)" : "inherit" }}>
              {primeraLinea}
            </span>
            {m.anulado === 1 && (
              <Badge tone="danger" style={{ marginLeft: "8px" }}>
                Anulado
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      header: "Comprobante",
      minWidth: 130,
      flex: true,
      render: (m) => m.comprobante ? m.comprobante : <span style={{ color: "var(--color-text-hint)" }}>—</span>,
    },
    {
      header: "Monto",
      minWidth: 130,
      flex: true,
      render: (m) => (
        <strong
          style={{
            color: m.anulado ? "var(--color-text-hint)" : m.tipo === "Ingreso" ? "var(--color-ok)" : "var(--color-danger)",
            textDecoration: m.anulado ? "line-through" : "none",
          }}
        >
          {signedMoney(m.tipo, m.monto)}
        </strong>
      ),
    },
    {
      header: "Acciones",
      width: 95,
      align: "center",
      render: (m) => (
        <div style={{ display: "flex", gap: "6px", alignItems: "center", justifyContent: "center" }}>
          <IconButton
            icon={<EyeIcon size={16} />}
            title="Ver detalle del movimiento"
            variant="default"
            square
            onClick={(e) => {
              e.stopPropagation();
              setMovimientoSeleccionado(m);
            }}
          />
          {puedeOperarCaja && m.anulado === 0 && (
            <IconButton
              icon={<BanIcon size={16} />}
              title="Anular movimiento"
              variant="danger"
              square
              onClick={(e) => {
                e.stopPropagation();
                setMovimientoParaAnular(m);
              }}
            />
          )}
        </div>
      ),
    },
  ];

  const saldo = resumen?.saldoActual ?? 0;

  // -------------------------------------------------------------
  // PANTALLA 1: LISTADO DE MOVIMIENTOS
  // -------------------------------------------------------------
  if (vista === "lista") {
    return (
      <Layout
        title="Caja"
        action={
          puedeOperarCaja ? (
            <div style={{ display: "flex", gap: "var(--space-4)" }}>
              <Button variant="secondary" onClick={() => abrirNuevoMovimiento("Ingreso")}>
                + Nuevo ingreso
              </Button>
              <Button onClick={() => abrirNuevoMovimiento("Egreso")}>
                - Nuevo egreso
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className={s.stats}>
          <Card compact className={s.stat}>
            <span className={s.statLabel}>Saldo de caja</span>
            <span className={saldo >= 0 ? s.statValueOk : s.statValueDanger}>{money(saldo)}</span>
          </Card>
          <Card compact className={s.stat}>
            <span className={s.statLabel}>Ingresos del mes</span>
            <span className={s.statValueOk}>+ {money(resumen?.ingresosMes ?? 0)}</span>
          </Card>
          <Card compact className={s.stat}>
            <span className={s.statLabel}>Egresos del mes</span>
            <span className={s.statValueDanger}>- {money(resumen?.egresosMes ?? 0)}</span>
          </Card>
          <Card compact className={s.stat}>
            <span className={s.statLabel}>Movimientos</span>
            <span className={s.statValue}>{resumen?.totalMovimientos ?? 0}</span>
          </Card>
        </div>

        <div className={s.filters}>
          <Field
            label="Buscar por descripción o comprobante"
            type="search"
            placeholder="Escribí un texto o N° de factura…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            width={340}
          />
          <SelectField
            label="Filtrar por tipo"
            value={tipoFiltro}
            options={TIPOS_FILTRO}
            onChange={setTipoFiltro}
            width={160}
          />
          <SelectField
            label="Filtrar por categoría"
            value={catFiltro}
            options={CATEGORIAS_FILTRO}
            onChange={setCatFiltro}
            width={240}
          />
        </div>

        <DataTable
          columns={columns}
          rows={movimientos}
          rowKey={(m) => m.id}
          onRowClick={(m) => {
            setMovimientoSeleccionado(m);
            setVisorArchivo(null);
            setImprimirAdjunto(false);
            setDetalleAltura(null);
          }}
          emptyMessage={loading ? "Cargando movimientos de caja..." : "No se encontraron movimientos registrados."}
        />

        {/* Modal de Detalle de Movimiento de Caja */}
        {movimientoSeleccionado && (
          <div className={s.modalOverlay} onClick={() => setMovimientoSeleccionado(null)}>
            <div className={`${s.detailWorkspace} ${visorArchivo ? s.withPreview : s.withoutPreview}`} onClick={(e) => e.stopPropagation()}>
            <div ref={detalleRef} className={s.modalCard} onClick={(e) => e.stopPropagation()}>
              <div className={s.modalHeader}>
                <h3 className={s.modalTitle}>
                  Detalle del Movimiento #{movimientoSeleccionado.id}
                </h3>
                <button
                  type="button"
                  className={`${s.modalClose} ${s.noPrint}`}
                  onClick={() => setMovimientoSeleccionado(null)}
                >
                  ✕
                </button>
              </div>

              <div className={s.modalBody}>
                <div className={s.detailGrid}>
                  <div className={s.detailItem}>
                    <span className={s.detailLabel}>Tipo de Movimiento</span>
                    <span className={s.detailValue}>
                      <Badge tone={movimientoSeleccionado.tipo === "Ingreso" ? "ok" : "danger"}>
                        {movimientoSeleccionado.tipo === "Ingreso" ? "Ingreso de Fondos" : "Egreso / Gasto"}
                      </Badge>
                    </span>
                  </div>

                  <div className={s.detailItem}>
                    <span className={s.detailLabel}>Estado</span>
                    <span className={s.detailValue}>
                      <Badge tone={movimientoSeleccionado.anulado === 1 ? "danger" : "ok"}>
                        {movimientoSeleccionado.anulado === 1 ? "Anulado" : "Efectivo / Válido"}
                      </Badge>
                    </span>
                  </div>

                  {movimientoSeleccionado.anulado === 1 && movimientoSeleccionado.motivoAnulacion && (
                    <div className={s.detailItem}>
                      <span className={s.detailLabel}>Motivo de Anulación</span>
                      <span className={s.detailValue} style={{ color: "var(--color-danger)", fontWeight: 500 }}>
                        {movimientoSeleccionado.motivoAnulacion}
                      </span>
                    </div>
                  )}

                  <div className={s.detailItem}>
                    <span className={s.detailLabel}>Fecha del Movimiento</span>
                    <span className={s.detailValue}>{movimientoSeleccionado.fecha}</span>
                  </div>

                  <div className={s.detailItem}>
                    <span className={s.detailLabel}>Registrado por</span>
                    <span className={s.detailValue}>{movimientoSeleccionado.registradoPor || "—"}</span>
                  </div>

                  <div className={s.detailItem}>
                    <span className={s.detailLabel}>Monto Operado</span>
                    <span
                      className={s.detailValue}
                      style={{
                        fontWeight: 700,
                        fontSize: "var(--fs-lg)",
                        color:
                          movimientoSeleccionado.anulado === 1
                            ? "var(--color-text-hint)"
                            : movimientoSeleccionado.tipo === "Ingreso"
                            ? "var(--color-ok)"
                            : "var(--color-danger)",
                        textDecoration: movimientoSeleccionado.anulado === 1 ? "line-through" : "none",
                      }}
                    >
                      {signedMoney(movimientoSeleccionado.tipo, movimientoSeleccionado.monto)}
                    </span>
                  </div>

                  <div className={s.detailItem}>
                    <span className={s.detailLabel}>Categoría</span>
                    <span className={s.detailValue}>{movimientoSeleccionado.categoria}</span>
                  </div>

                  <div className={s.detailItem}>
                    <span className={s.detailLabel}>N° de Comprobante / Factura</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      {movimientoSeleccionado.comprobante ? (
                        <code>{movimientoSeleccionado.comprobante}</code>
                      ) : (
                        <span style={{ color: "var(--color-text-hint)" }}>Sin comprobante asociado</span>
                      )}
                      {movimientoSeleccionado.adjuntoNombre && (
                        <button
                          type="button"
                          className={`${s.viewAttachBtn} ${s.noPrint}`}
                          onClick={() => abrirAdjunto(movimientoSeleccionado.id)}
                          title="Ver comprobante adjunto"
                          aria-label="Ver comprobante adjunto"
                        >
                          <SearchIcon size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className={s.detailItem} style={{ marginTop: "var(--space-2)" }}>
                  <span className={s.detailLabel}>Concepto / Descripción Detallada</span>
                  <div
                    style={{
                      background: "var(--color-th-bg)",
                      padding: "var(--space-4)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      fontSize: "var(--fs-base)",
                      color: "var(--color-text)",
                      lineHeight: 1.5,
                      whiteSpace: "pre-line",
                    }}
                  >
                    {movimientoSeleccionado.descripcion}
                  </div>
                </div>
                {movimientoSeleccionado.adjuntoNombre && (
                  <label className={`${s.printOption} ${s.noPrint}`}>
                    <input type="checkbox" checked={imprimirAdjunto} onChange={(e) => setImprimirAdjunto(e.target.checked)} />
                    ¿Desea imprimir el comprobante junto al detalle?
                  </label>
                )}
              </div>

              <div className={`${s.modalFooter} ${s.noPrint}`}>
                <Button
                  variant="secondary"
                  onClick={() => void imprimirDetalleMovimiento()}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <PrinterIcon size={16} />
                  Imprimir Detalle
                </Button>
                {puedeOperarCaja && movimientoSeleccionado.anulado === 0 && (
                  <Button
                    variant="danger"
                    onClick={() => {
                      const m = movimientoSeleccionado;
                      setMovimientoSeleccionado(null);
                      setMovimientoParaAnular(m);
                    }}
                  >
                    Anular Movimiento
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setMovimientoSeleccionado(null)}>
                  Cerrar
                </Button>
              </div>
            </div>
            {visorArchivo && (
              <div className={s.attachmentPreview} style={detalleAltura ? { height: `${detalleAltura}px` } : undefined} onClick={() => setVisorArchivo(null)}>
                <div className={s.modalHeader}>
                  <h3 className={s.modalTitle}>{visorArchivo.nombre}</h3>
                  <button type="button" className={s.modalClose} onClick={() => setVisorArchivo(null)}>✕</button>
                </div>
                {visorArchivo.dataUrl.startsWith("data:application/pdf") ? (
                  <iframe src={visorArchivo.dataUrl} title={visorArchivo.nombre} />
                ) : (
                  <img src={visorArchivo.dataUrl} alt={visorArchivo.nombre} />
                )}
              </div>
            )}
            </div>
          </div>
        )}

        {/* Modal Visor de Comprobante / Archivo Adjunto */}

        <ConfirmDialog
          isOpen={movimientoParaAnular !== null}
          title="Anular movimiento de caja"
          message={
            movimientoParaAnular ? (
              <div>
                <p style={{ margin: 0 }}>
                  ¿Está seguro de que desea anular el movimiento{" "}
                  <strong>"{movimientoParaAnular.descripcion}"</strong> por un monto de{" "}
                  <strong>{money(movimientoParaAnular.monto)}</strong>?
                </p>
                <div style={{ marginTop: "16px" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "6px" }}>
                    Motivo de anulación (RF14):
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Registro duplicado / Error en comprobante..."
                    value={motivoAnulacion}
                    onChange={(e) => setMotivoAnulacion(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid var(--color-border)",
                      background: "var(--color-bg-card)",
                      color: "inherit",
                    }}
                  />
                </div>
              </div>
            ) : null
          }
          confirmLabel="Anular movimiento"
          cancelLabel="Cancelar"
          variant="danger"
          onConfirm={confirmarAnularMovimiento}
          onCancel={() => {
            setMovimientoParaAnular(null);
            setMotivoAnulacion("");
          }}
        />
      </Layout>
    );
  }

  // -------------------------------------------------------------
  // PANTALLA 2: NUEVO MOVIMIENTO
  // -------------------------------------------------------------
  return (
    <Layout
      title={tipo === "Ingreso" ? "Caja › Registrar nuevo ingreso" : "Caja › Registrar nuevo egreso"}
      action={
        <Button variant="secondary" onClick={() => setVista("lista")}>
          ← Volver a caja
        </Button>
      }
    >
      <form onSubmit={guardarMovimiento} className={s.formContainer}>
        {error && <div className={s.errorMsg}>{error}</div>}

        <Card title="Datos del movimiento">
          <div className={s.formFields}>
            <div className={s.formRow}>
              <SelectField
                label="Tipo de movimiento"
                value={tipo}
                options={["Ingreso", "Egreso"]}
                onChange={(v) => {
                  const t = v as "Ingreso" | "Egreso";
                  setTipo(t);
                  setCategoria(t === "Ingreso" ? CATEGORIAS_INGRESO[0] : CATEGORIAS_EGRESO[0]);
                }}
                width={200}
              />
              <SelectField
                label="Categoría"
                value={categoria}
                options={tipo === "Ingreso" ? CATEGORIAS_INGRESO : CATEGORIAS_EGRESO}
                onChange={setCategoria}
                width={300}
                required
              />
            </div>

            <Field
              label="Descripción"
              placeholder={tipo === "Ingreso" ? "Ej: Buffet acto escolar día del maestro" : "Ej: Compra de pintura y pinceles"}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              width="100%"
              required
            />

            <div className={s.formRow} style={{ alignItems: "flex-end" }}>
              <Field
                label="Monto ($)"
                type="number"
                min="0.01"
                step="any"
                placeholder="0"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                width={200}
                required
              />
              <div className={s.voucherContainer}>
                <Field
                  label="N° Comprobante / Factura (Opcional)"
                  placeholder="Ej: FAC-B-0001-00042"
                  value={comprobante}
                  onChange={(e) => setComprobante(e.target.value)}
                  width={260}
                />
                <div>
                  <input
                    type="file"
                    id="comprobante-file"
                    style={{ display: "none" }}
                    accept=".pdf,image/*"
                    onChange={handleArchivoSeleccionado}
                  />
                  <label htmlFor="comprobante-file" className={s.attachBtn} title="Adjuntar archivo o comprobante">
                    <PaperclipIcon size={16} />
                    {archivoAdjunto ? (archivoAdjunto.length > 20 ? archivoAdjunto.slice(0, 18) + "…" : archivoAdjunto) : "Adjuntar comprobante"}
                  </label>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className={s.actionRow}>
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando..." : "Guardar movimiento"}
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
