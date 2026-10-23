// src/pages/Caja.tsx
import { useEffect, useState, FormEvent } from "react";
import { api, MovimientoCajaFila, ResumenCaja, money, signedMoney } from "../api";
import Layout from "../components/Layout";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import DataTable, { Column } from "../components/ui/DataTable";
import { Field, SelectField } from "../components/ui/Field";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import IconButton from "../components/ui/IconButton";
import { BanIcon, EyeIcon, PrinterIcon, PaperclipIcon } from "../components/icons";
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
      const nuevoId = await api.crearMovimientoCaja({
        tipo,
        categoria,
        descripcion: descripcion.trim(),
        monto: montoNum,
        comprobante: compFinal,
      });

      // Si se adjuntó un archivo en base64, guardarlo en el almacenamiento local indexado por el ID del movimiento
      if (archivoBase64) {
        try {
          localStorage.setItem(`comprobante_mov_${nuevoId}`, JSON.stringify({
            nombre: archivoAdjunto || "comprobante",
            dataUrl: archivoBase64,
          }));
        } catch (e) {
          console.warn("No se pudo almacenar comprobante en localStorage:", e);
        }
      }

      cargarDatos();
      setVista("lista");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
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
          onRowClick={(m) => setMovimientoSeleccionado(m)}
          emptyMessage={loading ? "Cargando movimientos de caja..." : "No se encontraron movimientos registrados."}
        />

        {/* Modal de Detalle de Movimiento de Caja */}
        {movimientoSeleccionado && (
          <div className={s.modalOverlay} onClick={() => setMovimientoSeleccionado(null)}>
            <div className={`${s.modalCard} ${s.printSection}`} onClick={(e) => e.stopPropagation()}>
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
                      {(() => {
                        const adjuntoStorage = localStorage.getItem(`comprobante_mov_${movimientoSeleccionado.id}`);
                        if (adjuntoStorage) {
                          try {
                            const parsed = JSON.parse(adjuntoStorage);
                            return (
                              <button
                                type="button"
                                className={s.viewAttachBtn}
                                onClick={() => setVisorArchivo(parsed)}
                                title="Ver comprobante adjunto"
                              >
                                <PaperclipIcon size={14} />
                              </button>
                            );
                          } catch {
                            return null;
                          }
                        }
                        return null;
                      })()}
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
              </div>

              <div className={`${s.modalFooter} ${s.noPrint}`}>
                <Button
                  variant="secondary"
                  onClick={() => window.print()}
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
          </div>
        )}

        {/* Modal Visor de Comprobante / Archivo Adjunto */}
        {visorArchivo && (
          <div className={s.modalOverlay} onClick={() => setVisorArchivo(null)}>
            <div
              className={`${s.modalCard} ${s.printSection}`}
              style={{ maxWidth: "800px", width: "95vw", height: "85vh" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={s.modalHeader}>
                <h3 className={s.modalTitle} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <PaperclipIcon size={18} />
                  {visorArchivo.nombre}
                </h3>
                <button
                  type="button"
                  className={`${s.modalClose} ${s.noPrint}`}
                  onClick={() => setVisorArchivo(null)}
                >
                  ✕
                </button>
              </div>
              <div style={{ flex: 1, padding: "var(--space-4)", overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center", background: "#f8fafc" }}>
                {visorArchivo.dataUrl.startsWith("data:application/pdf") ? (
                  <iframe
                    id="visor-comprobante-iframe"
                    src={visorArchivo.dataUrl}
                    title={visorArchivo.nombre}
                    style={{ width: "100%", height: "100%", border: "none", borderRadius: "var(--radius-sm)" }}
                  />
                ) : (
                  <img
                    src={visorArchivo.dataUrl}
                    alt={visorArchivo.nombre}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: "var(--radius-sm)" }}
                  />
                )}
              </div>
              <div className={`${s.modalFooter} ${s.noPrint}`}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const iframe = document.getElementById("visor-comprobante-iframe") as HTMLIFrameElement | null;
                    if (iframe && iframe.contentWindow) {
                      iframe.contentWindow.print();
                    } else {
                      window.print();
                    }
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <PrinterIcon size={16} />
                  Imprimir Comprobante
                </Button>
                <Button variant="primary" onClick={() => setVisorArchivo(null)}>
                  Cerrar
                </Button>
              </div>
            </div>
          </div>
        )}

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
