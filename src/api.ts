// src/api.ts
import { invoke } from "@tauri-apps/api/core";

export type Rol = "Presidente" | "Secretaria" | "Tesorero" | "Superadmin" | "Asesor";
export interface Usuario { id: number; nombre: string; rol: Rol }
export interface Movimiento { descripcion: string; tipo: "Ingreso" | "Egreso"; monto: number }
export interface ResumenInicio {
  saldoCaja: number;
  /** Bonos anuales del año corriente ya abonados (familias distintas) */
  bonosCobrados: number;
  /** Asociados activos: familias a las que se les ofrece el bono */
  bonosTotal: number;
  /** Familias que abonaron los materiales del año corriente */
  materialesCobrados: number;
  proximaReunion: string | null;
  ultimosMovimientos: Movimiento[];
  ultimaCopia: string | null;
}
export interface AuditoriaFila {
  id: number;
  usuario: string;
  fechaHora: string;
  accion: string;
  entidad: string;
  entidadId: number | null;
  /** Detalle legible del cambio (valor anterior → nuevo), cuando aplica */
  detalle?: string | null;
}
export interface ResumenPadron { activos: number; colaboraron: number; noColaboraron: number }
/** El bono es colaborativo: no existe deuda ni exención, sólo consta si la familia colaboró en el año */
export type EstadoColaboracion = "Colaboró" | "No colaboró";

/** Conceptos del bono contribución */
export type ConceptoPago = "BONO_ANUAL" | "MATERIALES";

export const CONCEPTOS: { value: ConceptoPago; label: string }[] = [
  { value: "BONO_ANUAL", label: "Bono contribución anual" },
  { value: "MATERIALES", label: "Bono contribución materiales" },
];

/** Etiqueta legible del concepto, incluidos los registros históricos de cuota mensual */
export const etiquetaConcepto = (concepto: string) => {
  if (concepto === "BONO_ANUAL") return "Bono contribución anual";
  if (concepto === "MATERIALES") return "Bono contribución materiales";
  return "Cuota social (histórico)";
};

export interface AsociadoFila {
  id: number;
  apellidoNombre: string;
  dni: string;
  telefono: string | null;
  email: string | null;
  alumnos: string | null;
  cantidadAlumnos: number;
  tieneHermanos: number;
  estadoColaboracion: EstadoColaboracion;
  /** 1 si la familia abonó el bono de la cooperadora del año corriente */
  bonoAnualPagado: number;
  /** 1 si la familia abonó el bono de materiales del año corriente */
  materialesPagado: number;
  activo: number;
  tipoVinculo: string;
  fechaAlta: string;
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
  cantidadAlumnos: number;
  listaAlumnos: AlumnoItem[];
  estadoColaboracion: EstadoColaboracion;
  /** 1 si la familia abonó el bono anual del año corriente */
  bonoAnualPagado: number;
  /** 1 si la familia abonó el bono de materiales del año corriente */
  materialesPagado: number;
  tieneHermanos: number;
  activo: number;
  tipoVinculo: string;
}

export interface DatosAsociado {
  apellidoNombre: string;
  dni: string;
  telefono?: string;
  email?: string;
  tipoVinculo: string;
  /** AAAA-MM-DD. En el alta, omitirla usa la fecha del día; en la edición conserva la registrada. */
  fechaAlta?: string;
  alumnos: { nombre: string; curso: string }[];
}

export interface Filtros { busqueda: string; estadoColaboracion: string; estado: string }

// Cuotas y Pagos (bono contribución)
export interface PagoFila {
  id: number;
  asociadoId: number;
  apellidoNombre: string;
  dni: string;
  /** Año lectivo del bono */
  periodo: string;
  concepto: string;
  fechaPago: string;
  monto: number;
  medio: string;
  comprobante: string | null;
  registradoPor: string;
  registradoPorRol?: string;
  registradoPorNombre?: string;
  movimientoId?: number | null;
  adjuntoNombre?: string | null;
  /** Nota libre cargada al registrar el bono */
  observaciones?: string | null;
}

export interface DatosPago {
  asociadoId: number;
  /** Año lectivo del bono (corriente o entrante) */
  periodo: string;
  concepto: ConceptoPago;
  monto: number;
  medio: string;
  comprobante?: string;
  adjuntoNombre?: string;
  adjuntoDatos?: string;
  observaciones?: string;
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
  adjuntoNombre?: string | null;
  registradoPor?: string | null;
  /** Fecha y hora de carga en el sistema; `fecha` es la fecha real de la operación */
  registradoEn?: string | null;
}

export interface DatosMovimientoCaja {
  tipo: "Ingreso" | "Egreso";
  categoria: string;
  descripcion: string;
  monto: number;
  comprobante?: string;
  adjuntoNombre?: string;
  adjuntoDatos?: string;
  /** AAAA-MM-DD; si se omite, el núcleo usa la fecha del día */
  fecha?: string;
}

