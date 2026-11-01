import { useEffect, useRef, useState, FormEvent } from "react";
import { api, PagoFila, AsociadoFila, AdjuntoMovimiento, money } from "../api";
import { useApp } from "../context";
import Layout from "../components/Layout";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import DataTable, { Column } from "../components/ui/DataTable";
import { Field, SelectField } from "../components/ui/Field";
import IconButton from "../components/ui/IconButton";
import { PaperclipIcon, PrinterIcon, ReceiptIcon, SearchIcon } from "../components/icons";
import s from "./Cuotas.module.css";

const PERIODOS_FILTRO = [
  { value: "Todos", label: "Todos los períodos" },
  { value: "2026-10", label: "Octubre 2026" },
  { value: "2026-09", label: "Septiembre 2026" },
  { value: "2026-08", label: "Agosto 2026" },
  { value: "2026-07", label: "Julio 2026" },
  { value: "2026-06", label: "Junio 2026" },
  { value: "2026-05", label: "Mayo 2026" },
  { value: "2026-04", label: "Abril 2026" },
  { value: "2026-03", label: "Marzo 2026" },
];

const MEDIOS_PAGO = [
  "Efectivo",
  "Transferencia",
  "Mercado Pago",
  "Débito",
];

export default function Cuotas() {
  const { usuario } = useApp();
  const [vista, setVista] = useState<"lista" | "nuevo" | "recibo">("lista");

  const [pagos, setPagos] = useState<PagoFila[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [periodo, setPeriodo] = useState("Todos");
  const [loading, setLoading] = useState(false);

  // Lista de asociados para registrar pagos
  const [asociados, setAsociados] = useState<AsociadoFila[]>([]);

  // Formulario Registrar Pago
  const [asociadoId, setAsociadoId] = useState<number | "">("");
  const [busquedaAsociado, setBusquedaAsociado] = useState("");
  const [mostrarDropdownAsoc, setMostrarDropdownAsoc] = useState(false);
  const [pagoPeriodo, setPagoPeriodo] = useState("2026-10");
  const [pagoMonto, setPagoMonto] = useState("3000");
  const [pagoMedio, setPagoMedio] = useState("Efectivo");
  const [pagoComprobante, setPagoComprobante] = useState("");
  const [pagoAdjuntoNombre, setPagoAdjuntoNombre] = useState<string | null>(null);
  const [pagoAdjuntoDatos, setPagoAdjuntoDatos] = useState<string | null>(null);
  const [pagoSaving, setPagoSaving] = useState(false);
  const [pagoError, setPagoError] = useState<string | null>(null);

  // Pantalla Ver Recibo
  const [reciboSeleccionado, setReciboSeleccionado] = useState<PagoFila | null>(null);
  const [pagoDetalle, setPagoDetalle] = useState<PagoFila | null>(null);
  const [visorAdjunto, setVisorAdjunto] = useState<AdjuntoMovimiento | null>(null);
  const [detalleAdjunto, setDetalleAdjunto] = useState<AdjuntoMovimiento | null>(null);
  const [detalleAdjuntoError, setDetalleAdjuntoError] = useState<string | null>(null);
  const [imprimirComprobante, setImprimirComprobante] = useState(false);
  const detalleCardRef = useRef<HTMLDivElement | null>(null);
  const [detalleAltura, setDetalleAltura] = useState<number | null>(null);

  const cargarPagos = () => {
    setLoading(true);
    api.listarPagos(busqueda, periodo)
      .then(setPagos)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    cargarPagos();
  }, [busqueda, periodo]);

  useEffect(() => {
    api.listarAsociados({ busqueda: "", estadoCuotas: "Todos", estado: "1" })
      .then(setAsociados)
      .catch(console.error);

    api.obtenerConfiguracion("cuota_mensual").then((val) => {
      if (val) setPagoMonto(val);
    }).catch(console.error);
  }, []);

  const abrirNuevoPago = () => {
    setAsociadoId("");
    setBusquedaAsociado("");
    setMostrarDropdownAsoc(false);
    setPagoPeriodo(new Date().toISOString().slice(0, 7));
    setPagoMedio("Efectivo");
    setPagoComprobante(`REC-${Math.floor(1000 + Math.random() * 9000)}`);
    setPagoAdjuntoNombre(null);
    setPagoAdjuntoDatos(null);
    setPagoError(null);
    setVista("nuevo");
  };

  const guardarPago = async (e: FormEvent) => {
    e.preventDefault();
    if (!asociadoId) {
      setPagoError("Debe seleccionar un asociado.");
      return;
    }
    const montoNum = Number(pagoMonto);
    if (!montoNum || montoNum <= 0) {
      setPagoError("El monto debe ser un número positivo.");
      return;
    }

    setPagoSaving(true);
    setPagoError(null);
    try {
      const nuevoId = await api.registrarPago({
        asociadoId: Number(asociadoId),
        periodo: pagoPeriodo,
        monto: montoNum,
        medio: pagoMedio,
        comprobante: pagoComprobante.trim() || undefined,
        adjuntoNombre: pagoAdjuntoNombre || undefined,
        adjuntoDatos: pagoAdjuntoDatos || undefined,
      });

      const asociado = asociados.find((a) => a.id === Number(asociadoId));
      setReciboSeleccionado({
        id: nuevoId,
        asociadoId: Number(asociadoId),
        apellidoNombre: asociado ? asociado.apellidoNombre : "Asociado",
        dni: asociado ? asociado.dni : "",
        periodo: pagoPeriodo,
        fechaPago: new Date().toISOString().split("T")[0],
        monto: montoNum,
        medio: pagoMedio,
        comprobante: pagoComprobante.trim() || `REC-${nuevoId.toString().slice(-4)}`,
        registradoPor: `${usuario.rol} (${usuario.nombre})`,
        registradoPorRol: usuario.rol,
        registradoPorNombre: usuario.nombre,
      });

      cargarPagos();
      setVista("recibo");
    } catch (err) {
      setPagoError(String(err));
    } finally {
      setPagoSaving(false);
    }
  };

  const imprimirListadoPagos = () => {
    const escapar = (valor: string) => valor.replace(/[&<>"']/g, (caracter) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[caracter] || caracter));
    const filas = pagos.map((p) => `
      <tr>
        <td>${escapar(p.fechaPago)}</td>
        <td>${escapar(p.comprobante || `REC-${p.id}`)}</td>
        <td>${escapar(p.apellidoNombre)}</td>
        <td>${escapar(p.dni)}</td>
        <td>${escapar(p.periodo)}</td>
        <td>${escapar(p.medio)}</td>
        <td>${escapar(money(p.monto))}</td>
      </tr>`).join("");
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    document.body.appendChild(iframe);
    iframe.contentDocument?.open();
    iframe.contentDocument?.write(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8">
          <title>Listado de pagos</title>
          <style>
            body { font-family: Arial, sans-serif; color: #1f2937; padding: 24px; }
            h1 { margin: 0 0 6px; font-size: 22px; }
            p { margin: 0 0 18px; color: #6b7280; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
            th { background: #f3f4f6; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>Listado de pagos</h1>
          <p>Filtro: ${periodo === "Todos" ? "Todos los períodos" : periodo}</p>
          <table>
            <thead><tr><th>Fecha</th><th>Comprobante</th><th>Asociado</th><th>DNI</th><th>Período</th><th>Medio</th><th>Monto</th></tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </body>
      </html>`);
    iframe.contentDocument?.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1000);
    }, 100);
  };

  const cargarAdjuntoPago = async (pago: PagoFila) => {
    if (!pago.movimientoId) return null;
    try {
      const adjunto = await api.obtenerAdjuntoMovimiento(pago.movimientoId);
      if (!adjunto) {
        setDetalleAdjuntoError("No se pudo recuperar el comprobante adjunto.");
      }
      return adjunto;
    } catch (err) {
      const mensaje = String(err);
      setDetalleAdjuntoError(mensaje);
      return null;
    }
  };

  const abrirAdjuntoPago = async (pago: PagoFila) => {
    if (visorAdjunto) {
      setVisorAdjunto(null);
      return;
    }
    const adjunto = await cargarAdjuntoPago(pago);
    if (adjunto) setVisorAdjunto(adjunto);
  };

  const imprimirDetallePago = async () => {
    if (!pagoDetalle) return;
    let adjunto = detalleAdjunto;
    if (imprimirComprobante && !adjunto) {
      adjunto = await cargarAdjuntoPago(pagoDetalle);
      if (!adjunto) return;
    }

    const escapar = (valor: string) => valor.replace(/[&<>"']/g, (caracter) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[caracter] || caracter));
    const comprobante = adjunto && imprimirComprobante
      ? adjunto.dataUrl.startsWith("data:image/")
        ? `<h3>Comprobante adjunto</h3><img src="${adjunto.dataUrl}" alt="${escapar(adjunto.nombre)}">`
        : `<h3>Comprobante adjunto</h3><div class="pdf-note">${escapar(adjunto.nombre)} (archivo PDF adjunto)</div>`
      : "";
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    document.body.appendChild(iframe);
    iframe.contentDocument?.open();
    iframe.contentDocument?.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Detalle del movimiento</title>
      <style>
        @page { size: A4 portrait; margin: 10mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #1f2937; padding: 0; margin: 0; }
        h1 { font-size: 20px; margin: 0 0 14px; } h3 { margin: 14px 0 8px; font-size: 14px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
        .item span { display: block; color: #6b7280; font-size: 12px; font-weight: 600; margin-bottom: 4px; }
        .amount { color: #15803d; font-size: 18px; font-weight: 700; }
        .description { margin-top: 16px; padding: 10px; background: #f3f4f6; border: 1px solid #d1d5db; }
        .attachment { margin-top: 14px; page-break-inside: avoid; break-inside: avoid; }
        img { display: block; max-width: 100%; max-height: 145mm; object-fit: contain; }
        .pdf-note { padding: 12px; border: 1px solid #d1d5db; }
      </style></head><body>
      <h1>Detalle del movimiento #${pagoDetalle.movimientoId || pagoDetalle.id}</h1>
      <div class="grid">
        <div class="item"><span>Fecha del movimiento</span><strong>${escapar(pagoDetalle.fechaPago)}</strong></div>
        <div class="item"><span>Registrado por</span><strong>${escapar(pagoDetalle.registradoPor || "—")}</strong></div>
        <div class="item"><span>Monto operado</span><strong class="amount">+ ${escapar(money(pagoDetalle.monto))}</strong></div>
        <div class="item"><span>Categoría</span><strong>Cuotas</strong></div>
        <div class="item"><span>N° de comprobante / factura</span><strong>${escapar(pagoDetalle.comprobante || "Sin comprobante asociado")}</strong></div>
        <div class="item"><span>Medio de pago</span><strong>${escapar(pagoDetalle.medio)}</strong></div>
      </div>
      <div class="description"><strong>Concepto / descripción detallada</strong><br>
        Asociado N° ${pagoDetalle.asociadoId} - Cuota Social · Período ${escapar(pagoDetalle.periodo)}<br>${escapar(pagoDetalle.apellidoNombre)}
      </div>${comprobante ? `<div class="attachment">${comprobante}</div>` : ""}</body></html>`);
    iframe.contentDocument?.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1000);
    }, 100);
  };

  const abrirDetallePago = (pago: PagoFila) => {
    setPagoDetalle(pago);
    setDetalleAdjunto(null);
    setDetalleAdjuntoError(null);
    setImprimirComprobante(false);
    setDetalleAltura(null);
  };

  useEffect(() => {
    if (!pagoDetalle || !detalleCardRef.current) return;
    const actualizarAltura = () => {
      if (detalleCardRef.current) setDetalleAltura(detalleCardRef.current.offsetHeight);
    };
    actualizarAltura();
    const observer = new ResizeObserver(actualizarAltura);
    observer.observe(detalleCardRef.current);
    return () => observer.disconnect();
  }, [pagoDetalle, imprimirComprobante, detalleAdjunto]);

  const columns: Column<PagoFila>[] = [
    { header: "Fecha", minWidth: 90, flex: true, render: (p) => p.fechaPago },
    {
      header: "Comprobante",
      minWidth: 105,
      flex: true,
      render: (p) => p.comprobante || `REC-${p.id}`,
    },
    {
      header: "Asociado",
      minWidth: 160,
      flex: true,
      render: (p) => <strong>{p.apellidoNombre}</strong>,
    },
    { header: "DNI", minWidth: 90, flex: true, render: (p) => p.dni },
    {
      header: "Período",
      minWidth: 85,
      flex: true,
      render: (p) => <Badge tone="ok">{p.periodo}</Badge>,
    },
    { header: "Medio", minWidth: 95, flex: true, render: (p) => p.medio },
    {
      header: "Monto",
      minWidth: 100,
      flex: true,
      render: (p) => <strong>{money(p.monto)}</strong>,
    },
    {
      header: "Registrado por",
      minWidth: 110,
      flex: true,
      render: (p) => {
        // En la tabla se muestra únicamente el rol
        if (p.registradoPorRol) return p.registradoPorRol;
        const match = p.registradoPor.match(/^([^(]+)/);
        return match ? match[1].trim() : p.registradoPor;
      },
    },
    {
      header: "Acciones",
      width: 70,
      align: "center",
      render: (p) => (
        <IconButton
          icon={<ReceiptIcon />}
          title="Ver recibo oficial"
          variant="primary"
          square
          onClick={(e) => {
            e.stopPropagation();
            setReciboSeleccionado(p);
            setVista("recibo");
          }}
        />
      ),
    },
  ];

  // -------------------------------------------------------------
  // PANTALLA 1: LISTADO DE PAGOS
  // -------------------------------------------------------------
  if (vista === "lista") {
    return (
      <Layout
        title="Cuotas y pagos"
        action={
          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            <Button
              variant="secondary"
              onClick={imprimirListadoPagos}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <PrinterIcon size={16} />
              Imprimir listado
            </Button>
            {(usuario.rol === "Tesorero" || usuario.rol === "Superadmin") && (
              <Button onClick={abrirNuevoPago}>+ Registrar pago</Button>
            )}
          </div>
        }
      >
        <div className={s.filters}>
          <Field
            label="Buscar por asociado, DNI o comprobante"
            type="search"
            placeholder="Escribí un nombre, DNI o recibo…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            width={360}
          />
          <SelectField
            label="Mes de pago"
            value={periodo}
            options={PERIODOS_FILTRO}
            onChange={setPeriodo}
            width={200}
          />
        </div>

        <div className={s.paymentsTable}>
          <DataTable
            columns={columns}
            rows={pagos}
            rowKey={(p) => p.id}
            stickyHeader
            emptyMessage={loading ? "Cargando pagos..." : "No se encontraron pagos registrados."}
            onRowClick={(p) => void abrirDetallePago(p)}
          />
        </div>
        {pagoDetalle && (
          <div className={s.detailOverlay} onClick={() => setPagoDetalle(null)}>
            <div className={`${s.detailWorkspace} ${visorAdjunto ? s.withPreview : s.withoutPreview}`} onClick={(e) => e.stopPropagation()}>
            <div ref={detalleCardRef} className={s.detailCard} onClick={(e) => e.stopPropagation()}>
              <div className={s.detailHeader}>
                <h2>Detalle del movimiento #{pagoDetalle.movimientoId || pagoDetalle.id}</h2>
                <button type="button" className={`${s.detailClose} ${s.noPrint}`} onClick={() => setPagoDetalle(null)}>✕</button>
              </div>
              <div className={s.detailBody}>
                <div className={s.detailStatus}>
                  <Badge tone="ok">Ingreso de Fondos</Badge>
                  <Badge tone="ok">Efectivo / Válido</Badge>
                </div>
                <div className={s.detailGrid}>
                  <div><span>Fecha del movimiento</span><strong>{pagoDetalle.fechaPago}</strong></div>
                  <div><span>Registrado por</span><strong>{pagoDetalle.registradoPor || "—"}</strong></div>
                  <div><span>Monto operado</span><strong className={s.detailAmount}>+ {money(pagoDetalle.monto)}</strong></div>
                  <div><span>Categoría</span><strong>Cuotas</strong></div>
                  <div>
                    <span>N° de comprobante / factura</span>
                    <div className={s.detailInline}>
                      <strong>{pagoDetalle.comprobante || "Sin comprobante asociado"}</strong>
                      {pagoDetalle.adjuntoNombre && (
                        <button type="button" className={`${s.attachmentButton} ${s.noPrint}`} onClick={() => void abrirAdjuntoPago(pagoDetalle)} aria-label="Ver comprobante adjunto" title="Ver comprobante adjunto">
                          <SearchIcon size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div><span>Medio de pago</span><strong>{pagoDetalle.medio}</strong></div>
                </div>
                {detalleAdjuntoError && <p className={s.detailAttachmentError}>{detalleAdjuntoError}</p>}
                <div className={s.detailDescription}>
                  <span>Concepto / descripción detallada</span>
                  <p>Asociado N° {pagoDetalle.asociadoId} - Cuota Social · Período {pagoDetalle.periodo}<br />{pagoDetalle.apellidoNombre}</p>
                </div>
                {pagoDetalle.adjuntoNombre && (
                  <label className={`${s.printOption} ${s.noPrint}`}>
                    <input
                      type="checkbox"
                      checked={imprimirComprobante}
                      onChange={async (e) => {
                        const checked = e.target.checked;
                        setImprimirComprobante(checked);
                        if (checked && !detalleAdjunto) {
                          setDetalleAdjunto(await cargarAdjuntoPago(pagoDetalle));
                        }
                      }}
                    />
                    ¿Desea imprimir el comprobante junto al detalle?
                  </label>
                )}
              </div>
              <div className={`${s.detailFooter} ${s.noPrint}`}>
                <Button variant="secondary" onClick={() => void imprimirDetallePago()}><PrinterIcon size={16} /> Imprimir detalle</Button>
                <Button variant="secondary" onClick={() => setPagoDetalle(null)}>Cerrar</Button>
              </div>
            </div>
            {visorAdjunto && (
              <div
                className={s.attachmentPreview}
                style={detalleAltura ? { height: `${detalleAltura}px` } : undefined}
                onClick={() => setVisorAdjunto(null)}
              >
                <div className={s.detailHeader}>
                  <h2>{visorAdjunto.nombre}</h2>
                  <button type="button" className={s.detailClose} onClick={() => setVisorAdjunto(null)}>✕</button>
                </div>
                {visorAdjunto.dataUrl.startsWith("data:application/pdf") ? (
                  <iframe src={visorAdjunto.dataUrl} title={visorAdjunto.nombre} />
                ) : (
                  <img src={visorAdjunto.dataUrl} alt={visorAdjunto.nombre} />
                )}
              </div>
            )}
            </div>
          </div>
        )}
      </Layout>
    );
  }

  // -------------------------------------------------------------
  // PANTALLA 2: REGISTRAR PAGO
  // -------------------------------------------------------------
  if (vista === "nuevo") {
    const asociadosFiltrados = asociados.filter((a) => {
      if (!busquedaAsociado.trim()) return true;
      const q = busquedaAsociado.toLowerCase().trim();
      return (
        a.apellidoNombre.toLowerCase().includes(q) ||
        a.dni.includes(q) ||
        (a.alumnos && a.alumnos.toLowerCase().includes(q))
      );
    });

    const asociadoSeleccionado = asociados.find((a) => a.id === Number(asociadoId));

    return (
      <Layout
        title="Cuotas y pagos › Registrar pago"
        action={
          <Button variant="secondary" onClick={() => setVista("lista")}>
            ← Volver al listado
          </Button>
        }
      >
        <form onSubmit={guardarPago} className={s.formContainer}>
          {pagoError && <div className={s.errorMsg}>{pagoError}</div>}

          <Card title="Datos del pago">
            <div className={s.formFields}>
              {/* Buscador predictivo de Asociado Titular por Nombre, Apellido o DNI */}
              <div className={s.asociadoSearchWrapper}>
                <label className={s.asociadoSearchLabel}>
                  Asociado titular <span style={{ color: "var(--color-danger)" }}>*</span>
                </label>

                {asociadoSeleccionado ? (
                  <div className={s.asociadoSeleccionadoCard}>
                    <div className={s.asociadoSeleccionadoInfo}>
                      <span style={{ fontWeight: 700, fontSize: "var(--fs-base)" }}>
                        {asociadoSeleccionado.apellidoNombre}
                      </span>
                      <code style={{ fontSize: "var(--fs-sm)" }}>DNI {asociadoSeleccionado.dni}</code>
                      {asociadoSeleccionado.alumnos && (
                        <span style={{ fontSize: "var(--fs-xs)", color: "var(--color-text-muted)" }}>
                          ({asociadoSeleccionado.alumnos})
                        </span>
                      )}
                      <Badge tone={asociadoSeleccionado.estadoCuotas === "Al día" ? "ok" : "warn"}>
                        {asociadoSeleccionado.estadoCuotas}
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setAsociadoId("");
                        setBusquedaAsociado("");
                        setMostrarDropdownAsoc(true);
                      }}
                    >
                      Cambiar
                    </Button>
                  </div>
                ) : (
                  <div className={s.asociadoInputContainer}>
                    <input
                      type="text"
                      className={s.asociadoInput}
                      placeholder="Escribí apellido, nombre o DNI del asociado…"
                      value={busquedaAsociado}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBusquedaAsociado(val);
                        setMostrarDropdownAsoc(val.trim().length > 0);
                      }}
                      onFocus={() => {
                        if (busquedaAsociado.trim().length > 0) {
                          setMostrarDropdownAsoc(true);
                        }
                      }}
                    />
                    {busquedaAsociado && (
                      <button
                        type="button"
                        className={s.asociadoClearBtn}
                        onClick={() => {
                          setBusquedaAsociado("");
                          setMostrarDropdownAsoc(false);
                        }}
                        title="Limpiar búsqueda"
                      >
                        ✕
                      </button>
                    )}

                    {mostrarDropdownAsoc && busquedaAsociado.trim().length > 0 && (
                      <div className={s.asociadoDropdown}>
                        {asociadosFiltrados.length === 0 ? (
                          <div style={{ padding: "var(--space-4)", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--fs-sm)" }}>
                            No se encontró ningún asociado activo con "{busquedaAsociado}".
                          </div>
                        ) : (
                          asociadosFiltrados.slice(0, 8).map((a) => (
                            <div
                              key={a.id}
                              className={s.asociadoOption}
                              onMouseDown={() => {
                                setAsociadoId(a.id);
                                setBusquedaAsociado("");
                                setMostrarDropdownAsoc(false);
                              }}
                            >
                              <div>
                                <div className={s.asociadoOptionNombre}>{a.apellidoNombre}</div>
                                {a.alumnos && (
                                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--color-text-muted)" }}>
                                    Alumnos: {a.alumnos}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                                <span className={s.asociadoOptionDni}>DNI {a.dni}</span>
                                <Badge tone={a.estadoCuotas === "Al día" ? "ok" : "warn"}>
                                  {a.estadoCuotas}
                                </Badge>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className={s.formRow}>
                <Field
                  label="Período abonado"
                  type="month"
                  value={pagoPeriodo}
                  onChange={(e) => setPagoPeriodo(e.target.value)}
                  width={220}
                  required
                />
                <Field
                  label="Monto ($)"
                  type="number"
                  min="0.01"
                  step="any"
                  value={pagoMonto}
                  onChange={(e) => setPagoMonto(e.target.value)}
                  width={180}
                  required
                />
              </div>

              <div className={s.formRow}>
                <SelectField
                  label="Medio de pago"
                  value={pagoMedio}
                  options={MEDIOS_PAGO}
                  onChange={setPagoMedio}
                  width={220}
                />
                <Field
                  label="Comprobante"
                  type="text"
                  placeholder="Ej: REC-1045"
                  value={pagoComprobante}
                  onChange={(e) => setPagoComprobante(e.target.value)}
                  width={220}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => document.getElementById("pago-comprobante-file")?.click()}
                  style={{ height: "48px", alignSelf: "flex-end", display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <PaperclipIcon size={16} />
                  Agregar comprobante
                </Button>
                <input
                  id="pago-comprobante-file"
                  type="file"
                  accept=".pdf,image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 10 * 1024 * 1024) {
                      setPagoError("El comprobante adjunto supera el límite de 10 MB.");
                      e.target.value = "";
                      return;
                    }
                    setPagoAdjuntoNombre(file.name);
                    if (!pagoComprobante.trim()) setPagoComprobante(file.name.replace(/\.[^/.]+$/, ""));
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === "string") setPagoAdjuntoDatos(reader.result);
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                {pagoAdjuntoNombre && <span className={s.attachmentName}>{pagoAdjuntoNombre}</span>}
              </div>
            </div>
          </Card>

          <div className={s.actionRow}>
            <Button type="submit" disabled={pagoSaving}>
              {pagoSaving ? "Registrando..." : "Confirmar pago"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setVista("lista")}
              disabled={pagoSaving}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Layout>
    );
  }

  // -------------------------------------------------------------
  // PANTALLA 3: VER RECIBO
  // -------------------------------------------------------------
  return (
    <Layout
      title="Cuotas y pagos › Comprobante de pago"
      action={
        <div style={{ display: "flex", gap: "var(--space-4)" }}>
          <Button variant="secondary" onClick={() => window.print()}>
            🖨️ Imprimir recibo
          </Button>
          <Button variant="secondary" onClick={() => setVista("lista")}>
            ← Volver al listado
          </Button>
        </div>
      }
    >
      {reciboSeleccionado ? (
        <div className={s.receiptPaper}>
          <div className={s.receiptHeader}>
            <div>
              <div className={s.receiptSchool}>Asociación Cooperadora Escolar</div>
              <div className={s.receiptSub}>Comprobante oficial de pago de cuota social</div>
            </div>
            <div>
              <div className={s.receiptNumber}>
                Recibo N° {reciboSeleccionado.comprobante || `REC-${reciboSeleccionado.id}`}
              </div>
              <div className={s.receiptDate}>Fecha: {reciboSeleccionado.fechaPago}</div>
            </div>
          </div>

          <div className={s.receiptBody}>
            <div className={s.receiptRow}>
              <span className={s.receiptLabel}>Recibimos de:</span>
              <span className={s.receiptValue}>{reciboSeleccionado.apellidoNombre}</span>
            </div>
            <div className={s.receiptRow}>
              <span className={s.receiptLabel}>DNI:</span>
              <span className={s.receiptValue}>{reciboSeleccionado.dni}</span>
            </div>
            <div className={s.receiptRow}>
              <span className={s.receiptLabel}>En concepto de:</span>
              <span className={s.receiptValue}>Cuota Social · Período {reciboSeleccionado.periodo}</span>
            </div>
            <div className={s.receiptRow}>
              <span className={s.receiptLabel}>Medio de pago:</span>
              <span className={s.receiptValue}>{reciboSeleccionado.medio}</span>
            </div>
            <div className={s.receiptRow}>
              <span className={s.receiptLabel}>Registrado por:</span>
              <span className={s.receiptValue}>{reciboSeleccionado.registradoPor}</span>
            </div>

            <div className={s.receiptTotalRow}>
              <span className={s.receiptTotalLabel}>IMPORTE TOTAL</span>
              <span className={s.receiptTotalValue}>{money(reciboSeleccionado.monto)}</span>
            </div>

            <div className={s.receiptSignatures}>
              <div className={s.signBox}>Firma del Asociado</div>
              <div className={s.signBox}>Firma y Sello Cooperadora</div>
            </div>
          </div>
        </div>
      ) : (
        <p className={s.summary}>No se seleccionó ningún recibo.</p>
      )}
    </Layout>
  );
}
