// src/utils/pdfGenerators.ts
import { PDFDocument } from "pdf-lib";
import { MiembroComisionFila, DatosInstitucionales } from "../api";

export async function generarPdfNomina(
  miembros: MiembroComisionFila[],
  institucion: DatosInstitucionales,
  ejercicio: string
): Promise<Uint8Array> {
  const existingPdfBytes = await fetch("/plantillas/nomina_comision_directiva.pdf").then((res) => {
    if (!res.ok) throw new Error("No se pudo cargar la plantilla de Nómina");
    return res.arrayBuffer();
  });

  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const form = pdfDoc.getForm();

  // Encabezados
  // Mapeo verificado por pypdf:
  // text_1zzii -> AÑO
  // text_2waid -> DISTRITO
  // text_3gqed -> ESCUELA Y N°
  // text_4ulwg -> ASOCIACIÓN COOPERADORA
  const trySet = (name: string, val: string) => {
    try {
      const field = form.getTextField(name);
      if (field) field.setText(val || "");
    } catch {
      // Ignorar si el campo no existe
    }
  };

  trySet("text_1zzii", ejercicio);
  trySet("text_2waid", institucion.distrito);
  trySet("text_3gqed", institucion.numeroEscuela);
  trySet("text_4ulwg", institucion.asociacionNombre);

  // 16 filas de 6 campos: Cargo, Apellido y Nombre, Documento, Domicilio, Localidad, Vencimiento
  // Fila 1: text_5tqre, text_6ejdd, text_7dovh, text_8yqyo, text_9mftm, text_10oxfg
  // Fila 2: text_11xekx, text_12mdfp, text_13cstz, text_14gknp, text_15pknk, text_16ghv
  // Fila 3: text_17yfqe, text_18zchm, text_19yqnr, text_20lffq, text_21dhyh, text_22iwwu
  // Fila 4: text_23yvob, text_24nhce, text_25xchw, text_26gxfc, text_27vjsc, text_28yqvi
  // Fila 5: text_29qbbh, text_30nrmc, text_31mtyt, text_32pysw, text_33ovw, text_34bky
  // Fila 6: text_35kvyv, text_36eqg, text_37rthk, text_38xoyw, text_39lycr, text_40sugv
  // Fila 7: text_41slln, text_42ovur, text_43lqvd, text_44zhlx, text_45qmsf, text_46puxd
  // Fila 8: text_47oijx, text_48edov, text_49sokd, text_50hsgf, text_51tqqj, text_52pysx
  // Fila 9: text_53mpyk, text_54zhlm, text_55mknq, text_56ubve, text_57hhyz, text_58fchx
  // Fila 10: text_59womz, text_60pgyq, text_61mlyy, text_62tyec, text_63fvyy, text_64gqch
  // Fila 11: text_65tyer, text_66yylf, text_67jffp, text_68eqkc, text_69mhyg, text_70whfs
  // Fila 12: text_71kkmr, text_72wugt, text_73srmd, text_74oouo, text_75nhym, text_76yypx
  // Fila 13: text_77ehmh, text_78gtyc, text_79tyep, text_80ffkc, text_81kkmr, text_82yypx
  // Fila 14: text_83xocp, text_84lyeb, text_85yqvb, text_86wwyc, text_87tyem, text_88pysm
  // Fila 15: text_89bkov, text_90uuyt, text_91mkyq, text_92qwec, text_93kklm, text_94yytr
  // Fila 16: text_95trmb, text_96oihc, text_97qwer, text_98tyup, text_99asdf, text_100ghjk

  const rowFieldNames = [
    ["text_5tqre", "text_6ejdd", "text_7dovh", "text_8yqyo", "text_9mftm", "text_10oxfg"],
    ["text_11xekx", "text_12mdfp", "text_13cstz", "text_14gknp", "text_15pknk", "text_16ghv"],
    ["text_17yfqe", "text_18zchm", "text_19yqnr", "text_20lffq", "text_21dhyh", "text_22iwwu"],
    ["text_23yvob", "text_24nhce", "text_25xchw", "text_26gxfc", "text_27vjsc", "text_28yqvi"],
    ["text_29qbbh", "text_30nrmc", "text_31mtyt", "text_32pysw", "text_33ovw", "text_34bky"],
    ["text_35kvyv", "text_36eqg", "text_37rthk", "text_38xoyw", "text_39lycr", "text_40sugv"],
    ["text_41slln", "text_42ovur", "text_43lqvd", "text_44zhlx", "text_45qmsf", "text_46puxd"],
    ["text_47oijx", "text_48edov", "text_49sokd", "text_50hsgf", "text_51tqqj", "text_52pysx"],
    ["text_53mpyk", "text_54zhlm", "text_55mknq", "text_56ubve", "text_57hhyz", "text_58fchx"],
    ["text_59womz", "text_60pgyq", "text_61mlyy", "text_62tyec", "text_63fvyy", "text_64gqch"],
    ["text_65tyer", "text_66yylf", "text_67jffp", "text_68eqkc", "text_69mhyg", "text_70whfs"],
    ["text_71kkmr", "text_72wugt", "text_73srmd", "text_74oouo", "text_75nhym", "text_76yypx"],
    ["text_77ehmh", "text_78gtyc", "text_79tyep", "text_80ffkc", "text_81kkmr", "text_82yypx"],
    ["text_83xocp", "text_84lyeb", "text_85yqvb", "text_86wwyc", "text_87tyem", "text_88pysm"],
    ["text_89bkov", "text_90uuyt", "text_91mkyq", "text_92qwec", "text_93kklm", "text_94yytr"],
    ["text_95trmb", "text_96oihc", "text_97qwer", "text_98tyup", "text_99asdf", "text_100ghjk"],
  ];

  // Ordenar miembros por 'orden'
  const sorted = [...miembros].sort((a, b) => a.orden - b.orden);

  sorted.forEach((m, idx) => {
    if (idx < rowFieldNames.length) {
      const fNames = rowFieldNames[idx];
      trySet(fNames[0], m.cargo);
      trySet(fNames[1], m.nombre);
      trySet(fNames[2], m.dni);
      trySet(fNames[3], m.domicilio);
      trySet(fNames[4], m.localidad);
      trySet(fNames[5], m.vencimiento);
    }
  });

  return pdfDoc.save();
}

