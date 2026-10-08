// src-tauri/src/commands.rs
use crate::{db, AppState};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

type R<T> = Result<T, String>;
fn s<E: ToString>(e: E) -> String { e.to_string() }

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Usuario { pub id: i64, pub nombre: String, pub rol: String }

fn auth(st: &State<AppState>) -> R<Usuario> {
    let g = st.sesion.lock().map_err(s)?;
    g.clone().ok_or_else(|| "Sesión no iniciada".to_string())
}

fn one(db: &Connection, sql: &str) -> R<i64> {
    db.query_row(sql, [], |r| r.get(0)).map_err(s)
}

// ----------------------------------------------------
// AUTENTICACIÓN
// ----------------------------------------------------

#[tauri::command]
pub fn login(st: State<AppState>, dni: String, clave: String) -> R<Usuario> {
    let msg = "DNI o contraseña incorrectos".to_string();
    let found: (Usuario, String) = {
        let db = st.db.lock().map_err(s)?;
        db.query_row(
            "SELECT id,nombre,rol,clave_hash FROM usuarios WHERE activo=1 AND dni=?1",
            params![dni.trim()],
            |r| Ok((Usuario { id: r.get(0)?, nombre: r.get(1)?, rol: r.get(2)? }, r.get(3)?)),
        )
        .map_err(|_| msg.clone())?
    };
    if !db::verify(&clave, &found.1) { return Err(msg); }
    *st.sesion.lock().map_err(s)? = Some(found.0.clone());
    Ok(found.0)
}

#[tauri::command]
pub fn logout(st: State<AppState>) -> R<()> {
    *st.sesion.lock().map_err(s)? = None;
    Ok(())
}

// ----------------------------------------------------
// INICIO Y DASHBOARD
// ----------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Movimiento { pub descripcion: String, pub tipo: String, pub monto: i64 }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumenInicio {
    pub saldo_caja: i64,
    pub cuotas_cobradas: i64,
    pub cuotas_total: i64,
    pub con_deuda: i64,
    pub proxima_reunion: Option<String>,
    pub ultimos_movimientos: Vec<Movimiento>,
    pub ultima_copia: Option<String>,
}

#[tauri::command]
pub fn resumen_inicio(st: State<AppState>) -> R<ResumenInicio> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let saldo_caja = one(&db, "SELECT COALESCE(SUM(CASE tipo WHEN 'Ingreso' THEN monto ELSE -monto END),0) FROM movimientos_caja WHERE anulado=0")?;
    let cuotas_cobradas = one(&db, "SELECT COUNT(DISTINCT asociado_id) FROM pagos WHERE periodo=strftime('%Y-%m','now','localtime')")?;
    let cuotas_total = one(&db, "SELECT COUNT(*) FROM v_asociados WHERE activo=1 AND exento=0")?;
    let con_deuda = one(&db, "SELECT COUNT(*) FROM v_asociados WHERE activo=1 AND estado_cuotas='Con deuda'")?;
    let proxima_reunion: Option<String> = db
        .query_row(
            "SELECT strftime('%d/%m',fecha) || ' · ' || tipo FROM reuniones WHERE fecha>=date('now','localtime') ORDER BY fecha LIMIT 1",
            [], |r| r.get(0),
        )
        .optional().map_err(s)?;
    let ultima_copia: Option<String> = db
        .query_row("SELECT valor FROM configuracion WHERE clave='ultima_copia'", [], |r| r.get(0))
        .optional().map_err(s)?;
    let mut q = db
        .prepare("SELECT descripcion,tipo,monto FROM movimientos_caja WHERE anulado=0 ORDER BY fecha DESC, id DESC LIMIT 4")
        .map_err(s)?;
    let rows = q
        .query_map([], |r| Ok(Movimiento { descripcion: r.get(0)?, tipo: r.get(1)?, monto: r.get(2)? }))
        .map_err(s)?;
    let ultimos_movimientos = rows.collect::<Result<Vec<_>, _>>().map_err(s)?;
    Ok(ResumenInicio { saldo_caja, cuotas_cobradas, cuotas_total, con_deuda, proxima_reunion, ultimos_movimientos, ultima_copia })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumenPadron { pub activos: i64, pub con_deuda: i64, pub exentos: i64 }

