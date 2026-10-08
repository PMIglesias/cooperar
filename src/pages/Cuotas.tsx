// src/pages/Cuotas.tsx
import { useEffect, useState, FormEvent } from "react";
import { api, PagoFila, AsociadoFila, money } from "../api";
import Layout from "../components/Layout";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import DataTable, { Column } from "../components/ui/DataTable";
import { Field, SelectField } from "../components/ui/Field";
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
    setAsociadoId(asociados.length > 0 ? asociados[0].id : "");
    setPagoPeriodo("2026-10");
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
      width: 220,
      flex: true,
      render: (p) => <strong>{p.apellidoNombre}</strong>,
    },
    { header: "DNI", width: 120, render: (p) => p.dni },
    {
      header: "Período",
      width: 110,
      render: (p) => <Badge tone="ok">{p.periodo}</Badge>,
    },
    { header: "Medio", width: 130, render: (p) => p.medio },
    {
      header: "Monto",
      width: 120,
      render: (p) => <strong>{money(p.monto)}</strong>,
    },
    { header: "Registrado por", width: 150, render: (p) => p.registradoPor },
    {
      header: "",
      width: 110,
      render: (p) => (
        <button
          className={s.receiptBtn}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setReciboSeleccionado(p);
            setVista("recibo");
          }}
        >
          Ver recibo ›
        </button>
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
    const opcionesAsociados = [
      { value: "", label: "Seleccione un asociado…" },
      ...asociados.map((a) => ({
        value: String(a.id),
        label: `${a.apellidoNombre} (DNI ${a.dni})`,
      })),
    ];

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
              <SelectField
                label="Asociado titular"
                value={String(asociadoId)}
                options={opcionesAsociados}
                onChange={(v) => setAsociadoId(v ? Number(v) : "")}
                width="100%"
                required
              />

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
                  min="1"
                  step="100"
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
