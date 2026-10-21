// src/pages/Cuotas.tsx
import { useEffect, useState, FormEvent } from "react";
import { api, PagoFila, AsociadoFila, money } from "../api";
import Layout from "../components/Layout";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import DataTable, { Column } from "../components/ui/DataTable";
import { Field, SelectField } from "../components/ui/Field";
import IconButton from "../components/ui/IconButton";
import { ReceiptIcon } from "../components/icons";
import s from "./Cuotas.module.css";

const PERIODOS_FILTRO = [
  "Todos",
  "2026-10",
  "2026-09",
  "2026-08",
  "2026-07",
  "2026-06",
  "2026-05",
  "2026-04",
  "2026-03",
];

const MEDIOS_PAGO = [
  "Efectivo",
  "Transferencia",
  "Mercado Pago",
  "Débito",
];

export default function Cuotas() {
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
  const [pagoSaving, setPagoSaving] = useState(false);
  const [pagoError, setPagoError] = useState<string | null>(null);

  // Pantalla Ver Recibo
  const [reciboSeleccionado, setReciboSeleccionado] = useState<PagoFila | null>(null);

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
        registradoPor: "Usuario actual",
      });

      cargarPagos();
      setVista("recibo");
    } catch (err) {
      setPagoError(String(err));
    } finally {
      setPagoSaving(false);
    }
  };

  const totalRecaudado = pagos.reduce((acc, p) => acc + p.monto, 0);

  const columns: Column<PagoFila>[] = [
    { header: "Fecha", width: 110, render: (p) => p.fechaPago },
    {
      header: "Comprobante",
      width: 130,
      render: (p) => p.comprobante || `REC-${p.id}`,
    },
    {
      header: "Asociado",
      minWidth: 200,
      flex: true,
      render: (p) => <strong>{p.apellidoNombre}</strong>,
    },
    { header: "DNI", width: 115, render: (p) => p.dni },
    {
      header: "Período",
      width: 105,
      render: (p) => <Badge tone="ok">{p.periodo}</Badge>,
    },
    { header: "Medio", width: 125, render: (p) => p.medio },
    {
      header: "Monto",
      width: 120,
      render: (p) => <strong>{money(p.monto)}</strong>,
    },
    { header: "Registrado por", minWidth: 140, flex: true, render: (p) => p.registradoPor },
    {
      header: "Acciones",
      width: 85,
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
        action={<Button onClick={abrirNuevoPago}>+ Registrar pago</Button>}
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
            label="Filtrar por período"
            value={periodo}
            options={PERIODOS_FILTRO}
            onChange={setPeriodo}
            width={200}
          />
        </div>

        <p className={s.summary}>
          {pagos.length} pagos registrados · Total recaudado: {money(totalRecaudado)}
        </p>

        <DataTable
          columns={columns}
          rows={pagos}
          rowKey={(p) => p.id}
          emptyMessage={loading ? "Cargando pagos..." : "No se encontraron pagos registrados."}
          onRowClick={(p) => {
            setReciboSeleccionado(p);
            setVista("recibo");
          }}
        />
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
                  label="N° Comprobante / Recibo"
                  type="text"
                  placeholder="Ej: REC-1045"
                  value={pagoComprobante}
                  onChange={(e) => setPagoComprobante(e.target.value)}
                  width={220}
                />
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
