// src/pages/Asociados.tsx
import { useEffect, useState, FormEvent } from "react";
import {
  api,
  AsociadoFila,
  AsociadoDetalle,
  EstadoCuotas,
  ResumenPadron,
  PagoFila,
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
import { EyeIcon } from "../components/icons";
import { useApp } from "../context";
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
  const puedeAdministrar = usuario.rol === "Secretaria" || usuario.rol === "Presidente" || usuario.rol === "Superadmin";
  const [vista, setVista] = useState<"lista" | "ficha" | "formulario">("lista");

  // Filtros de listado
  const [busqueda, setBusqueda] = useState("");
  const [estadoCuotas, setEstadoCuotas] = useState("Todos");
  const [estado, setEstado] = useState("Todos"); // "Todos" por defecto
  const [rows, setRows] = useState<AsociadoFila[]>([]);
  const [resumen, setResumen] = useState<ResumenPadron | null>(null);

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
  const [formAlumnos, setFormAlumnos] = useState<FormAlumno[]>([{ nombre: "", curso: "" }]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  const cargarAsociados = () => {
    api.listarAsociados({ busqueda, estadoCuotas, estado }).then(setRows).catch(console.error);
    api.resumenPadron().then(setResumen).catch(console.error);
  };

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

  const abrirNuevoForm = () => {
    setEditingId(null);
    setFormNombre("");
    setFormDni("");
    setFormTelefono("");
    setFormEmail("");
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
      alumnos: alumnosValidos.map((a) => ({
        nombre: a.nombre.trim(),
        curso: a.curso.trim() || "1°",
      })),
    };

    try {
      if (editingId) {
        await api.actualizarAsociado(editingId, datos);
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

  const COLUMNS: Column<AsociadoFila>[] = [
    { header: "Apellido y nombre", minWidth: 220, flex: true, render: (a) => <strong>{a.apellidoNombre}</strong> },
    { header: "DNI", minWidth: 110, flex: true, render: (a) => a.dni },
    { header: "Teléfono", minWidth: 130, flex: true, render: (a) => a.telefono || "—" },
    { header: "Alumnos", minWidth: 180, flex: true, render: (a) => a.alumnos || "—" },
    {
      header: "Estado",
      minWidth: 105,
      flex: true,
      render: (a) => (
        <Badge tone={a.activo === 1 ? "ok" : "danger"}>
          {a.activo === 1 ? "Activo" : "De baja"}
        </Badge>
      ),
    },
    {
      header: "Cuotas",
      minWidth: 115,
      flex: true,
      render: (a) => <Badge tone={TONE[a.estadoCuotas]}>{a.estadoCuotas}</Badge>,
    },
    {
      header: "Acciones",
      width: 85,
      align: "center",
      render: (a) => (
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
        action={puedeAdministrar ? <Button onClick={abrirNuevoForm}>+ Nuevo asociado</Button> : undefined}
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
          <Button variant="secondary" onClick={() => setVista("lista")}>
            ← Volver al listado
          </Button>
        }
      >
        {loadingFicha ? (
          <p className={s.emptyText}>Cargando datos del asociado...</p>
        ) : ficha ? (
          <div className={s.fichaContainer}>
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

            {puedeAdministrar && (
              <div className={s.actionRow}>
                <Button onClick={() => abrirEditarForm(ficha)}>
                  Editar datos
                </Button>
                <Button variant="secondary" onClick={toggleExento}>
                  {ficha.exento === 1 ? "Quitar condición de exento" : "Marcar como exento"}
                </Button>
                <Button variant="secondary" onClick={toggleBaja}>
                  {ficha.activo === 1 ? "Dar de baja asociado" : "Reactivar asociado"}
                </Button>
              </div>
            )}

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
          <Button
            variant="secondary"
            onClick={() => setVista(editingId && selectedId ? "ficha" : "lista")}
            disabled={formSaving}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </Layout>
  );
}