#[tauri::command]
pub fn resumen_padron(st: State<AppState>) -> R<ResumenPadron> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    Ok(ResumenPadron {
        activos: one(&db, "SELECT COUNT(*) FROM v_asociados WHERE activo=1")?,
        con_deuda: one(&db, "SELECT COUNT(*) FROM v_asociados WHERE activo=1 AND estado_cuotas='Con deuda'")?,
        exentos: one(&db, "SELECT COUNT(*) FROM v_asociados WHERE activo=1 AND exento=1")?,
    })
}

// ----------------------------------------------------
// ASOCIADOS
// ----------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsociadoFila {
    pub id: i64,
    pub apellido_nombre: String,
    pub dni: String,
    pub telefono: Option<String>,
    pub alumnos: Option<String>,
    pub estado_cuotas: String,
    pub activo: i64,
}

#[tauri::command]
pub fn listar_asociados(st: State<AppState>, busqueda: String, estado_cuotas: String, estado: String) -> R<Vec<AsociadoFila>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let activo_cond = match estado.trim() {
        "Activos" | "Activo" => "AND activo=1",
        "Dados de baja" | "Baja" => "AND activo=0",
        _ => "", // "Todos"
    };
    let sql = format!(
        "SELECT id,apellido_nombre,dni,telefono,alumnos,estado_cuotas,activo FROM v_asociados
         WHERE (1=1 {})
           AND (?1='' OR apellido_nombre LIKE '%'||?1||'%' OR dni LIKE '%'||?1||'%')
           AND (?2='Todos' OR estado_cuotas=?2)
         ORDER BY apellido_nombre",
        activo_cond
    );
    let mut q = db.prepare(&sql).map_err(s)?;
    let rows = q
        .query_map(params![busqueda.trim(), estado_cuotas], |r| {
            Ok(AsociadoFila {
                id: r.get(0)?, apellido_nombre: r.get(1)?, dni: r.get(2)?,
                telefono: r.get(3)?, alumnos: r.get(4)?, estado_cuotas: r.get(5)?,
                activo: r.get(6)?,
            })
        })
        .map_err(s)?;
    let v = rows.collect::<Result<Vec<_>, _>>().map_err(s)?;
    Ok(v)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlumnoItem { pub id: i64, pub nombre: String, pub curso: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsociadoDetalle {
    pub id: i64,
    pub apellido_nombre: String,
    pub dni: String,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub fecha_alta: String,
    pub alumnos: Option<String>,
    pub lista_alumnos: Vec<AlumnoItem>,
    pub estado_cuotas: String,
    pub exento: i64,
    pub activo: i64,
}

#[tauri::command]
pub fn obtener_asociado(st: State<AppState>, id: i64) -> R<AsociadoDetalle> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let detalle = db.query_row(
        "SELECT id,apellido_nombre,dni,telefono,email,fecha_alta,alumnos,estado_cuotas,exento,activo FROM v_asociados WHERE id=?1",
        params![id],
        |r| Ok((
            r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, Option<String>>(3)?,
            r.get::<_, Option<String>>(4)?, r.get::<_, String>(5)?, r.get::<_, Option<String>>(6)?,
            r.get::<_, String>(7)?, r.get::<_, i64>(8)?, r.get::<_, i64>(9)?,
        )),
    )
    .map_err(s)?;

    let mut q = db.prepare("SELECT id,nombre,curso FROM alumnos WHERE asociado_id=?1 ORDER BY id").map_err(s)?;
    let alumnos_rows = q.query_map(params![id], |r| Ok(AlumnoItem { id: r.get(0)?, nombre: r.get(1)?, curso: r.get(2)? })).map_err(s)?;
    let lista_alumnos = alumnos_rows.collect::<Result<Vec<_>, _>>().map_err(s)?;

    Ok(AsociadoDetalle {
        id: detalle.0, apellido_nombre: detalle.1, dni: detalle.2, telefono: detalle.3,
        email: detalle.4, fecha_alta: detalle.5, alumnos: detalle.6, lista_alumnos,
        estado_cuotas: detalle.7, exento: detalle.8, activo: detalle.9,
    })
}

#[derive(Deserialize)]
pub struct NuevoAlumno { pub nombre: String, pub curso: String }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatosAsociado {
    pub apellido_nombre: String,
    pub dni: String,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub alumnos: Vec<NuevoAlumno>,
}