export interface AdjuntoMovimiento {
  nombre: string;
  dataUrl: string;
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

export interface DecisionActa {
  orden: number;
  descripcion: string;
  resultado: "APROBADO" | "DESAPROBADO";
  observacion: string;
}

export interface CuadroFinancieroActa {
  cuotaSocial: string;
  donacionDinero: string;
  rifas: string;
  festivales: string;
  kiosco: string;
  interesesBancarios: string;
  reintegradosBanco: string;
  subsidiosDgcye: string;
  otrosIngresosA: string;
  otrosIngresosB: string;
  totalEntradas: string;
  resumenTotalEntradas: string;
  saldoEjercicioAnterior: string;
  totalGeneral: string;
  totalSalidasResumen: string;
  saldoProximoEjercicio: string;
  cuentaCorriente: string;
  plazoFijoBanco: string;
  dineroEfectivo: string;
  ropaCalzado: string;
  librosUtiles: string;
  excursiones: string;
  emergenciasSanitarias: string;
  golosinasPremiosMedallas: string;
  gastosAlumnoF: string;
  gastosAlumnoG: string;
  materialDidactico: string;
  mantSubsidios: string;
  mantFondosPropios: string;
  articulosLimpieza: string;
  combustibleCalefaccion: string;
  libreria: string;
  mobiliario: string;
  gastosEscuelaH: string;
  gastosEscuelaI: string;
  organizacionRifas: string;
  organizacionFestivales: string;
  kioscoEntidad: string;
  gastosEntidadD: string;
  gastosEntidadE: string;
  gastosAdministrativos: string;
  otrosEgresos: string;
  totalSalidasPlazoFijo: string;
  poseeKiosco: boolean;
  kioscoPropio: boolean;
  kioscoLicitado: boolean;
  contratoDesde: string;
  contratoHasta: string;
}

export interface ActaFila {
  id: number;
  reunionId: number | null;
  tipo: string;
  numero: string;
  foja: string;
  fechaAsamblea: string;
  sociosActivosAsistentes: number;
  periodoDesde: string;
  periodoHasta: string;
  cuotaSocial: number;
  cuotaPeriodicidad: "Mensual" | "Anual";
  cajaChica: number;
  cuadroFinanciero: CuadroFinancieroActa;
  observaciones?: string;
  archivoAdjunto: string | null;
  estado: "Borrador" | "Firmada";
  decisiones: DecisionActa[];
}

export interface DatosActa {
  id?: number;
  /** Estado del acta cuando se edita una existente (Borrador | Firmada) */
  estado?: "Borrador" | "Firmada";
  reunionId?: number | null;
  tipo: string;
  numero: string;
  foja: string;
  fechaAsamblea: string;
  sociosActivosAsistentes: number;
  periodoDesde: string;
  periodoHasta: string;
  cuotaSocial: number;
  cuotaPeriodicidad: "Mensual" | "Anual";
  cajaChica: number;
  cuadroFinanciero: CuadroFinancieroActa;
  observaciones?: string;
  archivoAdjunto?: string | null;
  decisiones: DecisionActa[];
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
  /** Última vez que el detalle se recalculó por cambios en la caja del período */
  actualizadaEn?: string | null;
  totalIngresos: number;
  totalEgresos: number;
  saldoPeriodo: number;
}

export interface LineaRendicion {
  tipo: "Ingreso" | "Egreso";
  categoria: string;
  total: number;
}

export interface MesRendicion {
  /** AAAA-MM */
  mes: string;
  ingresos: number;
  egresos: number;
}

export interface SaldoEjercicioAnterior {
  saldo: number;
  origen: "acta" | "caja" | "sin_datos";
  detalle: string;
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
  personalEstablecimientoId?: number | null;
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
  aprobado: number;
  aprobadoPor: string | null;
  aprobadoEn: string | null;
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
  /** Saldo en cuenta corriente informado por la cooperadora (alimenta el acta y el P.I.A.) */
  saldoCuentaCorriente: string;
  /** Saldo en plazo fijo informado por la cooperadora (alimenta el acta y el P.I.A.) */
  saldoPlazoFijo: string;
  /** Monto de caja chica fijado en la asamblea (lo vuelca el acta) */
  cajaChica: string;
  /** Bono contribución anual por familia */
  bonoAnual: string;
  /** Bono contribución de materiales por alumno */
  materiales: string;
  /** Bono de materiales por alumno para familias con hermanos */
  materialesHermanos: string;
  logoBase64?: string;
}

// Usuarios
export interface UsuarioFila {
  id: number;
  nombre: string;
  dni: string;
  cargo: string | null;
  rol: Rol;
  activo: number;
}

export interface DatosUsuario {
  nombre: string;
  dni: string;
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
  { dni: "18000000", nombre: "Director/a Escolar", rol: "Asesor" as Rol, clave: "admin123" },
];

const isTauri = typeof window !== "undefined" && Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

// In-Memory Mock Store for Browser Preview Mode
/** El detalle por concepto se deriva de los pagos cargados en el preview */
type MockAsociado = Omit<AsociadoDetalle, "bonoAnualPagado" | "materialesPagado">;

let mockAsociados: MockAsociado[] = [
  {
    id: 1, apellidoNombre: "Álvarez, Marcos", dni: "32111222", telefono: "11-4567-8901", email: "marcos.alvarez@email.com",
    fechaAlta: "2026-07-01", alumnos: "Lucía Álvarez (3° A)", cantidadAlumnos: 1, listaAlumnos: [{ id: 1, nombre: "Lucía Álvarez", curso: "3° A" }],
    estadoColaboracion: "Colaboró", tieneHermanos: 0, activo: 1, tipoVinculo: "PADRE_TUTOR",
  },
  {
    id: 2, apellidoNombre: "Fernández, Valeria", dni: "29888777", telefono: "11-9876-5432", email: "valeria.fernandez@email.com",
    fechaAlta: "2026-04-01", alumnos: "Mateo Fernández (5° B), Sofía Fernández (1° A)", cantidadAlumnos: 2, listaAlumnos: [{ id: 2, nombre: "Mateo Fernández", curso: "5° B" }, { id: 3, nombre: "Sofía Fernández", curso: "1° A" }],
    estadoColaboracion: "Colaboró", tieneHermanos: 1, activo: 1, tipoVinculo: "PADRE_TUTOR",
  },
  {
    id: 3, apellidoNombre: "Gómez, Santiago", dni: "34555666", telefono: "11-2233-4455", email: "santiago.gomez@email.com",
    fechaAlta: "2025-10-01", alumnos: "Ignacio Gómez (2° C)", cantidadAlumnos: 1, listaAlumnos: [{ id: 4, nombre: "Ignacio Gómez", curso: "2° C" }],
    estadoColaboracion: "No colaboró", tieneHermanos: 0, activo: 1, tipoVinculo: "SIN_VINCULO",
  },
  {
    id: 4, apellidoNombre: "López, Mariana", dni: "31222333", telefono: "11-6677-8899", email: "mariana.lopez@email.com",
    fechaAlta: "2026-08-01", alumnos: "Camila López (4° A)", cantidadAlumnos: 1, listaAlumnos: [{ id: 5, nombre: "Camila López", curso: "4° A" }],
    estadoColaboracion: "Colaboró", tieneHermanos: 0, activo: 1, tipoVinculo: "PERSONAL_ESCOLAR",
  },
  {
    id: 5, apellidoNombre: "Martínez, Diego", dni: "28777666", telefono: "11-3344-5566", email: "diego.martinez@email.com",
    fechaAlta: "2026-05-01", alumnos: "Tomás Martínez (6° B)", cantidadAlumnos: 1, listaAlumnos: [{ id: 6, nombre: "Tomás Martínez", curso: "6° B" }],
    estadoColaboracion: "Colaboró", tieneHermanos: 0, activo: 1, tipoVinculo: "PADRE_TUTOR",
  },
  {
    id: 6, apellidoNombre: "Rodríguez, Laura", dni: "33444555", telefono: "11-5566-7788", email: "laura.rodriguez@email.com",
    fechaAlta: "2026-09-01", alumnos: "Benjamín Rodríguez (1° B)", cantidadAlumnos: 1, listaAlumnos: [{ id: 7, nombre: "Benjamín Rodríguez", curso: "1° B" }],
    estadoColaboracion: "Colaboró", tieneHermanos: 0, activo: 1, tipoVinculo: "PADRE_TUTOR",
  },
  {
    id: 7, apellidoNombre: "Romero, Pablo", dni: "30111444", telefono: "11-7788-9900", email: "pablo.romero@email.com",
    fechaAlta: "2026-06-01", alumnos: "Martina Romero (2° A)", cantidadAlumnos: 1, listaAlumnos: [{ id: 8, nombre: "Martina Romero", curso: "2° A" }],
    estadoColaboracion: "No colaboró", tieneHermanos: 0, activo: 1, tipoVinculo: "PADRE_TUTOR",
  },
  {
    id: 8, apellidoNombre: "Sánchez, Elena", dni: "27999111", telefono: "11-8899-0011", email: "elena.sanchez@email.com",
    fechaAlta: "2026-02-01", alumnos: "Joaquín Sánchez (5° A)", cantidadAlumnos: 1, listaAlumnos: [{ id: 9, nombre: "Joaquín Sánchez", curso: "5° A" }],
    estadoColaboracion: "Colaboró", tieneHermanos: 0, activo: 1, tipoVinculo: "PADRE_TUTOR",
  },
];

const MOCK_ANIO = String(new Date().getFullYear());
const mockPago = (
  id: number,
  asociadoId: number,
  apellidoNombre: string,
  dni: string,
  concepto: ConceptoPago,
  monto: number,
  comprobante: string,
  fechaPago: string,
): PagoFila => ({
  id, asociadoId, apellidoNombre, dni, periodo: MOCK_ANIO, concepto, fechaPago, monto,
  medio: "Efectivo", comprobante,
  registradoPor: "Tesorero (Roberto Fernández)", registradoPorRol: "Tesorero", registradoPorNombre: "Roberto Fernández",
});

let mockPagos: PagoFila[] = [
  mockPago(1, 1, "Álvarez, Marcos", "32111222", "BONO_ANUAL", 12000, "BONO-001", `${MOCK_ANIO}-10-04`),
  mockPago(2, 4, "López, Mariana", "31222333", "BONO_ANUAL", 12000, "BONO-002", `${MOCK_ANIO}-10-05`),
  mockPago(3, 5, "Martínez, Diego", "28777666", "BONO_ANUAL", 12000, "BONO-003", `${MOCK_ANIO}-10-05`),
  mockPago(4, 6, "Rodríguez, Laura", "33444555", "BONO_ANUAL", 12000, "BONO-004", `${MOCK_ANIO}-10-06`),
  mockPago(5, 8, "Sánchez, Elena", "27999111", "BONO_ANUAL", 12000, "BONO-005", `${MOCK_ANIO}-10-07`),
  mockPago(6, 1, "Álvarez, Marcos", "32111222", "MATERIALES", 5000, "MAT-001", `${MOCK_ANIO}-10-05`),
  mockPago(7, 2, "Fernández, Valeria", "29888777", "MATERIALES", 8000, "MAT-002", `${MOCK_ANIO}-10-06`),
  mockPago(8, 4, "López, Mariana", "31222333", "MATERIALES", 5000, "MAT-003", `${MOCK_ANIO}-10-07`),
];

const mockAdjuntos: Record<number, AdjuntoMovimiento> = {};

/** ¿La familia abonó ese concepto en el año de la simulación? */
const mockPagoDelAnio = (asociadoId: number, concepto: ConceptoPago) =>
  mockPagos.some((p) => p.asociadoId === asociadoId && p.concepto === concepto && p.periodo === MOCK_ANIO);

const MOCK_CATEGORIA_BONO = "Cuota Social";
let mockMovimientos: MovimientoCajaFila[] = [
  { id: 5, fecha: `${MOCK_ANIO}-10-06`, tipo: "Ingreso", categoria: MOCK_CATEGORIA_BONO, descripcion: "Bono contribución anual del año en curso", monto: 48000, comprobante: "BONO-102", anulado: 0 },
  { id: 4, fecha: `${MOCK_ANIO}-10-04`, tipo: "Egreso", categoria: "Mant. y mejoras con fondos propios", descripcion: "Reparación luminarias patio y pasillos", monto: 45000, comprobante: "FAC-8890", anulado: 0 },
  { id: 3, fecha: `${MOCK_ANIO}-10-02`, tipo: "Ingreso", categoria: "Festivales, actos, quermese", descripcion: "Recaudación kermesse familiar escolar", monto: 185000, comprobante: "ACT-012", anulado: 0 },
  { id: 2, fecha: `${MOCK_ANIO}-09-29`, tipo: "Egreso", categoria: "Artículos de limpieza", descripcion: "Compra de artículos de limpieza y desinfección", monto: 25400, comprobante: "FAC-1102", anulado: 0 },
  { id: 1, fecha: `${MOCK_ANIO}-09-27`, tipo: "Ingreso", categoria: MOCK_CATEGORIA_BONO, descripcion: "Bono contribución de materiales", monto: 56000, comprobante: "MAT-101", anulado: 0 },
];

let mockReuniones: ReunionFila[] = [
  { id: 1, fecha: "2026-10-19", tipo: "Comisión", temas: "Planificación mejoras edilicias de verano, presupuesto pintura y balance de cuotas.", acta: null, asistentesCount: 0 },
  { id: 2, fecha: "2026-09-17", tipo: "Asamblea", temas: "Aprobación de memoria y balance anual. Renovación parcial de autoridades.", acta: "En la ciudad, reunidos los miembros en asamblea ordinaria, se aprueba por unanimidad la memoria y balance del ejercicio anterior. Se ratifican los cargos directivos.", asistentesCount: 18 },
];
let mockActas: ActaFila[] = [];

let mockRendiciones: RendicionFila[] = [
  { id: 1, periodo: "Septiembre 2026", desde: "2026-09-01", hasta: "2026-09-30", generadaEn: "2026-10-01 10:00:00", generadaPor: "Roberto Fernández", estado: "Aprobada", aprobadaPor: "Carlos Gómez", aprobadaEn: "2026-10-02 14:30:00", totalIngresos: 241000, totalEgresos: 70400, saldoPeriodo: 170600 },
];

let mockUsuarios: UsuarioFila[] = [
  { id: 1, nombre: "Administrador General", dni: "10000001", cargo: null, rol: "Superadmin", activo: 1 },
  { id: 2, nombre: "Carlos Gómez", dni: "20000002", cargo: "PRESIDENTE", rol: "Presidente", activo: 1 },
  { id: 3, nombre: "Mariana López", dni: "30000003", cargo: "SECRETARIO", rol: "Secretaria", activo: 1 },
  { id: 4, nombre: "Roberto Fernández", dni: "40000004", cargo: "TESORERO", rol: "Tesorero", activo: 1 },
  { id: 5, nombre: "Director/a Escolar", dni: "18000000", cargo: "ASESOR", rol: "Asesor", activo: 1 },
];

let mockCopias: CopiaSeguridadFila[] = [
  { nombreArchivo: "cooperar_backup_20261007_052000.db", fecha: "2026-10-07 05:20:00", tamanoBytes: 61440 },
];

let mockConfiguracion: Record<string, string> = {
  bono_anual: "12000",
  materiales: "5000",
  materiales_hermanos: "4000",
  saldo_cuenta_corriente: "0",
  saldo_plazo_fijo: "0",
  caja_chica: "0",
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
      bonosCobrados: new Set(mockPagos.filter((p) => p.concepto === "BONO_ANUAL" && p.periodo === MOCK_ANIO).map((p) => p.asociadoId)).size,
      bonosTotal: activos.length,
      materialesCobrados: new Set(mockPagos.filter((p) => p.concepto === "MATERIALES" && p.periodo === MOCK_ANIO).map((p) => p.asociadoId)).size,
      proximaReunion: "19/10 · Comisión",
      ultimosMovimientos: mockMovimientos.slice(0, 4).map((m) => ({ descripcion: m.descripcion, tipo: m.tipo, monto: m.monto })),
      ultimaCopia: mockConfiguracion.ultima_copia || "07/10/2026 05:20",
    };
  },
  listarAuditoria: async (): Promise<AuditoriaFila[]> => {
    if (isTauri) return invoke<AuditoriaFila[]>("listar_auditoria");
    return [];
  },
  resumenPadron: async (): Promise<ResumenPadron> => {
    if (isTauri) return invoke<ResumenPadron>("resumen_padron");
    const activos = mockAsociados.filter((a) => a.activo === 1);
    return {
      activos: activos.length,
      colaboraron: activos.filter((a) => a.estadoColaboracion === "Colaboró").length,
      noColaboraron: activos.filter((a) => a.estadoColaboracion === "No colaboró").length,
    };
  },

  // Asociados
  listarAsociados: async (f: Filtros): Promise<AsociadoFila[]> => {
    if (isTauri) return invoke<AsociadoFila[]>("listar_asociados", { ...f });
    return mockAsociados
      .filter((a) => {
        const matchEstado = f.estado === "Todos" ? true : f.estado === "Activos" || f.estado === "Activo" ? a.activo === 1 : a.activo === 0;
        const matchBusqueda = !f.busqueda || a.apellidoNombre.toLowerCase().includes(f.busqueda.toLowerCase()) || a.dni.includes(f.busqueda);
        const matchColaboracion = f.estadoColaboracion === "Todos" || a.estadoColaboracion === f.estadoColaboracion;
        return matchEstado && matchBusqueda && matchColaboracion;
      })
      .map((a) => ({
        id: a.id,
        apellidoNombre: a.apellidoNombre,
        dni: a.dni,
        telefono: a.telefono,
        email: a.email,
        alumnos: a.alumnos,
        cantidadAlumnos: a.cantidadAlumnos,
        tieneHermanos: a.tieneHermanos,
        estadoColaboracion: a.estadoColaboracion,
        bonoAnualPagado: mockPagoDelAnio(a.id, "BONO_ANUAL") ? 1 : 0,
        materialesPagado: mockPagoDelAnio(a.id, "MATERIALES") ? 1 : 0,
        activo: a.activo,
        tipoVinculo: a.tipoVinculo,
        fechaAlta: a.fechaAlta,
      }));
  },
  obtenerAsociado: async (id: number): Promise<AsociadoDetalle> => {
    if (isTauri) return invoke<AsociadoDetalle>("obtener_asociado", { id });
    const found = mockAsociados.find((a) => a.id === id);
    if (!found) throw new Error("Asociado no encontrado");
    return {
      ...found,
      bonoAnualPagado: mockPagoDelAnio(id, "BONO_ANUAL") ? 1 : 0,
      materialesPagado: mockPagoDelAnio(id, "MATERIALES") ? 1 : 0,
    };
  },
  crearAsociado: async (datos: DatosAsociado): Promise<number> => {
    if (isTauri) return invoke<number>("crear_asociado", { datos });
    const id = Date.now();
    const listaAlumnos: AlumnoItem[] = datos.alumnos
      .filter((a) => a.nombre.trim().length > 0)
      .map((a, idx) => ({ id: id + idx + 1, nombre: a.nombre.trim(), curso: a.curso.trim() }));
    const alumnosStr = listaAlumnos.map((a) => `${a.nombre} (${a.curso})`).join(", ");

    const nuevo: MockAsociado = {
      id,
      apellidoNombre: datos.apellidoNombre.trim(),
      dni: datos.dni.trim(),
      telefono: datos.telefono?.trim() || null,
      email: datos.email?.trim() || null,
      fechaAlta: datos.fechaAlta?.trim() || hoyISO(),
      alumnos: alumnosStr || null,
      cantidadAlumnos: listaAlumnos.length,
      tieneHermanos: listaAlumnos.length > 1 ? 1 : 0,
      listaAlumnos,
      estadoColaboracion: "No colaboró",
      activo: 1,
      tipoVinculo: datos.tipoVinculo,
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
        tipoVinculo: datos.tipoVinculo,
        fechaAlta: datos.fechaAlta?.trim() || mockAsociados[idx].fechaAlta,
        alumnos: alumnosStr || null,
        cantidadAlumnos: listaAlumnos.length,
        tieneHermanos: listaAlumnos.length > 1 ? 1 : 0,
        listaAlumnos,
      };
    }
  },
  darDeBaja: async (id: number): Promise<void> => {
    if (isTauri) return invoke<void>("dar_de_baja", { id });
    const a = mockAsociados.find((x) => x.id === id);
    if (a) a.activo = 0;
  },
  eliminarAsociado: async (id: number): Promise<void> => {
    if (isTauri) return invoke<void>("eliminar_asociado", { id });
    mockAsociados = mockAsociados.filter((a) => a.id !== id);
  },
  reactivarAsociado: async (id: number): Promise<void> => {
    if (isTauri) return invoke<void>("reactivar_asociado", { id });
    const a = mockAsociados.find((x) => x.id === id);
    if (a) a.activo = 1;
  },

  // Cuotas y Pagos (bono contribución)
  listarPagos: async (busqueda = "", anio = "Todos", concepto = "Todos"): Promise<PagoFila[]> => {
    if (isTauri) return invoke<PagoFila[]>("listar_pagos", { busqueda, anio, concepto });
    return mockPagos.filter((p) => {
      const matchAnio = anio === "Todos" || !anio || p.periodo === anio;
      const matchConcepto = concepto === "Todos" || !concepto || p.concepto === concepto;
      const matchBusqueda = !busqueda || p.apellidoNombre.toLowerCase().includes(busqueda.toLowerCase()) || p.dni.includes(busqueda) || (p.comprobante && p.comprobante.includes(busqueda));
      return matchAnio && matchConcepto && matchBusqueda;
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
      concepto: datos.concepto,
      fechaPago: hoyISO(),
      monto: datos.monto,
      medio: datos.medio,
      comprobante: datos.comprobante || `REC-${id.toString().slice(-4)}`,
      registradoPor: "Usuario Actual",
      observaciones: datos.observaciones?.trim() || null,
    };
    mockPagos.unshift(nuevoPago);

    // El bono es colaborativo: sólo se registra que la familia colaboró
    if (asociado) {
      asociado.estadoColaboracion = "Colaboró";
    }

    const alumnos = asociado ? asociado.cantidadAlumnos : 0;
    const detalleAlumnos = datos.concepto === "MATERIALES"
      ? ` (${Math.max(alumnos, 1)} ${alumnos === 1 ? "alumno" : "alumnos"})`
      : "";

    // Registrar en caja
    mockMovimientos.unshift({
      id: Date.now() + 1,
      fecha: nuevoPago.fechaPago,
      tipo: "Ingreso",
      categoria: MOCK_CATEGORIA_BONO,
      descripcion: `Asociado N° ${datos.asociadoId} - ${etiquetaConcepto(datos.concepto)} ${datos.periodo}${detalleAlumnos}\n${nombre}`,
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
      fecha: datos.fecha || hoyISO(),
      registradoEn: new Date().toLocaleString("es-AR"),
      tipo: datos.tipo,
      categoria: datos.categoria,
      descripcion: datos.descripcion,
      monto: datos.monto,
      comprobante: datos.comprobante || null,
      anulado: 0,
      adjuntoNombre: datos.adjuntoNombre || null,
    });
    if (datos.adjuntoDatos) mockAdjuntos[id] = { nombre: datos.adjuntoNombre || "comprobante", dataUrl: datos.adjuntoDatos };
    return id;
  },
  obtenerAdjuntoMovimiento: async (id: number): Promise<AdjuntoMovimiento | null> => {
    if (isTauri) return invoke<AdjuntoMovimiento | null>("obtener_adjunto_movimiento", { id });
    return mockAdjuntos[id] || null;
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
  listarActas: async (): Promise<ActaFila[]> => {
    if (isTauri) return invoke<ActaFila[]>("listar_actas");
    return mockActas;
  },
  guardarActaDetallada: async (datos: DatosActa): Promise<ActaFila> => {
    if (isTauri) return invoke<ActaFila>("guardar_acta_detallada", { datos });
    const ahora: ActaFila = {
      ...datos,
      id: datos.id || Date.now(),
      reunionId: datos.reunionId ?? null,
      archivoAdjunto: datos.archivoAdjunto ?? null,
      estado: "Borrador",
    };
    mockActas = [ahora, ...mockActas.filter((acta) => acta.id !== ahora.id)];
    return ahora;
  },
  aprobarActa: async (id: number): Promise<void> => {
    if (isTauri) return invoke<void>("aprobar_acta", { id });
    const acta = mockActas.find((item) => item.id === id);
    if (acta) acta.estado = "Firmada";
  },
  eliminarActa: async (id: number): Promise<void> => {
    if (isTauri) return invoke<void>("eliminar_acta", { id });
    mockActas = mockActas.filter((acta) => acta.id !== id);
  },

  // Rendiciones
  listarRendiciones: async (): Promise<RendicionFila[]> => {
    if (isTauri) return invoke<RendicionFila[]>("listar_rendiciones");
    return mockRendiciones;
  },
  /** Saldo con el que arranca el ejercicio que empieza en `desde` (AAAA-MM-DD) */
  saldoEjercicioAnterior: async (desde: string): Promise<SaldoEjercicioAnterior> => {
    if (isTauri) return invoke<SaldoEjercicioAnterior>("saldo_ejercicio_anterior", { desde });
    return { saldo: 0, origen: "sin_datos", detalle: "Vista previa sin datos de ejercicios anteriores" };
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
  /** Recalcula el detalle con la caja del período y devuelve la fecha de actualización */
  actualizarRendicion: async (id: number): Promise<string> => {
    if (isTauri) return invoke<string>("actualizar_rendicion", { id });
    const fecha = new Date().toLocaleString("es-AR");
    const r = mockRendiciones.find((x) => x.id === id);
    if (r) r.actualizadaEn = fecha;
    return fecha;
  },
  detalleRendicion: async (id: number): Promise<LineaRendicion[]> => {
    if (isTauri) return invoke<LineaRendicion[]>("detalle_rendicion", { id });
    return [
      { tipo: "Ingreso", categoria: "Cuota Social", total: 185000 },
      { tipo: "Ingreso", categoria: "Festivales, actos, quermese", total: 36000 },
      { tipo: "Ingreso", categoria: "Donación de dinero", total: 20000 },
      { tipo: "Egreso", categoria: "Mant. y mejoras con fondos propios", total: 38500 },
      { tipo: "Egreso", categoria: "Material didáctico", total: 19400 },
      { tipo: "Egreso", categoria: "Artículos de Limpieza", total: 12500 },
    ];
  },
  detalleMensualRendicion: async (id: number): Promise<MesRendicion[]> => {
    if (isTauri) return invoke<MesRendicion[]>("detalle_mensual_rendicion", { id });
    const r = mockRendiciones.find((x) => x.id === id);
    if (!r) return [];
    return mesesEntre(r.desde, r.hasta).map((mes) => {
      const delMes = mockMovimientos.filter((m) => m.anulado === 0 && m.fecha.startsWith(mes));
      const suma = (tipo: string) => delMes.filter((m) => m.tipo === tipo).reduce((acc, m) => acc + m.monto, 0);
      return { mes, ingresos: suma("Ingreso"), egresos: suma("Egreso") };
    });
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
      cargo: null,
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
  eliminarCopiaSeguridad: async (archivo: string): Promise<string> => {
    if (isTauri) return invoke<string>("eliminar_copia_seguridad", { archivo });
    mockCopias = mockCopias.filter((x) => x.nombreArchivo !== archivo);
    return `Copia de seguridad eliminada: ${archivo}`;
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
      { id: 1, orden: 1, cargo: "PRESIDENTE", asociadoId: null, nombre: "Carlos Gómez", dni: "20000002", cuil: "20-20000002-3", domicilio: "Av. San Martín 1420", localidad: "Morón", telefono: "11-4567-1111", email: "carlos.gomez@email.com", vencimiento: "31/12/2027" },
      { id: 2, orden: 2, cargo: "VICEPRESIDENTE", asociadoId: 2, nombre: "Valeria Fernández", dni: "29888777", cuil: "27-29888777-4", domicilio: "Belgrano 450", localidad: "Morón", telefono: "11-9876-2222", email: "valeria.fernandez@email.com", vencimiento: "31/12/2027" },
      { id: 3, orden: 3, cargo: "SECRETARIO", asociadoId: 4, nombre: "Mariana López", dni: "30000003", cuil: "27-30000003-8", domicilio: "Mitre 830", localidad: "Morón", telefono: "11-6677-3333", email: "mariana.lopez@email.com", vencimiento: "31/12/2027" },
      { id: 4, orden: 4, cargo: "TESORERO", asociadoId: null, nombre: "Roberto Fernández", dni: "40000004", cuil: "20-40000004-1", domicilio: "Sarmiento 112", localidad: "Morón", telefono: "11-3344-4444", email: "roberto.fernandez@email.com", vencimiento: "31/12/2027" },
      { id: 5, orden: 5, cargo: "VOCAL TITULAR 1°", asociadoId: 1, nombre: "Marcos Álvarez", dni: "32111222", cuil: "20-32111222-6", domicilio: "Rivadavia 310", localidad: "Morón", telefono: "11-4567-5555", email: "marcos.alvarez@email.com", vencimiento: "31/12/2027" },
      { id: 6, orden: 6, cargo: "VOCAL TITULAR 2°", asociadoId: 8, nombre: "Elena Sánchez", dni: "27999111", cuil: "27-27999111-5", domicilio: "Caseros 650", localidad: "Morón", telefono: "11-8899-6666", email: "elena.sanchez@email.com", vencimiento: "31/12/2027" },
      { id: 7, orden: 7, cargo: "VOCAL TITULAR 3°", asociadoId: 7, nombre: "Pablo Romero", dni: "30111444", cuil: "20-30111444-2", domicilio: "Alsina 920", localidad: "Morón", telefono: "11-7788-7777", email: "pablo.romero@email.com", vencimiento: "31/12/2027" },
      { id: 8, orden: 8, cargo: "VOCAL SUPLENTE 1°", asociadoId: 5, nombre: "Diego Martínez", dni: "28777666", cuil: "20-28777666-9", domicilio: "Brown 710", localidad: "Morón", telefono: "11-3344-8888", email: "diego.martinez@email.com", vencimiento: "31/12/2027" },
      { id: 9, orden: 9, cargo: "VOCAL SUPLENTE 2°", asociadoId: 6, nombre: "Laura Rodríguez", dni: "33444555", cuil: "27-33444555-0", domicilio: "Salta 184", localidad: "Morón", telefono: "11-5566-9999", email: "laura.rodriguez@email.com", vencimiento: "31/12/2027" },
      { id: 10, orden: 10, cargo: "VOCAL SUPLENTE 3°", asociadoId: 3, nombre: "Santiago Gómez", dni: "34555666", cuil: "20-34555666-3", domicilio: "Jujuy 530", localidad: "Morón", telefono: "11-2233-0000", email: "santiago.gomez@email.com", vencimiento: "31/12/2027" },
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
        aprobado: 0,
        aprobadoPor: null,
        aprobadoEn: null,
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
        aprobado: 0,
        aprobadoPor: null,
        aprobadoEn: null,
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
      aprobado: 0,
      aprobadoPor: null,
      aprobadoEn: null,
    };
  },

  aprobarDocumentoAsamblea: async (id: number): Promise<void> => {
    if (isTauri) return invoke<void>("aprobar_documento_asamblea", { id });
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
      "saldo_cuenta_corriente", "saldo_plazo_fijo", "caja_chica",
      "bono_anual", "materiales", "materiales_hermanos", "logo_cooperadora"
    ];
    const res: Record<string, string> = {};
    for (const k of keys) {
      const v = await api.obtenerConfiguracion(k);
      res[k] = v || "";
    }
    // Los importes sin informar vuelven vacíos en lugar de "0": así el campo no arranca
    // con un cero que hay que borrar antes de escribir.
    const importe = (valor: string | undefined) => (!valor || valor === "0" ? "" : valor);
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
      saldoCuentaCorriente: importe(res.saldo_cuenta_corriente),
      saldoPlazoFijo: importe(res.saldo_plazo_fijo),
      cajaChica: importe(res.caja_chica),
      bonoAnual: res.bono_anual || "12000",
      materiales: res.materiales || "5000",
      materialesHermanos: res.materiales_hermanos || "4000",
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
      saldo_cuenta_corriente: datos.saldoCuentaCorriente,
      saldo_plazo_fijo: datos.saldoPlazoFijo,
      caja_chica: datos.cajaChica,
      bono_anual: datos.bonoAnual,
      materiales: datos.materiales,
      materiales_hermanos: datos.materialesHermanos,
      logo_cooperadora: datos.logoBase64 || "",
    };
    for (const [k, v] of Object.entries(mapping)) {
      await api.guardarConfiguracion(k, v);
    }
  },
};


