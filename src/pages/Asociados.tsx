// src/pages/Asociados.tsx
import { useEffect, useState, useRef, FormEvent } from "react";
import {
  api,
  AsociadoFila,
  AsociadoDetalle,
  EstadoCuotas,
  ResumenPadron,
  PagoFila,
  DatosInstitucionales,
  PersonalEstablecimientoFila,
  money,
} from "../api";
import Layout from "../components/Layout";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge, { Tone } from "../components/ui/Badge";
import DataTable, { Column } from "../components/ui/DataTable";
import { Field, SelectField } from "../components/ui/Field";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import IconButton from "../components/ui/IconButton";
import Modal from "../components/ui/Modal";
import { EyeIcon, PrinterIcon, SettingsIcon } from "../components/icons";
import { useApp } from "../context";
import {
  generarHtmlListadoAsociados,
  generarHtmlFichaAsociado,
  ColumnasSeleccionadas,
  COLUMNAS_DEFAULT,
} from "../utils/asociadosPrintHtml";
import s from "./Asociados.module.css";

const TONE: Record<EstadoCuotas, Tone> = {
  "Al día": "ok",
  "Con deuda": "danger",
  Exento: "warn",
};

interface FormAlumno {
  nombre: string;
  curso: string;
}

export default function Asociados() {
  const { usuario } = useApp();
  const puedeAdministrar = usuario.rol === "Secretaria" || usuario.rol === "Superadmin";
  const [vista, setVista] = useState<"lista" | "ficha" | "formulario" | "visor">("lista");
  const [institucion, setInstitucion] = useState<DatosInstitucionales | null>(null);

  // Filtros de listado
  const [busqueda, setBusqueda] = useState("");
  const [estadoCuotas, setEstadoCuotas] = useState("Todos");
  const [estado, setEstado] = useState("Todos"); // "Todos" por defecto
  const [rows, setRows] = useState<AsociadoFila[]>([]);
  const [resumen, setResumen] = useState<ResumenPadron | null>(null);

  // Modal de Personalización de Listado
  const [modalImprimirOpen, setModalImprimirOpen] = useState(false);
  const [personalizarDesdePreview, setPersonalizarDesdePreview] = useState(false);
  const [columnasAplicadas, setColumnasAplicadas] = useState<ColumnasSeleccionadas>(COLUMNAS_DEFAULT);
  const [columnasPersonalizadas, setColumnasPersonalizadas] = useState<ColumnasSeleccionadas>(COLUMNAS_DEFAULT);

  // Visor de Impresión
  const [docActivo, setDocActivo] = useState<{
    titulo: string;
    htmlContent: string;
    esListado: boolean;
  } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Pantalla Ficha
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [ficha, setFicha] = useState<AsociadoDetalle | null>(null);
  const [pagosFicha, setPagosFicha] = useState<PagoFila[]>([]);
  const [loadingFicha, setLoadingFicha] = useState(false);

  // Pantalla Formulario (Nuevo / Editar)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formNombre, setFormNombre] = useState("");
  const [formDni, setFormDni] = useState("");
  const [formTelefono, setFormTelefono] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formTipoVinculo, setFormTipoVinculo] = useState("PADRE_TUTOR");
  const [busquedaDirectivo, setBusquedaDirectivo] = useState("");
  const [directivosDropdownOpen, setDirectivosDropdownOpen] = useState(false);
  const [personalEstablecimiento, setPersonalEstablecimiento] = useState<PersonalEstablecimientoFila[]>([]);
  const [formExento, setFormExento] = useState(false);
  const [formActivo, setFormActivo] = useState(true);
  const [formAlumnos, setFormAlumnos] = useState<FormAlumno[]>([{ nombre: "", curso: "" }]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  const cargarAsociados = () => {
    api.listarAsociados({ busqueda, estadoCuotas, estado }).then(setRows).catch(console.error);
    api.resumenPadron().then(setResumen).catch(console.error);
  };

  useEffect(() => {
    api.obtenerDatosInstitucionales().then(setInstitucion).catch(console.error);
    api.listarPersonalEstablecimiento().then(setPersonalEstablecimiento).catch(console.error);
  }, []);

  useEffect(() => {
    cargarAsociados();
  }, [busqueda, estadoCuotas, estado]);

  const abrirFicha = async (id: number) => {
    setSelectedId(id);
    setLoadingFicha(true);
    setVista("ficha");
    try {
      const [det, pagos] = await Promise.all([
        api.obtenerAsociado(id),
        api.obtenerHistorialPagosAsociado(id),
      ]);
      setFicha(det);
      setPagosFicha(pagos);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingFicha(false);
    }
  };

  // Manejador: Generar e Imprimir Ficha del Asociado
  const handleImprimirFicha = async (asociadoId?: number) => {
    try {
      const targetId = asociadoId || ficha?.id;
      if (!targetId) return;

      let det = ficha;
      let pagos = pagosFicha;

      if (!det || det.id !== targetId) {
        const [d, p] = await Promise.all([
          api.obtenerAsociado(targetId),
          api.obtenerHistorialPagosAsociado(targetId),
        ]);
        det = d;
        pagos = p;
      }

      if (!det) return;

      const html = generarHtmlFichaAsociado(det, pagos, institucion);
      setDocActivo({
        titulo: `Ficha de Asociado - ${det.apellidoNombre}`,
        htmlContent: html,
        esListado: false,
      });
      setVista("visor");
    } catch (err) {
      console.error("Error al generar la ficha para impresión:", err);
    }
  };

  const generarListado = (cols: ColumnasSeleccionadas, titulo: string) => {
    const criterios: string[] = [];
    if (busqueda.trim()) criterios.push(`Búsqueda: "${busqueda.trim()}"`);
    if (estado !== "Todos") criterios.push(`Estado: ${estado}`);
    if (estadoCuotas !== "Todos") criterios.push(`Cuotas: ${estadoCuotas}`);
    const subtituloFiltros = criterios.length > 0 ? criterios.join(" · ") : "Todos los asociados registrados";

    const html = generarHtmlListadoAsociados(rows, institucion, cols, subtituloFiltros);
    setDocActivo({
      titulo,
      htmlContent: html,
      esListado: true,
    });
  };

  // Configurar guarda las columnas para futuras impresiones sin abrir el visor.
  const aplicarConfiguracionListado = () => {
    setColumnasAplicadas(columnasPersonalizadas);
    if (personalizarDesdePreview) {
      generarListado(columnasPersonalizadas, "Listado Personalizado de Asociados");
      setPersonalizarDesdePreview(false);
      setModalImprimirOpen(false);
      setVista("visor");
      return;
    }

    setModalImprimirOpen(false);
  };

  // Disparar diálogo de impresión desde el iframe
  const handleDispararImpresion = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.focus();
      iframeRef.current.contentWindow.print();
    }
  };

  const abrirConfiguracionListado = (desdePreview = false) => {
    setColumnasPersonalizadas(columnasAplicadas);
    setPersonalizarDesdePreview(desdePreview);
    if (desdePreview) setVista("lista");
    setModalImprimirOpen(true);
  };

  const cerrarConfiguracionListado = () => {
    setModalImprimirOpen(false);
    if (personalizarDesdePreview) {
      setPersonalizarDesdePreview(false);
      setVista("visor");
    }
  };

  const abrirNuevoForm = () => {
    setEditingId(null);
    setFormNombre("");
    setFormDni("");
    setFormTelefono("");
    setFormEmail("");
    setFormTipoVinculo("PADRE_TUTOR");
    setBusquedaDirectivo("");
    setDirectivosDropdownOpen(false);
    setFormExento(false);
    setFormActivo(true);
    setFormAlumnos([{ nombre: "", curso: "" }]);
    setFormError(null);
    setVista("formulario");
  };

  const abrirEditarForm = (det: AsociadoDetalle) => {
    setEditingId(det.id);
    setFormNombre(det.apellidoNombre);
    setFormDni(det.dni);
    setFormTelefono(det.telefono || "");
    setFormEmail(det.email || "");
    setFormTipoVinculo(det.tipoVinculo || "PADRE_TUTOR");
    setBusquedaDirectivo("");
    setDirectivosDropdownOpen(false);
    setFormExento(det.exento === 1);
    setFormActivo(det.activo === 1);
    if (det.listaAlumnos && det.listaAlumnos.length > 0) {
      setFormAlumnos(det.listaAlumnos.map((a) => ({ nombre: a.nombre, curso: a.curso })));
    } else {
      setFormAlumnos([{ nombre: "", curso: "" }]);
    }
    setFormError(null);
    setVista("formulario");
  };

  const agregarAlumnoRow = () => {
    setFormAlumnos([...formAlumnos, { nombre: "", curso: "" }]);
  };

  const eliminarAlumnoRow = (index: number) => {
    if (formAlumnos.length <= 1) {
      setFormAlumnos([{ nombre: "", curso: "" }]);
      return;
    }
    setFormAlumnos(formAlumnos.filter((_, i) => i !== index));
  };

  const etiquetaVinculo = (tipo: string) => ({
    PADRE_TUTOR: "Padre, madre o tutor de alumno",
    PERSONAL_ESCOLAR: "Personal de la escuela",
    DIRECTIVO_ESCOLAR: "Directivo/personal escolar",
    FAMILIAR_RESPONSABLE: "Familiar o responsable autorizado",
    COLABORADOR_EXTERNO: "Vecino, comercio o entidad colaboradora",
    SIN_VINCULO: "Sin vínculo con el establecimiento",
    OTRO: "Otro vínculo",
  }[tipo] || tipo);

  const personalDirectivo = personalEstablecimiento
    .filter((persona) =>
      `${persona.nombre} ${persona.cargo} ${persona.dni}`
        .toLocaleLowerCase()
        .includes(busquedaDirectivo.toLocaleLowerCase().trim()),
    )
    .slice(0, 8);

  const seleccionarPersonalDirectivo = (persona: PersonalEstablecimientoFila) => {
    setFormNombre(persona.nombre);
    setFormDni(persona.dni);
    setFormTelefono(persona.telefono || "");
    setFormEmail(persona.email || "");
    setBusquedaDirectivo(`${persona.nombre} — ${persona.cargo}`);
    setDirectivosDropdownOpen(false);
  };

  const actualizarAlumnoRow = (index: number, field: "nombre" | "curso", value: string) => {
    const next = [...formAlumnos];
    next[index] = { ...next[index], [field]: value };
    setFormAlumnos(next);
  };

  const guardarFormulario = async (e: FormEvent) => {
    e.preventDefault();
    if (!formNombre.trim()) {
      setFormError("El apellido y nombre son obligatorios.");
      return;
    }
    if (!formDni.trim()) {
      setFormError("El DNI es obligatorio.");
      return;
    }

    const alumnosValidos = formAlumnos.filter((a) => a.nombre.trim() !== "");

    setFormSaving(true);
    setFormError(null);

    const datos = {
      apellidoNombre: formNombre.trim(),
      dni: formDni.trim(),
      telefono: formTelefono.trim() || undefined,
      email: formEmail.trim() || undefined,
      tipoVinculo: formTipoVinculo,
      alumnos: alumnosValidos.map((a) => ({
        nombre: a.nombre.trim(),
        curso: a.curso.trim() || "1°",
      })),
    };

    try {
      if (editingId) {
        await api.actualizarAsociado(editingId, datos);
        await api.marcarExento(editingId, formExento);
        if (formActivo !== (ficha?.activo === 1)) {
          if (formActivo) await api.reactivarAsociado(editingId);
          else await api.darDeBaja(editingId);
        }
        abrirFicha(editingId);
      } else {
        const nuevoId = await api.crearAsociado(datos);
        abrirFicha(nuevoId);
      }
      cargarAsociados();
    } catch (err) {
      setFormError(String(err));
    } finally {
      setFormSaving(false);
    }
  };

  const [confirmBajaOpen, setConfirmBajaOpen] = useState(false);
  const [confirmEliminarOpen, setConfirmEliminarOpen] = useState(false);

  const toggleExento = async () => {
    if (!ficha) return;
    const nuevoEstado = ficha.exento === 0;
    try {
      await api.marcarExento(ficha.id, nuevoEstado);
      abrirFicha(ficha.id);
      cargarAsociados();
    } catch (err) {
      console.error(err);
    }
  };

  const toggleBaja = async () => {
    if (!ficha) return;
    if (ficha.activo === 1) {
      setConfirmBajaOpen(true);
    } else {
      try {
        await api.reactivarAsociado(ficha.id);
        abrirFicha(ficha.id);
        cargarAsociados();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const confirmarDarDeBaja = async () => {
    if (!ficha) return;
    try {
      await api.darDeBaja(ficha.id);
      setConfirmBajaOpen(false);
      abrirFicha(ficha.id);
      cargarAsociados();
    } catch (err) {
      console.error(err);
    }
  };

  const confirmarEliminar = async () => {
    if (!ficha) return;
    try {
      await api.eliminarAsociado(ficha.id);
      setConfirmEliminarOpen(false);
      setFicha(null);
      setSelectedId(null);
      setVista("lista");
      cargarAsociados();
    } catch (err) {
      setConfirmEliminarOpen(false);
      setFormError(String(err));
    }
  };

  const COLUMNS: Column<AsociadoFila>[] = [
    { header: "Apellido y nombre", minWidth: 220, flex: true, render: (a) => <strong>{a.apellidoNombre}</strong> },
    ...(columnasAplicadas.dni ? [{ header: "DNI", minWidth: 110, flex: true, render: (a: AsociadoFila) => a.dni }] : []),
    ...(columnasAplicadas.telefono ? [{ header: "Teléfono", minWidth: 130, flex: true, render: (a: AsociadoFila) => a.telefono || "—" }] : []),
    ...(columnasAplicadas.email ? [{ header: "Correo", minWidth: 210, flex: true, render: (a: AsociadoFila) => a.email || "—" }] : []),
    ...(columnasAplicadas.alumnos ? [{ header: "Alumnos", minWidth: 180, flex: true, render: (a: AsociadoFila) => a.alumnos || "—" }] : []),
    ...(columnasAplicadas.activo ? [{
      header: "Estado",
      minWidth: 105,
      flex: true,
      render: (a: AsociadoFila) => (
        <Badge tone={a.activo === 1 ? "ok" : "danger"}>
          {a.activo === 1 ? "Activo" : "De baja"}
        </Badge>
      ),
    }] : []),
    ...(columnasAplicadas.estadoCuotas ? [{
      header: "Cuotas",
      minWidth: 115,
      flex: true,
      render: (a: AsociadoFila) => <Badge tone={TONE[a.estadoCuotas]}>{a.estadoCuotas}</Badge>,
    }] : []),
    {
      header: "Acciones",
      width: 100,
      align: "center",
      render: (a: AsociadoFila) => (
        <div style={{ display: "flex", gap: "6px", justifyContent: "center", alignItems: "center" }}>
          <IconButton
            icon={<EyeIcon />}
            title="Ver ficha del asociado"
            variant="primary"
            square
            onClick={(e) => {
              e.stopPropagation();
              abrirFicha(a.id);
            }}
          />
          <IconButton
            icon={<PrinterIcon size={16} />}
            title="Imprimir ficha e historial del asociado"
            variant="default"
            square
            onClick={(e) => {
              e.stopPropagation();
              handleImprimirFicha(a.id);
            }}
          />
        </div>
      ),
    },
  ];

  const COLUMNS_PAGOS: Column<PagoFila>[] = [
    { header: "Fecha", width: 120, render: (p) => p.fechaPago },
    { header: "Período", width: 120, render: (p) => <Badge tone="ok">{p.periodo}</Badge> },
    { header: "Comprobante", width: 140, render: (p) => p.comprobante || `REC-${p.id}` },
    { header: "Medio de pago", width: 140, render: (p) => p.medio },
    {
      header: "Registrado por",
      width: 160,
      flex: true,
      render: (p) => {
        if (p.registradoPorRol) return p.registradoPorRol;
        const match = p.registradoPor.match(/^([^(]+)/);
        return match ? match[1].trim() : p.registradoPor;
      },
    },
  ];

  // -------------------------------------------------------------
  // PANTALLA 1: LISTADO DE ASOCIADOS
  // -------------------------------------------------------------
  if (vista === "lista") {
    return (
      <Layout
        title="Asociados"
        action={
          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            {puedeAdministrar && <Button onClick={abrirNuevoForm}>+ Nuevo asociado</Button>}
            <Button
              variant="secondary"
              onClick={() => {
                generarListado(columnasAplicadas, "Padrón Oficial de Asociados");
                setVista("visor");
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <PrinterIcon size={16} />
              Imprimir listado
            </Button>
            <Button
              variant="secondary"
              onClick={() => abrirConfiguracionListado()}
              aria-label="Configurar listado"
              title="Configurar listado"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <SettingsIcon size={20} />
            </Button>
          </div>
        }
      >
        <div className={s.filters}>
          <Field
            label="Buscar por nombre, DNI o alumno"
            placeholder="Escribí un nombre o DNI…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            width={380}
          />
          <SelectField
            label="Estado del asociado"
            value={estado}
            width={180}
            options={["Todos", "Activos", "Dados de baja"]}
            onChange={setEstado}
          />
          <SelectField
            label="Estado de cuotas"
            value={estadoCuotas}
            width={180}
            options={["Todos", "Al día", "Con deuda", "Exento"]}
            onChange={setEstadoCuotas}
          />
        </div>

        <p className={s.summary}>
          {resumen &&
            `${resumen.activos} asociados activos · ${resumen.conDeuda} con deuda · ${resumen.exentos} exentos`}
        </p>

        <DataTable
          columns={COLUMNS}
          rows={rows}
          rowKey={(a) => a.id}
          onRowClick={(a) => abrirFicha(a.id)}
          emptyMessage="No se encontraron asociados con los filtros aplicados."
        />

        {/* Modal de Configuración de Columnas para Listado Personalizado */}
        <Modal
          isOpen={modalImprimirOpen}
          onClose={cerrarConfiguracionListado}
          title="Personalizar Campos del Padrón de Asociados"
          size="medium"
          footer={
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-3)", width: "100%" }}>
              <Button variant="secondary" onClick={cerrarConfiguracionListado}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={aplicarConfiguracionListado}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <SettingsIcon size={20} />
                {personalizarDesdePreview ? "Aplicar y ver listado" : "Guardar configuración"}
              </Button>
            </div>
          }
        >
          <div className={s.modalPrintContainer}>
            <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "var(--fs-sm)" }}>
              Selecciona qué columnas figurarán en el documento impreso para los{" "}
              <strong>{rows.length} asociados</strong> filtrados actualmente:
            </p>

            <div className={s.customColsCard} style={{ marginTop: 0 }}>
              <div className={s.colsGrid}>
                <label className={s.colCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={columnasPersonalizadas.dni}
                    onChange={(e) =>
                      setColumnasPersonalizadas({ ...columnasPersonalizadas, dni: e.target.checked })
                    }
                  />
                  <span>DNI del Asociado</span>
                </label>

                <label className={s.colCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={columnasPersonalizadas.telefono}
                    onChange={(e) =>
                      setColumnasPersonalizadas({ ...columnasPersonalizadas, telefono: e.target.checked })
                    }
                  />
                  <span>Teléfono de contacto</span>
                </label>

                <label className={s.colCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={columnasPersonalizadas.email}
                    onChange={(e) =>
                      setColumnasPersonalizadas({ ...columnasPersonalizadas, email: e.target.checked })
                    }
                  />
                  <span>Correo electrónico</span>
                </label>

                <label className={s.colCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={columnasPersonalizadas.alumnos}
                    onChange={(e) =>
                      setColumnasPersonalizadas({ ...columnasPersonalizadas, alumnos: e.target.checked })
                    }
                  />
                  <span>Alumnos y cursos</span>
                </label>

                <label className={s.colCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={columnasPersonalizadas.fechaAlta}
                    onChange={(e) =>
                      setColumnasPersonalizadas({ ...columnasPersonalizadas, fechaAlta: e.target.checked })
                    }
                  />
                  <span>Fecha de alta</span>
                </label>

                <label className={s.colCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={columnasPersonalizadas.estadoCuotas}
                    onChange={(e) =>
                      setColumnasPersonalizadas({ ...columnasPersonalizadas, estadoCuotas: e.target.checked })
                    }
                  />
                  <span>Estado de cuotas</span>
                </label>

                <label className={s.colCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={columnasPersonalizadas.activo}
                    onChange={(e) =>
                      setColumnasPersonalizadas({ ...columnasPersonalizadas, activo: e.target.checked })
                    }
                  />
                  <span>Estado (Activo / Baja)</span>
                </label>

                <label className={s.colCheckboxLabel} style={{ background: "rgba(15, 61, 94, 0.06)", padding: "4px 8px", borderRadius: "4px" }}>
                  <input
                    type="checkbox"
                    checked={columnasPersonalizadas.firma}
                    onChange={(e) =>
                      setColumnasPersonalizadas({ ...columnasPersonalizadas, firma: e.target.checked })
                    }
                  />
                  <strong style={{ color: "var(--color-primary)" }}>Espacio para firma del socio</strong>
                </label>
              </div>
            </div>
          </div>
        </Modal>
      </Layout>
    );
  }

  // -------------------------------------------------------------
  // PANTALLA 2: FICHA DEL ASOCIADO
  // -------------------------------------------------------------
  if (vista === "ficha") {
    return (
      <Layout
        title="Asociados › Ficha del asociado"
        action={
          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            {puedeAdministrar && (
              <Button onClick={() => ficha && abrirEditarForm(ficha)}>Editar datos</Button>
            )}
            <Button
              variant="secondary"
              onClick={() => handleImprimirFicha()}
              title="Imprimir ficha"
              aria-label="Imprimir ficha"
              style={{ width: "48px", height: "48px", padding: 0 }}
            >
              <PrinterIcon size={16} />
            </Button>
            <Button variant="secondary" onClick={() => setVista("lista")}>
              ← Volver al listado
            </Button>
          </div>
        }
      >
        {loadingFicha ? (
          <p className={s.emptyText}>Cargando datos del asociado...</p>
        ) : ficha ? (
          <div className={s.fichaContainer}>
            {formError && <div className={s.errorMsg}>{formError}</div>}
            <Card title={ficha.apellidoNombre}>
              <div className={s.fichaGrid}>
                <div className={s.fichaItem}>
                  <span className={s.fichaLabel}>DNI</span>
                  <span className={s.fichaValue}>{ficha.dni}</span>
                </div>
                <div className={s.fichaItem}>
                  <span className={s.fichaLabel}>Teléfono</span>
                  <span className={s.fichaValue}>{ficha.telefono || "—"}</span>
                </div>
                <div className={s.fichaItem}>
                  <span className={s.fichaLabel}>Correo electrónico</span>
                  <span className={s.fichaValue}>{ficha.email || "—"}</span>
                </div>
                <div className={s.fichaItem}>
                  <span className={s.fichaLabel}>Fecha de alta</span>
                  <span className={s.fichaValue}>{ficha.fechaAlta}</span>
                </div>
                <div className={s.fichaItem}>
                  <span className={s.fichaLabel}>Vínculo con la cooperadora</span>
                  <span className={s.fichaValue}>{etiquetaVinculo(ficha.tipoVinculo)}</span>
                </div>
                <div className={s.fichaItem}>
                  <span className={s.fichaLabel}>Estado de cuotas</span>
                  <div>
                    <Badge tone={TONE[ficha.estadoCuotas]}>{ficha.estadoCuotas}</Badge>
                  </div>
                </div>
                <div className={s.fichaItem}>
                  <span className={s.fichaLabel}>Estado de asociado</span>
                  <div>
                    <Badge tone={ficha.activo === 1 ? "ok" : "danger"}>
                      {ficha.activo === 1 ? "Activo" : "Dado de baja"}
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>

            <Card title="Alumnos a cargo">
              {ficha.listaAlumnos && ficha.listaAlumnos.length > 0 ? (
                <div className={s.alumnosList}>
                  {ficha.listaAlumnos.map((al) => (
                    <div key={al.id} className={s.alumnoCard}>
                      <span className={s.alumnoNombre}>{al.nombre}</span>
                      <span className={s.alumnoCurso}>Curso: {al.curso}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={s.emptyText}>No tiene alumnos vinculados.</p>
              )}
            </Card>

            <Card title="Historial de pagos">
              <DataTable
                columns={COLUMNS_PAGOS}
                rows={pagosFicha}
                rowKey={(p) => p.id}
                emptyMessage="No registra pagos asentados en el sistema."
              />
            </Card>

            <ConfirmDialog
              isOpen={confirmBajaOpen}
              title="Dar de baja asociado"
              message={
                <>
                  ¿Está seguro de que desea dar de baja al asociado{" "}
                  <strong>{ficha.apellidoNombre}</strong> (DNI {ficha.dni})?
                </>
              }
              confirmLabel="Dar de baja"
              cancelLabel="Cancelar"
              variant="danger"
              onConfirm={confirmarDarDeBaja}
              onCancel={() => setConfirmBajaOpen(false)}
            />
          </div>
        ) : (
          <p className={s.emptyText}>Asociado no encontrado.</p>
        )}
      </Layout>
    );
  }

  // -------------------------------------------------------------
  // PANTALLA 4: VISOR DE PREVISUALIZACIÓN DE IMPRESIÓN (ESTILO P.I.A.)
  // -------------------------------------------------------------
  if (vista === "visor" && docActivo) {
    return (
      <Layout
        title={docActivo.esListado ? "Asociados › Padrón oficial de asociados" : "Asociados › Ficha de asociado"}
        action={
          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            <Button
              variant="primary"
              onClick={handleDispararImpresion}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <PrinterIcon size={16} />
              Imprimir documento
            </Button>
            {docActivo.esListado && (
              <Button
                variant="secondary"
                onClick={() => abrirConfiguracionListado(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <SettingsIcon size={20} />
                Personalizar listado
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => setVista(docActivo.esListado ? "lista" : "ficha")}
            >
              ← Volver
            </Button>
          </div>
        }
      >
        <div className={s.previewScreen}>
          <div className={s.iframeWrapper}>
            <iframe
              ref={iframeRef}
              srcDoc={docActivo.htmlContent}
              title={docActivo.titulo}
              className={s.printFrame}
            />
          </div>
        </div>
      </Layout>
    );
  }

  // -------------------------------------------------------------
  // PANTALLA 3: FORMULARIO NUEVO / EDITAR
  // -------------------------------------------------------------
  return (
    <Layout
      title={editingId ? "Asociados › Editar asociado" : "Asociados › Nuevo asociado"}
      action={
        <Button
          variant="secondary"
          onClick={() => setVista(editingId && selectedId ? "ficha" : "lista")}
        >
          ← Volver
        </Button>
      }
    >
      <form onSubmit={guardarFormulario} className={s.formContainer}>
        {formError && <div className={s.errorMsg}>{formError}</div>}

        <Card title="Vínculo con la cooperadora">
          <SelectField
            label="Vinculación del asociado"
            value={formTipoVinculo}
            options={[
              { value: "PADRE_TUTOR", label: "Padre, madre o tutor de alumno" },
              { value: "PERSONAL_ESCOLAR", label: "Personal de la escuela" },
              { value: "DIRECTIVO_ESCOLAR", label: "Directivo/personal escolar" },
              { value: "FAMILIAR_RESPONSABLE", label: "Familiar o responsable autorizado" },
              { value: "COLABORADOR_EXTERNO", label: "Vecino, comercio o entidad colaboradora" },
              { value: "SIN_VINCULO", label: "Sin vínculo con el establecimiento" },
              { value: "OTRO", label: "Otro vínculo" },
            ]}
            onChange={(valor) => {
              setFormTipoVinculo(valor);
              setBusquedaDirectivo("");
              setDirectivosDropdownOpen(false);
            }}
            width="100%"
          />
          {formTipoVinculo === "DIRECTIVO_ESCOLAR" && (
            <div className={s.autocomplete}>
              <Field
                label="Buscar integrante de la nómina directiva"
                placeholder="Nombre, cargo, DNI o número de socio"
                value={busquedaDirectivo}
                onChange={(e) => {
                  setBusquedaDirectivo(e.target.value);
                  setDirectivosDropdownOpen(true);
                }}
                onFocus={() => setDirectivosDropdownOpen(true)}
                width="100%"
              />
              {directivosDropdownOpen && (
                <div className={s.autocompleteMenu} role="listbox">
                  {personalDirectivo.map((persona) => (
                    <button
                      key={persona.id}
                      type="button"
                      className={s.autocompleteOption}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => seleccionarPersonalDirectivo(persona)}
                    >
                      <strong>{persona.nombre}</strong>
                      <span>{persona.cargo} · DNI {persona.dni}</span>
                    </button>
                  ))}
                  {personalDirectivo.length === 0 && (
                    <span className={s.autocompleteEmpty}>No se encontraron integrantes.</span>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="Datos del titular">
          <div className={s.formFields}>
            <div className={s.formRow}>
              <Field
                label="Apellido y nombre"
                placeholder="Ej: Pérez, Juan Manuel"
                value={formNombre}
                onChange={(e) => setFormNombre(e.target.value)}
                width={360}
                required
              />
              <Field
                label="DNI"
                placeholder="Ej: 30123456"
                value={formDni}
                onChange={(e) => setFormDni(e.target.value)}
                width={200}
                required
              />
            </div>
            <div className={s.formRow}>
              <Field
                label="Teléfono de contacto"
                placeholder="Ej: 11-4567-8901"
                value={formTelefono}
                onChange={(e) => setFormTelefono(e.target.value)}
                width={260}
              />
              <Field
                label="Correo electrónico"
                type="email"
                placeholder="correo@ejemplo.com"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                width={300}
              />
            </div>
          </div>
        </Card>

        {editingId && (
          <Card title="Estado del asociado">
            <div className={s.formRow}>
              <SelectField
                label="Condición de cuotas"
                value={formExento ? "Exento" : "No exento"}
                options={["No exento", "Exento"]}
                onChange={(v) => setFormExento(v === "Exento")}
                width={220}
              />
              <SelectField
                label="Estado"
                value={formActivo ? "Activo" : "Dado de baja"}
                options={["Activo", "Dado de baja"]}
                onChange={(v) => setFormActivo(v === "Activo")}
                width={220}
              />
            </div>
          </Card>
        )}

        <Card title="Alumnos vinculados">
          <div className={s.alumnosForm}>
            {formAlumnos.map((al, idx) => (
              <div key={idx} className={s.alumnoFormRow}>
                <Field
                  label={`Nombre del alumno #${idx + 1}`}
                  placeholder="Ej: Sofía Pérez"
                  value={al.nombre}
                  onChange={(e) => actualizarAlumnoRow(idx, "nombre", e.target.value)}
                  width={340}
                />
                <Field
                  label="Curso / Grado"
                  placeholder="Ej: 3° A"
                  value={al.curso}
                  onChange={(e) => actualizarAlumnoRow(idx, "curso", e.target.value)}
                  width={160}
                />
                <button
                  type="button"
                  className={s.removeBtn}
                  onClick={() => eliminarAlumnoRow(idx)}
                >
                  Quitar
                </button>
              </div>
            ))}
            <button type="button" className={s.addBtn} onClick={agregarAlumnoRow}>
              + Agregar otro alumno
            </button>
          </div>
        </Card>

        <div className={s.actionRow}>
          <Button type="submit" disabled={formSaving}>
            {formSaving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear asociado"}
          </Button>
          {editingId && (
            <Button
              variant="danger"
              onClick={() => setConfirmEliminarOpen(true)}
              disabled={formSaving}
            >
              Eliminar asociado
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => setVista(editingId && selectedId ? "ficha" : "lista")}
            disabled={formSaving}
          >
            Cancelar
          </Button>
        </div>
        <ConfirmDialog
          isOpen={confirmEliminarOpen}
          title="Eliminar asociado"
          message={<>¿Está seguro de que desea eliminar definitivamente a <strong>{ficha?.apellidoNombre}</strong>? Esta acción no se puede deshacer.</>}
          confirmLabel="Eliminar"
          cancelLabel="Cancelar"
          variant="danger"
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirmEliminarOpen(false)}
        />
      </form>
    </Layout>
  );
}