#[tauri::command]
pub fn crear_asociado(st: State<AppState>, datos: DatosAsociado) -> R<i64> {
    auth(&st)?;
    let mut db = st.db.lock().map_err(s)?;
    let tx = db.transaction().map_err(s)?;
    tx.execute(
        "INSERT INTO asociados(apellido_nombre,dni,telefono,email) VALUES(?1,?2,?3,?4)",
        params![datos.apellido_nombre.trim(), datos.dni.trim(), datos.telefono, datos.email],
    )
    .map_err(s)?;
    let id = tx.last_insert_rowid();
    for a in &datos.alumnos {
        if !a.nombre.trim().is_empty() {
            tx.execute("INSERT INTO alumnos(asociado_id,nombre,curso) VALUES(?1,?2,?3)", params![id, a.nombre.trim(), a.curso.trim()]).map_err(s)?;
        }
    }
    tx.commit().map_err(s)?;
    Ok(id)
}

#[tauri::command]
pub fn actualizar_asociado(st: State<AppState>, id: i64, datos: DatosAsociado) -> R<()> {
    auth(&st)?;
    let mut db = st.db.lock().map_err(s)?;
    let tx = db.transaction().map_err(s)?;
    tx.execute(
        "UPDATE asociados SET apellido_nombre=?1,dni=?2,telefono=?3,email=?4 WHERE id=?5",
        params![datos.apellido_nombre.trim(), datos.dni.trim(), datos.telefono, datos.email, id],
    )
    .map_err(s)?;
    tx.execute("DELETE FROM alumnos WHERE asociado_id=?1", params![id]).map_err(s)?;
    for a in &datos.alumnos {
        if !a.nombre.trim().is_empty() {
            tx.execute("INSERT INTO alumnos(asociado_id,nombre,curso) VALUES(?1,?2,?3)", params![id, a.nombre.trim(), a.curso.trim()]).map_err(s)?;
        }
    }
    tx.commit().map_err(s)
}

#[tauri::command]
pub fn marcar_exento(st: State<AppState>, id: i64, exento: bool) -> R<()> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.execute("UPDATE asociados SET exento=?1 WHERE id=?2", params![exento as i64, id]).map_err(s)?;
    Ok(())
}

#[tauri::command]
pub fn dar_de_baja(st: State<AppState>, id: i64) -> R<()> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.execute("UPDATE asociados SET activo=0 WHERE id=?1", params![id]).map_err(s)?;
    Ok(())
}

#[tauri::command]
pub fn reactivar_asociado(st: State<AppState>, id: i64) -> R<()> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.execute("UPDATE asociados SET activo=1 WHERE id=?1", params![id]).map_err(s)?;
    Ok(())
}

// ----------------------------------------------------
// CUOTAS Y PAGOS
// ----------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PagoFila {
    pub id: i64,
    pub asociado_id: i64,
    pub apellido_nombre: String,
    pub dni: String,
    pub periodo: String,
    pub fecha_pago: String,
    pub monto: i64,
    pub medio: String,
    pub comprobante: Option<String>,
    pub registrado_por: String,
}

#[tauri::command]
pub fn listar_pagos(st: State<AppState>, busqueda: String, periodo: String) -> R<Vec<PagoFila>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let mut q = db.prepare(
        "SELECT p.id, p.asociado_id, a.apellido_nombre, a.dni, p.periodo, p.fecha_pago, p.monto, p.medio, p.comprobante, u.nombre
         FROM pagos p
         JOIN asociados a ON a.id = p.asociado_id
         JOIN usuarios u ON u.id = p.registrado_por
         WHERE (?1 = '' OR a.apellido_nombre LIKE '%'||?1||'%' OR a.dni LIKE '%'||?1||'%' OR p.comprobante LIKE '%'||?1||'%')
           AND (?2 = 'Todos' OR ?2 = '' OR p.periodo = ?2)
         ORDER BY p.fecha_pago DESC, p.id DESC",
    ).map_err(s)?;
    let rows = q.query_map(params![busqueda.trim(), periodo.trim()], |r| {
        Ok(PagoFila {
            id: r.get(0)?, asociado_id: r.get(1)?, apellido_nombre: r.get(2)?, dni: r.get(3)?,
            periodo: r.get(4)?, fecha_pago: r.get(5)?, monto: r.get(6)?, medio: r.get(7)?,
            comprobante: r.get(8)?, registrado_por: r.get(9)?,
        })
    }).map_err(s)?;
    let v = rows.collect::<Result<Vec<_>, _>>().map_err(s)?;
    Ok(v)
}

