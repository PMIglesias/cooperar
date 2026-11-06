import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { ActaFila, api, CuadroFinancieroActa, DatosActa, DecisionActa } from "../api";
import fieldStyles from "../components/ui/Field.module.css";

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

function TextoInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label style={{ display: "inline-flex", gap: "var(--space-2)", alignItems: "center", minWidth: 0 }}>
      <span className={fieldStyles.label} style={{ flex: "1 1 auto" }}>{label}</span>
      <input
        className={fieldStyles.control}
        style={{ width: 150, flex: "0 0 150px" }}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

const nuevaActa = (): DatosActa => ({
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
  cuadroFinanciero: { ...CUADRO_VACIO },
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
  const [actas, setActas] = useState<ActaFila[]>([]);
  const [form, setForm] = useState<DatosActa | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = () => api.listarActas().then(setActas).catch((e) => setError(String(e)));
  useEffect(() => { cargar(); }, []);

  const editar = (acta?: ActaFila) => {
    setError(null);
    setForm(acta ? {
      ...acta,
      reunionId: acta.reunionId,
      archivoAdjunto: acta.archivoAdjunto,
      cuadroFinanciero: { ...CUADRO_VACIO, ...acta.cuadroFinanciero },
      decisiones: acta.decisiones.filter((decision) => decision.orden <= 5).length
        ? acta.decisiones.filter((decision) => decision.orden <= 5)
        : nuevaActa().decisiones,
    } : nuevaActa());
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
                  <small>{acta.decisiones.filter((d) => d.resultado === "APROBADO").length} decisiones aprobadas</small>
                </div>
                <Button variant="secondary" onClick={() => editar(acta)}>Editar</Button>
              </div>
            ))}
          </Card>
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
                value={form.cuotaSocial}
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
              value={form.cajaChica}
              onChange={(e) => actualizar("cajaChica", Number(e.target.value.replace(/\D/g, "")))}
            />
          </label>
          <h3 style={{ marginTop: "var(--space-5)", marginBottom: "var(--space-3)" }}>Cuadro demostrativo de recursos y gastos</h3>
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
                <input type="radio" name="posee-kiosco" checked={index === 0 ? form.cuadroFinanciero.poseeKiosco : !form.cuadroFinanciero.poseeKiosco} onChange={() => actualizarCuadro(campo, index === 0)} />
                {texto}
              </label>
            ))}
            <span>En caso afirmativo:</span>
            {([["kioscoPropio", "Propio"], ["kioscoLicitado", "Licitado"]] as const).map(([campo, texto]) => (
              <label key={texto} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={form.cuadroFinanciero[campo]} onChange={(e) => actualizarCuadro(campo, e.target.checked)} />
                {texto}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: "var(--space-5)", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
            <TextoInput label="Contrato desde" value={form.cuadroFinanciero.contratoDesde} onChange={(v) => actualizarCuadro("contratoDesde", v)} />
            <TextoInput label="Contrato hasta" value={form.cuadroFinanciero.contratoHasta} onChange={(v) => actualizarCuadro("contratoHasta", v)} />
          </div>
        </Card>
      )}
    </Layout>
  );
}
