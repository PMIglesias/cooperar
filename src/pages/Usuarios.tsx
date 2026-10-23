// src/pages/Usuarios.tsx
import { useEffect, useState, FormEvent } from "react";
import {
  api,
  UsuarioFila,
  CopiaSeguridadFila,
  Rol,
} from "../api";
import Layout from "../components/Layout";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import DataTable, { Column } from "../components/ui/DataTable";
import IconButton from "../components/ui/IconButton";
import { EditIcon, ToggleActiveIcon } from "../components/icons";
import { Field, SelectField } from "../components/ui/Field";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import s from "./Usuarios.module.css";

const ROLES: { value: Rol; label: string }[] = [
  { value: "Superadmin", label: "Superadministrador (Acceso total)" },
  { value: "Presidente", label: "Presidente de Cooperadora" },
  { value: "Secretaria", label: "Secretario/a (Padrones y Actas)" },
  { value: "Tesorero", label: "Tesorero/a (Caja y Cobranzas)" },
];

export default function Usuarios() {
  const [vista, setVista] = useState<"lista" | "formulario">("lista");
  const [activeTab, setActiveTab] = useState<"usuarios" | "respaldo">("usuarios");

  // --- TAB USUARIOS ---
  const [usuarios, setUsuarios] = useState<UsuarioFila[]>([]);
  const [busquedaUsuario, setBusquedaUsuario] = useState("");
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userNombre, setUserNombre] = useState("");
  const [userDni, setUserDni] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userRol, setUserRol] = useState<Rol>("Secretaria");
  const [userClave, setUserClave] = useState("");
  const [userSaving, setUserSaving] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);

  // --- TAB RESPALDO ---
  const [copias, setCopias] = useState<CopiaSeguridadFila[]>([]);
  const [rutaDatos, setRutaDatos] = useState("");
  const [creandoBackup, setCreandoBackup] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  const cargarUsuarios = () => {
    api.listarUsuarios().then(setUsuarios).catch(console.error);
  };

  const cargarCopias = () => {
    api.listarCopiasSeguridad().then(setCopias).catch(console.error);
    api.obtenerRutaDatos().then(setRutaDatos).catch(console.error);
  };

  useEffect(() => {
    cargarUsuarios();
    cargarCopias();
  }, []);

  // Manejadores Usuarios
  const abrirNuevoUsuario = () => {
    setEditingUserId(null);
    setUserNombre("");
    setUserDni("");
    setUserEmail("");
    setUserRol("Secretaria");
    setUserClave("admin123");
    setUserError(null);
    setVista("formulario");
  };

  const abrirEditarUsuario = (u: UsuarioFila) => {
    setEditingUserId(u.id);
    setUserNombre(u.nombre);
    setUserDni(u.dni);
    setUserEmail(u.email || "");
    setUserRol(u.rol);
    setUserClave("");
    setUserError(null);
    setVista("formulario");
  };

  const guardarUsuario = async (e: FormEvent) => {
    e.preventDefault();
    if (!userNombre.trim() || !userDni.trim()) {
      setUserError("El nombre y el DNI son obligatorios.");
      return;
    }

    setUserSaving(true);
    setUserError(null);
    try {
      if (editingUserId) {
        await api.actualizarUsuario(editingUserId, {
          nombre: userNombre.trim(),
          dni: userDni.trim(),
          email: userEmail.trim() || undefined,
          rol: userRol,
          clave: userClave.trim() || undefined,
        });
      } else {
        await api.crearUsuario({
          nombre: userNombre.trim(),
          dni: userDni.trim(),
          email: userEmail.trim() || undefined,
          rol: userRol,
          clave: userClave.trim() || "admin123",
        });
      }
      cargarUsuarios();
      setVista("lista");
    } catch (err) {
      setUserError(String(err));
    } finally {
      setUserSaving(false);
    }
  };

  const toggleEstadoUsuario = async (u: UsuarioFila) => {
    try {
      await api.cambiarEstadoUsuario(u.id, u.activo === 0);
      cargarUsuarios();
    } catch (err) {
      console.error(err);
    }
  };

  // Manejador Backups
  const [backupMsgTone, setBackupMsgTone] = useState<"ok" | "warn" | "danger">("ok");
  const [copiaParaRestaurar, setCopiaParaRestaurar] = useState<CopiaSeguridadFila | null>(null);
  const [restaurando, setRestaurando] = useState(false);

  const crearBackup = async () => {
    setCreandoBackup(true);
    setBackupMsg(null);
    try {
      const res = await api.crearCopiaSeguridad();
      setBackupMsg(res.mensaje);
      setBackupMsgTone(res.creado ? "ok" : "warn");
      cargarCopias();
    } catch (err) {
      setBackupMsg(`Error al crear copia: ${String(err)}`);
      setBackupMsgTone("danger");
    } finally {
      setCreandoBackup(false);
    }
  };

  const confirmarRestaurarCopia = async () => {
    if (!copiaParaRestaurar) return;
    setRestaurando(true);
    setBackupMsg(null);
    try {
      const msg = await api.restaurarCopiaSeguridad(copiaParaRestaurar.nombreArchivo);
      setBackupMsg(msg);
      setBackupMsgTone("ok");
      setCopiaParaRestaurar(null);
      cargarCopias();
      cargarUsuarios();
    } catch (err) {
      setBackupMsg(`Error al restaurar respaldo: ${String(err)}`);
      setBackupMsgTone("danger");
    } finally {
      setRestaurando(false);
    }
  };

  const usuariosFiltrados = usuarios.filter((u) => {
    return (
      !busquedaUsuario ||
      u.nombre.toLowerCase().includes(busquedaUsuario.toLowerCase()) ||
      u.dni.includes(busquedaUsuario) ||
      u.rol.toLowerCase().includes(busquedaUsuario.toLowerCase())
    );
  });

  const columnsUsuarios: Column<UsuarioFila>[] = [
    {
      header: "Nombre y apellido",
      minWidth: 200,
      flex: true,
      render: (u) => <strong>{u.nombre}</strong>,
    },
    {
      header: "DNI (Usuario)",
      minWidth: 130,
      flex: true,
      render: (u) => <code>{u.dni}</code>,
    },
    {
      header: "Rol",
      minWidth: 150,
      flex: true,
      render: (u) => {
        let tone: "ok" | "warn" | "primary" = "primary";
        if (u.rol === "Superadmin") tone = "warn";
        if (u.rol === "Presidente") tone = "ok";
        return <Badge tone={tone}>{u.rol}</Badge>;
      },
    },
    { header: "Correo electrónico", minWidth: 200, flex: true, render: (u) => u.email || "—" },
    {
      header: "Estado",
      minWidth: 110,
      flex: true,
      render: (u) => (
        <Badge tone={u.activo === 1 ? "ok" : "danger"}>
          {u.activo === 1 ? "Activo" : "Inactivo"}
        </Badge>
      ),
    },
    {
      header: "Acciones",
      width: 95,
      align: "center",
      render: (u) => (
        <div style={{ display: "flex", gap: "6px", alignItems: "center", justifyContent: "center" }}>
          <IconButton
            icon={<EditIcon size={16} />}
            variant="default"
            title={`Editar usuario: ${u.nombre}`}
            onClick={(e) => {
              e.stopPropagation();
              abrirEditarUsuario(u);
            }}
          />
          <IconButton
            icon={<ToggleActiveIcon size={16} active={u.activo === 1} />}
            variant={u.activo === 1 ? "danger" : "success"}
            title={u.activo === 1 ? `Desactivar cuenta de ${u.nombre}` : `Reactivar cuenta de ${u.nombre}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleEstadoUsuario(u);
            }}
          />
        </div>
      ),
    },
  ];

  const columnsCopias: Column<CopiaSeguridadFila>[] = [
    {
      header: "Archivo de respaldo",
      minWidth: 280,
      flex: true,
      render: (c) => <code>{c.nombreArchivo}</code>,
    },
    { header: "Fecha y hora", minWidth: 180, flex: true, render: (c) => c.fecha },
    {
      header: "Tamaño",
      minWidth: 130,
      flex: true,
      render: (c) => <span>{(c.tamanoBytes / 1024).toFixed(1)} KB</span>,
    },
    {
      header: "Estado",
      minWidth: 130,
      flex: true,
      render: () => <Badge tone="ok">Copia íntegra</Badge>,
    },
    {
      header: "Acción",
      width: 120,
      align: "center",
      render: (c) => (
        <Button
          variant="secondary"
          title={`Restaurar base de datos desde ${c.nombreArchivo}`}
          onClick={(e) => {
            e.stopPropagation();
            setCopiaParaRestaurar(c);
          }}
        >
          Restaurar
        </Button>
      ),
    },
  ];

  // -------------------------------------------------------------
  // PANTALLA 1: LISTADO (TABS)
  // -------------------------------------------------------------
  if (vista === "lista") {
    return (
      <Layout
        title="Usuarios y respaldo"
        action={
          activeTab === "usuarios" ? (
            <Button onClick={abrirNuevoUsuario}>+ Nuevo usuario</Button>
          ) : activeTab === "respaldo" ? (
            <Button onClick={crearBackup} disabled={creandoBackup}>
              {creandoBackup ? "Creando copia…" : "Crear copia ahora"}
            </Button>
          ) : undefined
        }
      >
        <div className={s.tabNav}>
          <button
            type="button"
            className={`${s.tabBtn} ${activeTab === "usuarios" ? s.tabBtnActive : ""}`}
            onClick={() => setActiveTab("usuarios")}
          >
            Cuentas de usuarios
          </button>
          <button
            type="button"
            className={`${s.tabBtn} ${activeTab === "respaldo" ? s.tabBtnActive : ""}`}
            onClick={() => setActiveTab("respaldo")}
          >
            Copias de seguridad
          </button>
        </div>

        {/* --- TAB 1: USUARIOS --- */}
        {activeTab === "usuarios" && (
          <div>
            <div style={{ marginBottom: "var(--space-4)" }}>
              <Field
                label="Buscar usuario por nombre, DNI o rol"
                type="search"
                placeholder="Escribí un nombre o DNI…"
                value={busquedaUsuario}
                onChange={(e) => setBusquedaUsuario(e.target.value)}
                width={360}
              />
            </div>

            <DataTable
              columns={columnsUsuarios}
              rows={usuariosFiltrados}
              rowKey={(u) => u.id}
              emptyMessage="No se encontraron usuarios registrados."
            />
          </div>
        )}

        {/* --- TAB 2: RESPALDO --- */}
        {activeTab === "respaldo" && (
          <div>
            <Card title="Almacenamiento local portable y respaldos automáticos" className={s.backupInfo}>
              <p style={{ color: "var(--color-text-muted)", fontSize: "var(--fs-base)" }}>
                La base de datos SQLite y los respaldos se guardan de forma portable en la carpeta de la aplicación:
              </p>
              <div>
                <span className={s.pathTag}>{rutaDatos || "./datos"}</span>
              </div>
              <p style={{ color: "var(--color-text-muted)", fontSize: "var(--fs-sm)", margin: 0 }}>
                • <strong>Respaldo automático periódico:</strong> el sistema genera una copia de seguridad automáticamente cada 30 minutos mientras la aplicación está en uso.
                <br />
                • <strong>Respaldo automático al salir:</strong> al cerrar la aplicación, se guarda una copia de seguridad de manera instantánea.
              </p>
            </Card>

            {backupMsg && (
              <div
                className={
                  backupMsgTone === "ok"
                    ? s.successMsg
                    : backupMsgTone === "warn"
                    ? s.warnMsg
                    : s.errorMsg
                }
              >
                {backupMsg}
              </div>
            )}

            <Card title="Historial de copias de seguridad">
              <DataTable
                columns={columnsCopias}
                rows={copias}
                rowKey={(c) => c.nombreArchivo}
                emptyMessage="No hay copias de seguridad registradas."
              />
            </Card>
          </div>
        )}

        <ConfirmDialog
          isOpen={copiaParaRestaurar !== null}
          title="Restaurar copia de seguridad (RF21)"
          message={
            copiaParaRestaurar ? (
              <div>
                <p style={{ margin: 0 }}>
                  ¿Está seguro de que desea restaurar la base de datos a partir del respaldo{" "}
                  <strong>"{copiaParaRestaurar.nombreArchivo}"</strong>?
                </p>
                <p style={{ marginTop: "12px", color: "var(--color-danger)", fontSize: "0.85rem", fontWeight: 600 }}>
                  ⚠️ Advertencia: Todos los cambios, pagos y movimientos registrados posteriormente a esta fecha serán reemplazados por el contenido del archivo de copia.
                </p>
              </div>
            ) : null
          }
          confirmLabel={restaurando ? "Restaurando..." : "Restaurar base de datos"}
          cancelLabel="Cancelar"
          variant="danger"
          onConfirm={confirmarRestaurarCopia}
          onCancel={() => setCopiaParaRestaurar(null)}
        />
      </Layout>
    );
  }

  // -------------------------------------------------------------
  // PANTALLA 2: NUEVO / EDITAR USUARIO
  // -------------------------------------------------------------
  return (
    <Layout
      title={editingUserId ? "Usuarios › Editar usuario" : "Usuarios › Nuevo usuario"}
      action={
        <Button variant="secondary" onClick={() => setVista("lista")}>
          ← Volver
        </Button>
      }
    >
      <form onSubmit={guardarUsuario} className={s.formContainer}>
        {userError && <div className={s.errorMsg}>{userError}</div>}

        <Card title="Datos de la cuenta">
          <div className={s.formFields}>
            <div className={s.formRow}>
              <Field
                label="Nombre y apellido"
                placeholder="Ej: Laura Martínez"
                value={userNombre}
                onChange={(e) => setUserNombre(e.target.value)}
                width={340}
                required
              />
              <Field
                label="DNI (utilizado para ingresar)"
                placeholder="Ej: 35123456"
                value={userDni}
                onChange={(e) => setUserDni(e.target.value)}
                width={200}
                required
              />
            </div>

            <div className={s.formRow}>
              <Field
                label="Correo electrónico"
                type="email"
                placeholder="correo@ejemplo.com"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                width={300}
              />
              <SelectField
                label="Rol de acceso"
                value={userRol}
                options={ROLES}
                onChange={(v) => setUserRol(v as Rol)}
                width={280}
              />
            </div>

            <Field
              label={editingUserId ? "Contraseña (dejar en blanco para conservar la actual)" : "Contraseña de acceso"}
              type="password"
              placeholder={editingUserId ? "••••••••" : "admin123"}
              value={userClave}
              onChange={(e) => setUserClave(e.target.value)}
              width={340}
            />
          </div>
        </Card>

        <div className={s.actionRow}>
          <Button type="submit" disabled={userSaving}>
            {userSaving ? "Guardando..." : editingUserId ? "Guardar cambios" : "Crear usuario"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setVista("lista")}
            disabled={userSaving}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </Layout>
  );
}