#[tauri::command]
pub fn obtener_historial_pagos_asociado(st: State<AppState>, asociado_id: i64) -> R<Vec<PagoFila>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let mut q = db.prepare(
        "SELECT p.id, p.asociado_id, a.apellido_nombre, a.dni, p.periodo, p.fecha_pago, p.monto, p.medio, p.comprobante, u.nombre
         FROM pagos p
         JOIN asociados a ON a.id = p.asociado_id
         JOIN usuarios u ON u.id = p.registrado_por
         WHERE p.asociado_id = ?1
         ORDER BY p.periodo DESC, p.fecha_pago DESC",
    ).map_err(s)?;
    let rows = q.query_map(params![asociado_id], |r| {
        Ok(PagoFila {
            id: r.get(0)?, asociado_id: r.get(1)?, apellido_nombre: r.get(2)?, dni: r.get(3)?,
            periodo: r.get(4)?, fecha_pago: r.get(5)?, monto: r.get(6)?, medio: r.get(7)?,
            comprobante: r.get(8)?, registrado_por: r.get(9)?,
        })
    }).map_err(s)?;
    let v = rows.collect::<Result<Vec<_>, _>>().map_err(s)?;
    Ok(v)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatosPago {
    pub asociado_id: i64,
    pub periodo: String,
    pub monto: i64,
    pub medio: String,
    pub comprobante: Option<String>,
}

#[tauri::command]
pub fn registrar_pago(st: State<AppState>, datos: DatosPago) -> R<i64> {
    let u = auth(&st)?;
    let mut db = st.db.lock().map_err(s)?;
    let tx = db.transaction().map_err(s)?;

    let asociado_nombre: String = tx.query_row("SELECT apellido_nombre FROM asociados WHERE id=?1", params![datos.asociado_id], |r| r.get(0)).map_err(s)?;
    let desc = format!("Cobro cuota {} - {}", datos.periodo, asociado_nombre);

    // 1. Crear movimiento en caja automático
    tx.execute(
        "INSERT INTO movimientos_caja(fecha, tipo, categoria, descripcion, monto, comprobante) VALUES(date('now','localtime'), 'Ingreso', 'Cuotas', ?1, ?2, ?3)",
        params![desc, datos.monto, datos.comprobante],
    ).map_err(s)?;
    let mov_id = tx.last_insert_rowid();

    // 2. Registrar pago
    tx.execute(
        "INSERT INTO pagos(asociado_id, periodo, fecha_pago, monto, medio, comprobante, registrado_por, movimiento_id) VALUES(?1, ?2, date('now','localtime'), ?3, ?4, ?5, ?6, ?7)",
        params![datos.asociado_id, datos.periodo.trim(), datos.monto, datos.medio.trim(), datos.comprobante, u.id, mov_id],
    ).map_err(s)?;
    let pago_id = tx.last_insert_rowid();

    tx.commit().map_err(s)?;
    Ok(pago_id)
}

// ----------------------------------------------------
// CAJA
// ----------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovimientoCajaFila {
    pub id: i64,
    pub fecha: String,
    pub tipo: String,
    pub categoria: String,
    pub descripcion: String,
    pub monto: i64,
    pub comprobante: Option<String>,
    pub anulado: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumenCaja {
    pub saldo_actual: i64,
    pub ingresos_mes: i64,
    pub egresos_mes: i64,
    pub total_movimientos: i64,
}

#[tauri::command]
pub fn listar_movimientos_caja(st: State<AppState>, tipo: String, categoria: String, busqueda: String) -> R<Vec<MovimientoCajaFila>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let mut q = db.prepare(
        "SELECT id, fecha, tipo, categoria, descripcion, monto, comprobante, anulado
         FROM movimientos_caja
         WHERE (?1 = 'Todos' OR tipo = ?1)
           AND (?2 = 'Todas' OR categoria = ?2)
           AND (?3 = '' OR descripcion LIKE '%'||?3||'%' OR comprobante LIKE '%'||?3||'%')
         ORDER BY fecha DESC, id DESC",
    ).map_err(s)?;
    let rows = q.query_map(params![tipo, categoria, busqueda.trim()], |r| {
        Ok(MovimientoCajaFila {
            id: r.get(0)?, fecha: r.get(1)?, tipo: r.get(2)?, categoria: r.get(3)?,
            descripcion: r.get(4)?, monto: r.get(5)?, comprobante: r.get(6)?, anulado: r.get(7)?,
        })
    }).map_err(s)?;
    let v = rows.collect::<Result<Vec<_>, _>>().map_err(s)?;
    Ok(v)
}