export const money = (n: number) => `$ ${n.toLocaleString("es-AR")}`;

/** Fecha local de hoy en AAAA-MM-DD (toISOString usa UTC y después de las 21 h da el día siguiente) */
export const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Ejercicio de la cooperadora: del 1° de mayo al 30 de abril del año siguiente */
export const ejercicioDe = (anioInicio: number) => ({
  nombre: `Ejercicio ${anioInicio}/${anioInicio + 1}`,
  desde: `${anioInicio}-05-01`,
  hasta: `${anioInicio + 1}-04-30`,
});

/** Año en que empezó el ejercicio en curso (de enero a abril sigue abierto el del año anterior) */
export const anioEjercicioActual = () => {
  const d = new Date();
  return d.getMonth() >= 4 ? d.getFullYear() : d.getFullYear() - 1;
};

/** Meses AAAA-MM entre dos fechas AAAA-MM-DD, ambos incluidos */
export const mesesEntre = (desde: string, hasta: string) => {
  const meses: string[] = [];
  let anio = Number(desde.slice(0, 4));
  let mes = Number(desde.slice(5, 7));
  const fin = Number(hasta.slice(0, 4)) * 12 + Number(hasta.slice(5, 7));
  while (anio * 12 + mes <= fin && meses.length < 120) {
    meses.push(`${anio}-${String(mes).padStart(2, "0")}`);
    if (mes === 12) { anio += 1; mes = 1; } else { mes += 1; }
  }
  return meses;
};

const NOMBRES_MES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
/** "2026-05" → "Mayo 2026" */
export const nombreMes = (mes: string) => `${NOMBRES_MES[Number(mes.slice(5, 7)) - 1] ?? mes} ${mes.slice(0, 4)}`;
export const signedMoney = (tipo: string, n: number) => `${tipo === "Ingreso" ? "+" : "-"} ${money(n)}`;