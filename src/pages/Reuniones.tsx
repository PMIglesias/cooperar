// src/pages/Reuniones.tsx
import { useEffect, useState, FormEvent } from "react";
import { api, ReunionFila } from "../api";
import Layout from "../components/Layout";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import DataTable, { Column } from "../components/ui/DataTable";
import { Field, SelectField } from "../components/ui/Field";
import s from "./Reuniones.module.css";

const TIPOS_REUNION = ["Comisión", "Asamblea"];

export default function Reuniones() {
  const [vista, setVista] = useState<"lista" | "nuevo" | "acta">("lista");

  const [reuniones, setReuniones] = useState<ReunionFila[]>([]);
  const [tipoFiltro, setTipoFiltro] = useState("Todos");
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(false);

  // Formulario Programar Reunión
  const [fecha, setFecha] = useState("");
  const [tipo, setTipo] = useState<"Comisión" | "Asamblea">("Comisión");
  const [temas, setTemas] = useState("");
  const [savingReunion, setSavingReunion] = useState(false);
  const [errorReunion, setErrorReunion] = useState<string | null>(null);

  // Pantalla Acta
  const [reunionActa, setReunionActa] = useState<ReunionFila | null>(null);
  const [textoActa, setTextoActa] = useState("");
  const [savingActa, setSavingActa] = useState(false);
  const [errorActa, setErrorActa] = useState<string | null>(null);

  const cargarReuniones = () => {
    setLoading(true);
    api.listarReuniones()
      .then(setReuniones)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    cargarReuniones();
  }, []);

  const abrirProgramar = () => {
    const ahora = new Date();
    ahora.setDate(ahora.getDate() + 7);
    ahora.setHours(18, 30, 0, 0);
    const isoString = ahora.toISOString().slice(0, 16);

    setFecha(isoString);
    setTipo("Comisión");
    setTemas("");
    setErrorReunion(null);
    setVista("nuevo");
  };

  const guardarReunion = async (e: FormEvent) => {
    e.preventDefault();
    if (!fecha) {
      setErrorReunion("Debe indicar la fecha y hora de la reunión.");
      return;
    }
    if (!temas.trim()) {
      setErrorReunion("Debe detallar el orden del día / temas a tratar.");
      return;
    }

    setSavingReunion(true);
    setErrorReunion(null);
    try {
      await api.crearReunion({
        fecha: fecha.replace("T", " "),
        tipo,
        temas: temas.trim(),
      });
      cargarReuniones();
      setVista("lista");
    } catch (err) {
      setErrorReunion(String(err));
    } finally {
      setSavingReunion(false);
    }
  };

  const abrirActa = (r: ReunionFila) => {
    setReunionActa(r);
    setTextoActa(r.acta || "");
    setErrorActa(null);
    setVista("acta");
  };

  const cargarPlantillaActa = () => {
    if (!reunionActa) return;
    const plantilla = `ACTA DE ASOCIACIÓN COOPERADORA ESCOLAR

En la sede de la Institución Educativa, a los días del mes correspondiente a ${reunionActa.fecha}, siendo las 18:30 horas, se reúne la Comisión Directiva con la presencia de los miembros titulares y asociados presentes.

ORDEN DEL DÍA:
${reunionActa.temas}

DESARROLLO Y RESOLUCIONES:
1. Lectura y consideración del acta anterior: Aprobada por unanimidad sin observaciones.
2. Estado de Tesorería y Balance de Caja: El Tesorero expone el detalle de ingresos por cuotas sociales y egresos del período.
3. Tratamiento de los puntos principales: Se debate y se aprueba por unanimidad la asignación de fondos para los proyectos acordados.

No habiendo más asuntos que tratar, se da por finalizada la sesión siendo las 19:45 horas, firmando los presentes de conformidad.

____________________        ____________________
Presidente                  Secretario/a`;
    setTextoActa(plantilla);
  };

  const guardarActa = async () => {
    if (!reunionActa) return;
    setSavingActa(true);
    setErrorActa(null);
    try {
      await api.guardarActa(reunionActa.id, textoActa);
      cargarReuniones();
      setVista("lista");
    } catch (err) {
      setErrorActa(String(err));
    } finally {
      setSavingActa(false);
    }
  };

  const reunionesFiltradas = reuniones.filter((r) => {
    const matchTipo = tipoFiltro === "Todos" || r.tipo === tipoFiltro;
    const matchBusqueda =
      !busqueda ||
      r.temas.toLowerCase().includes(busqueda.toLowerCase()) ||
      r.fecha.includes(busqueda);
    return matchTipo && matchBusqueda;
  });

  const columns: Column<ReunionFila>[] = [
    { header: "Fecha y hora", width: 160, render: (r) => r.fecha },
    {
      header: "Tipo",
      width: 170,
      render: (r) => (
        <Badge tone={r.tipo === "Asamblea" ? "ok" : "primary"}>
          {r.tipo === "Asamblea" ? "Asamblea General" : "Comisión Directiva"}
        </Badge>
      ),
    },
    {
      header: "Temas / Orden del día",
      width: 320,
      flex: true,
      render: (r) => <span>{r.temas}</span>,
    },
    {
      header: "Estado del acta",
      width: 150,
      render: (r) => (
        <Badge tone={r.acta ? "ok" : "warn"}>
          {r.acta ? "Acta redactada" : "Pendiente"}
        </Badge>
      ),
    },
    {
      header: "",
      width: 140,
      render: (r) => (
        <button
          type="button"
          className={s.actionBtn}
          onClick={(e) => {
            e.stopPropagation();
            abrirActa(r);
          }}
        >
          {r.acta ? "Ver acta ›" : "Redactar acta ›"}
        </button>
      ),
    },
  ];

  // -------------------------------------------------------------
  // PANTALLA 1: LISTADO DE REUNIONES
  // -------------------------------------------------------------
  if (vista === "lista") {
    return (
      <Layout
        title="Reuniones y actas"
        action={<Button onClick={abrirProgramar}>+ Programar reunión</Button>}
      >
        <div className={s.filters}>
          <Field
            label="Buscar temas u orden del día"
            type="search"
            placeholder="Escribí un tema o palabra clave…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            width={360}
          />
          <SelectField
            label="Filtrar por tipo"
            value={tipoFiltro}
            options={["Todos", "Comisión", "Asamblea"]}
            onChange={setTipoFiltro}
            width={200}
          />
        </div>

        <DataTable
          columns={columns}
          rows={reunionesFiltradas}
          rowKey={(r) => r.id}
          emptyMessage={loading ? "Cargando reuniones..." : "No se encontraron reuniones registradas."}
          onRowClick={(r) => abrirActa(r)}
        />
      </Layout>
    );
  }

  // -------------------------------------------------------------
  // PANTALLA 2: PROGRAMAR REUNIÓN
  // -------------------------------------------------------------
  if (vista === "nuevo") {
    return (
      <Layout
        title="Reuniones › Programar reunión"
        action={
          <Button variant="secondary" onClick={() => setVista("lista")}>
            ← Volver al listado
          </Button>
        }
      >
        <form onSubmit={guardarReunion} className={s.formContainer}>
          {errorReunion && <div className={s.errorMsg}>{errorReunion}</div>}

          <Card title="Detalles de la convocatoria">
            <div className={s.formFields}>
              <div className={s.formRow}>
                <Field
                  label="Fecha y hora de la reunión"
                  type="datetime-local"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  width={280}
                  required
                />
                <SelectField
                  label="Tipo de reunión"
                  value={tipo}
                  options={TIPOS_REUNION}
                  onChange={(v) => setTipo(v as "Comisión" | "Asamblea")}
                  width={240}
                />
              </div>

              <div>
                <Field
                  label="Temas a tratar / Orden del día"
                  placeholder="Ej: 1. Aprobación de balance mensual. 2. Presupuesto reparación de techos. 3. Organización festival."
                  value={temas}
                  onChange={(e) => setTemas(e.target.value)}
                  width="100%"
                  required
                />
              </div>
            </div>
          </Card>

          <div className={s.actionRow}>
            <Button type="submit" disabled={savingReunion}>
              {savingReunion ? "Guardando..." : "Programar reunión"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setVista("lista")}
              disabled={savingReunion}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Layout>
    );
  }

  // -------------------------------------------------------------
  // PANTALLA 3: REDACTAR / VER ACTA
  // -------------------------------------------------------------
  return (
    <Layout
      title="Reuniones › Libro de actas"
      action={
        <div style={{ display: "flex", gap: "var(--space-4)" }}>
          <Button variant="secondary" onClick={() => window.print()}>
            🖨️ Imprimir acta
          </Button>
          <Button variant="secondary" onClick={() => setVista("lista")}>
            ← Volver a reuniones
          </Button>
        </div>
      }
    >
      {reunionActa && (
        <div className={s.formContainer}>
          {errorActa && <div className={s.errorMsg}>{errorActa}</div>}

          <Card>
            <div className={s.actaHeader}>
              <div className={s.actaMeta}>
                <span className={s.actaTitle}>
                  {reunionActa.tipo === "Asamblea" ? "Asamblea General" : "Reunión de Comisión Directiva"} — {reunionActa.fecha}
                </span>
                <span className={s.actaSub}>Orden del día: {reunionActa.temas}</span>
              </div>
              <button type="button" className={s.templateBtn} onClick={cargarPlantillaActa}>
                📄 Cargar plantilla estándar
              </button>
            </div>

            <textarea
              className={s.actaTextarea}
              value={textoActa}
              onChange={(e) => setTextoActa(e.target.value)}
              placeholder="Escribí aquí el texto oficial del acta, miembros presentes, temas tratados y resoluciones aprobadas…"
            />
          </Card>

          <div className={s.actionRow}>
            <Button onClick={guardarActa} disabled={savingActa}>
              {savingActa ? "Guardando..." : "Guardar acta oficial"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setVista("lista")}
              disabled={savingActa}
            >
              Volver
            </Button>
          </div>
        </div>
      )}
    </Layout>
  );
}