#[tauri::command]
pub fn resumen_caja(st: State<AppState>) -> R<ResumenCaja> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let saldo_actual = one(&db, "SELECT COALESCE(SUM(CASE tipo WHEN 'Ingreso' THEN monto ELSE -monto END),0) FROM movimientos_caja WHERE anulado=0")?;
    let ingresos_mes = one(&db, "SELECT COALESCE(SUM(monto),0) FROM movimientos_caja WHERE tipo='Ingreso' AND anulado=0 AND strftime('%Y-%m', fecha)=strftime('%Y-%m','now','localtime')")?;
    let egresos_mes = one(&db, "SELECT COALESCE(SUM(monto),0) FROM movimientos_caja WHERE tipo='Egreso' AND anulado=0 AND strftime('%Y-%m', fecha)=strftime('%Y-%m','now','localtime')")?;
    let total_movimientos = one(&db, "SELECT COUNT(*) FROM movimientos_caja WHERE anulado=0")?;
    Ok(ResumenCaja { saldo_actual, ingresos_mes, egresos_mes, total_movimientos })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatosMovimientoCaja {
    pub tipo: String,
    pub categoria: String,
    pub descripcion: String,
    pub monto: i64,
    pub comprobante: Option<String>,
}

#[tauri::command]
pub fn crear_movimiento_caja(st: State<AppState>, datos: DatosMovimientoCaja) -> R<i64> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.execute(
        "INSERT INTO movimientos_caja(fecha, tipo, categoria, descripcion, monto, comprobante) VALUES(date('now','localtime'), ?1, ?2, ?3, ?4, ?5)",
        params![datos.tipo, datos.categoria.trim(), datos.descripcion.trim(), datos.monto, datos.comprobante],
    ).map_err(s)?;
    Ok(db.last_insert_rowid())
}

#[tauri::command]
pub fn anular_movimiento_caja(st: State<AppState>, id: i64) -> R<()> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.execute("UPDATE movimientos_caja SET anulado=1 WHERE id=?1", params![id]).map_err(s)?;
    Ok(())
}

// ----------------------------------------------------
// REUNIONES Y ACTAS
// ----------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReunionFila {
    pub id: i64,
    pub fecha: String,
    pub tipo: String,
    pub temas: String,
    pub acta: Option<String>,
    pub asistentes_count: i64,
}

#[tauri::command]
pub fn listar_reuniones(st: State<AppState>) -> R<Vec<ReunionFila>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let mut q = db.prepare(
        "SELECT r.id, r.fecha, r.tipo, r.temas, r.acta, COUNT(a.asociado_id)
         FROM reuniones r
         LEFT JOIN asistencias a ON a.reunion_id = r.id
         GROUP BY r.id
         ORDER BY r.fecha DESC, r.id DESC",
    ).map_err(s)?;
    let rows = q.query_map([], |r| {
        Ok(ReunionFila {
            id: r.get(0)?, fecha: r.get(1)?, tipo: r.get(2)?, temas: r.get(3)?,
            acta: r.get(4)?, asistentes_count: r.get(5)?,
        })
    }).map_err(s)?;
    let v = rows.collect::<Result<Vec<_>, _>>().map_err(s)?;
    Ok(v)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatosReunion {
    pub fecha: String,
    pub tipo: String,
    pub temas: String,
}

#[tauri::command]
pub fn crear_reunion(st: State<AppState>, datos: DatosReunion) -> R<i64> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.execute(
        "INSERT INTO reuniones(fecha, tipo, temas) VALUES(?1, ?2, ?3)",
        params![datos.fecha.trim(), datos.tipo.trim(), datos.temas.trim()],
    ).map_err(s)?;
    Ok(db.last_insert_rowid())
}

#[tauri::command]
pub fn guardar_acta(st: State<AppState>, id: i64, acta: String) -> R<()> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.execute("UPDATE reuniones SET acta=?1 WHERE id=?2", params![acta.trim(), id]).map_err(s)?;
    Ok(())
}

