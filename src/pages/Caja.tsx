// src/pages/Caja.tsx
import { useEffect, useState, FormEvent } from "react";
import { api, MovimientoCajaFila, ResumenCaja, money, signedMoney } from "../api";
import Layout from "../components/Layout";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import DataTable, { Column } from "../components/ui/DataTable";
import { Field, SelectField } from "../components/ui/Field";
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
  "Cuotas",
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    setVista("nuevo");
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
      await api.crearMovimientoCaja({
        tipo,
        categoria,
        descripcion: descripcion.trim(),
        monto: montoNum,
        comprobante: comprobante.trim() || undefined,
      });
      cargarDatos();
      setVista("lista");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const anularMovimiento = async (m: MovimientoCajaFila) => {
    if (confirm(`¿Anular el movimiento "${m.descripcion}" por ${money(m.monto)}?`)) {
      try {
        await api.anularMovimientoCaja(m.id);
        cargarDatos();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const columns: Column<MovimientoCajaFila>[] = [
    { header: "Fecha", width: 110, render: (m) => m.fecha },
    {
      header: "Tipo",
      width: 120,
      render: (m) => (
        <Badge tone={m.tipo === "Ingreso" ? "ok" : "danger"}>
          {m.tipo === "Ingreso" ? "Ingreso" : "Egreso"}
        </Badge>
      ),
    },
    { header: "Categoría", width: 180, render: (m) => m.categoria },
    {
      header: "Descripción",
      width: 260,
      flex: true,
      render: (m) => (
        <div>
          <span style={{ textDecoration: m.anulado ? "line-through" : "none", color: m.anulado ? "var(--color-text-hint)" : "inherit" }}>
            {m.descripcion}
          </span>
          {m.anulado === 1 && (
            <Badge tone="danger" style={{ marginLeft: "8px" }}>
              Anulado
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: "Comprobante",
      width: 140,
      render: (m) => m.comprobante ? m.comprobante : <span style={{ color: "var(--color-text-hint)" }}>—</span>,
    },
    {
      header: "Monto",
      width: 130,
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
      header: "",
      width: 100,
      render: (m) =>
        m.anulado === 0 ? (
          <button
            type="button"
            className={s.anularBtn}
            onClick={(e) => {
              e.stopPropagation();
              anularMovimiento(m);
            }}
          >
            Anular
          </button>
        ) : (
          <span style={{ color: "var(--color-text-hint)", fontSize: "var(--fs-xs)" }}>—</span>
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
          <div style={{ display: "flex", gap: "var(--space-4)" }}>
            <Button variant="secondary" onClick={() => abrirNuevoMovimiento("Ingreso")}>
              + Nuevo ingreso
            </Button>
            <Button onClick={() => abrirNuevoMovimiento("Egreso")}>
              - Nuevo egreso
            </Button>
          </div>
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
          emptyMessage={loading ? "Cargando movimientos de caja..." : "No se encontraron movimientos registrados."}
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

            <div className={s.formRow}>
              <Field
                label="Monto ($)"
                type="number"
                min="1"
                step="100"
                placeholder="0"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                width={200}
                required
              />
              <Field
                label="N° Comprobante / Factura (Opcional)"
                placeholder="Ej: FAC-B-0001-00042"
                value={comprobante}
                onChange={(e) => setComprobante(e.target.value)}
                width={280}
              />
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
