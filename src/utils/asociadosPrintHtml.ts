// src/utils/asociadosPrintHtml.ts
import { AsociadoFila, AsociadoDetalle, PagoFila, DatosInstitucionales } from "../api";

export interface ColumnasSeleccionadas {
  dni: boolean;
  telefono: boolean;
  email: boolean;
  alumnos: boolean;
  fechaAlta: boolean;
  estadoCuotas: boolean;
  activo: boolean;
  firma: boolean;
}

export const COLUMNAS_DEFAULT: ColumnasSeleccionadas = {
  dni: true,
  telefono: true,
  email: false,
  alumnos: true,
  fechaAlta: false,
  estadoCuotas: true,
  activo: true,
  firma: false,
};

export function generarHtmlListadoAsociados(
  asociados: AsociadoFila[],
  institucion: DatosInstitucionales | null,
  cols: ColumnasSeleccionadas,
  subtituloFiltros: string
): string {
  const nombreInstitucion = institucion?.asociacionNombre || "Asociación Cooperadora Escolar";
  const escuela = `${institucion?.numeroEscuela || "Escuela Primaria"} — ${institucion?.nombreEscuela || ""}`;
  const distrito = institucion?.distrito || "Morón";
  const cuit = institucion?.cuit || "";
  const telefono = institucion?.telefonoEscuela || "";
  const email = institucion?.emailInstitucional || "";
  const fechaHoy = new Date().toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const horaHoy = new Date().toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const headerCells = [
    `<th style="width: 40px; text-align: center;">#</th>`,
    `<th style="text-align: left;">Apellido y Nombre</th>`,
    cols.dni ? `<th style="width: 95px; text-align: center;">DNI</th>` : "",
    cols.telefono ? `<th style="width: 110px; text-align: left;">Teléfono</th>` : "",
    cols.email ? `<th style="text-align: left;">Correo</th>` : "",
    cols.alumnos ? `<th style="text-align: left;">Alumnos a Cargo</th>` : "",
    cols.fechaAlta ? `<th style="width: 85px; text-align: center;">F. Alta</th>` : "",
    cols.estadoCuotas ? `<th style="width: 90px; text-align: center;">Cuotas</th>` : "",
    cols.activo ? `<th style="width: 80px; text-align: center;">Estado</th>` : "",
    cols.firma ? `<th style="width: 140px; text-align: center;">Firma del Socio</th>` : "",
  ].filter(Boolean).join("");

  const rowsHtml = asociados.map((a, idx) => {
    const estadoCuotaTone =
      a.estadoCuotas === "Al día"
        ? "color: #047857; font-weight: 600;"
        : a.estadoCuotas === "Con deuda"
        ? "color: #b91c1c; font-weight: 600;"
        : "color: #b45309; font-weight: 600;";

    const estadoTone = a.activo === 1 ? "color: #111827;" : "color: #9ca3af; font-style: italic;";

    return `
      <tr style="border-bottom: 1px solid #e5e7eb; ${idx % 2 === 1 ? "background-color: #f9fafb;" : ""}">
        <td style="text-align: center; color: #6b7280; font-size: 11px;">${idx + 1}</td>
        <td style="font-weight: 600; color: #111827;">${a.apellidoNombre}</td>
        ${cols.dni ? `<td style="text-align: center; font-family: monospace; font-size: 11.5px;">${a.dni}</td>` : ""}
        ${cols.telefono ? `<td style="font-size: 11.5px;">${a.telefono || "—"}</td>` : ""}
        ${cols.email ? `<td style="font-size: 11px; color: #374151;">${(a as any).email || "—"}</td>` : ""}
        ${cols.alumnos ? `<td style="font-size: 11.5px; color: #1f2937;">${a.alumnos || "—"}</td>` : ""}
        ${cols.fechaAlta ? `<td style="text-align: center; font-size: 11px;">${(a as any).fechaAlta || "—"}</td>` : ""}
        ${cols.estadoCuotas ? `<td style="text-align: center; font-size: 11px; ${estadoCuotaTone}">${a.estadoCuotas}</td>` : ""}
        ${cols.activo ? `<td style="text-align: center; font-size: 11px; ${estadoTone}">${a.activo === 1 ? "Activo" : "De baja"}</td>` : ""}
        ${cols.firma ? `<td style="border-bottom: 1px dashed #9ca3af; height: 32px;"></td>` : ""}
      </tr>
    `;
  }).join("");

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Padrón de Asociados - ${nombreInstitucion}</title>
  <style>
    @page {
      size: A4 ${cols.firma || (cols.email && cols.alumnos) ? "landscape" : "portrait"};
      margin: 12mm 10mm 15mm 10mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111827;
      background: #ffffff;
      margin: 0;
      padding: 16px;
      font-size: 12px;
      line-height: 1.35;
    }
    .header {
      border-bottom: 2px solid #0f3d5e;
      padding-bottom: 10px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .header-main {
      flex: 1;
    }
    .inst-title {
      font-size: 16px;
      font-weight: 800;
      color: #0f3d5e;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin: 0 0 2px 0;
    }
    .inst-subtitle {
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      margin: 0 0 3px 0;
    }
    .inst-meta {
      font-size: 11px;
      color: #6b7280;
      margin: 0;
    }
    .header-right {
      text-align: right;
    }
    .doc-badge {
      display: inline-block;
      background: #eef4f9;
      color: #0f3d5e;
      border: 1px solid #bfd3e3;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11.5px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .doc-date {
      font-size: 10.5px;
      color: #6b7280;
    }
    .filters-note {
      background: #f3f4f6;
      border-left: 3px solid #0f3d5e;
      padding: 6px 10px;
      margin-bottom: 12px;
      font-size: 11px;
      color: #374151;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      page-break-inside: auto;
    }
    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    th {
      background: #0f3d5e;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      padding: 6px 8px;
      border: 1px solid #0f3d5e;
    }
    td {
      padding: 5px 8px;
      vertical-align: middle;
      font-size: 11.5px;
    }
    .footer {
      margin-top: 18px;
      padding-top: 8px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #6b7280;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-main">
      <h1 class="inst-title">${nombreInstitucion}</h1>
      <h2 class="inst-subtitle">${escuela}</h2>
      <p class="inst-meta">Distrito: ${distrito} ${cuit ? `· CUIT: ${cuit}` : ""}</p>
      <p class="inst-meta">${telefono ? `Tel: ${telefono}` : ""}${telefono && email ? " · " : ""}${email ? `Email: ${email}` : ""}</p>
    </div>
    <div class="header-right">
      <div class="doc-badge">Padrón de Asociados</div>
      <div class="doc-date">Listado de asociados</div>
    </div>
  </div>

  <div class="filters-note">
    <span><strong>Criterio / Filtro:</strong> ${subtituloFiltros}</span>
    <span><strong>Total registros:</strong> ${asociados.length} asociados</span>
  </div>

  <table>
    <thead>
      <tr>${headerCells}</tr>
    </thead>
    <tbody>
      ${rowsHtml || `<tr><td colspan="10" style="text-align: center; padding: 24px; color: #6b7280;">No hay asociados para mostrar con los criterios seleccionados.</td></tr>`}
    </tbody>
  </table>

  <div class="footer">
    <span>Sistema Integral Cooperar · Gestión Institucional de Asociaciones Cooperadoras</span>
    <span>Fecha de impresión: ${fechaHoy} ${horaHoy}</span>
  </div>
</body>
</html>
`;
}

export function generarHtmlFichaAsociado(
  asociado: AsociadoDetalle,
  pagos: PagoFila[],
  institucion: DatosInstitucionales | null
): string {
  const nombreInstitucion = institucion?.asociacionNombre || "Asociación Cooperadora Escolar";
  const escuela = `${institucion?.numeroEscuela || "Escuela Primaria"} — ${institucion?.nombreEscuela || ""}`;
  const distrito = institucion?.distrito || "Morón";
  const cuit = institucion?.cuit || "";
  const telefono = institucion?.telefonoEscuela || "";
  const email = institucion?.emailInstitucional || "";
  const fechaHoy = new Date().toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const horaHoy = new Date().toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const totalAportado = pagos
    .filter((p: any) => p.anulado !== 1)
    .reduce((acc, p) => acc + (p.monto || 0), 0);

  const pagosFilasHtml = pagos.map((p: any, idx) => {
    const isAnulado = p.anulado === 1;
    const anuladoTag = isAnulado ? `<span style="color: #dc2626; font-weight: 700;"> (ANULADO)</span>` : "";
    const styleRow = isAnulado ? "text-decoration: line-through; color: #9ca3af; background-color: #fef2f2;" : idx % 2 === 1 ? "background-color: #f9fafb;" : "";
    return `
      <tr style="border-bottom: 1px solid #e5e7eb; ${styleRow}">
        <td style="text-align: center; font-size: 11px;">${p.fechaPago}</td>
        <td style="text-align: center; font-weight: 700; color: #0f3d5e;">${p.periodo}</td>
        <td style="text-align: center; font-family: monospace; font-size: 11px;">${p.comprobante || `REC-${p.id}`}</td>
        <td style="font-size: 11px;">${p.medio}</td>
        <td style="text-align: right; font-weight: 700; color: ${isAnulado ? "#9ca3af" : "#047857"};">
          $ ${p.monto.toLocaleString("es-AR")}${anuladoTag}
        </td>
        <td style="font-size: 10.5px; color: #4b5563;">${p.registradoPorRol || p.registradoPor}</td>
      </tr>
    `;
  }).join("");

  const alumnosHtml = asociado.listaAlumnos && asociado.listaAlumnos.length > 0
    ? asociado.listaAlumnos.map((al) => `
        <div style="background: #f3f4f6; border-left: 3px solid #0f3d5e; padding: 6px 10px; border-radius: 4px; display: inline-block; margin-right: 8px; margin-bottom: 6px;">
          <strong style="color: #111827;">${al.nombre}</strong>
          <span style="color: #4b5563; font-size: 11px; margin-left: 4px;">(${al.curso})</span>
        </div>
      `).join("")
    : `<em style="color: #6b7280;">No registra alumnos a cargo vinculados.</em>`;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Ficha de Asociado - ${asociado.apellidoNombre}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 12mm 15mm 12mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111827;
      background: #ffffff;
      margin: 0;
      padding: 16px;
      font-size: 12px;
      line-height: 1.4;
    }
    .header {
      border-bottom: 2px solid #0f3d5e;
      padding-bottom: 10px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .inst-title {
      font-size: 16px;
      font-weight: 800;
      color: #0f3d5e;
      text-transform: uppercase;
      margin: 0 0 2px 0;
    }
    .inst-subtitle {
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      margin: 0 0 2px 0;
    }
    .inst-meta {
      font-size: 11px;
      color: #6b7280;
      margin: 0;
    }
    .doc-badge {
      display: inline-block;
      background: #eef4f9;
      color: #0f3d5e;
      border: 1px solid #bfd3e3;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .doc-date {
      font-size: 10.5px;
      color: #6b7280;
    }
    .section-title {
      font-size: 12.5px;
      font-weight: 700;
      color: #0f3d5e;
      text-transform: uppercase;
      border-bottom: 1.5px solid #e5e7eb;
      padding-bottom: 4px;
      margin: 16px 0 10px 0;
    }
    .grid-data {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px 14px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 12px 14px;
    }
    .data-item {
      display: flex;
      flex-direction: column;
    }
    .data-label {
      font-size: 10.5px;
      text-transform: uppercase;
      color: #6b7280;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .data-value {
      font-size: 12.5px;
      font-weight: 600;
      color: #111827;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    th {
      background: #0f3d5e;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 6px 8px;
      border: 1px solid #0f3d5e;
    }
    td {
      padding: 5px 8px;
      border: 1px solid #e5e7eb;
      font-size: 11.5px;
    }
    .summary-box {
      margin-top: 10px;
      padding: 8px 12px;
      background: #eef4f9;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      font-weight: 600;
      color: #0f3d5e;
    }
    .signatures {
      margin-top: 36px;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 40px;
      padding: 0 30px;
    }
    .sign-box {
      border-top: 1px solid #374151;
      text-align: center;
      padding-top: 6px;
      font-size: 11px;
      color: #374151;
    }
    .footer {
      margin-top: 24px;
      padding-top: 8px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #6b7280;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="inst-title">${nombreInstitucion}</h1>
      <h2 class="inst-subtitle">${escuela}</h2>
      <p class="inst-meta">Distrito: ${distrito} ${cuit ? `· CUIT: ${cuit}` : ""}</p>
      <p class="inst-meta">${telefono ? `Tel: ${telefono}` : ""}${telefono && email ? " · " : ""}${email ? `Email: ${email}` : ""}</p>
    </div>
    <div style="text-align: right;">
      <div class="doc-badge">Ficha Oficial de Asociado</div>
      <div class="doc-date">Ficha de asociado</div>
    </div>
  </div>

  <div class="section-title">1. Información del Asociado</div>
  <div class="grid-data">
    <div class="data-item">
      <span class="data-label">Apellido y Nombre</span>
      <span class="data-value" style="font-size: 13.5px; color: #0f3d5e;">${asociado.apellidoNombre}</span>
    </div>
    <div class="data-item">
      <span class="data-label">Documento Nacional de Identidad</span>
      <span class="data-value" style="font-family: monospace;">${asociado.dni}</span>
    </div>
    <div class="data-item">
      <span class="data-label">Número de Socio / ID</span>
      <span class="data-value">#${asociado.id.toString().padStart(4, "0")}</span>
    </div>
    <div class="data-item">
      <span class="data-label">Teléfono de Contacto</span>
      <span class="data-value">${asociado.telefono || "No registrado"}</span>
    </div>
    <div class="data-item">
      <span class="data-label">Correo Electrónico</span>
      <span class="data-value">${asociado.email || "No registrado"}</span>
    </div>
    <div class="data-item">
      <span class="data-label">Fecha de Ingreso / Alta</span>
      <span class="data-value">${asociado.fechaAlta}</span>
    </div>
    <div class="data-item">
      <span class="data-label">Estado Societario</span>
      <span class="data-value" style="${asociado.activo === 1 ? "color: #047857;" : "color: #dc2626;"}">
        ${asociado.activo === 1 ? "Activo (En Padrón)" : "Dado de baja"}
      </span>
    </div>
    <div class="data-item">
      <span class="data-label">Situación Arancelaria</span>
      <span class="data-value" style="${asociado.estadoCuotas === "Al día" ? "color: #047857;" : asociado.estadoCuotas === "Con deuda" ? "color: #dc2626;" : "color: #b45309;"}">
        ${asociado.estadoCuotas} ${asociado.exento === 1 ? "(Exención Aprobada)" : ""}
      </span>
    </div>
  </div>

  <div class="section-title">2. Alumnos a Cargo Vinculados</div>
  <div style="margin-top: 6px;">
    ${alumnosHtml}
  </div>

  <div class="section-title">3. Historial de Pagos y Aportes Registrados</div>
  <table>
    <thead>
      <tr>
        <th style="width: 85px;">Fecha</th>
        <th style="width: 80px;">Período</th>
        <th style="width: 100px;">Comprobante</th>
        <th>Medio de Pago</th>
        <th style="width: 110px; text-align: right;">Monto Aportado</th>
        <th style="width: 130px;">Registrado Por</th>
      </tr>
    </thead>
    <tbody>
      ${pagosFilasHtml || `<tr><td colspan="6" style="text-align: center; padding: 16px; color: #6b7280;">No registra pagos asentados en la cuenta de cuotas.</td></tr>`}
    </tbody>
  </table>

  <div class="summary-box">
    <span>Total de cuotas activas registradas: ${pagos.filter((p: any) => p.anulado !== 1).length}</span>
    <span>Suma Total Aportada: $ ${totalAportado.toLocaleString("es-AR")}</span>
  </div>

  <div class="signatures">
    <div class="sign-box">
      <strong>Firma del Asociado Titular</strong><br>
      Aclaración y DNI
    </div>
    <div class="sign-box">
      <strong>Sello y Firma de Tesorería / Presidencia</strong><br>
      Asociación Cooperadora Escolar
    </div>
  </div>

  <div class="footer">
    <span>Sistema Integral Cooperar · Certificado Oficial de Estado de Cuenta</span>
    <span>Fecha de impresión: ${fechaHoy} ${horaHoy}</span>
  </div>
</body>
</html>
`;
}