// ----------------------------------------------------
// RENDICIONES DE CUENTAS
// ----------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RendicionFila {
    pub id: i64,
    pub periodo: String,
    pub desde: String,
    pub hasta: String,
    pub generada_en: String,
    pub generada_por: String,
    pub estado: String,
    pub aprobada_por: Option<String>,
    pub aprobada_en: Option<String>,
    pub total_ingresos: i64,
    pub total_egresos: i64,
    pub saldo_periodo: i64,
}

#[tauri::command]
pub fn listar_rendiciones(st: State<AppState>) -> R<Vec<RendicionFila>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let mut q = db.prepare(
        "SELECT r.id, r.periodo, r.desde, r.hasta, r.generada_en, u1.nombre, r.estado, u2.nombre, r.aprobada_en,
                (SELECT COALESCE(SUM(monto),0) FROM movimientos_caja WHERE tipo='Ingreso' AND anulado=0 AND fecha BETWEEN r.desde AND r.hasta) as ing,
                (SELECT COALESCE(SUM(monto),0) FROM movimientos_caja WHERE tipo='Egreso' AND anulado=0 AND fecha BETWEEN r.desde AND r.hasta) as egr
         FROM rendiciones r
         JOIN usuarios u1 ON u1.id = r.generada_por
         LEFT JOIN usuarios u2 ON u2.id = r.aprobada_por
         ORDER BY r.desde DESC, r.id DESC",
    ).map_err(s)?;
    let rows = q.query_map([], |r| {
        let ing: i64 = r.get(9)?;
        let egr: i64 = r.get(10)?;
        Ok(RendicionFila {
            id: r.get(0)?, periodo: r.get(1)?, desde: r.get(2)?, hasta: r.get(3)?,
            generada_en: r.get(4)?, generada_por: r.get(5)?, estado: r.get(6)?,
            aprobada_por: r.get(7)?, aprobada_en: r.get(8)?, total_ingresos: ing,
            total_egresos: egr, saldo_periodo: ing - egr,
        })
    }).map_err(s)?;
    let v = rows.collect::<Result<Vec<_>, _>>().map_err(s)?;
    Ok(v)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatosRendicion {
    pub periodo: String,
    pub desde: String,
    pub hasta: String,
}

#[tauri::command]
pub fn crear_rendicion(st: State<AppState>, datos: DatosRendicion) -> R<i64> {
    let u = auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.execute(
        "INSERT INTO rendiciones(periodo, desde, hasta, generada_en, generada_por, estado) VALUES(?1, ?2, ?3, datetime('now','localtime'), ?4, 'Borrador')",
        params![datos.periodo.trim(), datos.desde.trim(), datos.hasta.trim(), u.id],
    ).map_err(s)?;
    Ok(db.last_insert_rowid())
}

#[tauri::command]
pub fn aprobar_rendicion(st: State<AppState>, id: i64) -> R<()> {
    let u = auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.execute(
        "UPDATE rendiciones SET estado='Aprobada', aprobada_por=?1, aprobada_en=datetime('now','localtime') WHERE id=?2",
        params![u.id, id],
    ).map_err(s)?;
    Ok(())
}

// ----------------------------------------------------
// USUARIOS Y RESPALDO
// ----------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsuarioFila {
    pub id: i64,
    pub nombre: String,
    pub dni: String,
    pub email: Option<String>,
    pub rol: String,
    pub activo: i64,
}

#[tauri::command]
pub fn listar_usuarios(st: State<AppState>) -> R<Vec<UsuarioFila>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let mut q = db.prepare("SELECT id, nombre, dni, email, rol, activo FROM usuarios ORDER BY id").map_err(s)?;
    let rows = q.query_map([], |r| {
        Ok(UsuarioFila {
            id: r.get(0)?, nombre: r.get(1)?, dni: r.get(2)?, email: r.get(3)?,
            rol: r.get(4)?, activo: r.get(5)?,
        })
    }).map_err(s)?;
    let v = rows.collect::<Result<Vec<_>, _>>().map_err(s)?;
    Ok(v)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatosUsuario {
    pub nombre: String,
    pub dni: String,
    pub email: Option<String>,
    pub rol: String,
    pub clave: Option<String>,
}

