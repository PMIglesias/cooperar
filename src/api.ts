// src/api.ts
import { invoke } from "@tauri-apps/api/core";

export type Rol = "Presidente" | "Secretaria" | "Tesorero" | "Superadmin";
export interface Usuario { id: number; nombre: string; rol: Rol }
export interface Movimiento { descripcion: string; tipo: "Ingreso" | "Egreso"; monto: number }
export interface ResumenInicio {
  saldoCaja: number; cuotasCobradas: number; cuotasTotal: number; conDeuda: number;
  proximaReunion: string | null; ultimosMovimientos: Movimiento[]; ultimaCopia: string | null;
}
export interface ResumenPadron { activos: number; conDeuda: number; exentos: number }
export type EstadoCuotas = "Al día" | "Con deuda" | "Exento";

export interface AsociadoFila {
  id: number;
  apellidoNombre: string;
  dni: string;
  telefono: string | null;
  alumnos: string | null;
  estadoCuotas: EstadoCuotas;
  activo: number;
}

export interface AlumnoItem {
  id: number;
  nombre: string;
  curso: string;
}

export interface AsociadoDetalle {
  id: number;
  apellidoNombre: string;
  dni: string;
  telefono: string | null;
  email: string | null;
  fechaAlta: string;
  alumnos: string | null;
  listaAlumnos: AlumnoItem[];
  estadoCuotas: EstadoCuotas;
  exento: number;
  activo: number;
}

export interface DatosAsociado {
  apellidoNombre: string;
  dni: string;
  telefono?: string;
  email?: string;
  alumnos: { nombre: string; curso: string }[];
}

export interface Filtros { busqueda: string; estadoCuotas: string; estado: string }

// Cuotas y Pagos
export interface PagoFila {
  id: number;
  asociadoId: number;
  apellidoNombre: string;
  dni: string;
  periodo: string;
  fechaPago: string;
  monto: number;
  medio: string;
  comprobante: string | null;
  registradoPor: string;
  registradoPorRol?: string;
  registradoPorNombre?: string;
}

export interface DatosPago {
  asociadoId: number;
  periodo: string;
  monto: number;
  medio: string;
  comprobante?: string;
}

// Caja
export interface MovimientoCajaFila {
  id: number;
  fecha: string;
  tipo: "Ingreso" | "Egreso";
  categoria: string;
  descripcion: string;
  monto: number;
  comprobante: string | null;
  anulado: number;
  motivoAnulacion?: string | null;
}

export interface DatosMovimientoCaja {
  tipo: "Ingreso" | "Egreso";
  categoria: string;
  descripcion: string;
  monto: number;
  comprobante?: string;
}

export interface ResumenCaja {
  saldoActual: number;
  ingresosMes: number;
  egresosMes: number;
  totalMovimientos: number;
}

// Reuniones
export interface ReunionFila {
  id: number;
  fecha: string;
  tipo: "Comisión" | "Asamblea";
  temas: string;
  acta: string | null;
  archivoAdjunto?: string | null;
  asistentesCount: number;
}

export interface DatosReunion {
  fecha: string;
  tipo: "Comisión" | "Asamblea";
  temas: string;
}

// Rendiciones
export interface RendicionFila {
  id: number;
  periodo: string;
  desde: string;
  hasta: string;
  generadaEn: string;
  generadaPor: string;
  estado: "Borrador" | "Aprobada";
  aprobadaPor: string | null;
  aprobadaEn: string | null;
  totalIngresos: number;
  totalEgresos: number;
  saldoPeriodo: number;
}

export interface DatosRendicion {
  periodo: string;
  desde: string;
  hasta: string;
}

// Comisión Directiva y Documentación de Asambleas
export interface MiembroComisionFila {
  id: number;
  orden: number;
  cargo: string;
  asociadoId?: number | null;
  nombre: string;
  dni: string;
  cuil: string;
  domicilio: string;
  localidad: string;
  telefono: string;
  email: string;
  vencimiento: string;
}

export interface PersonalEstablecimientoFila {
  id: number;
  cargo: string;
  nombre: string;
  dni: string;
  telefono: string;
  email: string;
  vinculoNomina: "NINGUNO" | "ASESOR" | "REV_CTAS_DOC_TIT" | "REV_CTAS_DOC_SUP" | string;
}

export interface DocumentoAsambleaFila {
  id: number;
  tipo: "NOMINA_COMISION" | "PIA_COOPERADORA" | string;
  titulo: string;
  periodo: string;
  fechaGeneracion: string;
  generadoPor: string;
  archivoPdf: string;
  datosJson: string;
}

export interface GuardarDocumentoParams {
  tipo: string;
  titulo: string;
  periodo: string;
  datosJson: string;
  pdfBytesBase64: string;
}

export interface DatosInstitucionales {
  distrito: string;
  numeroEscuela: string;
  nombreEscuela: string;
  asociacionNombre: string;
  cue: string;
  cuit: string;
  domicilioEscuela: string;
  barrio: string;
  localidad: string;
  telefonoEscuela: string;
  emailInstitucional: string;
  bancoNombre: string;
  bancoSucursal: string;
  cuentaCorriente: string;
  cbu: string;
  alias: string;
  cuotaMensual: string;
  cuotaAnual: string;
  logoBase64?: string;
}

// Usuarios
export interface UsuarioFila {
  id: number;
  nombre: string;
  dni: string;
  email: string | null;
  rol: Rol;
  activo: number;
}

export interface DatosUsuario {
  nombre: string;
  dni: string;
  email?: string;
  rol: Rol;
  clave?: string;
}

export interface CopiaSeguridadFila {
  nombreArchivo: string;
  fecha: string;
  tamanoBytes: number;
}

export interface ResultadoBackup {
  creado: boolean;
  archivo: string;
  mensaje: string;
}

