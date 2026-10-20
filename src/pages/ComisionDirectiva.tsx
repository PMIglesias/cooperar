// src/pages/ComisionDirectiva.tsx
import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { useApp } from "../context";
import {
  api,
  MiembroComisionFila,
  DatosInstitucionales,
  AsociadoFila,
} from "../api";
import s from "./ComisionDirectiva.module.css";

export default function ComisionDirectiva() {
  const { usuario } = useApp();
  const [comision, setComision] = useState<MiembroComisionFila[]>([]);
  const [institucion, setInstitucion] = useState<DatosInstitucionales | null>(null);
  const [asociados, setAsociados] = useState<AsociadoFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal para editar integrante
  const [miembroEditando, setMiembroEditando] = useState<MiembroComisionFila | null>(null);

  const puedeEditar = usuario.rol === "Secretaria" || usuario.rol === "Superadmin";

  const cargarDatos = async () => {
    try {
      setLoading(true);
      setError(null);
      const [com, inst, asocs] = await Promise.all([
        api.listarComisionDirectiva(),
        api.obtenerDatosInstitucionales(),
        api.listarAsociados({ busqueda: "", estadoCuotas: "todos", estado: "activo" }),
      ]);
      setComision(com);
      setInstitucion(inst);
      setAsociados(asocs);
    } catch (err: any) {
      setError(err?.message || "Error al cargar la Comisión Directiva");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const handleGuardarMiembroModal = async (e: React.FormEvent) => {
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

    setMiembroEditando({
      ...miembroEditando,
      asociadoId: asocId,
      nombre: encontrado.apellidoNombre,
      dni: encontrado.dni,
      cuil: `20-${encontrado.dni}-3`,
      telefono: tel || miembroEditando.telefono,
      email: email || miembroEditando.email,
    });
  };

  const handleGuardarInstitucion = async () => {
    if (!institucion || !puedeEditar) return;
    try {
      await api.guardarDatosInstitucionales(institucion);
      setMensajeExito("Datos institucionales guardados correctamente.");
    } catch (err: any) {
      setError(err?.message || "Error al guardar datos institucionales");
    }
  };

  return (
    <Layout
      title="Comisión Directiva"
      action={
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            cargarDatos();
            setMensajeExito("Datos actualizados correctamente.");
          }}
          disabled={loading}
          title="Recargar datos desde la base de datos"
        >
          🔄 Actualizar
        </button>
      }
    >
      {mensajeExito && <div className="alert alert-success">{mensajeExito}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className={s.container}>
        {/* Tabla de Comisión Directiva */}
        <div className="card">
          <div className={s.cardHeaderRow}>
            <div>
              <h2 style={{ fontSize: "var(--fs-lg)", fontWeight: 700, margin: 0 }}>
                Nómina de Autoridades e Integrantes
              </h2>
              <p style={{ color: "var(--color-text-muted)", fontSize: "var(--fs-sm)", margin: "4px 0 0" }}>
                Integrantes y autoridades de la Cooperadora. Puedes vincularlos a los Asociados del padrón o ingresarlos manualmente.
                {!puedeEditar && " (Modo sólo lectura para su rol)"}
              </p>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Cargo</th>
                  <th>Apellido y Nombre</th>
                  <th>DNI</th>
                  <th>CUIL</th>
                  <th>Domicilio / Localidad</th>
                  <th>Teléfono</th>
                  <th>Vencimiento</th>
                  {puedeEditar && <th style={{ textAlign: "right" }}>Acción</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={puedeEditar ? 9 : 8} style={{ textAlign: "center", padding: "var(--space-6)" }}>
                      Cargando autoridades...
                    </td>
                  </tr>
                ) : comision.length === 0 ? (
                  <tr>
                    <td colSpan={puedeEditar ? 9 : 8} style={{ textAlign: "center", padding: "var(--space-6)" }}>
                      No se encontraron integrantes registrados.
                    </td>
                  </tr>
                ) : (
                  comision.map((m) => (
                    <tr key={m.id}>
                      <td style={{ color: "var(--color-text-muted)", fontWeight: 600 }}>{m.orden}°</td>
                      <td style={{ fontWeight: 600, fontSize: "var(--fs-xs)", color: "var(--color-primary)" }}>
                        {m.cargo}
                      </td>
                      <td>
                        <div>
                          <strong>{m.nombre}</strong>
                          {m.asociadoId ? (
                            <div>
                              <span className={s.asociadoBadge}>Socio en BD</span>
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td>{m.dni}</td>
                      <td>{m.cuil}</td>
                      <td>{m.domicilio ? `${m.domicilio}, ${m.localidad}` : m.localidad}</td>
                      <td>{m.telefono}</td>
                      <td>{m.vencimiento}</td>
                      {puedeEditar && (
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setMiembroEditando({ ...m })}
                          >
                            ✏️ Editar
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Datos Institucionales */}
        {institucion && (
          <div className="card">
            <h2 style={{ fontSize: "var(--fs-lg)", fontWeight: 700, marginBottom: "var(--space-4)" }}>
              Datos del Establecimiento y Cooperadora
            </h2>
            <div className={s.configGrid}>
              <div className="form-group">
                <label className="label">Distrito</label>
                <input
                  type="text"
                  className="input"
                  disabled={!puedeEditar}
                  value={institucion.distrito}
                  onChange={(e) =>
                    setInstitucion({ ...institucion, distrito: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label className="label">Escuela y Número</label>
                <input
                  type="text"
                  className="input"
                  disabled={!puedeEditar}
                  value={institucion.numeroEscuela}
                  onChange={(e) =>
                    setInstitucion({ ...institucion, numeroEscuela: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label className="label">Nombre Escuela</label>
                <input
                  type="text"
                  className="input"
                  disabled={!puedeEditar}
                  value={institucion.nombreEscuela}
                  onChange={(e) =>
                    setInstitucion({ ...institucion, nombreEscuela: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label className="label">Asociación Cooperadora</label>
                <input
                  type="text"
                  className="input"
                  disabled={!puedeEditar}
                  value={institucion.asociacionNombre}
                  onChange={(e) =>
                    setInstitucion({ ...institucion, asociacionNombre: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label className="label">CUE</label>
                <input
                  type="text"
                  className="input"
                  disabled={!puedeEditar}
                  value={institucion.cue}
                  onChange={(e) =>
                    setInstitucion({ ...institucion, cue: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label className="label">CUIT</label>
                <input
                  type="text"
                  className="input"
                  disabled={!puedeEditar}
                  value={institucion.cuit}
                  onChange={(e) =>
                    setInstitucion({ ...institucion, cuit: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label className="label">Domicilio Escuela</label>
                <input
                  type="text"
                  className="input"
                  disabled={!puedeEditar}
                  value={institucion.domicilioEscuela}
                  onChange={(e) =>
                    setInstitucion({ ...institucion, domicilioEscuela: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label className="label">Localidad</label>
                <input
                  type="text"
                  className="input"
                  disabled={!puedeEditar}
                  value={institucion.localidad}
                  onChange={(e) =>
                    setInstitucion({ ...institucion, localidad: e.target.value })
                  }
                />
              </div>
            </div>
            {puedeEditar && (
              <div style={{ marginTop: "var(--space-4)" }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleGuardarInstitucion}
                >
                  Guardar Datos Institucionales
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL DE EDICIÓN DE AUTORIDAD DE COMISIÓN DIRECTIVA */}
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
                <div className="form-group">
                  <label className="label">Tomar datos desde Asociado de la BD:</label>
                  <select
                    className="input"
                    value={miembroEditando.asociadoId || ""}
                    onChange={(e) => handleSeleccionarAsociado(e.target.value)}
                  >
                    <option value="">-- Ingreso manual / No vinculado --</option>
                    {asociados.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.apellidoNombre} (DNI {a.dni})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="label">Apellido y Nombre:</label>
                  <input
                    type="text"
                    required
                    className="input"
                    value={miembroEditando.nombre}
                    onChange={(e) =>
                      setMiembroEditando({ ...miembroEditando, nombre: e.target.value })
                    }
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                  <div className="form-group">
                    <label className="label">DNI:</label>
                    <input
                      type="text"
                      required
                      className="input"
                      value={miembroEditando.dni}
                      onChange={(e) =>
                        setMiembroEditando({ ...miembroEditando, dni: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">CUIL:</label>
                    <input
                      type="text"
                      required
                      className="input"
                      value={miembroEditando.cuil}
                      onChange={(e) =>
                        setMiembroEditando({ ...miembroEditando, cuil: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                  <div className="form-group">
                    <label className="label">Domicilio:</label>
                    <input
                      type="text"
                      required
                      className="input"
                      value={miembroEditando.domicilio}
                      onChange={(e) =>
                        setMiembroEditando({ ...miembroEditando, domicilio: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">Localidad:</label>
                    <input
                      type="text"
                      required
                      className="input"
                      value={miembroEditando.localidad}
                      onChange={(e) =>
                        setMiembroEditando({ ...miembroEditando, localidad: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                  <div className="form-group">
                    <label className="label">Teléfono:</label>
                    <input
                      type="text"
                      className="input"
                      value={miembroEditando.telefono}
                      onChange={(e) =>
                        setMiembroEditando({ ...miembroEditando, telefono: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">Vencimiento Mandato:</label>
                    <input
                      type="text"
                      className="input"
                      value={miembroEditando.vencimiento}
                      onChange={(e) =>
                        setMiembroEditando({ ...miembroEditando, vencimiento: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
              <div className={s.modalFooter}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setMiembroEditando(null)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
