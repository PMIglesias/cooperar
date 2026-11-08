import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import Badge from "../components/ui/Badge";
import IconButton from "../components/ui/IconButton";
import { CheckIcon, EditIcon, TrashIcon, RefreshIcon } from "../components/icons";
import { ActaFila, api, CuadroFinancieroActa, DatosActa, DecisionActa, RendicionFila, money } from "../api";
import fieldStyles from "../components/ui/Field.module.css";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { useApp } from "../context";
import { cuadroDesdeRendicion, cuadroSinValoresDeRendicion } from "../utils/cuadroDesdeRendicion";

const DECISIONES_BASE = [
  "Designación de 2 socios para firma del acta",
  "Lectura del acta asamblea anterior",
  "Lectura del informe de rev. de ctas. sobre el Balance",
  "Lectura de la Memoria y consideraciones del Balance",
  "Elección Autoridades CD y Rev. de Cuentas",
];

const CUADRO_VACIO: CuadroFinancieroActa = {
  cuotaSocial: "", donacionDinero: "", rifas: "", festivales: "", kiosco: "",
  interesesBancarios: "", reintegradosBanco: "", subsidiosDgcye: "", otrosIngresosA: "",
  otrosIngresosB: "", totalEntradas: "", resumenTotalEntradas: "", saldoEjercicioAnterior: "",
  totalGeneral: "", totalSalidasResumen: "", saldoProximoEjercicio: "", cuentaCorriente: "",
  plazoFijoBanco: "", dineroEfectivo: "", ropaCalzado: "", librosUtiles: "", excursiones: "",
  emergenciasSanitarias: "", golosinasPremiosMedallas: "", gastosAlumnoF: "", gastosAlumnoG: "",
  materialDidactico: "", mantSubsidios: "", mantFondosPropios: "", articulosLimpieza: "",
  combustibleCalefaccion: "", libreria: "", mobiliario: "", gastosEscuelaH: "", gastosEscuelaI: "",
  organizacionRifas: "", organizacionFestivales: "", kioscoEntidad: "", gastosEntidadD: "",
  gastosEntidadE: "", gastosAdministrativos: "", otrosEgresos: "", totalSalidasPlazoFijo: "",
  poseeKiosco: false, kioscoPropio: false, kioscoLicitado: false, contratoDesde: "", contratoHasta: "",
};

function DineroInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const tabulado = /^[a-z]\)/.test(label) || label.startsWith("En banco") || label.startsWith("En caja chica") || label.startsWith("Dinero en efectivo");
  return (
    <label style={{ display: "inline-flex", gap: "var(--space-2)", alignItems: "center", minWidth: 0, paddingLeft: tabulado ? "var(--space-5)" : 0 }}>
      <span className={fieldStyles.label} style={{ flex: "1 1 auto" }}>{label}</span>
      <input
        className={fieldStyles.control}
        style={{ width: 150, textAlign: "right", paddingRight: 14, flex: "0 0 150px" }}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      />
    </label>
  );
}

