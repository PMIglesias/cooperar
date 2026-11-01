// src/pages/ComisionDirectiva.tsx
import { useEffect, useState, useRef, FormEvent } from "react";
import Layout from "../components/Layout";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import DataTable, { Column } from "../components/ui/DataTable";
import IconButton from "../components/ui/IconButton";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { EditIcon, TrashIcon, SettingsIcon } from "../components/icons";
import { Field, SelectField } from "../components/ui/Field";
import { useApp } from "../context";
import {
  api,
  MiembroComisionFila,
  PersonalEstablecimientoFila,
  DatosInstitucionales,
  AsociadoFila,
} from "../api";
import s from "./ComisionDirectiva.module.css";

export default function ComisionDirectiva() {
  const { usuario, setLogoCooperadora } = useApp();
  const [activeTab, setActiveTab] = useState<"autoridades" | "establecimiento" | "cooperadora">("autoridades");
  const [comision, setComision] = useState<MiembroComisionFila[]>([]);
  const [personal, setPersonal] = useState<PersonalEstablecimientoFila[]>([]);
  const [institucion, setInstitucion] = useState<DatosInstitucionales | null>(null);
  const [asociados, setAsociados] = useState<AsociadoFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingInst, setSavingInst] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal para editar integrante de Comisión
  const [miembroEditando, setMiembroEditando] = useState<MiembroComisionFila | null>(null);

  // Modal para crear/editar personal del establecimiento
  const [personalEditando, setPersonalEditando] = useState<PersonalEstablecimientoFila | null>(null);
  const [personalAEliminar, setPersonalAEliminar] = useState<PersonalEstablecimientoFila | null>(null);

  // Modal para ajuste y posicionamiento del Logo
  const [logoModalOpen, setLogoModalOpen] = useState(false);
  const [tempLogoSrc, setTempLogoSrc] = useState<string>("");
  const [logoZoom, setLogoZoom] = useState(1);
  const [logoPos, setLogoPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  const puedeEditar = usuario.rol === "Secretaria" || usuario.rol === "Superadmin";
  const [columnasAutoridades, setColumnasAutoridades] = useState({
    dni: true,
    cuil: true,
    domicilio: true,
    telefono: true,
    vencimiento: true,
  });
  const [configurarAutoridadesOpen, setConfigurarAutoridadesOpen] = useState(false);
  const [busquedaVinculacion, setBusquedaVinculacion] = useState("");
  const [tipoVinculacionSeleccionado, setTipoVinculacionSeleccionado] = useState("ASOCIADO");
  const [vinculacionDropdownOpen, setVinculacionDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fechaPredeterminadaEjercicio = `${new Date().getFullYear()}-12-31`;
  const normalizarFecha = (valor: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
    const partes = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return partes ? `${partes[3]}-${partes[2]}-${partes[1]}` : fechaPredeterminadaEjercicio;
  };
  const prepararMiembroEdicion = (miembro: MiembroComisionFila) => ({
    ...miembro,
    vencimiento: normalizarFecha(miembro.vencimiento),
  });

  const cargarDatos = async () => {
    try {
      setLoading(true);
      setError(null);
      const [com, pers, inst, asocs] = await Promise.all([
        api.listarComisionDirectiva(),
        api.listarPersonalEstablecimiento(),
        api.obtenerDatosInstitucionales(),
        api.listarAsociados({ busqueda: "", estadoCuotas: "Todos", estado: "Activos" }),
      ]);
      setComision(com);
      setPersonal(pers);
      setInstitucion(inst);
      setAsociados(asocs);
    } catch (err: any) {
      setError(err?.message || "Error al cargar la información institucional");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  useEffect(() => {
    containerRef.current?.parentElement?.scrollTo({ top: 0 });
  }, [activeTab]);

  useEffect(() => {
    if (!miembroEditando) return;
    setTipoVinculacionSeleccionado(
      miembroEditando.asociadoId
        ? "ASOCIADO"
        : miembroEditando.personalEstablecimientoId
          ? "PERSONAL"
          : "ASOCIADO"
    );
    setBusquedaVinculacion("");
    setVinculacionDropdownOpen(false);
  }, [miembroEditando?.id]);

  const handleGuardarMiembroModal = async (e: FormEvent) => {
    e.preventDefault();
    if (!miembroEditando || !puedeEditar) return;
    try {
      await api.guardarMiembroComision(miembroEditando);
      setComision((prev) =>
        prev.map((m) => (m.id === miembroEditando.id ? miembroEditando : m))
      );
      setMensajeExito(`Autoridad "${miembroEditando.cargo}" actualizada con éxito.`);
      setMiembroEditando(null);
    } catch (err: any) {
      setError(err?.message || "Error al actualizar autoridad");
    }
  };

  const handleGuardarPersonalModal = async (e: FormEvent) => {
    e.preventDefault();
    if (!personalEditando || !puedeEditar) return;
    try {
      const guardado = await api.guardarPersonalEstablecimiento(personalEditando);
      setPersonal((prev) => {
        const idx = prev.findIndex((p) => p.id === guardado.id);
        if (idx >= 0) {
          const copia = [...prev];
          copia[idx] = guardado;
          return copia;
        }
        return [...prev, guardado];
      });
      // Recargar comisión por si hubo sincronización de vínculos
      const comActualizada = await api.listarComisionDirectiva();
      setComision(comActualizada);
      setMensajeExito(`Personal "${guardado.nombre}" guardado y vinculado correctamente.`);
      setPersonalEditando(null);
    } catch (err: any) {
      setError(err?.message || "Error al guardar personal");
    }
  };

  const descripcionVinculoNomina = (vinculo: string) => {
    if (vinculo.startsWith("AUTORIDAD:")) {
      const autoridad = comision.find((item) => item.id === Number(vinculo.slice("AUTORIDAD:".length)));
      return autoridad ? autoridad.cargo : "Autoridad vinculada";
    }
    if (vinculo === "ASESOR") return "Asesor";
    if (vinculo === "REV_CTAS_DOC_TIT") return "REV. CTAS";
    if (vinculo === "REV_CTAS_DOC_SUP") return "REV. CTAS (S)";
    return "Sin vinculación";
  };

  const handleConfirmarEliminacionPersonal = async () => {
    if (!personalAEliminar || !puedeEditar) return;
    try {
      await api.eliminarPersonalEstablecimiento(personalAEliminar.id);
      setPersonal((prev) => prev.filter((item) => item.id !== personalAEliminar.id));
      setMensajeExito(`Personal "${personalAEliminar.nombre}" eliminado correctamente.`);
      setPersonalAEliminar(null);
    } catch (err: any) {
      setError(err?.message || "Error al eliminar personal");
    }
  };

  const handleSelectLogoFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      setTempLogoSrc(src);
      setLogoZoom(1);
      setLogoPos({ x: 0, y: 0 });
      setLogoModalOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmCrop = () => {
    if (!imgRef.current || !institucion) return;

    const img = imgRef.current;
    const canvas = document.createElement("canvas");
    const size = 300; // tamaño final del logo circular en alta definición
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Crear máscara circular
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    // Fondo blanco suave
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    // Contenedor visual mide 260px x 260px
    const viewSize = 260;
    const scaleFactor = size / viewSize;

    const naturalW = img.naturalWidth || 260;
    const naturalH = img.naturalHeight || 260;
    const displayAspect = naturalW / naturalH;

    let baseW = viewSize;
    let baseH = viewSize;
    if (displayAspect >= 1) {
      baseW = viewSize * displayAspect;
    } else {
      baseH = viewSize / displayAspect;
    }

    const renderedW = baseW * logoZoom * scaleFactor;
    const renderedH = baseH * logoZoom * scaleFactor;

    // Centro del canvas más offset del usuario
    const drawX = (size - renderedW) / 2 + logoPos.x * scaleFactor;
    const drawY = (size - renderedH) / 2 + logoPos.y * scaleFactor;

    ctx.drawImage(img, drawX, drawY, renderedW, renderedH);

    const croppedBase64 = canvas.toDataURL("image/png");
    setInstitucion({ ...institucion, logoBase64: croppedBase64 });
    setLogoCooperadora(croppedBase64);
    setLogoModalOpen(false);

    // Guardado persistente inmediato del logo en la base de datos
    api.guardarConfiguracion("logo_cooperadora", croppedBase64)
      .then(() => {
        setMensajeExito("Logo institucional actualizado y guardado correctamente.");
      })
      .catch((err) => {
        setError(`Error al guardar logo: ${String(err)}`);
      });
  };

  const handleSeleccionarAsociado = async (asociadoIdStr: string) => {
    if (!miembroEditando) return;
    if (!asociadoIdStr) {
      setMiembroEditando({
        ...miembroEditando,
        asociadoId: null,
      });
      return;
    }
    const asocId = parseInt(asociadoIdStr, 10);
    const encontrado = asociados.find((a) => a.id === asocId);
    if (!encontrado) return;

    let tel = encontrado.telefono || "";
    let email = "";
    try {
      const detalle = await api.obtenerAsociado(asocId);
      tel = detalle.telefono || tel;
      email = detalle.email || "";
    } catch {
      // Ignorar fallback
    }

    // Calcular CUIL/CUIT estimativo con módulo 11 estándar de ANSES (por defecto prefijo 20, con ajuste a 23 si es necesario)
    const calcularCuilEstimado = (dniStr: string) => {
      const clean = dniStr.replace(/\D/g, "");
      if (clean.length < 7 || clean.length > 8) return "";
      const padded = clean.padStart(8, "0");
      const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
      
      const obtenerDigito = (prefijo: string) => {
        const full = prefijo + padded;
        let suma = 0;
        for (let i = 0; i < 10; i++) {
          suma += parseInt(full[i], 10) * factores[i];
        }
        const resto = suma % 11;
        if (resto === 0) return 0;
        if (resto === 1) return null; // Debe cambiar prefijo a 23
        return 11 - resto;
      };

      let prefijo = "20";
      let dv = obtenerDigito(prefijo);
      if (dv === null) {
        prefijo = "23";
        dv = obtenerDigito(prefijo);
      }
      return `${prefijo}-${padded}-${dv}`;
    };

    setMiembroEditando({
      ...miembroEditando,
      asociadoId: asocId,
      nombre: encontrado.apellidoNombre,
      dni: encontrado.dni,
      cuil: miembroEditando.cuil || calcularCuilEstimado(encontrado.dni),
      telefono: tel || miembroEditando.telefono,
      email: email || miembroEditando.email,
    });
  };

  const handleGuardarInstitucion = async (e: FormEvent) => {
    e.preventDefault();
    if (!institucion || !puedeEditar) return;
    try {
      setSavingInst(true);
      setError(null);
      await api.guardarDatosInstitucionales(institucion);
      if (institucion.logoBase64 !== undefined) {
        setLogoCooperadora(institucion.logoBase64);
      }
      setMensajeExito("Datos guardados correctamente.");
    } catch (err: any) {
      setError(err?.message || "Error al guardar datos institucionales");
    } finally {
      setSavingInst(false);
    }
  };

  const tipoVinculacionAutoridad = tipoVinculacionSeleccionado;

  const opcionesTiposVinculacion = [
    { value: "ASOCIADO", label: "Asociado cooperadora" },
    { value: "PERSONAL", label: "Directivo/personal escolar" },
    { value: "MANUAL", label: "Manual" },
  ];

  const normalizarBusqueda = (valor: string) =>
    valor
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .trim();
  const textoBusqueda = normalizarBusqueda(busquedaVinculacion);
  const asociadosVinculacion = asociados
    .filter((a) => {
      if (!textoBusqueda) return true;
      return normalizarBusqueda(`${a.apellidoNombre} ${a.dni} ${a.id}`).includes(textoBusqueda);
    })
    .slice(0, 8);

  const personalVinculacion = personal
    .filter((p) => {
      if (!textoBusqueda) return true;
      return normalizarBusqueda(`${p.nombre} ${p.cargo} ${p.dni} ${p.id}`).includes(textoBusqueda);
    })
    .slice(0, 8);

  const seleccionarOrigenAutoridad = async (valor: string) => {
    if (!miembroEditando) return;
    if (valor.startsWith("ASOCIADO:")) {
      await handleSeleccionarAsociado(valor.slice("ASOCIADO:".length));
      setMiembroEditando((actual) => actual ? {
        ...actual,
        personalEstablecimientoId: null,
      } : actual);
      return;
    }
    if (valor.startsWith("PERSONAL:")) {
      const personalId = Number(valor.slice("PERSONAL:".length));
      const persona = personal.find((item) => item.id === personalId);
      if (!persona) return;
      setMiembroEditando({
        ...miembroEditando,
        asociadoId: null,
        personalEstablecimientoId: personalId,
        nombre: persona.nombre,
        dni: persona.dni,
        telefono: persona.telefono,
        email: persona.email,
      });
      return;
    }
    setMiembroEditando({ ...miembroEditando, asociadoId: null, personalEstablecimientoId: null });
  };

  const seleccionarResultadoVinculo = async (valor: string, etiqueta: string) => {
    await seleccionarOrigenAutoridad(valor);
    setBusquedaVinculacion(etiqueta);
    setVinculacionDropdownOpen(false);
  };

  const cambiarBusquedaVinculacion = (valor: string) => {
    setBusquedaVinculacion(valor);
    setVinculacionDropdownOpen(true);
  };

  const cambiarTipoVinculacion = (tipo: string) => {
    if (!miembroEditando) return;
    setTipoVinculacionSeleccionado(tipo);
    setBusquedaVinculacion("");
    setVinculacionDropdownOpen(false);
    setMiembroEditando({
      ...miembroEditando,
      asociadoId: null,
      personalEstablecimientoId: null,
    });
  };

  const formatearPeriodo = (valor: string) => {
    const anios = [...new Set(valor.match(/\d{4}/g) || [])];
    return anios.length > 0 ? anios.map((anio) => anio.slice(-2)).join(" | ") : valor;
  };

  // Definición de columnas con DataTable nativo de la app
  const columns: Column<MiembroComisionFila>[] = [
    {
      header: "Cargo",
      minWidth: 180,
      flex: true,
      render: (m) => (
        <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>
          {m.cargo}
        </span>
      ),
    },
    {
      header: "Apellido y Nombre",
      minWidth: 205,
      flex: true,
      render: (m) => (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px" }}>
          <strong>{m.nombre}</strong>
        </div>
      ),
    },
    {
      header: "Asociado",
      minWidth: 86,
      flex: true,
      align: "center",
      render: (m) => (
        <Badge tone={m.asociadoId ? "ok" : "info"}>
          {m.asociadoId ? "Sí" : "No"}
        </Badge>
      ),
    },
    {
      header: "DNI",
      minWidth: 90,
      flex: true,
      render: (m) => m.dni,
    },
    {
      header: "CUIL",
      minWidth: 130,
      flex: true,
      render: (m) => m.cuil,
    },
    {
      header: "Domicilio / Localidad",
      minWidth: 220,
      flex: true,
      render: (m) => (m.domicilio ? `${m.domicilio}, ${m.localidad}` : m.localidad),
    },
    {
      header: "Teléfono",
      minWidth: 125,
      flex: true,
      render: (m) => m.telefono || "—",
    },
    {
      header: "Período",
      minWidth: 82,
      flex: true,
      render: (m) => <Badge tone="warn">{formatearPeriodo(m.vencimiento)}</Badge>,
    },
    ...(puedeEditar
      ? [
          {
            header: "Acciones",
            width: 72,
            align: "center" as const,
            render: (m: MiembroComisionFila) => (
              <IconButton
                icon={<EditIcon size={16} />}
                variant="primary"
                title={`Editar autoridad: ${m.cargo}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setMiembroEditando(prepararMiembroEdicion(m));
                }}
              />
            ),
          },
        ]
      : []),
  ];
  const columnasAutoridadesVisibles = columns.filter((column) => {
    if (column.header === "DNI") return columnasAutoridades.dni;
    if (column.header === "CUIL") return columnasAutoridades.cuil;
    if (column.header === "Domicilio / Localidad") return columnasAutoridades.domicilio;
    if (column.header === "Teléfono") return columnasAutoridades.telefono;
    if (column.header === "Período") return columnasAutoridades.vencimiento;
    return true;
  });

  // Columnas para la tabla de Personal del Establecimiento
  const columnsPersonal: Column<PersonalEstablecimientoFila>[] = [
    {
      header: "Cargo Escolar",
      minWidth: 115,
      flex: true,
      render: (p) => <strong>{p.cargo}</strong>,
    },
    {
      header: "Nombre y Apellido",
      minWidth: 160,
      flex: true,
      render: (p) => <span>{p.nombre}</span>,
    },
    {
      header: "DNI",
      width: 88,
      render: (p) => <code>{p.dni}</code>,
    },
    {
      header: "Teléfono",
      width: 128,
      render: (p) => p.telefono || "—",
    },
    {
      header: "Email",
      minWidth: 150,
      flex: true,
      render: (p) => p.email || "—",
    },
    {
      header: "Cargo Nómina",
      minWidth: 180,
      flex: true,
      render: (p) => {
        const vinculada = p.vinculoNomina !== "NINGUNO";
        return (
          <span
            className={vinculada ? s.vinculoBadge : s.sinVinculoBadge}
            title={descripcionVinculoNomina(p.vinculoNomina)}
          >
            {descripcionVinculoNomina(p.vinculoNomina)}
          </span>
        );
      },
    },
    ...(puedeEditar
      ? [
          {
            header: "Acciones",
            width: 72,
            align: "center" as const,
            render: (p: PersonalEstablecimientoFila) => (
              <div style={{ display: "flex", gap: "6px", alignItems: "center", justifyContent: "center", width: "100%" }}>
                <IconButton
                  icon={<EditIcon size={16} />}
                  variant="primary"
                  title={`Editar datos de ${p.nombre}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPersonalEditando({ ...p });
                  }}
                />
                <IconButton
                  icon={<TrashIcon size={16} />}
                  variant="danger"
                  title={`Eliminar a ${p.nombre}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPersonalAEliminar(p);
                  }}
                />
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <Layout
      title="Comisión Directiva e Institución"
      flushContentTop
      hideContentOverflow={activeTab === "autoridades"}
    >
      <div ref={containerRef} className={`${s.container} ${activeTab === "autoridades" ? s.authoritiesContainer : ""}`}>
        {mensajeExito && <div className="alert alert-success">{mensajeExito}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        {/* Pestañas de Navegación: Separación de Autoridades, Establecimiento y Cooperadora */}
        <div className={s.tabNav}>
          <div className={s.tabsGroup}>
          <button
            type="button"
            className={`${s.tabBtn} ${activeTab === "autoridades" ? s.tabBtnActive : ""}`}
            onClick={() => {
              setActiveTab("autoridades");
              setMensajeExito(null);
            }}
          >
            👥 Nómina de Autoridades
          </button>
          <button
            type="button"
            className={`${s.tabBtn} ${activeTab === "establecimiento" ? s.tabBtnActive : ""}`}
            onClick={() => {
              setActiveTab("establecimiento");
              setMensajeExito(null);
            }}
          >
            🏫 Establecimiento Educativo
          </button>
          <button
            type="button"
            className={`${s.tabBtn} ${activeTab === "cooperadora" ? s.tabBtnActive : ""}`}
            onClick={() => {
              setActiveTab("cooperadora");
              setMensajeExito(null);
            }}
          >
            🏛️ Asociación Cooperadora
          </button>
          </div>
          {activeTab === "autoridades" && (
            <IconButton
              icon={<SettingsIcon size={20} />}
              title="Configurar columnas de autoridades"
              onClick={() => setConfigurarAutoridadesOpen(true)}
            />
          )}
        </div>

        {/* TAB 1: AUTORIDADES DE LA COMISIÓN DIRECTIVA */}
        {activeTab === "autoridades" && (
          <>
            <div className={s.tablePanel}>
              <DataTable
                columns={columnasAutoridadesVisibles}
                rows={comision}
                stickyHeader
                rowKey={(m) => m.id}
                emptyMessage={loading ? "Cargando autoridades..." : "No se encontraron integrantes registrados."}
                onRowClick={puedeEditar ? (m) => setMiembroEditando(prepararMiembroEdicion(m)) : undefined}
              />
            </div>
            <Modal
              isOpen={configurarAutoridadesOpen}
              onClose={() => setConfigurarAutoridadesOpen(false)}
              title="Configurar vista de autoridades"
              size="medium"
              footer={<Button variant="primary" onClick={() => setConfigurarAutoridadesOpen(false)}>Aplicar configuración</Button>}
            >
              <div style={{ display: "grid", gap: "var(--space-3)" }}>
                {([
                  ["dni", "DNI"],
                  ["cuil", "CUIL"],
                  ["domicilio", "Domicilio y localidad"],
                  ["telefono", "Teléfono"],
                  ["vencimiento", "Período"],
                ] as const).map(([key, label]) => (
                  <label key={key} style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={columnasAutoridades[key]}
                      onChange={(e) => setColumnasAutoridades({ ...columnasAutoridades, [key]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </Modal>
          </>
        )}

        {/* TAB 2: ESTABLECIMIENTO EDUCATIVO Y EQUIPO DIRECTIVO / DOCENTE */}
        {activeTab === "establecimiento" && institucion && (
          <div className={s.establishmentPanel} style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <form onSubmit={handleGuardarInstitucion}>
              <Card title="Datos del Establecimiento Escolar">
                <div className={s.configGrid}>
                  <Field
                    label="Distrito Escolar"
                    disabled={!puedeEditar}
                    value={institucion.distrito}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, distrito: e.target.value })
                    }
                    required
                  />
                  <Field
                    label="Escuela y Número"
                    disabled={!puedeEditar}
                    value={institucion.numeroEscuela}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, numeroEscuela: e.target.value })
                    }
                    required
                  />
                  <Field
                    label="Nombre de la Escuela"
                    disabled={!puedeEditar}
                    value={institucion.nombreEscuela}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, nombreEscuela: e.target.value })
                    }
                    required
                  />
                  <Field
                    label="Número C.U.E."
                    disabled={!puedeEditar}
                    value={institucion.cue}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, cue: e.target.value })
                    }
                    required
                  />
                  <Field
                    label="Domicilio del Establecimiento"
                    disabled={!puedeEditar}
                    value={institucion.domicilioEscuela}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, domicilioEscuela: e.target.value })
                    }
                    required
                  />
                  <Field
                    label="Barrio / Paraje"
                    disabled={!puedeEditar}
                    value={institucion.barrio}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, barrio: e.target.value })
                    }
                  />
                  <Field
                    label="Localidad"
                    disabled={!puedeEditar}
                    value={institucion.localidad}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, localidad: e.target.value })
                    }
                    required
                  />
                  <Field
                    label="Teléfono Institucional"
                    disabled={!puedeEditar}
                    value={institucion.telefonoEscuela}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, telefonoEscuela: e.target.value })
                    }
                  />
                </div>

                {puedeEditar && (
                  <div className={s.formActions}>
                    <Button type="submit" disabled={savingInst}>
                      {savingInst ? "Guardando..." : "Guardar Datos del Establecimiento"}
                    </Button>
                  </div>
                )}
              </Card>
            </form>

            <Card title="Equipo Directivo, Secretarios y Docentes" className={s.teamCard}>
              <div className={s.sectionTopBar}>
                <p className={s.summary}>
                  Personal del establecimiento registrado. Los cargos vinculados se sincronizan automáticamente con la Nómina Oficial de la Asamblea y Comisión Directiva.
                </p>
                {puedeEditar && (
                  <Button
                    type="button"
                    onClick={() =>
                      setPersonalEditando({
                        id: 0,
                        cargo: "Docente de Grado",
                        nombre: "",
                        dni: "",
                        telefono: "",
                        email: "",
                        vinculoNomina: "NINGUNO",
                      })
                    }
                  >
                    + Nuevo integrante
                  </Button>
                )}
              </div>

              <DataTable
                columns={columnsPersonal}
                rows={personal}
                stickyHeader
                rowKey={(p) => p.id}
                emptyMessage={loading ? "Cargando personal..." : "No hay personal registrado en el establecimiento."}
              />
            </Card>
          </div>
        )}

        {/* TAB 3: ASOCIACIÓN COOPERADORA Y CUENTAS BANCARIAS */}
        {activeTab === "cooperadora" && institucion && (
          <form className={s.cooperadoraPanel} onSubmit={handleGuardarInstitucion}>
            <Card title="Identidad y Logo de la Asociación Cooperadora">
              <div className={s.logoSection}>
                <div className={s.logoPreviewWrapper}>
                  {institucion.logoBase64 ? (
                    <img
                      src={institucion.logoBase64}
                      alt="Logo Cooperadora"
                      className={s.logoCircleImg}
                    />
                  ) : (
                    <div className={s.logoCirclePlaceholder}>
                      <span className={s.logoPlaceholderText}>Sin Logo</span>
                    </div>
                  )}
                </div>

                <div className={s.logoInfo}>
                  <h4 className={s.logoTitle}>Isotipo / Escudo Institucional</h4>
                  <p className={s.logoDescription}>
                    Selecciona una imagen en formato PNG o JPG. Se adaptará automáticamente al círculo distintivo para la aplicación y documentación oficial.
                  </p>
                  {puedeEditar && (
                    <div className={s.logoButtons}>
                      <label className={s.uploadBtn}>
                        📷 {institucion.logoBase64 ? "Cambiar imagen" : "Seleccionar imagen"}
                        <input
                          type="file"
                          accept="image/png, image/jpeg, image/webp"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleSelectLogoFile(file);
                              e.target.value = "";
                            }
                          }}
                        />
                      </label>
                      {institucion.logoBase64 && (
                        <button
                          type="button"
                          className={s.removeLogoBtn}
                          onClick={() => {
                            setInstitucion({ ...institucion, logoBase64: "" });
                            setLogoCooperadora("");
                            api.guardarConfiguracion("logo_cooperadora", "")
                              .then(() => setMensajeExito("Logo institucional removido."))
                              .catch(console.error);
                          }}
                        >
                          Quitar logo
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <div style={{ marginTop: "var(--space-6)" }}>
              <Card title="Datos Legales de la Asociación Cooperadora">
                <div className={s.configGrid}>
                  <Field
                    label="Nombre de la Asociación Cooperadora"
                    disabled={!puedeEditar}
                    value={institucion.asociacionNombre}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, asociacionNombre: e.target.value })
                    }
                    required
                  />
                  <Field
                    label="C.U.I.T. Cooperadora"
                    disabled={!puedeEditar}
                    value={institucion.cuit}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, cuit: e.target.value })
                    }
                    required
                  />
                  <Field
                    label="Correo Electrónico de la Cooperadora"
                    type="email"
                    disabled={!puedeEditar}
                    value={institucion.emailInstitucional}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, emailInstitucional: e.target.value })
                    }
                  />
                </div>
              </Card>
            </div>

            <div style={{ marginTop: "var(--space-6)" }}>
              <Card title="Datos de Cuenta Bancaria Oficial (P.I.A.)">
                <div className={s.configGrid}>
                  <Field
                    label="Entidad Bancaria"
                    disabled={!puedeEditar}
                    value={institucion.bancoNombre}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, bancoNombre: e.target.value })
                    }
                  />
                  <Field
                    label="Sucursal Bancaria"
                    disabled={!puedeEditar}
                    value={institucion.bancoSucursal}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, bancoSucursal: e.target.value })
                    }
                  />
                  <Field
                    label="Número de Cuenta Corriente"
                    disabled={!puedeEditar}
                    value={institucion.cuentaCorriente}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, cuentaCorriente: e.target.value })
                    }
                  />
                  <Field
                    label="C.B.U. (22 dígitos)"
                    disabled={!puedeEditar}
                    value={institucion.cbu}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, cbu: e.target.value })
                    }
                  />
                  <Field
                    label="Alias de la Cuenta"
                    disabled={!puedeEditar}
                    value={institucion.alias}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, alias: e.target.value })
                    }
                  />
                </div>
              </Card>
            </div>

            <div style={{ marginTop: "var(--space-6)" }}>
              <Card title="Valores Oficiales de Cuota Social">
                <div className={s.configGrid}>
                  <Field
                    label="Valor Cuota Social Mensual ($)"
                    type="number"
                    min="0"
                    step="100"
                    disabled={!puedeEditar}
                    value={institucion.cuotaMensual}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, cuotaMensual: e.target.value })
                    }
                    required
                  />
                  <Field
                    label="Valor Cuota Social Anual ($)"
                    type="number"
                    min="0"
                    step="100"
                    disabled={!puedeEditar}
                    value={institucion.cuotaAnual}
                    onChange={(e) =>
                      setInstitucion({ ...institucion, cuotaAnual: e.target.value })
                    }
                    required
                  />
                </div>
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--color-text-muted)", display: "block", marginTop: "var(--space-2)" }}>
                  💡 Este valor es el arancel societario oficial fijado en Asamblea. Se utilizará como sugerido por defecto en los registros de pago y en la Planilla de Información Anual (P.I.A.).
                </span>
              </Card>
            </div>

            {puedeEditar && (
              <div className={s.formActions}>
                <Button type="submit" disabled={savingInst}>
                  {savingInst ? "Guardando..." : "Guardar Datos de la Cooperadora"}
                </Button>
              </div>
            )}
          </form>
        )}
      </div>

      {/* MODAL DE EDICIÓN CON LOS COMPONENTES ESTÉTICOS DE LA APP */}
      {miembroEditando && (
        <div className={s.modalOverlay}>
          <div className={s.modalCard}>
            <div className={s.modalHeader}>
              <h3 className={s.modalTitle}>
                Editar Autoridad: {miembroEditando.cargo}
              </h3>
              <button
                type="button"
                className={s.modalClose}
                onClick={() => setMiembroEditando(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarMiembroModal}>
              <div className={s.modalBody}>
                <SelectField
                  label="Vinculación de la autoridad"
                  value={tipoVinculacionAutoridad}
                  options={opcionesTiposVinculacion}
                  onChange={cambiarTipoVinculacion}
                  width="100%"
                />
                {tipoVinculacionAutoridad !== "MANUAL" && (
                  <>
                    <div className={s.autocomplete}>
                      <Field
                        label={
                          tipoVinculacionAutoridad === "ASOCIADO"
                            ? "Buscar asociado cooperadora"
                            : "Buscar integrante de la nómina directiva"
                        }
                        placeholder="Nombre, cargo, DNI o número de socio"
                        value={busquedaVinculacion}
                        onChange={(e) => {
                          void cambiarBusquedaVinculacion(e.target.value);
                          setVinculacionDropdownOpen(true);
                        }}
                        onFocus={() => {
                          setVinculacionDropdownOpen(true);
                          setBusquedaVinculacion((valor) => valor.trim());
                        }}
                        width="100%"
                      />
                      {vinculacionDropdownOpen && (
                        <div className={s.autocompleteMenu} role="listbox">
                          {tipoVinculacionAutoridad === "ASOCIADO"
                            ? asociadosVinculacion.map((item) => {
                              const etiqueta = `Socio N° ${item.id} · ${item.apellidoNombre} (DNI ${item.dni})`;
                              return (
                                <button
                                  key={`ASOCIADO:${item.id}`}
                                  type="button"
                                  className={s.autocompleteOption}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => void seleccionarResultadoVinculo(`ASOCIADO:${item.id}`, etiqueta)}
                                >
                                  <strong>{item.apellidoNombre}</strong>
                                  <span>Socio N° {item.id} · DNI {item.dni}</span>
                                </button>
                              );
                            })
                            : personalVinculacion.map((item) => (
                              <button
                                key={`PERSONAL:${item.id}`}
                                type="button"
                                className={s.autocompleteOption}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => void seleccionarResultadoVinculo(`PERSONAL:${item.id}`, `${item.nombre} — ${item.cargo}`)}
                              >
                                <strong>{item.nombre}</strong>
                                <span>{item.cargo} · DNI {item.dni}</span>
                              </button>
                            ))}
                          {(tipoVinculacionAutoridad === "ASOCIADO" ? asociadosVinculacion : personalVinculacion).length === 0 && (
                            <span className={s.autocompleteEmpty}>No se encontraron integrantes.</span>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}

                <Field
                  label="Apellido y Nombre:"
                  required
                  value={miembroEditando.nombre}
                  onChange={(e) =>
                    setMiembroEditando({ ...miembroEditando, nombre: e.target.value })
                  }
                  width="100%"
                />

                <div className={s.modalRow}>
                  <Field
                    label="DNI:"
                    required
                    value={miembroEditando.dni}
                    onChange={(e) =>
                      setMiembroEditando({ ...miembroEditando, dni: e.target.value })
                    }
                  />
                  <Field
                    label="CUIL:"
                    required
                    value={miembroEditando.cuil}
                    onChange={(e) =>
                      setMiembroEditando({ ...miembroEditando, cuil: e.target.value })
                    }
                  />
                </div>

                <div className={s.modalRow}>
                  <Field
                    label="Domicilio:"
                    required
                    value={miembroEditando.domicilio}
                    onChange={(e) =>
                      setMiembroEditando({ ...miembroEditando, domicilio: e.target.value })
                    }
                  />
                  <Field
                    label="Localidad:"
                    required
                    value={miembroEditando.localidad}
                    onChange={(e) =>
                      setMiembroEditando({ ...miembroEditando, localidad: e.target.value })
                    }
                  />
                </div>

                <div className={s.modalRow}>
                  <Field
                    label="Teléfono:"
                    value={miembroEditando.telefono}
                    onChange={(e) =>
                      setMiembroEditando({ ...miembroEditando, telefono: e.target.value })
                    }
                  />
                  <Field
                    label="Vencimiento Mandato:"
                    type="date"
                    value={miembroEditando.vencimiento}
                    onChange={(e) =>
                      setMiembroEditando({ ...miembroEditando, vencimiento: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className={s.modalFooter}>
                <Button
                  variant="secondary"
                  onClick={() => setMiembroEditando(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  Guardar Cambios
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE PERSONAL DEL ESTABLECIMIENTO */}
      {personalEditando && (
        <div className={s.modalOverlay}>
          <div className={s.modalCard}>
            <div className={s.modalHeader}>
              <h3 className={s.modalTitle}>
                {personalEditando.id === 0 ? "Nuevo Integrante del Establecimiento" : `Editar Personal: ${personalEditando.nombre}`}
              </h3>
              <button
                type="button"
                className={s.modalClose}
                onClick={() => setPersonalEditando(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarPersonalModal}>
              <div className={s.modalBody}>
                <div className={s.modalRow}>
                  <Field
                    label="Cargo en el Establecimiento:"
                    placeholder="Ej. Director/a, Vicedirector/a, Secretario/a, Docente 4° A"
                    required
                    value={personalEditando.cargo}
                    onChange={(e) =>
                      setPersonalEditando({ ...personalEditando, cargo: e.target.value })
                    }
                  />
                  <Field
                    label="DNI:"
                    required
                    value={personalEditando.dni}
                    onChange={(e) =>
                      setPersonalEditando({ ...personalEditando, dni: e.target.value })
                    }
                  />
                </div>

                <Field
                  label="Apellido y Nombre:"
                  placeholder="Ej. Prof. María Rodríguez"
                  required
                  value={personalEditando.nombre}
                  onChange={(e) =>
                    setPersonalEditando({ ...personalEditando, nombre: e.target.value })
                  }
                  width="100%"
                />

                <div className={s.modalRow}>
                  <Field
                    label="Teléfono:"
                    value={personalEditando.telefono}
                    onChange={(e) =>
                      setPersonalEditando({ ...personalEditando, telefono: e.target.value })
                    }
                  />
                  <Field
                    label="Correo Electrónico:"
                    type="email"
                    value={personalEditando.email}
                    onChange={(e) =>
                      setPersonalEditando({ ...personalEditando, email: e.target.value })
                    }
                  />
                </div>

                <div className={s.nominaStatus}>
                  <span className={s.nominaStatusLabel}>Estado en Nómina Oficial</span>
                  <span className={personalEditando.vinculoNomina === "NINGUNO" ? s.sinVinculoBadge : s.vinculoBadge}>
                    {descripcionVinculoNomina(personalEditando.vinculoNomina)}
                  </span>
                  <span className={s.nominaStatusHelp}>
                    La vinculación se consulta desde aquí y sólo puede modificarse en la Nómina de Autoridades.
                  </span>
                </div>
              </div>

              <div className={s.modalFooter}>
                <Button
                  variant="secondary"
                  onClick={() => setPersonalEditando(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {personalEditando.id === 0 ? "Agregar Integrante" : "Guardar Cambios"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={personalAEliminar !== null}
        title="Eliminar integrante del establecimiento"
        message={
          personalAEliminar
            ? `¿Desea eliminar a "${personalAEliminar.nombre}" del registro del establecimiento?`
            : ""
        }
        confirmLabel="Eliminar integrante"
        onConfirm={() => void handleConfirmarEliminacionPersonal()}
        onCancel={() => setPersonalAEliminar(null)}
      />

      {/* MODAL PARA ENCUADRAR Y POSICIONAR EL LOGO */}
      {logoModalOpen && (
        <Modal
          isOpen={logoModalOpen}
          onClose={() => setLogoModalOpen(false)}
          title="Ajustar y Posicionar Logo"
          size="medium"
          footer={
            <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end", width: "100%" }}>
              <Button variant="secondary" onClick={() => setLogoModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleConfirmCrop}>
                Confirmar y Aplicar Logo
              </Button>
            </div>
          }
        >
          <div className={s.cropperContainer}>
            <p className={s.cropperInstructions}>
              Arrastra la imagen con el cursor para moverla y usa la barra de aumento para ajustarla dentro del círculo distintivo.
            </p>

            <div
              className={s.cropperViewport}
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDragging(true);
                setDragStart({ x: e.clientX - logoPos.x, y: e.clientY - logoPos.y });
              }}
              onMouseMove={(e) => {
                if (!isDragging) return;
                setLogoPos({
                  x: e.clientX - dragStart.x,
                  y: e.clientY - dragStart.y,
                });
              }}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => setIsDragging(false)}
            >
              {/* Imagen desplazable y escalable */}
              <div
                className={s.cropperCanvasLayer}
                style={{
                  transform: `translate(${logoPos.x}px, ${logoPos.y}px) scale(${logoZoom})`,
                }}
              >
                <img
                  ref={imgRef}
                  src={tempLogoSrc}
                  alt="Ajuste de logo"
                  className={s.cropperImage}
                  draggable={false}
                />
              </div>

              {/* Guía visual con máscara circular */}
              <div className={s.cropperCircleMask} />
            </div>

            <div className={s.cropperControls}>
              <div className={s.zoomControl}>
                <span className={s.zoomLabel}>Zoom / Escala:</span>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.05"
                  value={logoZoom}
                  onChange={(e) => setLogoZoom(parseFloat(e.target.value))}
                  className={s.zoomSlider}
                />
                <span className={s.zoomValue}>{Math.round(logoZoom * 100)}%</span>
              </div>

              <button
                type="button"
                className={s.resetCropBtn}
                onClick={() => {
                  setLogoZoom(1);
                  setLogoPos({ x: 0, y: 0 });
                }}
              >
                Centrar imagen
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
