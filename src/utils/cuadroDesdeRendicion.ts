// src/utils/cuadroDesdeRendicion.ts
import { CuadroFinancieroActa, LineaRendicion } from "../api";

/**
 * Vínculo Rendición → Acta: vuelca en el cuadro demostrativo de recursos y gastos
 * los totales de la rendición del período, agrupados por categoría de caja.
 *
 * Los importes se guardan como texto de sólo dígitos, igual que los carga el acta.
 * Los saldos en banco y el dinero en efectivo NO se tocan: vienen de la cooperadora
 * o los define la asamblea.
 */

type CampoImporte = Exclude<keyof CuadroFinancieroActa, "poseeKiosco" | "kioscoPropio" | "kioscoLicitado" | "contratoDesde" | "contratoHasta">;

const normalizar = (texto: string) =>
  texto
    .trim()
    .toLocaleLowerCase("es-AR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Categorías de ingreso de la caja → campo del cuadro del acta */
const INGRESOS: Record<string, CampoImporte> = {
  "cuota social": "cuotaSocial",
  "cuotas": "cuotaSocial",
  "bono contribucion": "cuotaSocial",
  "donacion de dinero": "donacionDinero",
  "donaciones": "donacionDinero",
  "rifas": "rifas",
  "festivales, actos, quermese": "festivales",
  "kiosco": "kiosco",
  "intereses bancarios": "interesesBancarios",
  "reintegrados banco (debitos, mant., etc.)": "reintegradosBanco",
  "subsidios de la dgcye": "subsidiosDgcye",
};

/** Categorías de egreso de la caja → campo del cuadro del acta */
const EGRESOS: Record<string, CampoImporte> = {
  "ropa y calzado": "ropaCalzado",
  "libros y utiles": "librosUtiles",
  "excursiones": "excursiones",
  "emergencias sanitarias": "emergenciasSanitarias",
  "golosinas, premios y medallas": "golosinasPremiosMedallas",
  "material didactico": "materialDidactico",
  "mant. y mejoras con subsidios": "mantSubsidios",
  "mant. y mejoras con fondos propios": "mantFondosPropios",
  "articulos de limpieza": "articulosLimpieza",
  "combustible y calefaccion": "combustibleCalefaccion",
  "libreria": "libreria",
  "mobiliario": "mobiliario",
  "organizacion de rifas": "organizacionRifas",
  "organizacion de festivales": "organizacionFestivales",
  "kiosco": "kioscoEntidad",
  "gastos administrativos": "gastosAdministrativos",
};

/** Campos que se completan desde la rendición (el resto queda como está) */
const CAMPOS_RENDICION: CampoImporte[] = [
  "cuotaSocial", "donacionDinero", "rifas", "festivales", "kiosco",
  "interesesBancarios", "reintegradosBanco", "subsidiosDgcye",
  "otrosIngresosA", "otrosIngresosB",
  "ropaCalzado", "librosUtiles", "excursiones", "emergenciasSanitarias",
  "golosinasPremiosMedallas", "gastosAlumnoF", "gastosAlumnoG",
  "materialDidactico", "mantSubsidios", "mantFondosPropios", "articulosLimpieza",
  "combustibleCalefaccion", "libreria", "mobiliario", "gastosEscuelaH", "gastosEscuelaI",
  "organizacionRifas", "organizacionFestivales", "kioscoEntidad", "gastosEntidadD",
  "gastosEntidadE", "gastosAdministrativos", "otrosEgresos",
];

const comoImporte = (valor: string | undefined) => {
  const limpio = String(valor ?? "").replace(/\D/g, "");
  return limpio === "" ? 0 : Number(limpio);
};

const comoTexto = (valor: number) => (valor === 0 ? "" : String(valor));

/** Devuelve el cuadro del acta con los valores de la rendición ya volcados. */
export function cuadroDesdeRendicion(
  lineas: LineaRendicion[],
  actual: CuadroFinancieroActa,
): CuadroFinancieroActa {
  const nuevo: CuadroFinancieroActa = { ...actual };

  // Se parte de cero en los campos que alimenta la rendición
  for (const campo of CAMPOS_RENDICION) {
    (nuevo as unknown as Record<string, string>)[campo] = "";
  }

  let totalIngresos = 0;
  let totalEgresos = 0;

  for (const linea of lineas) {
    const total = linea.total || 0;
    if (linea.tipo === "Ingreso") {
      totalIngresos += total;
      const campo = INGRESOS[normalizar(linea.categoria)] ?? "otrosIngresosA";
      const acumulado = comoImporte(String((nuevo as unknown as Record<string, string>)[campo] ?? "")) + total;
      (nuevo as unknown as Record<string, string>)[campo] = comoTexto(acumulado);
    } else {
      totalEgresos += total;
      const campo = EGRESOS[normalizar(linea.categoria)] ?? "otrosEgresos";
      const acumulado = comoImporte(String((nuevo as unknown as Record<string, string>)[campo] ?? "")) + total;
      (nuevo as unknown as Record<string, string>)[campo] = comoTexto(acumulado);
    }
  }

  // Totales del cuadro: se recalculan con los valores recién volcados
  const saldoAnterior = comoImporte(actual.saldoEjercicioAnterior);
  nuevo.totalEntradas = comoTexto(totalIngresos);
  nuevo.resumenTotalEntradas = comoTexto(totalIngresos);
  nuevo.totalSalidasResumen = comoTexto(totalEgresos);
  nuevo.totalSalidasPlazoFijo = comoTexto(totalEgresos);
  nuevo.totalGeneral = comoTexto(totalIngresos + saldoAnterior);
  nuevo.saldoProximoEjercicio = comoTexto(totalIngresos + saldoAnterior - totalEgresos);

  return nuevo;
}

/** Importe de un campo del cuadro, o el valor de respaldo si el acta no lo informó. */
export const importeDelActa = (valor: string | undefined, respaldo: number) => {
  const limpio = String(valor ?? "").replace(/\D/g, "");
  return limpio === "" ? respaldo : Number(limpio);
};

/** ¿El cuadro todavía no tiene ningún valor proveniente de una rendición? */
export const cuadroSinValoresDeRendicion = (cuadro: CuadroFinancieroActa): boolean =>
  CAMPOS_RENDICION.every((campo) => {
    const valor = String((cuadro as unknown as Record<string, string>)[campo] ?? "").replace(/\D/g, "");
    return valor === "" || valor === "0";
  });