export const DEMO_USUARIOS = [
  { dni: "10000001", nombre: "Administrador General", rol: "Superadmin" as Rol, clave: "admin123" },
  { dni: "20000002", nombre: "Carlos Gómez", rol: "Presidente" as Rol, clave: "admin123" },
  { dni: "30000003", nombre: "Mariana López", rol: "Secretaria" as Rol, clave: "admin123" },
  { dni: "40000004", nombre: "Roberto Fernández", rol: "Tesorero" as Rol, clave: "admin123" },
];

const isTauri = typeof window !== "undefined" && Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

// In-Memory Mock Store for Browser Preview Mode
let mockAsociados: AsociadoDetalle[] = [
  {
    id: 1, apellidoNombre: "Álvarez, Marcos", dni: "32111222", telefono: "11-4567-8901", email: "marcos.alvarez@email.com",
    fechaAlta: "2026-07-01", alumnos: "Lucía Álvarez (3° A)", listaAlumnos: [{ id: 1, nombre: "Lucía Álvarez", curso: "3° A" }],
    estadoCuotas: "Al día", exento: 0, activo: 1,
  },
  {
    id: 2, apellidoNombre: "Fernández, Valeria", dni: "29888777", telefono: "11-9876-5432", email: "valeria.fernandez@email.com",
    fechaAlta: "2026-04-01", alumnos: "Mateo Fernández (5° B), Sofía Fernández (1° A)", listaAlumnos: [{ id: 2, nombre: "Mateo Fernández", curso: "5° B" }, { id: 3, nombre: "Sofía Fernández", curso: "1° A" }],
    estadoCuotas: "Con deuda", exento: 0, activo: 1,
  },
  {
    id: 3, apellidoNombre: "Gómez, Santiago", dni: "34555666", telefono: "11-2233-4455", email: "santiago.gomez@email.com",
    fechaAlta: "2025-10-01", alumnos: "Ignacio Gómez (2° C)", listaAlumnos: [{ id: 4, nombre: "Ignacio Gómez", curso: "2° C" }],
    estadoCuotas: "Exento", exento: 1, activo: 1,
  },
  {
    id: 4, apellidoNombre: "López, Mariana", dni: "31222333", telefono: "11-6677-8899", email: "mariana.lopez@email.com",
    fechaAlta: "2026-08-01", alumnos: "Camila López (4° A)", listaAlumnos: [{ id: 5, nombre: "Camila López", curso: "4° A" }],
    estadoCuotas: "Al día", exento: 0, activo: 1,
  },
  {
    id: 5, apellidoNombre: "Martínez, Diego", dni: "28777666", telefono: "11-3344-5566", email: "diego.martinez@email.com",
    fechaAlta: "2026-05-01", alumnos: "Tomás Martínez (6° B)", listaAlumnos: [{ id: 6, nombre: "Tomás Martínez", curso: "6° B" }],
    estadoCuotas: "Al día", exento: 0, activo: 1,
  },
  {
    id: 6, apellidoNombre: "Rodríguez, Laura", dni: "33444555", telefono: "11-5566-7788", email: "laura.rodriguez@email.com",
    fechaAlta: "2026-09-01", alumnos: "Benjamín Rodríguez (1° B)", listaAlumnos: [{ id: 7, nombre: "Benjamín Rodríguez", curso: "1° B" }],
    estadoCuotas: "Al día", exento: 0, activo: 1,
  },
  {
    id: 7, apellidoNombre: "Romero, Pablo", dni: "30111444", telefono: "11-7788-9900", email: "pablo.romero@email.com",
    fechaAlta: "2026-06-01", alumnos: "Martina Romero (2° A)", listaAlumnos: [{ id: 8, nombre: "Martina Romero", curso: "2° A" }],
    estadoCuotas: "Al día", exento: 0, activo: 1,
  },
  {
    id: 8, apellidoNombre: "Sánchez, Elena", dni: "27999111", telefono: "11-8899-0011", email: "elena.sanchez@email.com",
    fechaAlta: "2026-02-01", alumnos: "Joaquín Sánchez (5° A)", listaAlumnos: [{ id: 9, nombre: "Joaquín Sánchez", curso: "5° A" }],
    estadoCuotas: "Al día", exento: 0, activo: 1,
  },
];

let mockPagos: PagoFila[] = [
  { id: 1, asociadoId: 1, apellidoNombre: "Álvarez, Marcos", dni: "32111222", periodo: "2026-10", fechaPago: "2026-10-04", monto: 8000, medio: "Efectivo", comprobante: "REC-001", registradoPor: "Tesorero (Roberto Fernández)", registradoPorRol: "Tesorero", registradoPorNombre: "Roberto Fernández" },
  { id: 2, asociadoId: 4, apellidoNombre: "López, Mariana", dni: "31222333", periodo: "2026-10", fechaPago: "2026-10-05", monto: 8000, medio: "Transferencia", comprobante: "TRF-1029", registradoPor: "Tesorero (Roberto Fernández)", registradoPorRol: "Tesorero", registradoPorNombre: "Roberto Fernández" },
  { id: 3, asociadoId: 5, apellidoNombre: "Martínez, Diego", dni: "28777666", periodo: "2026-10", fechaPago: "2026-10-05", monto: 8000, medio: "Efectivo", comprobante: "REC-002", registradoPor: "Tesorero (Roberto Fernández)", registradoPorRol: "Tesorero", registradoPorNombre: "Roberto Fernández" },
  { id: 4, asociadoId: 6, apellidoNombre: "Rodríguez, Laura", dni: "33444555", periodo: "2026-10", fechaPago: "2026-10-06", monto: 8000, medio: "Transferencia", comprobante: "TRF-1033", registradoPor: "Tesorero (Roberto Fernández)", registradoPorRol: "Tesorero", registradoPorNombre: "Roberto Fernández" },
  { id: 5, asociadoId: 7, apellidoNombre: "Romero, Pablo", dni: "30111444", periodo: "2026-10", fechaPago: "2026-10-06", monto: 8000, medio: "Efectivo", comprobante: "REC-003", registradoPor: "Tesorero (Roberto Fernández)", registradoPorRol: "Tesorero", registradoPorNombre: "Roberto Fernández" },
  { id: 6, asociadoId: 8, apellidoNombre: "Sánchez, Elena", dni: "27999111", periodo: "2026-10", fechaPago: "2026-10-07", monto: 8000, medio: "Transferencia", comprobante: "TRF-1045", registradoPor: "Tesorero (Roberto Fernández)", registradoPorRol: "Tesorero", registradoPorNombre: "Roberto Fernández" },
];