#[tauri::command]
pub fn crear_usuario(st: State<AppState>, datos: DatosUsuario) -> R<i64> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let clave = datos.clave.unwrap_or_else(|| "admin123".to_string());
    let hash_str = db::hash(&clave);
    db.execute(
        "INSERT INTO usuarios(nombre, dni, email, rol, clave_hash) VALUES(?1, ?2, ?3, ?4, ?5)",
        params![datos.nombre.trim(), datos.dni.trim(), datos.email, datos.rol.trim(), hash_str],
    ).map_err(s)?;
    Ok(db.last_insert_rowid())
}

#[tauri::command]
pub fn actualizar_usuario(st: State<AppState>, id: i64, datos: DatosUsuario) -> R<()> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    if let Some(ref c) = datos.clave {
        if !c.trim().is_empty() {
            let hash_str = db::hash(c.trim());
            db.execute("UPDATE usuarios SET clave_hash=?1 WHERE id=?2", params![hash_str, id]).map_err(s)?;
        }
    }
    db.execute(
        "UPDATE usuarios SET nombre=?1, dni=?2, email=?3, rol=?4 WHERE id=?5",
        params![datos.nombre.trim(), datos.dni.trim(), datos.email, datos.rol.trim(), id],
    ).map_err(s)?;
    Ok(())
}

#[tauri::command]
pub fn cambiar_estado_usuario(st: State<AppState>, id: i64, activo: bool) -> R<()> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.execute("UPDATE usuarios SET activo=?1 WHERE id=?2", params![activo as i64, id]).map_err(s)?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopiaSeguridadFila {
    pub nombre_archivo: String,
    pub fecha: String,
    pub tamano_bytes: u64,
}

#[tauri::command]
pub fn crear_copia_seguridad(st: State<AppState>) -> R<String> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let copias_dir = st.data_dir.join("copias");
    std::fs::create_dir_all(&copias_dir).map_err(s)?;

    let now_str: String = db.query_row("SELECT strftime('%Y%m%d_%H%M%S','now','localtime')", [], |r| r.get(0)).map_err(s)?;
    let filename = format!("cooperar_backup_{}.db", now_str);
    let dest_path = copias_dir.join(&filename);
    let dest_str = dest_path.to_string_lossy().to_string();

    // SQLite backup seguro y atómico mediante VACUUM INTO
    db.execute("VACUUM INTO ?1", params![dest_str]).map_err(s)?;

    let fecha_humana: String = db.query_row("SELECT datetime('now','localtime')", [], |r| r.get(0)).map_err(s)?;
    db.execute("INSERT INTO configuracion(clave, valor) VALUES('ultima_copia', ?1) ON CONFLICT(clave) DO UPDATE SET valor=?1", params![fecha_humana]).map_err(s)?;

    Ok(filename)
}

#[tauri::command]
pub fn listar_copias_seguridad(st: State<AppState>) -> R<Vec<CopiaSeguridadFila>> {
    auth(&st)?;
    let copias_dir = st.data_dir.join("copias");
    let mut copias = Vec::new();
    if let Ok(entries) = std::fs::read_dir(copias_dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.ends_with(".db") {
                        let fecha = meta.modified()
                            .ok()
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| format!("{:?}", d.as_secs()))
                            .unwrap_or_else(|| "Reciente".to_string());
                        copias.push(CopiaSeguridadFila {
                            nombre_archivo: name,
                            fecha,
                            tamano_bytes: meta.len(),
                        });
                    }
                }
            }
        }
    }
    copias.sort_by(|a, b| b.nombre_archivo.cmp(&a.nombre_archivo));
    Ok(copias)
}

#[tauri::command]
pub fn obtener_configuracion(st: State<AppState>, clave: String) -> R<Option<String>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.query_row("SELECT valor FROM configuracion WHERE clave=?1", params![clave], |r| r.get(0)).optional().map_err(s)
}

#[tauri::command]
pub fn guardar_configuracion(st: State<AppState>, clave: String, valor: String) -> R<()> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.execute("INSERT INTO configuracion(clave, valor) VALUES(?1, ?2) ON CONFLICT(clave) DO UPDATE SET valor=?2", params![clave, valor]).map_err(s)?;
    Ok(())
}

#[tauri::command]
pub fn obtener_ruta_datos(st: State<AppState>) -> R<String> {
    auth(&st)?;
    Ok(st.data_dir.to_string_lossy().to_string())
}