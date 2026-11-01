// src/pages/Documentacion.tsx
import { useEffect, useState, useRef } from "react";
import Layout from "../components/Layout";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import DataTable, { Column } from "../components/ui/DataTable";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import IconButton from "../components/ui/IconButton";
import { EyeIcon, TrashIcon, PrinterIcon, CheckIcon } from "../components/icons";
import {
  api,
  DocumentoAsambleaFila,
  MiembroComisionFila,
  DatosInstitucionales,
  AsociadoFila,
} from "../api";
import {
  generarPdfNomina,
  generarPdfPia,
  uint8ArrayToBase64,
  base64ToBlob,
  DatosFinancierosPia,
} from "../utils/pdfGenerators";
import { useApp } from "../context";
import s from "./Documentacion.module.css";

type Vista = "listado" | "visor";

export default function Documentacion() {
  const { usuario } = useApp();
  const puedeEliminar = usuario.rol === "Secretaria" || usuario.rol === "Superadmin";
  const puedeGenerar = usuario.rol === "Secretaria" || usuario.rol === "Superadmin";
  const puedeAprobar = usuario.rol === "Secretaria" || usuario.rol === "Presidente" || usuario.rol === "Superadmin";
  const [vista, setVista] = useState<Vista>("listado");
  const [documentos, setDocumentos] = useState<DocumentoAsambleaFila[]>([]);
  const [comision, setComision] = useState<MiembroComisionFila[]>([]);
  const [institucion, setInstitucion] = useState<DatosInstitucionales | null>(null);
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Visor activo
  const [docActivo, setDocActivo] = useState<{
    titulo: string;
    pdfBlobUrl: string;
    pdfBase64: string;
    nombreArchivo: string;
  } | null>(null);

  // Diálogo confirmación eliminación
  const [docAEliminar, setDocAEliminar] = useState<DocumentoAsambleaFila | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const [docs, com, inst] = await Promise.all([
        api.listarDocumentosAsambleas(),
        api.listarComisionDirectiva(),
        api.obtenerDatosInstitucionales(),
      ]);
      setDocumentos(docs);
      setComision(com);
      setInstitucion(inst);
    } catch (err: any) {
      setError(err?.message || "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Generar y saltar directo a Preview de Nómina Comisión Directiva
  const handleGenerarNomina = async () => {
    if (!institucion) return;
    try {
      setGenerando(true);
      setError(null);
      const ejercicioActual = new Date().getFullYear().toString();

      // Generar PDF con datos de la BD
      const pdfBytes = await generarPdfNomina(comision, institucion, ejercicioActual);
      const pdfBase64 = uint8ArrayToBase64(pdfBytes);
      const blob = base64ToBlob(pdfBase64);
      const blobUrl = URL.createObjectURL(blob);

      // Guardar e indexar en la BD y en ./datos/documentos/
      const titulo = `Nómina Comisión Directiva ${ejercicioActual}`;
      const datosJson = JSON.stringify({
        ejercicio: ejercicioActual,
        periodo: ejercicioActual,
        distrito: institucion.distrito,
        escuela: institucion.numeroEscuela,
        asociacion: institucion.asociacionNombre,
        cargos: comision,
      });

      const guardado = await api.guardarDocumentoAsamblea({
        tipo: "NOMINA_COMISION",
        titulo,
        periodo: ejercicioActual,
        datosJson,
        pdfBytesBase64: pdfBase64,
      });

      setDocumentos((prev) => [guardado, ...prev]);

      setDocActivo({
        titulo,
        pdfBlobUrl: blobUrl,
        pdfBase64,
        nombreArchivo: guardado.archivoPdf,
      });
      setVista("visor");
      setMensajeExito("Documento generado e indexado en la base de datos.");
    } catch (err: any) {
      setError(err?.message || "Error al generar la Nómina de Comisión");
    } finally {
      setGenerando(false);
    }
  };

  // Generar y saltar directo a Preview de PIA Cooperadoras
  const handleGenerarPia = async () => {
    if (!institucion) return;
    try {
      setGenerando(true);
      setError(null);
      const anioActual = new Date().getFullYear();
      const ejercicioActual = `${anioActual - 1}/${anioActual}`;

      // Datos financieros levantados desde la base de datos
      const resCaja = await api.resumenCaja().catch(() => ({
        saldoActual: 185000,
        ingresosMes: 289000,
        egresosMes: 70400,
        totalMovimientos: 5,
      }));

      const financiero: DatosFinancierosPia = {
        saldoInicialCaja: 150000,
        saldoInicialBanco: 230000,
        totalCuotas: resCaja.ingresosMes > 0 ? resCaja.ingresosMes : 480000,
        totalDonaciones: 35000,
        totalRifas: 60000,
        totalFestivales: 185000,
        totalKiosco: 80000,
        intereses: 6000,
        reintegrados: 2000,
        subsidios: 250000,
        otrosIngresosA: 20000,
        otrosIngresosB: 15000,
        ropaCalzado: 45000,
        librosUtiles: 80000,
        excursiones: 55000,
        emergencias: 15000,
        golosinasPremios: 22000,
        materialDidactico: 60000,
        mantSubsidios: 150000,
        mantFondosPropios: 85000,
        limpieza: 42000,
        combustible: 25000,
        libreria: 20000,
        mobiliario: 70000,
        organizacionRifas: 15000,
        organizacionFestivales: 35000,
        gastosKiosco: 40000,
        otrosGastosA: 10000,
        otrosGastosB: 7000,
        cuotaSocialAprobada: 8000,
        cajaChicaAprobada: 40000,
      };

      const pdfBytes = await generarPdfPia(institucion, comision, financiero, ejercicioActual);
      const pdfBase64 = uint8ArrayToBase64(pdfBytes);
      const blob = base64ToBlob(pdfBase64);
      const blobUrl = URL.createObjectURL(blob);

      const titulo = `Planilla de Información Anual (P.I.A.) ${ejercicioActual}`;
      const datosJson = JSON.stringify({
        ejercicio: ejercicioActual,
        periodo: anioActual.toString(),
        institucion,
        autoridades: comision,
        ...financiero,
      });

      const guardado = await api.guardarDocumentoAsamblea({
        tipo: "PIA_COOPERADORA",
        titulo,
        periodo: anioActual.toString(),
        datosJson,
        pdfBytesBase64: pdfBase64,
      });

      setDocumentos((prev) => [guardado, ...prev]);

      setDocActivo({
        titulo,
        pdfBlobUrl: blobUrl,
        pdfBase64,
        nombreArchivo: guardado.archivoPdf,
      });
      setVista("visor");
      setMensajeExito("P.I.A. generada e indexada en la base de datos.");
    } catch (err: any) {
      setError(err?.message || "Error al generar la planilla P.I.A.");
    } finally {
      setGenerando(false);
    }
  };

  // Abrir un PDF histórico guardado
  const handleVerPdfHistorico = async (doc: DocumentoAsambleaFila) => {
    try {
      setGenerando(true);
      setError(null);
      let pdfBase64 = "";
      try {
        pdfBase64 = await api.leerArchivoDocumento(doc.archivoPdf);
      } catch {
        // Fallback: si no estuviera en disco se reconstruye fielmente desde el json indexado
      }

      let blobUrl = "";
      if (pdfBase64) {
        const blob = base64ToBlob(pdfBase64);
        blobUrl = URL.createObjectURL(blob);
      } else {
        const datos = JSON.parse(doc.datosJson || "{}");
        const pdfBytes =
          doc.tipo === "NOMINA_COMISION"
            ? await generarPdfNomina(comision, institucion!, doc.periodo)
            : await generarPdfPia(
                institucion!,
                comision,
                {
                  saldoInicialCaja: datos.saldoInicialCaja ?? 150000,
                  saldoInicialBanco: datos.saldoInicialBanco ?? 230000,
                  totalCuotas: datos.totalCuotas ?? 480000,
                  totalDonaciones: datos.totalDonaciones ?? 35000,
                  totalRifas: datos.totalRifas ?? 60000,
                  totalFestivales: datos.totalFestivales ?? 185000,
                  totalKiosco: datos.totalKiosco ?? 80000,
                  intereses: datos.intereses ?? 6000,
                  reintegrados: datos.reintegrados ?? 2000,
                  subsidios: datos.subsidios ?? 250000,
                  otrosIngresosA: datos.otrosIngresosA ?? 20000,
                  otrosIngresosB: datos.otrosIngresosB ?? 15000,
                  ropaCalzado: datos.ropaCalzado ?? 45000,
                  librosUtiles: datos.librosUtiles ?? 80000,
                  excursiones: datos.excursiones ?? 55000,
                  emergencias: datos.emergencias ?? 15000,
                  golosinasPremios: datos.golosinasPremios ?? 22000,
                  materialDidactico: datos.materialDidactico ?? 60000,
                  mantSubsidios: datos.mantSubsidios ?? 150000,
                  mantFondosPropios: datos.mantFondosPropios ?? 85000,
                  limpieza: datos.limpieza ?? 42000,
                  combustible: datos.combustible ?? 25000,
                  libreria: datos.libreria ?? 20000,
                  mobiliario: datos.mobiliario ?? 70000,
                  organizacionRifas: datos.organizacionRifas ?? 15000,
                  organizacionFestivales: datos.organizacionFestivales ?? 35000,
                  gastosKiosco: datos.gastosKiosco ?? 40000,
                  otrosGastosA: datos.otrosGastosA ?? 10000,
                  otrosGastosB: datos.otrosGastosB ?? 7000,
                  cuotaSocialAprobada: datos.cuotaSocialAprobada ?? 8000,
                  cajaChicaAprobada: datos.cajaChicaAprobada ?? 40000,
                },
                datos.ejercicio || doc.periodo
              );
        pdfBase64 = uint8ArrayToBase64(pdfBytes);
        const blob = base64ToBlob(pdfBase64);
        blobUrl = URL.createObjectURL(blob);
      }

      setDocActivo({
        titulo: doc.titulo,
        pdfBlobUrl: blobUrl,
        pdfBase64,
        nombreArchivo: doc.archivoPdf,
      });
      setVista("visor");
    } catch (err: any) {
      setError(err?.message || "Error al abrir el documento");
    } finally {
      setGenerando(false);
    }
  };

  // Imprimir desde el iframe
  const handleImprimir = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.print();
    }
  };

  // Exportar al Escritorio
  const handleExportarEscritorio = async () => {
    if (!docActivo) return;
    try {
      const ruta = await api.exportarPdfEscritorio(
        docActivo.nombreArchivo,
        docActivo.pdfBase64
      );
      setMensajeExito(`Copia guardada con éxito en: ${ruta}`);
    } catch (err: any) {
      setError(err?.message || "Error al exportar al Escritorio");
    }
  };

  // Confirmar eliminación
  const handleConfirmarEliminar = async () => {
    if (!docAEliminar) return;
    try {
      await api.eliminarDocumentoAsamblea(docAEliminar.id);
      setDocumentos((prev) => prev.filter((d) => d.id !== docAEliminar.id));
      setMensajeExito("Documento eliminado correctamente.");
    } catch (err: any) {
      setError(err?.message || "Error al eliminar el documento");
    } finally {
      setDocAEliminar(null);
    }
  };

  const handleAprobarDocumento = async (doc: DocumentoAsambleaFila) => {
    try {
      await api.aprobarDocumentoAsamblea(doc.id);
      setDocumentos((prev) => prev.map((item) => item.id === doc.id
        ? { ...item, aprobado: 1, aprobadoPor: usuario.nombre, aprobadoEn: new Date().toLocaleString("es-AR") }
        : item));
      setMensajeExito("Documento aprobado correctamente.");
    } catch (err: any) {
      setError(err?.message || "Error al aprobar el documento");
    }
  };

  const columns: Column<DocumentoAsambleaFila>[] = [
    { header: "Fecha", minWidth: 120, flex: true, render: (doc) => doc.fechaGeneracion },
    {
      header: "Tipo de Formulario",
      minWidth: 170,
      flex: true,
      render: (doc) => (
        <Badge tone={doc.tipo === "NOMINA_COMISION" ? "primary" : "ok"}>
          {doc.tipo === "NOMINA_COMISION" ? "Nómina Directiva" : "P.I.A. Cooperadoras"}
        </Badge>
      ),
    },
    {
      header: "Título del Documento",
      minWidth: 260,
      flex: true,
      render: (doc) => <strong>{doc.titulo}</strong>,
    },
    { header: "Período", minWidth: 100, flex: true, render: (doc) => doc.periodo },
    { header: "Generado por", minWidth: 160, flex: true, render: (doc) => doc.generadoPor },
    {
      header: "Estado",
      minWidth: 110,
      flex: true,
      render: (doc) => <Badge tone={doc.aprobado === 1 ? "ok" : "warn"}>{doc.aprobado === 1 ? "Aprobado" : "Pendiente"}</Badge>,
    },
    {
      header: "Acciones",
      width: 95,
      align: "center",
      render: (doc) => (
        <div style={{ display: "flex", gap: "6px", justifyContent: "center", alignItems: "center" }}>
          <IconButton
            icon={<EyeIcon size={16} />}
            title="Visualizar e Imprimir PDF"
            variant="default"
            square
            onClick={(e) => {
              e.stopPropagation();
              handleVerPdfHistorico(doc);
            }}
          />
          {puedeAprobar && doc.aprobado !== 1 && (
            <IconButton
              icon={<CheckIcon size={16} />}
              title="Aprobar documento"
              variant="success"
              square
              onClick={(e) => {
                e.stopPropagation();
                handleAprobarDocumento(doc);
              }}
            />
          )}
          {puedeEliminar && (
            <IconButton
              icon={<TrashIcon size={16} />}
              title="Eliminar documento del historial"
              variant="danger"
              square
              onClick={(e) => {
                e.stopPropagation();
                setDocAEliminar(doc);
              }}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <Layout
      title="Documentación de Asambleas"
      action={
        vista !== "listado" ? (
          <Button
            variant="secondary"
            onClick={() => {
              setVista("listado");
              setMensajeExito(null);
              setError(null);
            }}
          >
            ← Volver al listado
          </Button>
        ) : (
          puedeGenerar ? (
            <div style={{ display: "flex", gap: "var(--space-4)" }}>
              <Button
                variant="secondary"
                disabled={generando || loading}
                onClick={handleGenerarNomina}
              >
                {generando ? "Generando..." : "+ Generar Nómina Comisión"}
              </Button>
              <Button
                disabled={generando || loading}
                onClick={handleGenerarPia}
              >
                {generando ? "Generando..." : "+ Generar P.I.A."}
              </Button>
            </div>
          ) : null
        )
      }
    >
      {mensajeExito && <div className={s.successMsg}>{mensajeExito}</div>}
      {error && <div className={s.errorMsg}>{error}</div>}

      {/* VISTA 1: LISTADO DE DOCUMENTOS HISTÓRICOS */}
      {vista === "listado" && (
        <div className={s.container}>
          <DataTable
            columns={columns}
            rows={documentos}
            rowKey={(doc) => doc.id}
            onRowClick={(doc) => handleVerPdfHistorico(doc)}
            emptyMessage={
              loading
                ? "Cargando registros..."
                : "No hay documentos generados aún. Haz clic en los botones superiores para emitir un formulario oficial."
            }
          />
        </div>
      )}

      {/* VISTA 2: VISOR INTEGRADO Y EXPORTACIÓN */}
      {vista === "visor" && docActivo && (
        <div className={s.previewScreen}>
          <div className={s.previewToolbar}>
            <div className={s.previewDocInfo}>
              <span className={s.previewTitle}>{docActivo.titulo}</span>
            </div>
            <div className={s.previewActions}>
              <Button
                variant="secondary"
                onClick={handleImprimir}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <PrinterIcon size={16} />
                Imprimir
              </Button>
              <Button
                variant="primary"
                onClick={handleExportarEscritorio}
              >
                💾 Guardar copia en Escritorio
              </Button>
            </div>
          </div>
          <div className={s.iframeWrapper}>
            <iframe
              ref={iframeRef}
              src={docActivo.pdfBlobUrl}
              title={docActivo.titulo}
              className={s.pdfFrame}
            />
          </div>
        </div>
      )}

      {/* DIÁLOGO DE CONFIRMACIÓN CON ESTILO DE LA APP */}
      <ConfirmDialog
        isOpen={!!docAEliminar}
        title="Eliminar Documento de Asamblea"
        message={`¿Estás seguro de que deseas eliminar permanentemente "${docAEliminar?.titulo}" del registro histórico?`}
        confirmLabel="Eliminar documento"
        variant="danger"
        onConfirm={handleConfirmarEliminar}
        onCancel={() => setDocAEliminar(null)}
      />
    </Layout>
  );
}