let mockMovimientos: MovimientoCajaFila[] = [
  { id: 5, fecha: "2026-10-06", tipo: "Ingreso", categoria: "Cuotas", descripcion: "Cobro cuotas mes en curso", monto: 48000, comprobante: "LOT-102", anulado: 0 },
  { id: 4, fecha: "2026-10-04", tipo: "Egreso", categoria: "Mantenimiento", descripcion: "Reparación luminarias patio y pasillos", monto: 45000, comprobante: "FAC-8890", anulado: 0 },
  { id: 3, fecha: "2026-10-02", tipo: "Ingreso", categoria: "Eventos", descripcion: "Recaudación kermesse familiar escolar", monto: 185000, comprobante: "ACT-012", anulado: 0 },
  { id: 2, fecha: "2026-09-29", tipo: "Egreso", categoria: "Insumos", descripcion: "Compra de artículos de limpieza y desinfección", monto: 25400, comprobante: "FAC-1102", anulado: 0 },
  { id: 1, fecha: "2026-09-27", tipo: "Ingreso", categoria: "Cuotas", descripcion: "Cobro cuotas societarias mes anterior", monto: 56000, comprobante: "LOT-101", anulado: 0 },
];

let mockReuniones: ReunionFila[] = [
  { id: 1, fecha: "2026-10-19", tipo: "Comisión", temas: "Planificación mejoras edilicias de verano, presupuesto pintura y balance de cuotas.", acta: null, asistentesCount: 0 },
  { id: 2, fecha: "2026-09-17", tipo: "Asamblea", temas: "Aprobación de memoria y balance anual. Renovación parcial de autoridades.", acta: "En la ciudad, reunidos los miembros en asamblea ordinaria, se aprueba por unanimidad la memoria y balance del ejercicio anterior. Se ratifican los cargos directivos.", asistentesCount: 18 },
];

let mockRendiciones: RendicionFila[] = [
  { id: 1, periodo: "Septiembre 2026", desde: "2026-09-01", hasta: "2026-09-30", generadaEn: "2026-10-01 10:00:00", generadaPor: "Roberto Fernández", estado: "Aprobada", aprobadaPor: "Carlos Gómez", aprobadaEn: "2026-10-02 14:30:00", totalIngresos: 241000, totalEgresos: 70400, saldoPeriodo: 170600 },
];

let mockUsuarios: UsuarioFila[] = [
  { id: 1, nombre: "Administrador General", dni: "10000001", email: "admin@cooperar.local", rol: "Superadmin", activo: 1 },
  { id: 2, nombre: "Carlos Gómez", dni: "20000002", email: "presidente@cooperar.local", rol: "Presidente", activo: 1 },
  { id: 3, nombre: "Mariana López", dni: "30000003", email: "secretaria@cooperar.local", rol: "Secretaria", activo: 1 },
  { id: 4, nombre: "Roberto Fernández", dni: "40000004", email: "tesorero@cooperar.local", rol: "Tesorero", activo: 1 },
];

let mockCopias: CopiaSeguridadFila[] = [
  { nombreArchivo: "cooperar_backup_20261007_052000.db", fecha: "2026-10-07 05:20:00", tamanoBytes: 61440 },
];

let mockConfiguracion: Record<string, string> = {
  monto_cuota: "8000",
  ultima_copia: "07/10/2026 05:20",
};