function TextoInput({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <label style={{ display: "inline-flex", gap: "var(--space-2)", alignItems: "center", minWidth: 0 }}>
      <span className={fieldStyles.label} style={{ flex: "1 1 auto" }}>{label}</span>
      <input
        className={fieldStyles.control}
        style={{ width: 150, flex: "0 0 150px" }}
        type={label.startsWith("Contrato") ? "date" : "text"}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

const nuevaActa = (banco?: { cuentaCorriente?: string; plazoFijo?: string }): DatosActa => ({
  tipo: "Asamblea Anual Ordinaria",
  numero: "",
  foja: "",
  fechaAsamblea: "",
  sociosActivosAsistentes: 0,
  periodoDesde: "",
  periodoHasta: "",
  cuotaSocial: 0,
  cuotaPeriodicidad: "Mensual",
  cajaChica: 0,
  cuadroFinanciero: {
    ...CUADRO_VACIO,
    // Los saldos informados en la cooperadora se precargan en el acta
    cuentaCorriente: banco?.cuentaCorriente || "",
    plazoFijoBanco: banco?.plazoFijo || "",
  },
  observaciones: "",
  archivoAdjunto: null,
  decisiones: DECISIONES_BASE.map((descripcion, index) => ({
    orden: index + 1,
    descripcion,
    resultado: "APROBADO",
    observacion: "",
  })),
});

export default function Actas() {
  const { usuario } = useApp();
  const puedeEditar = usuario.rol === "Secretaria" || usuario.rol === "Presidente" || usuario.rol === "Superadmin";
  const puedeAprobar = usuario.rol === "Presidente" || usuario.rol === "Superadmin";
  const puedeEliminar = usuario.rol === "Superadmin";
  const [actas, setActas] = useState<ActaFila[]>([]);
  const [rendiciones, setRendiciones] = useState<RendicionFila[]>([]);
  const [aplicandoRendicion, setAplicandoRendicion] = useState(false);
  const [trayendoSaldo, setTrayendoSaldo] = useState(false);
  const [origenSaldoAnterior, setOrigenSaldoAnterior] = useState<string | null>(null);
  const [form, setForm] = useState<DatosActa | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [actaParaEliminar, setActaParaEliminar] = useState<ActaFila | null>(null);
  /** Última rendición volcada automáticamente (evita repetir la carga en cada render) */
  const aplicadaRef = useRef<string | null>(null);

  const cargar = () => {
    api.listarActas().then(setActas).catch((e) => setError(String(e)));
    api.listarRendiciones().then(setRendiciones).catch(() => {});
  };
  useEffect(() => { cargar(); }, []);

  // Saldos en banco informados en la cooperadora: se usan como valor inicial del acta
  const [saldosBanco, setSaldosBanco] = useState<{ cuentaCorriente: string; plazoFijo: string }>({
    cuentaCorriente: "",
    plazoFijo: "",
  });
  useEffect(() => {
    api.obtenerDatosInstitucionales()
      .then((inst) => setSaldosBanco({
        cuentaCorriente: inst.saldoCuentaCorriente || "",
        plazoFijo: inst.saldoPlazoFijo || "",
      }))
      .catch(() => {});
  }, []);

  const editar = async (acta?: ActaFila) => {
    setError(null);
    setOrigenSaldoAnterior(null);
    aplicadaRef.current = null;
    if (acta) {
      setForm({
        ...acta,
        reunionId: acta.reunionId,
        archivoAdjunto: acta.archivoAdjunto,
        cuadroFinanciero: { ...CUADRO_VACIO, ...acta.cuadroFinanciero },
        decisiones: acta.decisiones.filter((decision) => decision.orden <= 5).length
          ? acta.decisiones.filter((decision) => decision.orden <= 5)
          : nuevaActa().decisiones,
      });
      return;
    }

    // Acta nueva: se propone el período de la rendición más reciente; los valores se
    // traen solos cuando el período queda vinculado (ver efecto más abajo).
    const rendicion = rendiciones[0];
    setForm({
      ...nuevaActa(saldosBanco),
      ...(rendicion ? { periodoDesde: rendicion.desde.slice(0, 4), periodoHasta: rendicion.hasta.slice(0, 4) } : {}),
    });
  };

  /** Rendición del ejercicio indicado en el acta (1/5 del año "desde" al 30/4 del año "hasta") */
  const rendicionDelPeriodo = (desde: string, hasta: string) => {
    if (!/^\d{4}$/.test(desde) || !/^\d{4}$/.test(hasta)) return undefined;
    return rendiciones.find((r) => r.desde === `${desde}-05-01` && r.hasta === `${hasta}-04-30`);
  };

  const rendicionVinculada = form ? rendicionDelPeriodo(form.periodoDesde, form.periodoHasta) : undefined;

  // Al elegir el período de una rendición, el acta trae todos los valores sola: siempre en
  // un acta nueva y, en una guardada, sólo si todavía no tiene valores de rendición (nunca
  // se pisan los números de un acta firmada ni los ya cargados).
  useEffect(() => {
    if (!form || !rendicionVinculada) return;
    const puedeAuto = !form.id || (form.estado === "Borrador" && cuadroSinValoresDeRendicion(form.cuadroFinanciero));
    if (!puedeAuto) return;
    const clave = `${rendicionVinculada.id}|${form.periodoDesde}|${form.periodoHasta}`;
    if (aplicadaRef.current === clave) return;
    aplicadaRef.current = clave;
    void aplicarRendicion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.periodoDesde, form?.periodoHasta, rendiciones.length]);

  /** Vuelca en el cuadro los valores de la rendición vinculada, sin perder los saldos en banco */
  const aplicarRendicion = async () => {
    if (!form || !rendicionVinculada) return;
    setAplicandoRendicion(true);
    setError(null);
    try {
      const lineas = await api.detalleRendicion(rendicionVinculada.id);
      setForm((actual) => actual
        ? { ...actual, cuadroFinanciero: cuadroDesdeRendicion(lineas, actual.cuadroFinanciero) }
        : actual);
    } catch (e) {
      setError(String(e));
    } finally {
      setAplicandoRendicion(false);
    }
  };

  const importe = (valor?: string) => Number(String(valor ?? "").replace(/\D/g, "")) || 0;

  /**
   * Trae el "Saldo ejercicio anterior" del cierre del ejercicio anterior: primero el acta
   * aprobada, luego el acumulado de caja. Si no hay antecedentes, queda la carga manual.
   */
  const traerSaldoAnterior = async () => {
    if (!form) return;
    if (!/^\d{4}$/.test(form.periodoDesde)) {
      setError("Indicá el año de inicio del ejercicio (campo «período desde») para buscar el saldo");
      return;
    }
    setTrayendoSaldo(true);
    setError(null);
    try {
      const resultado = await api.saldoEjercicioAnterior(`${form.periodoDesde}-05-01`);
      setOrigenSaldoAnterior(resultado.detalle);
      if (resultado.origen === "sin_datos") return;
      setForm((actual) => {
        if (!actual) return actual;
        const entradas = importe(actual.cuadroFinanciero.resumenTotalEntradas || actual.cuadroFinanciero.totalEntradas);
        const salidas = importe(actual.cuadroFinanciero.totalSalidasResumen);
        const totalGeneral = entradas + resultado.saldo;
        return {
          ...actual,
          cuadroFinanciero: {
            ...actual.cuadroFinanciero,
            saldoEjercicioAnterior: String(resultado.saldo),
            totalGeneral: String(totalGeneral),
            saldoProximoEjercicio: String(totalGeneral - salidas),
          },
        };
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setTrayendoSaldo(false);
    }
  };

  const actualizar = <K extends keyof DatosActa>(campo: K, valor: DatosActa[K]) => {
    setForm((actual) => actual ? { ...actual, [campo]: valor } : actual);
  };

  const actualizarDecision = (index: number, patch: Partial<DecisionActa>) => {
    setForm((actual) => actual ? {
      ...actual,
      decisiones: actual.decisiones.map((decision, i) => i === index ? { ...decision, ...patch } : decision),
    } : actual);
  };

  const actualizarCuadro = <K extends keyof CuadroFinancieroActa>(campo: K, valor: CuadroFinancieroActa[K]) => {
    setForm((actual) => actual ? {
      ...actual,
      cuadroFinanciero: { ...actual.cuadroFinanciero, [campo]: valor },
    } : actual);
  };

  const guardar = async () => {
    if (!form || !form.numero.trim() || !form.fechaAsamblea || !/^\d{4}$/.test(form.periodoDesde) || !/^\d{4}$/.test(form.periodoHasta)) {
      setError("Complete el ejercicio con años de cuatro dígitos, número de acta y fecha de asamblea.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const guardada = await api.guardarActaDetallada(form);
      setActas((actuales) => [guardada, ...actuales.filter((a) => a.id !== guardada.id)]);
      setForm(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  const aprobar = async (acta: ActaFila) => {
    try {
      await api.aprobarActa(acta.id);
      cargar();
    } catch (e) {
      setError(String(e));
    }
  };

  const eliminar = async () => {
    if (!actaParaEliminar) return;
    try {
      await api.eliminarActa(actaParaEliminar.id);
      setActaParaEliminar(null);
      cargar();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <Layout
      title={form ? "Actas" : "Actas de asamblea"}
      headerMessage={form && error ? (
        <span style={{ color: "var(--color-danger)", fontSize: "var(--fs-sm)", textAlign: "right", marginLeft: "auto", marginRight: "var(--space-4)" }}>{error}</span>
      ) : undefined}
      action={form ? (
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
          <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando..." : "Guardar acta"}</Button>
          <Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
        </div>
      ) : <Button onClick={() => editar()}>+ Nueva acta</Button>}
    >
      {!form ? (
        <>
          <p>Datos estructurados que se vincularán automáticamente con el P.I.A.</p>
          <Card>
            {actas.length === 0 ? <p>No hay actas registradas.</p> : actas.map((acta) => (
              <div key={acta.id} style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", padding: "var(--space-4) 0", borderBottom: "1px solid var(--color-border)" }}>
                <div>
                  <strong>Acta N° {acta.numero}</strong>
                  <div>{acta.tipo} · {acta.fechaAsamblea} · Fojas {acta.foja || "sin indicar"}</div>
                  <small>{acta.decisiones.filter((d) => d.resultado === "APROBADO").length} decisiones aprobadas · </small>
                  <Badge tone={acta.estado === "Firmada" ? "ok" : "warn"}>
                    {acta.estado === "Firmada" ? "Aprobada" : "Borrador"}
                  </Badge>
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {puedeEditar && (
                    <IconButton
                      icon={<EditIcon />}
                      title="Editar acta"
                      variant="primary"
                      square
                      onClick={() => editar(acta)}
                    />
                  )}
                  {puedeAprobar && acta.estado === "Borrador" && (
                    <IconButton
                      icon={<CheckIcon />}
                      title="Aprobar acta"
                      variant="success"
                      square
                      onClick={() => aprobar(acta)}
                    />
                  )}
                  {puedeEliminar && (
                    <IconButton
                      icon={<TrashIcon />}
                      title="Eliminar acta"
                      variant="danger"
                      square
                      onClick={() => setActaParaEliminar(acta)}
                    />
                  )}
                </div>
              </div>
            ))}
          </Card>
          <ConfirmDialog
            isOpen={actaParaEliminar !== null}
            title="Eliminar acta"
            message={actaParaEliminar ? <>¿Está seguro de que desea eliminar el acta <strong>N° {actaParaEliminar.numero}</strong>?</> : null}
            confirmLabel="Eliminar acta"
            cancelLabel="Cancelar"
            variant="danger"
            onConfirm={eliminar}
            onCancel={() => setActaParaEliminar(null)}
          />
        </>
      ) : (
        <Card title="Síntesis del acta de la Asamblea Anual Ordinaria">
          <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", marginBottom: "var(--space-3)", flexWrap: "nowrap" }}>
            <label style={{ display: "inline-flex", gap: "var(--space-2)", alignItems: "center", whiteSpace: "nowrap" }}>
              <span className={fieldStyles.label}>Ejercicio desde</span>
              <input
                className={fieldStyles.control}
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="20__"
                value={form.periodoDesde}
                onChange={(e) => actualizar("periodoDesde", e.target.value.replace(/\D/g, "").slice(0, 4))}
                required
                style={{ width: 72 }}
              />
            </label>
            <label style={{ display: "inline-flex", gap: "var(--space-2)", alignItems: "center", whiteSpace: "nowrap" }}>
              <span className={fieldStyles.label}>Ejercicio hasta</span>
              <input
                className={fieldStyles.control}
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="20__"
                value={form.periodoHasta}
                onChange={(e) => actualizar("periodoHasta", e.target.value.replace(/\D/g, "").slice(0, 4))}
                required
                style={{ width: 72 }}
              />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "var(--space-3) var(--space-4)", alignItems: "end" }}>
            <Field label="Acta N°" value={form.numero} onChange={(e) => actualizar("numero", e.target.value)} required />
            <Field label="Fojas" value={form.foja} onChange={(e) => actualizar("foja", e.target.value)} />
            <Field label="Fecha de asamblea" type="date" value={form.fechaAsamblea} onChange={(e) => actualizar("fechaAsamblea", e.target.value)} required />
            <Field width="100%" label="Socios activos asistentes" type="number" min={0} value={form.sociosActivosAsistentes} onChange={(e) => actualizar("sociosActivosAsistentes", Number(e.target.value))} />
          </div>

          <h3 style={{ marginTop: "var(--space-5)", marginBottom: "var(--space-3)" }}>Orden del día</h3>
          {form.decisiones.map((decision, index) => (
            <div key={decision.orden} style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", alignItems: "center", marginBottom: "var(--space-2)" }}>
              <span>{decision.orden}° {decision.descripcion}</span>
              <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", whiteSpace: "nowrap" }}>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="radio"
                    name={`decision-${decision.orden}`}
                    checked={decision.resultado === "APROBADO"}
                    onChange={() => actualizarDecision(index, { resultado: "APROBADO" })}
                  />
                  Aprobado
                </label>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="radio"
                    name={`decision-${decision.orden}`}
                    checked={decision.resultado === "DESAPROBADO"}
                    onChange={() => actualizarDecision(index, { resultado: "DESAPROBADO" })}
                  />
                  Desaprobado
                </label>
              </div>
            </div>
          ))}

          <h3 style={{ marginTop: "var(--space-5)" }}>6° Fijación de Cuota Social — período 1/5 al 30/4</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", alignItems: "flex-start" }}>
            <label style={{ display: "inline-flex", gap: "var(--space-2)", alignItems: "center" }}>
              <span className={fieldStyles.label} style={{ width: 140 }}>Cuota social</span>
              <input
                className={fieldStyles.control}
                style={{ width: 180, textAlign: "right", paddingRight: 14 }}
                type="text"
                inputMode="numeric"
                value={form.cuotaSocial === 0 ? "" : String(form.cuotaSocial)}
                onChange={(e) => actualizar("cuotaSocial", Number(e.target.value.replace(/\D/g, "")))}
              />
            </label>
            <div style={{ display: "flex", gap: "var(--space-5)", alignItems: "center" }}>
              <span>Periodicidad de la cuota social:</span>
              {(["Mensual", "Anual"] as const).map((periodicidad) => (
                <label key={periodicidad} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="radio"
                    name="cuota-periodicidad"
                    checked={form.cuotaPeriodicidad === periodicidad}
                    onChange={() => actualizar("cuotaPeriodicidad", periodicidad)}
                  />
                  {periodicidad}
                </label>
              ))}
            </div>
          </div>
          <h3 style={{ marginTop: "var(--space-5)" }}>7° Fijación del Monto de Caja Chica</h3>
          <label style={{ display: "inline-flex", gap: "var(--space-2)", alignItems: "center" }}>
            <span className={fieldStyles.label} style={{ width: 140 }}>Monto aprobado</span>
            <input
              className={fieldStyles.control}
              style={{ width: 180, textAlign: "right", paddingRight: 14 }}
              type="text"
              inputMode="numeric"
              value={form.cajaChica === 0 ? "" : String(form.cajaChica)}
              onChange={(e) => actualizar("cajaChica", Number(e.target.value.replace(/\D/g, "")))}
            />
          </label>
          <h3 style={{ marginTop: "var(--space-5)", marginBottom: "var(--space-3)" }}>Cuadro demostrativo de recursos y gastos</h3>
          <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--fs-sm)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>
            {rendicionVinculada ? (
              <>
                Vinculado a la rendición <strong>{rendicionVinculada.periodo}</strong> ({rendicionVinculada.estado}):
                ingresos {money(rendicionVinculada.totalIngresos)} · egresos {money(rendicionVinculada.totalEgresos)}.{" "}
                {form.id
                  ? "El acta guardada conserva sus valores; podés volver a traerlos si la caja cambió."
                  : "Los valores se traen automáticamente."}
                {form.id && (
                  <button
                    type="button"
                    onClick={() => void aplicarRendicion()}
                    disabled={aplicandoRendicion}
                    style={{
                      marginLeft: "var(--space-2)",
                      background: "none",
                      border: 0,
                      padding: 0,
                      color: "var(--color-primary)",
                      fontWeight: 600,
                      textDecoration: "underline",
                      cursor: "pointer",
                      font: "inherit",
                    }}
                  >
                    {aplicandoRendicion ? "Actualizando..." : "Actualizar desde la rendición"}
                  </button>
                )}
              </>
            ) : (
              <>No hay una rendición para el ejercicio {form.periodoDesde || "—"}/{form.periodoHasta || "—"}: indicá el período del acta o cargá los valores a mano.</>
            )}
          </p>
          <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--fs-sm)", fontStyle: "italic", lineHeight: 1.3 }}>
            Ejercicio comprendido entre el 1/5 y del 30/4 presentado para su aprobación en la asamblea.
          </p>

          <h4 style={{ margin: "var(--space-3) 0 var(--space-2)" }}>Entradas</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--space-1)" }}>
            <strong>1. Recursos propios</strong>
            <DineroInput label="a) Cuota social" value={form.cuadroFinanciero.cuotaSocial} onChange={(v) => actualizarCuadro("cuotaSocial", v)} />
            <DineroInput label="b) Donación de dinero" value={form.cuadroFinanciero.donacionDinero} onChange={(v) => actualizarCuadro("donacionDinero", v)} />
            <DineroInput label="c) Rifas" value={form.cuadroFinanciero.rifas} onChange={(v) => actualizarCuadro("rifas", v)} />
            <DineroInput label="d) Festivales, actos, quermese" value={form.cuadroFinanciero.festivales} onChange={(v) => actualizarCuadro("festivales", v)} />
            <DineroInput label="e) Kiosco" value={form.cuadroFinanciero.kiosco} onChange={(v) => actualizarCuadro("kiosco", v)} />
            <DineroInput label="f) Intereses bancarios" value={form.cuadroFinanciero.interesesBancarios} onChange={(v) => actualizarCuadro("interesesBancarios", v)} />
            <DineroInput label="g) Reintegrados banco (débitos, mant., etc.)" value={form.cuadroFinanciero.reintegradosBanco} onChange={(v) => actualizarCuadro("reintegradosBanco", v)} />
            <strong>2. Recursos oficiales</strong>
            <DineroInput label="a) Subsidios de la DGCYE" value={form.cuadroFinanciero.subsidiosDgcye} onChange={(v) => actualizarCuadro("subsidiosDgcye", v)} />
            <strong>3. Otros ingresos / subsidios</strong>
            <DineroInput label="a) " value={form.cuadroFinanciero.otrosIngresosA} onChange={(v) => actualizarCuadro("otrosIngresosA", v)} />
            <DineroInput label="b) " value={form.cuadroFinanciero.otrosIngresosB} onChange={(v) => actualizarCuadro("otrosIngresosB", v)} />
            <DineroInput label="Total entradas (⑧A)" value={form.cuadroFinanciero.totalEntradas} onChange={(v) => actualizarCuadro("totalEntradas", v)} />
          </div>

          <h4 style={{ margin: "var(--space-3) 0 var(--space-2)" }}>Resumen anual</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--space-1)" }}>
            <DineroInput label="Total entradas (⑧A)" value={form.cuadroFinanciero.resumenTotalEntradas} onChange={(v) => actualizarCuadro("resumenTotalEntradas", v)} />
            <DineroInput label="Saldo ejercicio anterior" value={form.cuadroFinanciero.saldoEjercicioAnterior} onChange={(v) => actualizarCuadro("saldoEjercicioAnterior", v)} />
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", paddingLeft: "var(--space-5)", marginBottom: "var(--space-2)" }}>
              <IconButton
                icon={<RefreshIcon size={16} />}
                title="Traer del ejercicio anterior"
                square
                onClick={() => void traerSaldoAnterior()}
                disabled={trayendoSaldo}
              />
              {origenSaldoAnterior && (
                <span style={{ fontSize: "var(--fs-sm)", color: "var(--color-text-muted)" }}>
                  {origenSaldoAnterior}
                </span>
              )}
            </div>
            <DineroInput label="Total general (total entradas + saldo ejercicio anterior)" value={form.cuadroFinanciero.totalGeneral} onChange={(v) => actualizarCuadro("totalGeneral", v)} />
            <DineroInput label="Total salidas (⑧B)" value={form.cuadroFinanciero.totalSalidasResumen} onChange={(v) => actualizarCuadro("totalSalidasResumen", v)} />
            <DineroInput label="Saldo próximo ejercicio (total general - total salidas)" value={form.cuadroFinanciero.saldoProximoEjercicio} onChange={(v) => actualizarCuadro("saldoProximoEjercicio", v)} />
            <strong style={{ paddingLeft: "var(--space-5)" }}>A - En banco</strong>
            <DineroInput label="En banco — Cuenta corriente" value={form.cuadroFinanciero.cuentaCorriente} onChange={(v) => actualizarCuadro("cuentaCorriente", v)} />
            <DineroInput label="En banco — Plazo fijo" value={form.cuadroFinanciero.plazoFijoBanco} onChange={(v) => actualizarCuadro("plazoFijoBanco", v)} />
            <strong style={{ paddingLeft: "var(--space-5)" }}>B - En caja chica</strong>
            <p style={{ margin: "0 0 0 var(--space-5)", fontSize: "var(--fs-sm)", fontStyle: "italic", lineHeight: 1.3 }}>
              Saldo que pasa al próximo ejercicio. Corresponde al resto de dinero de caja chica aún no utilizado al cierre del ejercicio. No al monto aprobado en asamblea.
            </p>
            <DineroInput label="Dinero en efectivo" value={form.cuadroFinanciero.dineroEfectivo} onChange={(v) => actualizarCuadro("dineroEfectivo", v)} />
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
            <span className={fieldStyles.label}>Observaciones</span>
            <textarea
              className={fieldStyles.control}
              style={{ width: "100%", minHeight: 120, resize: "vertical", padding: "var(--space-3) 14px" }}
              value={form.observaciones || ""}
              onChange={(e) => actualizar("observaciones", e.target.value)}
            />
          </label>

          <h4 style={{ margin: "var(--space-3) 0 var(--space-2)" }}>Salidas</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--space-1)" }}>
            <strong>1. Gastos para el alumno</strong>
            <DineroInput label="a) Ropa y calzado" value={form.cuadroFinanciero.ropaCalzado} onChange={(v) => actualizarCuadro("ropaCalzado", v)} />
            <DineroInput label="b) Libros y útiles" value={form.cuadroFinanciero.librosUtiles} onChange={(v) => actualizarCuadro("librosUtiles", v)} />
            <DineroInput label="c) Excursiones" value={form.cuadroFinanciero.excursiones} onChange={(v) => actualizarCuadro("excursiones", v)} />
            <DineroInput label="d) Emergencias sanitarias" value={form.cuadroFinanciero.emergenciasSanitarias} onChange={(v) => actualizarCuadro("emergenciasSanitarias", v)} />
            <DineroInput label="e) Golosinas, premios y medallas" value={form.cuadroFinanciero.golosinasPremiosMedallas} onChange={(v) => actualizarCuadro("golosinasPremiosMedallas", v)} />
            <DineroInput label="f)" value={form.cuadroFinanciero.gastosAlumnoF} onChange={(v) => actualizarCuadro("gastosAlumnoF", v)} />
            <DineroInput label="g)" value={form.cuadroFinanciero.gastosAlumnoG} onChange={(v) => actualizarCuadro("gastosAlumnoG", v)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--space-1)" }}>
            <strong>2. Gastos para la escuela</strong>
            <DineroInput label="a) Material didáctico" value={form.cuadroFinanciero.materialDidactico} onChange={(v) => actualizarCuadro("materialDidactico", v)} />
            <DineroInput label="b) Mant. y mejoras con subsidios" value={form.cuadroFinanciero.mantSubsidios} onChange={(v) => actualizarCuadro("mantSubsidios", v)} />
            <DineroInput label="c) Mant. y mejoras con fondos propios" value={form.cuadroFinanciero.mantFondosPropios} onChange={(v) => actualizarCuadro("mantFondosPropios", v)} />
            <DineroInput label="d) Artículos de limpieza" value={form.cuadroFinanciero.articulosLimpieza} onChange={(v) => actualizarCuadro("articulosLimpieza", v)} />
            <DineroInput label="e) Combustible y calefacción" value={form.cuadroFinanciero.combustibleCalefaccion} onChange={(v) => actualizarCuadro("combustibleCalefaccion", v)} />
            <DineroInput label="f) Librería" value={form.cuadroFinanciero.libreria} onChange={(v) => actualizarCuadro("libreria", v)} />
            <DineroInput label="g) Mobiliario" value={form.cuadroFinanciero.mobiliario} onChange={(v) => actualizarCuadro("mobiliario", v)} />
            <DineroInput label="h)" value={form.cuadroFinanciero.gastosEscuelaH} onChange={(v) => actualizarCuadro("gastosEscuelaH", v)} />
            <DineroInput label="i)" value={form.cuadroFinanciero.gastosEscuelaI} onChange={(v) => actualizarCuadro("gastosEscuelaI", v)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--space-1)" }}>
            <strong>3. Gastos propios de la entidad</strong>
            <DineroInput label="a) Organización de rifas" value={form.cuadroFinanciero.organizacionRifas} onChange={(v) => actualizarCuadro("organizacionRifas", v)} />
            <DineroInput label="b) Organización de festivales" value={form.cuadroFinanciero.organizacionFestivales} onChange={(v) => actualizarCuadro("organizacionFestivales", v)} />
            <DineroInput label="c) Kiosco" value={form.cuadroFinanciero.kioscoEntidad} onChange={(v) => actualizarCuadro("kioscoEntidad", v)} />
            <DineroInput label="d)" value={form.cuadroFinanciero.gastosEntidadD} onChange={(v) => actualizarCuadro("gastosEntidadD", v)} />
            <DineroInput label="e)" value={form.cuadroFinanciero.gastosEntidadE} onChange={(v) => actualizarCuadro("gastosEntidadE", v)} />
            <strong>4. Otros gastos</strong>
            <DineroInput label="Gastos administrativos" value={form.cuadroFinanciero.gastosAdministrativos} onChange={(v) => actualizarCuadro("gastosAdministrativos", v)} />
            <DineroInput label="Otros egresos" value={form.cuadroFinanciero.otrosEgresos} onChange={(v) => actualizarCuadro("otrosEgresos", v)} />
          </div>
          <div style={{ marginTop: "var(--space-2)" }}>
            <DineroInput label="Total salidas (⑧B)" value={form.cuadroFinanciero.totalSalidasPlazoFijo} onChange={(v) => actualizarCuadro("totalSalidasPlazoFijo", v)} />
          </div>

          <h4 style={{ margin: "var(--space-3) 0 var(--space-2)" }}>Kiosco / librería escolar</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4)", alignItems: "center" }}>
            <span>Posee kiosco / librería escolar:</span>
            {([["poseeKiosco", "Sí"], ["poseeKiosco", "No"]] as const).map(([campo, texto], index) => (
              <label key={texto} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input
                  type="radio"
                  name="posee-kiosco"
                  checked={index === 0 ? form.cuadroFinanciero.poseeKiosco : !form.cuadroFinanciero.poseeKiosco}
                  onChange={() => {
                    actualizarCuadro(campo, index === 0);
                    if (index === 1) {
                      actualizarCuadro("kioscoPropio", false);
                      actualizarCuadro("kioscoLicitado", false);
                      actualizarCuadro("contratoDesde", "");
                      actualizarCuadro("contratoHasta", "");
                    }
                  }}
                />
                {texto}
              </label>
            ))}
            <span style={{ opacity: form.cuadroFinanciero.poseeKiosco ? 1 : 0.5 }}>En caso afirmativo:</span>
            {([["kioscoPropio", "Propio"], ["kioscoLicitado", "Licitado"]] as const).map(([campo, texto]) => (
              <label key={texto} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input
                  type="radio"
                  name="tipo-kiosco"
                  disabled={!form.cuadroFinanciero.poseeKiosco}
                  checked={form.cuadroFinanciero[campo]}
                  onChange={() => {
                    actualizarCuadro(campo, true);
                    actualizarCuadro(campo === "kioscoPropio" ? "kioscoLicitado" : "kioscoPropio", false);
                    if (campo === "kioscoPropio") {
                      actualizarCuadro("contratoDesde", "");
                      actualizarCuadro("contratoHasta", "");
                    }
                  }}
                />
                {texto}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: "var(--space-5)", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
            <div style={{ opacity: form.cuadroFinanciero.poseeKiosco && form.cuadroFinanciero.kioscoLicitado ? 1 : 0.5 }}>
              <TextoInput
                label="Contrato desde"
                value={form.cuadroFinanciero.contratoDesde}
                disabled={!form.cuadroFinanciero.poseeKiosco || !form.cuadroFinanciero.kioscoLicitado}
                onChange={(v) => actualizarCuadro("contratoDesde", v)}
              />
            </div>
            <div style={{ opacity: form.cuadroFinanciero.poseeKiosco && form.cuadroFinanciero.kioscoLicitado ? 1 : 0.5 }}>
              <TextoInput
                label="Contrato hasta"
                value={form.cuadroFinanciero.contratoHasta}
                disabled={!form.cuadroFinanciero.poseeKiosco || !form.cuadroFinanciero.kioscoLicitado}
                onChange={(v) => actualizarCuadro("contratoHasta", v)}
              />
            </div>
          </div>
        </Card>
      )}
    </Layout>
  );
}