export interface DatosFinancierosPia {
  saldoInicialCaja: number;
  saldoInicialBanco: number;
  totalCuotas: number;
  totalDonaciones: number;
  totalRifas: number;
  totalFestivales: number;
  totalKiosco: number;
  intereses: number;
  reintegrados: number;
  subsidios: number;
  otrosIngresosA: number;
  otrosIngresosB: number;
  // Salidas
  ropaCalzado: number;
  librosUtiles: number;
  excursiones: number;
  emergencias: number;
  golosinasPremios: number;
  materialDidactico: number;
  mantSubsidios: number;
  mantFondosPropios: number;
  limpieza: number;
  combustible: number;
  libreria: number;
  mobiliario: number;
  organizacionRifas: number;
  organizacionFestivales: number;
  gastosKiosco: number;
  otrosGastosA: number;
  otrosGastosB: number;
  cuotaSocialAprobada: number;
  cajaChicaAprobada: number;
}

export async function generarPdfPia(
  institucion: DatosInstitucionales,
  miembros: MiembroComisionFila[],
  financiero: DatosFinancierosPia,
  ejercicio: string
): Promise<Uint8Array> {
  const existingPdfBytes = await fetch("/plantillas/pia_cooperadoras.pdf").then((res) => {
    if (!res.ok) throw new Error("No se pudo cargar la plantilla P.I.A.");
    return res.arrayBuffer();
  });

  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const form = pdfDoc.getForm();

  const trySet = (name: string, val: string | number) => {
    try {
      const field = form.getTextField(name);
      if (field) field.setText(String(val ?? ""));
    } catch {
      // Ignorar si el campo no es de texto o no existe
    }
  };

  const tryCheck = (name: string) => {
    try {
      const cb = form.getCheckBox(name);
      if (cb) cb.check();
    } catch {
      // Ignorar
    }
  };

  // Desglosar año de ejercicio ej: "2024/2025" o "2025"
  const anios = ejercicio.split("/");
  const anioInicio = anios[0] ? anios[0].trim().slice(-2) : "24";
  const anioFin = anios[1] ? anios[1].trim().slice(-2) : (parseInt(anioInicio) + 1).toString().slice(-2);

  // 1. Encabezado Página 1
  trySet("Texto1", anioInicio);
  trySet("Texto2", anioFin);
  trySet("DISTRITO", institucion.distrito);

  // Cuadro 1: Establecimiento
  trySet("ESCUELA", institucion.nombreEscuela);
  trySet("nro", institucion.numeroEscuela.replace(/\D/g, ""));
  trySet("CUE", institucion.cue);

  const cuitClean = institucion.cuit.replace(/\D/g, "");
  if (cuitClean.length >= 11) {
    trySet("CUIT1", cuitClean.slice(0, 2));
    trySet("CUIT2", cuitClean.slice(2, 10));
    trySet("CUIT3", cuitClean.slice(10, 11));
  } else {
    trySet("CUIT1", institucion.cuit);
  }

  trySet("DOMICILIO", institucion.domicilioEscuela);
  trySet("BARRIO", institucion.barrio);
  trySet("LOCALIDAD", institucion.localidad);
  trySet("EMAIL", institucion.emailInstitucional);
  trySet("EMAIL2", institucion.emailInstitucional);
  trySet("TELÉFONO", institucion.telefonoEscuela);
  trySet("TELÉFONO2", institucion.telefonoEscuela);

  // Cuadro 2: Socios
  trySet("activos", "148");
  trySet("honorarios", "4");
  trySet("adherentes", "12");

  // Cuadro 3: Asamblea Anual Ordinaria
  const anioFull = anios[1] ? anios[1].trim() : (2000 + parseInt(anioFin)).toString();
  trySet("acta", "49");
  trySet("foja", "12");
  trySet("dia", "15");
  trySet("mes", "05");
  trySet("año", anioFull);
  trySet("asistieron", "38");

  // Cuadro 4: Decisiones Adoptadas
  trySet("1DECISIÓN ADOPTADA", "Aprobado por unanimidad");
  trySet("2DECISIÓN ADOPTADA", "Aprobada por unanimidad sin objeciones");
  trySet("3DECISIÓN ADOPTADA", "Aprobado dictamen favorable");
  trySet("4DECISIÓN ADOPTADA", "Aprobados Memoria y Balance general");
  trySet("5DECISIÓN ADOPTADA", "Electa Lista 1 Renovación por mayoría");
  trySet("6", financiero.cuotaSocialAprobada);
  tryCheck("Check Box34"); // Mensual
  trySet("7", financiero.cajaChicaAprobada);

  // Cuadro 5: Nueva Comisión Directiva (14 filas)
  const sorted = [...miembros].sort((a, b) => a.orden - b.orden);
  for (let i = 0; i < 14; i++) {
    const idx = i + 1;
    const m = sorted[i];
    if (m) {
      trySet(`CARGO${idx}`, m.cargo);
      trySet(`NOMBRE Y APELLIDO${idx}`, m.nombre);
      const cuilDigits = m.cuil.replace(/\D/g, "");
      if (cuilDigits.length >= 11) {
        trySet(`CUIL${(idx - 1) * 3 + 1}`, cuilDigits.slice(0, 2));
        trySet(`CUIL${(idx - 1) * 3 + 2}`, cuilDigits.slice(2, 10));
        trySet(`CUIL${(idx - 1) * 3 + 3}`, cuilDigits.slice(10, 11));
      } else {
        trySet(`CUIL${(idx - 1) * 3 + 2}`, m.cuil);
      }
      trySet(`Texto${idx + 3}`, m.telefono);
    }
  }

  // Cuadro 6: Revisores de Cuentas y Asesor
  const revTitDoc = miembros.find((m) => m.cargo.includes("DOCENTE")) || miembros[12];
  const revTit1 = miembros.find((m) => m.cargo.includes("REV. CTAS. TITULAR 1")) || miembros[10];
  const revSup1 = miembros.find((m) => m.cargo.includes("REV. CTAS. SUPLENTE 1")) || miembros[13];
  const asesor = miembros.find((m) => m.cargo.includes("ASESOR")) || miembros[15];

  if (revTitDoc) {
    trySet("TITULAR DOCENTE", revTitDoc.nombre);
    trySet("DNI1", revTitDoc.dni);
  }
  if (revTit1) {
    trySet("TITULAR", revTit1.nombre);
    trySet("DNI2", revTit1.dni);
  }
  if (revSup1) {
    trySet("SUPLENTE", revSup1.nombre);
    trySet("DNI3", revSup1.dni);
  }
  if (asesor) {
    trySet("ASESOR/A", asesor.nombre);
    trySet("DNI4", asesor.dni);
  }

  // Delegados ante la Federación (Cuadro superior y firma)
  const pres = miembros[0];
  const vice = miembros[1];
  if (pres) {
    trySet("TITULAR 2", pres.nombre);
    trySet("DNI5", pres.dni);
  }
  if (vice) {
    trySet("SUPLENTE 2", vice.nombre);
    trySet("DNI6", vice.dni);
  }

  // Fechas al pie de Página 1
  trySet("D", "15");
  trySet("M", "05");
  trySet("A", anioFull);
  trySet("NRO FOJA", "15");

  // ==========================================
  // PÁGINA 2: CUADRO DE RECURSOS Y GASTOS
  // ==========================================
  trySet("AÑO1", anioInicio);
  trySet("AÑO2", anioFin);

  // ENTRADAS
  // 1. Recursos Propios
  trySet("Texto18", financiero.totalCuotas);
  trySet("Texto19", financiero.totalDonaciones);
  trySet("Texto20", financiero.totalRifas);
  trySet("Texto21", financiero.totalFestivales);
  trySet("Texto22", financiero.totalKiosco);
  trySet("Texto23", financiero.intereses);
  trySet("Texto24", financiero.reintegrados);

  // 2. Recursos Oficiales
  trySet("Texto25", financiero.subsidios);

  // 3. Otros Ingresos
  trySet("INGRESO A", "Venta de diarios y reciclados");
  trySet("Texto26", financiero.otrosIngresosA);
  trySet("INGRESO B", "Aportes extraordinarios talleres");
  trySet("Texto27", financiero.otrosIngresosB);

  const totalEntradas =
    financiero.totalCuotas +
    financiero.totalDonaciones +
    financiero.totalRifas +
    financiero.totalFestivales +
    financiero.totalKiosco +
    financiero.intereses +
    financiero.reintegrados +
    financiero.subsidios +
    financiero.otrosIngresosA +
    financiero.otrosIngresosB;

  trySet("TOTAL ENTRADAS", totalEntradas);

  // SALIDAS
  // 1. Gastos Alumno
  trySet("Texto28", financiero.ropaCalzado);
  trySet("Texto29", financiero.librosUtiles);
  trySet("Texto30", financiero.excursiones);
  trySet("Texto31", financiero.emergencias);
  trySet("Texto32", financiero.golosinasPremios);
  trySet("GASTOS F", "Insumos refrigerio jornadas");
  trySet("Texto33", "14500");
  trySet("GASTOS G", "Becas de fotocopias");
  trySet("Texto34", "9800");

  // 2. Gastos Escuela
  trySet("Texto35", financiero.materialDidactico);
  trySet("Texto36", financiero.mantSubsidios);
  trySet("Texto37", financiero.mantFondosPropios);
  trySet("Texto38", financiero.limpieza);
  trySet("Texto39", financiero.combustible);
  trySet("Texto40", financiero.libreria);
  trySet("Texto41", financiero.mobiliario);
  trySet("GASTOS H", "Pintura y revestimientos");
  trySet("Texto42", "28000");
  trySet("GASTOS I", "Seguridad y cerrajería");
  trySet("Texto43", "12500");

  // 3. Gastos Entidad
  trySet("Texto51", financiero.organizacionRifas);
  trySet("Texto52", financiero.organizacionFestivales);
  trySet("Texto53", financiero.gastosKiosco);
  trySet("GASTOS D", "Gastos bancarios y comisiones");
  trySet("Texto54", "8200");
  trySet("GASTOS E", "Trámites personería y sellados");
  trySet("Texto55", "4500");

  // 4. Otros Gastos
  trySet("Texto50", "Contratación de sonido para acto escolar");
  trySet("Texto56", financiero.otrosGastosA);
  trySet("Texto49", "Fletes y acarreos de donaciones");
  trySet("Texto57", financiero.otrosGastosB);

  const totalSalidas =
    financiero.ropaCalzado +
    financiero.librosUtiles +
    financiero.excursiones +
    financiero.emergencias +
    financiero.golosinasPremios +
    14500 +
    9800 +
    financiero.materialDidactico +
    financiero.mantSubsidios +
    financiero.mantFondosPropios +
    financiero.limpieza +
    financiero.combustible +
    financiero.libreria +
    financiero.mobiliario +
    28000 +
    12500 +
    financiero.organizacionRifas +
    financiero.organizacionFestivales +
    financiero.gastosKiosco +
    8200 +
    4500 +
    financiero.otrosGastosA +
    financiero.otrosGastosB;

  trySet("TOTAL SALIDAS", totalSalidas);

  // RESUMEN ANUAL (Columna izquierda inferior)
  const saldoEjercicioAnterior = financiero.saldoInicialCaja + financiero.saldoInicialBanco;
  const totalGeneral = totalEntradas + saldoEjercicioAnterior;
  const saldoProximoEjercicio = totalGeneral - totalSalidas;

  trySet("Texto44", totalEntradas);
  trySet("Texto45", saldoEjercicioAnterior);
  trySet("Texto46", totalGeneral);
  trySet("Texto47", totalSalidas);
  trySet("Texto48", saldoProximoEjercicio);

  // Distribución del saldo
  const restoCajaChica = financiero.cajaChicaAprobada > 15000 ? 12000 : 8000;
  const enBancoCC = saldoProximoEjercicio - restoCajaChica;
  trySet("CC", enBancoCC);
  trySet("PF", "0");
  trySet("EFECTIVO", restoCajaChica);

  // Observaciones
  trySet("OBSERVACIONES 1", "Balance aprobado por asamblea ordinaria sin objeciones.");
  trySet("OBSERVACIONES 2", "Libros contables rubricados y al día con comprobantes respaldatorios.");

  // Datos Bancarios
  trySet("DATOS BANCO", institucion.bancoNombre);
  trySet("SUCURSAL", institucion.bancoSucursal);
  trySet("CUENTA CORRIENTE", institucion.cuentaCorriente);
  trySet("CBU", institucion.cbu);

  // Kiosco Escolar (Posee propio)
  tryCheck("Check Box194"); // Posee SI
  tryCheck("Check Box196"); // Propio

  // Fecha al pie Página 2
  trySet("DIA 2", "15");
  trySet("MES 2", "05");
  trySet("AÑO 2", anioFull);

  return pdfDoc.save();
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function base64ToBlob(base64: string, type = "application/pdf"): Blob {
  const binStr = window.atob(base64);
  const len = binStr.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = binStr.charCodeAt(i);
  }
  return new Blob([arr], { type });
}