export const api = {
  // Autenticación
  login: async (dni: string, clave: string): Promise<Usuario> => {
    if (isTauri) return invoke<Usuario>("login", { dni, clave });
    const cleanDni = dni.trim();
    const user = DEMO_USUARIOS.find((u) => u.dni === cleanDni && (u.clave === clave || clave === "admin123"));
    if (user) {
      return { id: DEMO_USUARIOS.indexOf(user) + 1, nombre: user.nombre, rol: user.rol };
    }
    throw new Error("DNI o contraseña incorrectos");
  },
  logout: async (): Promise<void> => {
    if (isTauri) return invoke<void>("logout");
  },

  // Dashboard
  resumenInicio: async (): Promise<ResumenInicio> => {
    if (isTauri) return invoke<ResumenInicio>("resumen_inicio");
    const activos = mockAsociados.filter((a) => a.activo === 1);
    return {
      saldoCaja: 218600,
      cuotasCobradas: mockPagos.filter((p) => p.periodo === "2026-10").length,
      cuotasTotal: activos.filter((a) => a.exento === 0).length,
      conDeuda: activos.filter((a) => a.estadoCuotas === "Con deuda").length,
      proximaReunion: "19/10 · Comisión",
      ultimosMovimientos: mockMovimientos.slice(0, 4).map((m) => ({ descripcion: m.descripcion, tipo: m.tipo, monto: m.monto })),
      ultimaCopia: mockConfiguracion.ultima_copia || "07/10/2026 05:20",
    };
  },
  resumenPadron: async (): Promise<ResumenPadron> => {
    if (isTauri) return invoke<ResumenPadron>("resumen_padron");
    const activos = mockAsociados.filter((a) => a.activo === 1);
    return {
      activos: activos.length,
      conDeuda: activos.filter((a) => a.estadoCuotas === "Con deuda").length,
      exentos: activos.filter((a) => a.exento === 1).length,
    };
  },

  // Asociados
  listarAsociados: async (f: Filtros): Promise<AsociadoFila[]> => {
    if (isTauri) return invoke<AsociadoFila[]>("listar_asociados", { ...f });
    return mockAsociados
      .filter((a) => {
        const matchEstado = f.estado === "Todos" ? true : f.estado === "Activos" || f.estado === "Activo" ? a.activo === 1 : a.activo === 0;
        const matchBusqueda = !f.busqueda || a.apellidoNombre.toLowerCase().includes(f.busqueda.toLowerCase()) || a.dni.includes(f.busqueda);
        const matchCuotas = f.estadoCuotas === "Todos" || a.estadoCuotas === f.estadoCuotas;
        return matchEstado && matchBusqueda && matchCuotas;
      })
      .map((a) => ({
        id: a.id,
        apellidoNombre: a.apellidoNombre,
        dni: a.dni,
        telefono: a.telefono,
        alumnos: a.alumnos,
        estadoCuotas: a.estadoCuotas,
        activo: a.activo,
      }));
  },
  obtenerAsociado: async (id: number): Promise<AsociadoDetalle> => {
    if (isTauri) return invoke<AsociadoDetalle>("obtener_asociado", { id });
    const found = mockAsociados.find((a) => a.id === id);
    if (!found) throw new Error("Asociado no encontrado");
    return found;
  },
  crearAsociado: async (datos: DatosAsociado): Promise<number> => {
    if (isTauri) return invoke<number>("crear_asociado", { datos });
    const id = Date.now();
    const listaAlumnos: AlumnoItem[] = datos.alumnos
      .filter((a) => a.nombre.trim().length > 0)
      .map((a, idx) => ({ id: id + idx + 1, nombre: a.nombre.trim(), curso: a.curso.trim() }));
    const alumnosStr = listaAlumnos.map((a) => `${a.nombre} (${a.curso})`).join(", ");

    const nuevo: AsociadoDetalle = {
      id,
      apellidoNombre: datos.apellidoNombre.trim(),
      dni: datos.dni.trim(),
      telefono: datos.telefono?.trim() || null,
      email: datos.email?.trim() || null,
      fechaAlta: new Date().toISOString().split("T")[0],
      alumnos: alumnosStr || null,
      listaAlumnos,
      estadoCuotas: "Con deuda",
      exento: 0,
      activo: 1,
    };
    mockAsociados.push(nuevo);
    return id;
  },
  actualizarAsociado: async (id: number, datos: DatosAsociado): Promise<void> => {
    if (isTauri) return invoke<void>("actualizar_asociado", { id, datos });
    const idx = mockAsociados.findIndex((a) => a.id === id);
    if (idx >= 0) {
      const listaAlumnos: AlumnoItem[] = datos.alumnos
        .filter((a) => a.nombre.trim().length > 0)
        .map((a, i) => ({ id: id + i + 1, nombre: a.nombre.trim(), curso: a.curso.trim() }));
      const alumnosStr = listaAlumnos.map((a) => `${a.nombre} (${a.curso})`).join(", ");

      mockAsociados[idx] = {
        ...mockAsociados[idx],
        apellidoNombre: datos.apellidoNombre.trim(),
        dni: datos.dni.trim(),
        telefono: datos.telefono?.trim() || null,
        email: datos.email?.trim() || null,
        alumnos: alumnosStr || null,
        listaAlumnos,
      };
    }
  },
  marcarExento: async (id: number, exento: boolean): Promise<void> => {
    if (isTauri) return invoke<void>("marcar_exento", { id, exento });
    const a = mockAsociados.find((x) => x.id === id);
    if (a) {
      a.exento = exento ? 1 : 0;
      a.estadoCuotas = exento ? "Exento" : "Al día";
    }
  },
  darDeBaja: async (id: number): Promise<void> => {
    if (isTauri) return invoke<void>("dar_de_baja", { id });
    const a = mockAsociados.find((x) => x.id === id);
    if (a) a.activo = 0;
  },
  reactivarAsociado: async (id: number): Promise<void> => {
    if (isTauri) return invoke<void>("reactivar_asociado", { id });
    const a = mockAsociados.find((x) => x.id === id);
    if (a) a.activo = 1;
  },

  // Cuotas y Pagos
  listarPagos: async (busqueda = "", periodo = "Todos"): Promise<PagoFila[]> => {
    if (isTauri) return invoke<PagoFila[]>("listar_pagos", { busqueda, periodo });
    return mockPagos.filter((p) => {
      const matchPeriodo = periodo === "Todos" || !periodo || p.periodo === periodo;
      const matchBusqueda = !busqueda || p.apellidoNombre.toLowerCase().includes(busqueda.toLowerCase()) || p.dni.includes(busqueda) || (p.comprobante && p.comprobante.includes(busqueda));
      return matchPeriodo && matchBusqueda;
    });
  },
  obtenerHistorialPagosAsociado: async (asociadoId: number): Promise<PagoFila[]> => {
    if (isTauri) return invoke<PagoFila[]>("obtener_historial_pagos_asociado", { asociadoId });
    return mockPagos.filter((p) => p.asociadoId === asociadoId);
  },
  registrarPago: async (datos: DatosPago): Promise<number> => {
    if (isTauri) return invoke<number>("registrar_pago", { datos });
    const id = Date.now();
    const asociado = mockAsociados.find((a) => a.id === datos.asociadoId);
    const nombre = asociado ? asociado.apellidoNombre : "Asociado";
    const nuevoPago: PagoFila = {
      id,
      asociadoId: datos.asociadoId,
      apellidoNombre: nombre,
      dni: asociado ? asociado.dni : "",
      periodo: datos.periodo,
      fechaPago: new Date().toISOString().split("T")[0],
      monto: datos.monto,
      medio: datos.medio,
      comprobante: datos.comprobante || `REC-${id.toString().slice(-4)}`,
      registradoPor: "Usuario Actual",
    };
    mockPagos.unshift(nuevoPago);

    // Actualizar estado cuotas del asociado
    if (asociado) {
      asociado.estadoCuotas = "Al día";
    }

    // Formatear período legible: "2026-10" -> "Mes 10/26", "2026" -> "Anual 2026"
    let periodoFmt = datos.periodo;
    if (datos.periodo.length === 7 && datos.periodo.includes("-")) {
      const [yyyy, mm] = datos.periodo.split("-");
      periodoFmt = `Mes ${mm}/${yyyy.slice(2)}`;
    } else if (datos.periodo.length === 4) {
      periodoFmt = `Anual ${datos.periodo}`;
    }

    // Registrar en caja
    mockMovimientos.unshift({
      id: Date.now() + 1,
      fecha: nuevoPago.fechaPago,
      tipo: "Ingreso",
      categoria: "Cuotas",
      descripcion: `Asociado N° ${datos.asociadoId} - ${periodoFmt}\n${nombre}`,
      monto: datos.monto,
      comprobante: nuevoPago.comprobante,
      anulado: 0,
    });

    return id;
  },

  // Caja
  listarMovimientosCaja: async (tipo = "Todos", categoria = "Todas", busqueda = ""): Promise<MovimientoCajaFila[]> => {
    if (isTauri) return invoke<MovimientoCajaFila[]>("listar_movimientos_caja", { tipo, categoria, busqueda });
    return mockMovimientos.filter((m) => {
      const matchTipo = tipo === "Todos" || m.tipo === tipo;
      const matchCat = categoria === "Todas" || m.categoria === categoria;
      const matchBusqueda = !busqueda || m.descripcion.toLowerCase().includes(busqueda.toLowerCase()) || (m.comprobante && m.comprobante.toLowerCase().includes(busqueda.toLowerCase()));
      return matchTipo && matchCat && matchBusqueda;
    });
  },
  resumenCaja: async (): Promise<ResumenCaja> => {
    if (isTauri) return invoke<ResumenCaja>("resumen_caja");
    const activos = mockMovimientos.filter((m) => m.anulado === 0);
    const ingresos = activos.filter((m) => m.tipo === "Ingreso").reduce((acc, m) => acc + m.monto, 0);
    const egresos = activos.filter((m) => m.tipo === "Egreso").reduce((acc, m) => acc + m.monto, 0);
    return {
      saldoActual: ingresos - egresos,
      ingresosMes: ingresos,
      egresosMes: egresos,
      totalMovimientos: activos.length,
    };
  },
  crearMovimientoCaja: async (datos: DatosMovimientoCaja): Promise<number> => {
    if (isTauri) return invoke<number>("crear_movimiento_caja", { datos });
    const id = Date.now();
    mockMovimientos.unshift({
      id,
      fecha: new Date().toISOString().split("T")[0],
      tipo: datos.tipo,
      categoria: datos.categoria,
      descripcion: datos.descripcion,
      monto: datos.monto,
      comprobante: datos.comprobante || null,
      anulado: 0,
    });
    return id;
  },
  anularMovimientoCaja: async (id: number, motivo?: string): Promise<void> => {
    if (isTauri) return invoke<void>("anular_movimiento_caja", { id, motivo: motivo || null });
    const m = mockMovimientos.find((x) => x.id === id);
    if (m) {
      m.anulado = 1;
      m.motivoAnulacion = motivo || "Anulado por tesorería / administración";
    }
  },

  // Reuniones
  listarReuniones: async (): Promise<ReunionFila[]> => {
    if (isTauri) return invoke<ReunionFila[]>("listar_reuniones");
    return mockReuniones;
  },
  crearReunion: async (datos: DatosReunion): Promise<number> => {
    if (isTauri) return invoke<number>("crear_reunion", { datos });
    const id = Date.now();
    mockReuniones.unshift({
      id,
      fecha: datos.fecha,
      tipo: datos.tipo,
      temas: datos.temas,
      acta: null,
      asistentesCount: 0,
    });
    return id;
  },
  guardarActa: async (id: number, acta: string, archivoAdjunto?: string): Promise<void> => {
    if (isTauri) return invoke<void>("guardar_acta", { id, acta, archivoAdjunto: archivoAdjunto || null });
    const r = mockReuniones.find((x) => x.id === id);
    if (r) {
      r.acta = acta;
      if (archivoAdjunto !== undefined) r.archivoAdjunto = archivoAdjunto;
    }
  },

  // Rendiciones
  listarRendiciones: async (): Promise<RendicionFila[]> => {
    if (isTauri) return invoke<RendicionFila[]>("listar_rendiciones");
    return mockRendiciones;
  },
  crearRendicion: async (datos: DatosRendicion): Promise<number> => {
    if (isTauri) return invoke<number>("crear_rendicion", { datos });
    const id = Date.now();
    mockRendiciones.unshift({
      id,
      periodo: datos.periodo,
      desde: datos.desde,
      hasta: datos.hasta,
      generadaEn: new Date().toLocaleString("es-AR"),
      generadaPor: "Usuario Actual",
      estado: "Borrador",
      aprobadaPor: null,
      aprobadaEn: null,
      totalIngresos: 241000,
      totalEgresos: 70400,
      saldoPeriodo: 170600,
    });
    return id;
  },
  aprobarRendicion: async (id: number): Promise<void> => {
    if (isTauri) return invoke<void>("aprobar_rendicion", { id });
    const r = mockRendiciones.find((x) => x.id === id);
    if (r) {
      r.estado = "Aprobada";
      r.aprobadaPor = "Presidente";
      r.aprobadaEn = new Date().toLocaleString("es-AR");
    }
  },
  eliminarRendicion: async (id: number): Promise<void> => {
    if (isTauri) return invoke<void>("eliminar_rendicion", { id });
    mockRendiciones = mockRendiciones.filter((x) => x.id !== id);
  },

  // Usuarios
  listarUsuarios: async (): Promise<UsuarioFila[]> => {
    if (isTauri) return invoke<UsuarioFila[]>("listar_usuarios");
    return mockUsuarios;
  },
  crearUsuario: async (datos: DatosUsuario): Promise<number> => {
    if (isTauri) return invoke<number>("crear_usuario", { datos });
    const id = Date.now();
    mockUsuarios.push({
      id,
      nombre: datos.nombre,
      dni: datos.dni,
      email: datos.email || null,
      rol: datos.rol,
      activo: 1,
    });
    return id;
  },
  actualizarUsuario: async (id: number, datos: DatosUsuario): Promise<void> => {
    if (isTauri) return invoke<void>("actualizar_usuario", { id, datos });
    const u = mockUsuarios.find((x) => x.id === id);
    if (u) {
      u.nombre = datos.nombre;
      u.dni = datos.dni;
      u.email = datos.email || null;
      u.rol = datos.rol;
    }
  },
  cambiarEstadoUsuario: async (id: number, activo: boolean): Promise<void> => {
    if (isTauri) return invoke<void>("cambiar_estado_usuario", { id, activo });
    const u = mockUsuarios.find((x) => x.id === id);
    if (u) u.activo = activo ? 1 : 0;
  },

  // Respaldo y Configuración
  crearCopiaSeguridad: async (): Promise<ResultadoBackup> => {
    if (isTauri) return invoke<ResultadoBackup>("crear_copia_seguridad");
    const name = `cooperar_backup_${Date.now()}.db`;
    mockCopias.unshift({
      nombreArchivo: name,
      fecha: new Date().toLocaleString("es-AR"),
      tamanoBytes: 61440,
    });
    mockConfiguracion.ultima_copia = new Date().toLocaleString("es-AR");
    return {
      creado: true,
      archivo: name,
      mensaje: `✓ Copia de seguridad creada con éxito: ${name}`,
    };
  },
  listarCopiasSeguridad: async (): Promise<CopiaSeguridadFila[]> => {
    if (isTauri) return invoke<CopiaSeguridadFila[]>("listar_copias_seguridad");
    return mockCopias;
  },
  restaurarCopiaSeguridad: async (archivo: string): Promise<string> => {
    if (isTauri) return invoke<string>("restaurar_copia_seguridad", { archivo });
    return `Base de datos restaurada correctamente desde ${archivo}`;
  },
  obtenerConfiguracion: async (clave: string): Promise<string | null> => {
    if (isTauri) return invoke<string | null>("obtener_configuracion", { clave });
    return mockConfiguracion[clave] || null;
  },
  guardarConfiguracion: async (clave: string, valor: string): Promise<void> => {
    if (isTauri) return invoke<void>("guardar_configuracion", { clave, valor });
    mockConfiguracion[clave] = valor;
  },
  obtenerRutaDatos: async (): Promise<string> => {
    if (isTauri) return invoke<string>("obtener_ruta_datos");
    return "./datos";
  },

  // Documentación Asambleas y Comisión Directiva
  listarComisionDirectiva: async (): Promise<MiembroComisionFila[]> => {
    if (isTauri) return invoke<MiembroComisionFila[]>("listar_comision_directiva");
    return [
      { id: 1, orden: 1, cargo: "PRESIDENTE", nombre: "Carlos Gómez", dni: "20000002", cuil: "20-20000002-3", domicilio: "Av. San Martín 1420", localidad: "Morón", telefono: "11-4567-1111", email: "carlos.gomez@email.com", vencimiento: "31/12/2027" },
      { id: 2, orden: 2, cargo: "VICEPRESIDENTE", nombre: "Valeria Fernández", dni: "29888777", cuil: "27-29888777-4", domicilio: "Belgrano 450", localidad: "Morón", telefono: "11-9876-2222", email: "valeria.fernandez@email.com", vencimiento: "31/12/2027" },
      { id: 3, orden: 3, cargo: "SECRETARIO", nombre: "Mariana López", dni: "30000003", cuil: "27-30000003-8", domicilio: "Mitre 830", localidad: "Morón", telefono: "11-6677-3333", email: "mariana.lopez@email.com", vencimiento: "31/12/2027" },
      { id: 4, orden: 4, cargo: "TESORERO", nombre: "Roberto Fernández", dni: "40000004", cuil: "20-40000004-1", domicilio: "Sarmiento 112", localidad: "Morón", telefono: "11-3344-4444", email: "roberto.fernandez@email.com", vencimiento: "31/12/2027" },
      { id: 5, orden: 5, cargo: "VOCAL TITULAR 1°", nombre: "Marcos Álvarez", dni: "32111222", cuil: "20-32111222-6", domicilio: "Rivadavia 310", localidad: "Morón", telefono: "11-4567-5555", email: "marcos.alvarez@email.com", vencimiento: "31/12/2027" },
      { id: 6, orden: 6, cargo: "VOCAL TITULAR 2°", nombre: "Elena Sánchez", dni: "27999111", cuil: "27-27999111-5", domicilio: "Caseros 650", localidad: "Morón", telefono: "11-8899-6666", email: "elena.sanchez@email.com", vencimiento: "31/12/2027" },
      { id: 7, orden: 7, cargo: "VOCAL TITULAR 3°", nombre: "Pablo Romero", dni: "30111444", cuil: "20-30111444-2", domicilio: "Alsina 920", localidad: "Morón", telefono: "11-7788-7777", email: "pablo.romero@email.com", vencimiento: "31/12/2027" },
      { id: 8, orden: 8, cargo: "VOCAL SUPLENTE 1°", nombre: "Diego Martínez", dni: "28777666", cuil: "20-28777666-9", domicilio: "Brown 710", localidad: "Morón", telefono: "11-3344-8888", email: "diego.martinez@email.com", vencimiento: "31/12/2027" },
      { id: 9, orden: 9, cargo: "VOCAL SUPLENTE 2°", nombre: "Laura Rodríguez", dni: "33444555", cuil: "27-33444555-0", domicilio: "Salta 184", localidad: "Morón", telefono: "11-5566-9999", email: "laura.rodriguez@email.com", vencimiento: "31/12/2027" },
      { id: 10, orden: 10, cargo: "VOCAL SUPLENTE 3°", nombre: "Santiago Gómez", dni: "34555666", cuil: "20-34555666-3", domicilio: "Jujuy 530", localidad: "Morón", telefono: "11-2233-0000", email: "santiago.gomez@email.com", vencimiento: "31/12/2027" },
      { id: 11, orden: 11, cargo: "REV. CTAS. TITULAR 1°", nombre: "Patricia Benítez", dni: "24111333", cuil: "27-24111333-2", domicilio: "Colón 230", localidad: "Morón", telefono: "11-4455-1234", email: "patricia.benitez@email.com", vencimiento: "31/12/2027" },
      { id: 12, orden: 12, cargo: "REV. CTAS. TITULAR 2°", nombre: "Gonzalo Morales", dni: "26555444", cuil: "20-26555444-7", domicilio: "25 de Mayo 415", localidad: "Morón", telefono: "11-5566-2345", email: "gonzalo.morales@email.com", vencimiento: "31/12/2027" },
      { id: 13, orden: 13, cargo: "REV. CTAS. TITULAR DOC.", nombre: "Claudia Navarro", dni: "23888999", cuil: "27-23888999-6", domicilio: "Sucre 890", localidad: "Morón", telefono: "11-6677-3456", email: "claudia.navarro@email.com", vencimiento: "31/12/2027" },
      { id: 14, orden: 14, cargo: "REV. CTAS. SUPLENTE 1°", nombre: "Federico Castro", dni: "31777888", cuil: "20-31777888-4", domicilio: "Maza 1040", localidad: "Morón", telefono: "11-7788-4567", email: "federico.castro@email.com", vencimiento: "31/12/2027" },
      { id: 15, orden: 15, cargo: "REV. CTAS. SUPLENTE DOC.", nombre: "Silvia Peralta", dni: "22444111", cuil: "27-22444111-9", domicilio: "Chacabuco 312", localidad: "Morón", telefono: "11-8899-5678", email: "silvia.peralta@email.com", vencimiento: "31/12/2027" },
      { id: 16, orden: 16, cargo: "ASESOR", nombre: "Director/a Escolar", dni: "18000000", cuil: "27-18000000-5", domicilio: "Directorio 500", localidad: "Morón", telefono: "11-4629-0000", email: "escuela12@educacion.gob.ar", vencimiento: "31/12/2027" },
    ];
  },

  guardarMiembroComision: async (miembro: MiembroComisionFila): Promise<void> => {
    if (isTauri) return invoke<void>("guardar_miembro_comision", { miembro });
  },

  listarPersonalEstablecimiento: async (): Promise<PersonalEstablecimientoFila[]> => {
    if (isTauri) return invoke<PersonalEstablecimientoFila[]>("listar_personal_establecimiento");
    return [
      { id: 1, cargo: "Director/a", nombre: "Prof. Martín Valenzuela", dni: "18000000", telefono: "11-4629-0000", email: "escuela12@educacion.gob.ar", vinculoNomina: "ASESOR" },
      { id: 2, cargo: "Vicedirector/a", nombre: "Lic. Andrea Benítez", dni: "21333444", telefono: "11-4629-0001", email: "andrea.benitez@educacion.gob.ar", vinculoNomina: "NINGUNO" },
      { id: 3, cargo: "Secretario/a Escolar", nombre: "Prof. Esteban Quispe", dni: "23111222", telefono: "11-4629-0002", email: "esteban.quispe@educacion.gob.ar", vinculoNomina: "NINGUNO" },
      { id: 4, cargo: "Docente de Grado", nombre: "Claudia Navarro", dni: "23888999", telefono: "11-6677-3456", email: "claudia.navarro@email.com", vinculoNomina: "REV_CTAS_DOC_TIT" },
      { id: 5, cargo: "Docente de Grado", nombre: "Silvia Peralta", dni: "22444111", telefono: "11-8899-5678", email: "silvia.peralta@email.com", vinculoNomina: "REV_CTAS_DOC_SUP" },
    ];
  },

  guardarPersonalEstablecimiento: async (p: PersonalEstablecimientoFila): Promise<PersonalEstablecimientoFila> => {
    if (isTauri) return invoke<PersonalEstablecimientoFila>("guardar_personal_establecimiento", { p });
    return { ...p, id: p.id || Date.now() };
  },

  eliminarPersonalEstablecimiento: async (id: number): Promise<void> => {
    if (isTauri) return invoke<void>("eliminar_personal_establecimiento", { id });
  },

  listarDocumentosAsambleas: async (): Promise<DocumentoAsambleaFila[]> => {
    if (isTauri) return invoke<DocumentoAsambleaFila[]>("listar_documentos_asambleas");
    return [
      {
        id: 1,
        tipo: "NOMINA_COMISION",
        titulo: "Nómina Comisión Directiva Ejercicio 2026",
        periodo: "2026",
        fechaGeneracion: "2026-10-01 10:30",
        generadoPor: "Carlos Gómez",
        archivoPdf: "nomina_comision_2026.pdf",
        datosJson: JSON.stringify({
          ejercicio: "2026",
          distrito: "Morón",
          escuela: "E.P. N° 12",
          asociacion: "Asoc. Cooperadora Escuela Primaria N° 12",
          totalCargos: 16,
        }),
      },
      {
        id: 2,
        tipo: "PIA_COOPERADORA",
        titulo: "Planilla de Información Anual (P.I.A.) 2025/2026",
        periodo: "2026",
        fechaGeneracion: "2026-10-10 14:15",
        generadoPor: "Roberto Fernández",
        archivoPdf: "pia_cooperadoras_2026.pdf",
        datosJson: JSON.stringify({
          ejercicio: "2026",
          distrito: "Morón",
          escuela: "E.P. N° 12",
          cue: "060123400",
          saldoInicial: 150000,
          cuotas: 480000,
          subsidios: 250000,
        }),
      },
    ];
  },

  guardarDocumentoAsamblea: async (params: GuardarDocumentoParams): Promise<DocumentoAsambleaFila> => {
    if (isTauri) return invoke<DocumentoAsambleaFila>("guardar_documento_asamblea", { params });
    return {
      id: Date.now(),
      tipo: params.tipo,
      titulo: params.titulo,
      periodo: params.periodo,
      fechaGeneracion: new Date().toLocaleString("es-AR"),
      generadoPor: "Usuario",
      archivoPdf: `${params.tipo.toLowerCase()}_${Date.now()}.pdf`,
      datosJson: params.datosJson,
    };
  },

  eliminarDocumentoAsamblea: async (id: number): Promise<void> => {
    if (isTauri) return invoke<void>("eliminar_documento_asamblea", { id });
  },

  leerArchivoDocumento: async (archivoPdf: string): Promise<string> => {
    if (isTauri) return invoke<string>("leer_archivo_documento", { archivoPdf });
    return "";
  },

  exportarPdfEscritorio: async (nombreArchivo: string, pdfBytesBase64: string): Promise<string> => {
    if (isTauri) return invoke<string>("exportar_pdf_escritorio", { nombreArchivo, pdfBytesBase64 });
    return "C:/Users/Usuario/Desktop/Cooperar Documentos/" + nombreArchivo;
  },

  guardarPdfEnRuta: async (rutaDestino: string, pdfBytesBase64: string): Promise<string> => {
    if (isTauri) return invoke<string>("guardar_pdf_en_ruta", { rutaDestino, pdfBytesBase64 });
    return rutaDestino;
  },

  obtenerDatosInstitucionales: async (): Promise<DatosInstitucionales> => {
    const keys = [
      "distrito", "numero_escuela", "nombre_escuela", "asociacion_nombre",
      "cue", "cuit", "domicilio_escuela", "barrio", "localidad",
      "telefono_escuela", "email_institucional", "banco_nombre",
      "banco_sucursal", "cuenta_corriente", "cbu", "alias",
      "cuota_mensual", "cuota_anual", "logo_cooperadora"
    ];
    const res: Record<string, string> = {};
    for (const k of keys) {
      const v = await api.obtenerConfiguracion(k);
      res[k] = v || "";
    }
    return {
      distrito: res.distrito || "Morón",
      numeroEscuela: res.numero_escuela || "E.P. N° 12",
      nombreEscuela: res.nombre_escuela || "General José de San Martín",
      asociacionNombre: res.asociacion_nombre || "Asoc. Cooperadora Escuela Primaria N° 12",
      cue: res.cue || "060123400",
      cuit: res.cuit || "30-67891234-9",
      domicilioEscuela: res.domicilio_escuela || "Nuestra Señora del Buen Viaje 450",
      barrio: res.barrio || "Centro",
      localidad: res.localidad || "Morón",
      telefonoEscuela: res.telefono_escuela || "011-4629-1234",
      emailInstitucional: res.email_institucional || "cooperadora.ep12.moron@gmail.com",
      bancoNombre: res.banco_nombre || "Banco de la Provincia de Buenos Aires",
      bancoSucursal: res.banco_sucursal || "Sucursal 5012 - Morón",
      cuentaCorriente: res.cuenta_corriente || "5012-12345/6",
      cbu: res.cbu || "0140012301501201234567",
      alias: res.alias || "COOP.EP12.MORON",
      cuotaMensual: res.cuota_mensual || "8000",
      cuotaAnual: res.cuota_anual || "80000",
      logoBase64: res.logo_cooperadora || "",
    };
  },

  guardarDatosInstitucionales: async (datos: DatosInstitucionales): Promise<void> => {
    const mapping: Record<string, string> = {
      distrito: datos.distrito,
      numero_escuela: datos.numeroEscuela,
      nombre_escuela: datos.nombreEscuela,
      asociacion_nombre: datos.asociacionNombre,
      cue: datos.cue,
      cuit: datos.cuit,
      domicilio_escuela: datos.domicilioEscuela,
      barrio: datos.barrio,
      localidad: datos.localidad,
      telefono_escuela: datos.telefonoEscuela,
      email_institucional: datos.emailInstitucional,
      banco_nombre: datos.bancoNombre,
      banco_sucursal: datos.bancoSucursal,
      cuenta_corriente: datos.cuentaCorriente,
      cbu: datos.cbu,
      alias: datos.alias,
      cuota_mensual: datos.cuotaMensual,
      cuota_anual: datos.cuotaAnual,
      logo_cooperadora: datos.logoBase64 || "",
    };
    for (const [k, v] of Object.entries(mapping)) {
      await api.guardarConfiguracion(k, v);
    }
  },
};


export const money = (n: number) => `$ ${n.toLocaleString("es-AR")}`;
export const signedMoney = (tipo: string, n: number) => `${tipo === "Ingreso" ? "+" : "-"} ${money(n)}`;