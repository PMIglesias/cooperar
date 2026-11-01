// src/pages/Reuniones.tsx
import { useEffect, useState, FormEvent } from "react";
import { api, ReunionFila } from "../api";
import Layout from "../components/Layout";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import DataTable, { Column } from "../components/ui/DataTable";
import { Field, SelectField } from "../components/ui/Field";
import IconButton from "../components/ui/IconButton";
import { DocumentIcon, EditIcon, EyeIcon, PaperclipIcon, PrinterIcon } from "../components/icons";
import { useApp } from "../context";
import s from "./Reuniones.module.css";

const TIPOS_REUNION = ["Comisión", "Asamblea"];

export default function Reuniones() {
  const { usuario } = useApp();
  const puedeAdministrar = usuario.rol === "Secretaria" || usuario.rol === "Presidente" || usuario.rol === "Superadmin";
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
  const [archivoAdjunto, setArchivoAdjunto] = useState<string | null>(null);
  const [archivoAdjuntoNombre, setArchivoAdjuntoNombre] = useState<string | null>(null);
  const [savingActa, setSavingActa] = useState(false);
  const [errorActa, setErrorActa] = useState<string | null>(null);

  const cargarReuniones = () => {
    setLoading(true);
    api.listarReuniones()
      .then(setReuniones)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const imprimirActa = () => {
    if (!reunionActa) return;
    const escapar = (valor: string) => valor.replace(/[&<>"']/g, (caracter) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[caracter] || caracter));
    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, { position: "fixed", width: "1px", height: "1px", border: "0", opacity: "0" });
    document.body.appendChild(iframe);
    iframe.contentDocument?.open();
    iframe.contentDocument?.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Acta</title>
      <style>
        @page { size: A4 portrait; margin: 20mm; }
        body { font-family: Arial, sans-serif; color: #1f2937; margin: 0; }
        h1 { margin: 0 0 8px; font-size: 22px; text-align: center; }
        .meta { text-align: center; color: #4b5563; margin-bottom: 24px; }
        .topics { padding: 12px; margin-bottom: 24px; background: #f3f4f6; border: 1px solid #d1d5db; }
        .acta { white-space: pre-wrap; line-height: 1.6; font-size: 14px; }
      </style></head><body>
      <h1>Acta de ${escapar(reunionActa.tipo === "Asamblea" ? "Asamblea General" : "Reunión de Comisión Directiva")}</h1>
      <div class="meta">${escapar(reunionActa.fecha)}</div>
      <div class="topics"><strong>Orden del día</strong><br>${escapar(reunionActa.temas)}</div>
      <div class="acta">${escapar(textoActa || "Acta aún no redactada.")}</div>
      </body></html>`);
    iframe.contentDocument?.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1000);
    }, 100);
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
    setArchivoAdjunto(r.archivoAdjunto || null);
    setArchivoAdjuntoNombre(r.archivoAdjunto ? "acta_adjunta_firmada.pdf" : null);
    setErrorActa(null);
    setVista("acta");
  };

  const handleArchivoActa = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setArchivoAdjuntoNombre(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setArchivoAdjunto(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
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
      await api.guardarActa(reunionActa.id, textoActa, archivoAdjunto || undefined);
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
    { header: "Fecha y hora", minWidth: 150, flex: true, render: (r) => r.fecha },
    {
      header: "Tipo",
      minWidth: 170,
      flex: true,
      render: (r) => (
        <Badge tone={r.tipo === "Asamblea" ? "ok" : "primary"}>
          {r.tipo === "Asamblea" ? "Asamblea General" : "Comisión Directiva"}
        </Badge>
      ),
    },
    {
      header: "Temas / Orden del día",
      minWidth: 260,
      flex: true,
      render: (r) => <span>{r.temas}</span>,
    },
    {
      header: "Estado del acta",
      minWidth: 160,
      flex: true,
      render: (r) => (
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          <Badge tone={r.acta ? "ok" : "warn"}>
            {r.acta ? "Acta redactada" : "Pendiente"}
          </Badge>
          {r.archivoAdjunto && (
            <span className={s.attachmentStatus} title="Contiene documento o acta escaneada adjunta" aria-label="Contiene adjunto">
              <PaperclipIcon size={16} />
            </span>
          )}
        </div>
      ),
    },
    {
      header: "Acciones",
      width: 85,
      align: "center",
      render: (r) => (
        <IconButton
          icon={puedeAdministrar ? (r.acta ? <DocumentIcon /> : <EditIcon />) : <EyeIcon />}
          title={puedeAdministrar ? (r.acta ? "Ver / Editar acta" : "Redactar acta") : "Ver acta"}
          variant="primary"
          square
          onClick={(e) => {
            e.stopPropagation();
            abrirActa(r);
          }}
        />
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
        action={puedeAdministrar ? <Button onClick={abrirProgramar}>+ Programar reunión</Button> : undefined}
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
          <Button variant="secondary" onClick={imprimirActa} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <PrinterIcon size={16} /> Imprimir acta
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
              {puedeAdministrar && (
                <button type="button" className={s.templateBtn} onClick={cargarPlantillaActa}>
                  📄 Cargar plantilla estándar
                </button>
              )}
            </div>

            <textarea
              className={s.actaTextarea}
              value={textoActa}
              readOnly={!puedeAdministrar}
              onChange={(e) => setTextoActa(e.target.value)}
              placeholder={
                puedeAdministrar
                  ? "Escribí aquí el texto oficial del acta, miembros presentes, temas tratados y resoluciones aprobadas…"
                  : "Acta aún no redactada."
              }
            />

            <div style={{ marginTop: "16px", padding: "12px 16px", background: "var(--color-bg)", borderRadius: "var(--radius-sm)", border: "1px dashed var(--color-border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <PaperclipIcon size={18} />
                <div>
                  <strong style={{ fontSize: "var(--fs-sm)", display: "block" }}>Adjunto digital escaneado (RF16 - PDF o Imagen):</strong>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--color-text-muted)" }}>
                    {archivoAdjunto ? (archivoAdjuntoNombre || "Documento escaneado adjunto") : "Sin archivo escaneado adjunto"}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {archivoAdjunto && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const w = window.open("");
                      w?.document.write(`<iframe src="${archivoAdjunto}" style="width:100%; height:100%; border:none;"></iframe>`);
                    }}
                  >
                    Ver archivo
                  </Button>
                )}
                {puedeAdministrar && (
                  <>
                    <input
                      type="file"
                      id="acta-adjunto-input"
                      style={{ display: "none" }}
                      accept=".pdf,image/*"
                      onChange={handleArchivoActa}
                    />
                    <label
                      htmlFor="acta-adjunto-input"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: "1px solid var(--color-border)",
                        background: "var(--color-bg-card)",
                        cursor: "pointer",
                        fontSize: "var(--fs-sm)",
                        fontWeight: 500,
                      }}
                    >
                      <PaperclipIcon size={14} />
                      {archivoAdjunto ? "Reemplazar adjunto" : "Adjuntar PDF o Imagen"}
                    </label>
                    {archivoAdjunto && (
                      <Button
                        variant="danger"
                        onClick={() => {
                          setArchivoAdjunto(null);
                          setArchivoAdjuntoNombre(null);
                        }}
                      >
                        Quitar
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </Card>

          <div className={s.actionRow}>
            {puedeAdministrar && (
              <Button onClick={guardarActa} disabled={savingActa}>
                {savingActa ? "Guardando..." : "Guardar acta oficial"}
              </Button>
            )}
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
