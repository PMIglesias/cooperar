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

fn auth_superadmin(st: &State<AppState>) -> R<Usuario> {
    let u = auth(st)?;
    if u.rol != "Superadmin" {
        return Err("Acceso denegado: sólo el Superadministrador puede acceder a esta sección".to_string());
    }
    Ok(u)
}

fn auth_superadmin_o_asesor(st: &State<AppState>) -> R<Usuario> {
    let u = auth(st)?;
    if u.rol != "Superadmin" && u.rol != "Asesor" {
        return Err("Acceso denegado: sólo el Superadministrador o el Asesor pueden consultar el historial".to_string());
    }
    Ok(u)
}

fn auth_secretaria_o_admin(st: &State<AppState>) -> R<Usuario> {
    let u = auth(st)?;
    if u.rol != "Secretaria" && u.rol != "Superadmin" {
        return Err("Acceso denegado: sólo la Secretaría o el Superadministrador pueden gestionar asociados y actas".to_string());
    }
    Ok(u)
}

fn auth_secretaria_presidente_o_admin(st: &State<AppState>) -> R<Usuario> {
    let u = auth(st)?;
    if u.rol != "Secretaria" && u.rol != "Presidente" && u.rol != "Superadmin" {
        return Err("Acceso denegado: sólo la Secretaría, la Presidencia o el Superadministrador pueden gestionar asociados, reuniones y actas".to_string());
    }
    Ok(u)
}

fn auth_tesorero_o_admin(st: &State<AppState>) -> R<Usuario> {
    let u = auth(st)?;
    if u.rol != "Tesorero" && u.rol != "Superadmin" {
        return Err("Acceso denegado: sólo la Tesorería o el Superadministrador pueden registrar pagos, movimientos de caja o rendiciones".to_string());
    }
    Ok(u)
}

fn auth_presidente_o_admin(st: &State<AppState>) -> R<Usuario> {
    let u = auth(st)?;
    if u.rol != "Presidente" && u.rol != "Superadmin" {
        return Err("Acceso denegado: sólo la Presidencia o el Superadministrador pueden aprobar rendiciones de cuentas".to_string());
    }
    Ok(u)
}

fn one(db: &Connection, sql: &str) -> R<i64> {
    db.query_row(sql, [], |r| r.get(0)).map_err(s)
}

fn auditar(db: &Connection, usuario_id: i64, accion: &str, entidad: &str, entidad_id: Option<i64>) -> R<()> {
    db.execute(
        "INSERT INTO auditoria(usuario_id, accion, entidad, entidad_id) VALUES(?1, ?2, ?3, ?4)",
        params![usuario_id, accion, entidad, entidad_id],
    ).map_err(s)?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditoriaFila {
    pub id: i64,
    pub usuario: String,
    pub fecha_hora: String,
    pub accion: String,
    pub entidad: String,
    pub entidad_id: Option<i64>,
}

#[tauri::command]
pub fn listar_auditoria(st: State<AppState>) -> R<Vec<AuditoriaFila>> {
    auth_superadmin(&st)?;
    let db = st.db.lock().map_err(s)?;
    let mut stmt = db.prepare(
        "SELECT a.id, COALESCE(u.nombre, 'Sistema'), a.fecha_hora, a.accion, a.entidad, a.entidad_id
         FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id
         ORDER BY a.id DESC",
    ).map_err(s)?;
    let rows = stmt.query_map([], |r| Ok(AuditoriaFila {
        id: r.get(0)?, usuario: r.get(1)?, fecha_hora: r.get(2)?, accion: r.get(3)?,
        entidad: r.get(4)?, entidad_id: r.get(5)?,
    })).map_err(s)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(s)
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
    pub email: Option<String>,
    pub alumnos: Option<String>,
    pub estado_cuotas: String,
    pub activo: i64,
    pub tipo_vinculo: String,
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
        "SELECT id,apellido_nombre,dni,telefono,email,alumnos,estado_cuotas,activo,tipo_vinculo FROM v_asociados
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
                telefono: r.get(3)?, email: r.get(4)?, alumnos: r.get(5)?, estado_cuotas: r.get(6)?,
                activo: r.get(7)?,
                tipo_vinculo: r.get(8)?,
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
    pub tipo_vinculo: String,
}

#[tauri::command]
pub fn obtener_asociado(st: State<AppState>, id: i64) -> R<AsociadoDetalle> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let detalle = db.query_row(
        "SELECT id,apellido_nombre,dni,telefono,email,fecha_alta,alumnos,estado_cuotas,exento,activo,tipo_vinculo FROM v_asociados WHERE id=?1",
        params![id],
        |r| Ok((
            r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, Option<String>>(3)?,
            r.get::<_, Option<String>>(4)?, r.get::<_, String>(5)?, r.get::<_, Option<String>>(6)?,
            r.get::<_, String>(7)?, r.get::<_, i64>(8)?, r.get::<_, i64>(9)?, r.get::<_, String>(10)?,
        )),
    )
    .map_err(s)?;

    let mut q = db.prepare("SELECT id,nombre,curso FROM alumnos WHERE asociado_id=?1 ORDER BY id").map_err(s)?;
    let alumnos_rows = q.query_map(params![id], |r| Ok(AlumnoItem { id: r.get(0)?, nombre: r.get(1)?, curso: r.get(2)? })).map_err(s)?;
    let lista_alumnos = alumnos_rows.collect::<Result<Vec<_>, _>>().map_err(s)?;

    Ok(AsociadoDetalle {
        id: detalle.0, apellido_nombre: detalle.1, dni: detalle.2, telefono: detalle.3,
        email: detalle.4, fecha_alta: detalle.5, alumnos: detalle.6, lista_alumnos,
        estado_cuotas: detalle.7, exento: detalle.8, activo: detalle.9, tipo_vinculo: detalle.10,
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
    pub tipo_vinculo: String,
}

#[tauri::command]
pub fn crear_asociado(st: State<AppState>, datos: DatosAsociado) -> R<i64> {
    let u = auth_secretaria_presidente_o_admin(&st)?;
    let mut db = st.db.lock().map_err(s)?;
    let tx = db.transaction().map_err(s)?;
    tx.execute(
        "INSERT INTO asociados(apellido_nombre,dni,telefono,email,tipo_vinculo) VALUES(?1,?2,?3,?4,?5)",
        params![datos.apellido_nombre.trim(), datos.dni.trim(), datos.telefono, datos.email, datos.tipo_vinculo],
    )
    .map_err(s)?;
    let id = tx.last_insert_rowid();
    for a in &datos.alumnos {
        if !a.nombre.trim().is_empty() {
            tx.execute("INSERT INTO alumnos(asociado_id,nombre,curso) VALUES(?1,?2,?3)", params![id, a.nombre.trim(), a.curso.trim()]).map_err(s)?;
        }
    }
    tx.commit().map_err(s)?;
    auditar(&db, u.id, "CREAR", "asociado", Some(id))?;
    Ok(id)
}

pub fn actualizar_asociado_interno(db: &mut Connection, id: i64, datos: &DatosAsociado) -> R<()> {
    let tx = db.transaction().map_err(s)?;
    tx.execute(
        "UPDATE asociados SET apellido_nombre=?1,dni=?2,telefono=?3,email=?4,tipo_vinculo=?5 WHERE id=?6",
        params![datos.apellido_nombre.trim(), datos.dni.trim(), datos.telefono, datos.email, datos.tipo_vinculo, id],
    )
    .map_err(s)?;
    // Mantener sincronizada la nómina de autoridades en caso de que este asociado integre la comisión directiva
    let _ = tx.execute(
        "UPDATE comision_directiva SET nombre=?1, dni=?2, telefono=?3, email=?4 WHERE asociado_id=?5",
        params![datos.apellido_nombre.trim(), datos.dni.trim(), datos.telefono, datos.email, id],
    );
    tx.execute("DELETE FROM alumnos WHERE asociado_id=?1", params![id]).map_err(s)?;
    for a in &datos.alumnos {
        if !a.nombre.trim().is_empty() {
            tx.execute("INSERT INTO alumnos(asociado_id,nombre,curso) VALUES(?1,?2,?3)", params![id, a.nombre.trim(), a.curso.trim()]).map_err(s)?;
        }
    }
    tx.commit().map_err(s)
}

#[tauri::command]
pub fn actualizar_asociado(st: State<AppState>, id: i64, datos: DatosAsociado) -> R<()> {
    let u = auth_secretaria_presidente_o_admin(&st)?;
    let mut db = st.db.lock().map_err(s)?;
    actualizar_asociado_interno(&mut db, id, &datos)?;
    auditar(&db, u.id, "ACTUALIZAR", "asociado", Some(id))
}

#[tauri::command]
pub fn marcar_exento(st: State<AppState>, id: i64, exento: bool) -> R<()> {
    let u = auth_secretaria_presidente_o_admin(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.execute("UPDATE asociados SET exento=?1 WHERE id=?2", params![exento as i64, id]).map_err(s)?;
    auditar(&db, u.id, if exento { "MARCAR_EXENTO" } else { "QUITAR_EXENTO" }, "asociado", Some(id))?;
    Ok(())
}

#[tauri::command]
pub fn dar_de_baja(st: State<AppState>, id: i64) -> R<()> {
    let u = auth_secretaria_presidente_o_admin(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.execute("UPDATE asociados SET activo=0 WHERE id=?1", params![id]).map_err(s)?;
    auditar(&db, u.id, "DAR_DE_BAJA", "asociado", Some(id))?;
    Ok(())
}

#[tauri::command]
pub fn reactivar_asociado(st: State<AppState>, id: i64) -> R<()> {
    let u = auth_secretaria_presidente_o_admin(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.execute("UPDATE asociados SET activo=1 WHERE id=?1", params![id]).map_err(s)?;
    auditar(&db, u.id, "REACTIVAR", "asociado", Some(id))?;
    Ok(())
}

#[tauri::command]
pub fn eliminar_asociado(st: State<AppState>, id: i64) -> R<()> {
    let u = auth_secretaria_o_admin(&st)?;
    let mut db = st.db.lock().map_err(s)?;
    let pagos: i64 = db.query_row("SELECT COUNT(*) FROM pagos WHERE asociado_id=?1", params![id], |r| r.get(0)).map_err(s)?;
    if pagos > 0 {
        return Err("No se puede eliminar un asociado que tiene pagos registrados. Puede darlo de baja.".to_string());
    }
    let vinculado: i64 = db.query_row("SELECT COUNT(*) FROM comision_directiva WHERE asociado_id=?1", params![id], |r| r.get(0)).map_err(s)?;
    if vinculado > 0 {
        return Err("No se puede eliminar un asociado vinculado a la Nómina de Autoridades. Quite primero la vinculación.".to_string());
    }
    let tx = db.transaction().map_err(s)?;
    tx.execute("DELETE FROM asociados WHERE id=?1", params![id]).map_err(s)?;
    tx.execute(
        "INSERT INTO auditoria(usuario_id, accion, entidad, entidad_id) VALUES(?1, 'ELIMINAR', 'asociado', ?2)",
        params![u.id, id],
    ).map_err(s)?;
    tx.commit().map_err(s)?;
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
    pub registrado_por_rol: Option<String>,
    pub registrado_por_nombre: Option<String>,
    pub movimiento_id: Option<i64>,
    pub adjunto_nombre: Option<String>,
}

#[tauri::command]
pub fn listar_pagos(st: State<AppState>, busqueda: String, periodo: String) -> R<Vec<PagoFila>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let mut q = db.prepare(
        "SELECT p.id, p.asociado_id, a.apellido_nombre, a.dni, p.periodo, p.fecha_pago, p.monto, p.medio, p.comprobante, u.nombre, u.rol, p.movimiento_id, m.adjunto_nombre
         FROM pagos p
         JOIN asociados a ON a.id = p.asociado_id
         JOIN usuarios u ON u.id = p.registrado_por
         LEFT JOIN movimientos_caja m ON m.id = p.movimiento_id
         WHERE (?1 = '' OR a.apellido_nombre LIKE '%'||?1||'%' OR a.dni LIKE '%'||?1||'%' OR p.comprobante LIKE '%'||?1||'%')
           AND (?2 = 'Todos' OR ?2 = '' OR p.periodo = ?2)
         ORDER BY p.fecha_pago DESC, p.id DESC",
    ).map_err(s)?;
    let rows = q.query_map(params![busqueda.trim(), periodo.trim()], |r| {
        let nombre: String = r.get(9)?;
        let rol: String = r.get(10)?;
        Ok(PagoFila {
            id: r.get(0)?, asociado_id: r.get(1)?, apellido_nombre: r.get(2)?, dni: r.get(3)?,
            periodo: r.get(4)?, fecha_pago: r.get(5)?, monto: r.get(6)?, medio: r.get(7)?,
            comprobante: r.get(8)?,
            registrado_por: format!("{} ({})", rol, nombre),
            registrado_por_rol: Some(rol),
            registrado_por_nombre: Some(nombre),
            movimiento_id: r.get(11)?,
            adjunto_nombre: r.get(12)?,
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
        "SELECT p.id, p.asociado_id, a.apellido_nombre, a.dni, p.periodo, p.fecha_pago, p.monto, p.medio, p.comprobante, u.nombre, u.rol, p.movimiento_id, m.adjunto_nombre
         FROM pagos p
         JOIN asociados a ON a.id = p.asociado_id
         JOIN usuarios u ON u.id = p.registrado_por
         LEFT JOIN movimientos_caja m ON m.id = p.movimiento_id
         WHERE p.asociado_id = ?1
         ORDER BY p.periodo DESC, p.fecha_pago DESC",
    ).map_err(s)?;
    let rows = q.query_map(params![asociado_id], |r| {
        let nombre: String = r.get(9)?;
        let rol: String = r.get(10)?;
        Ok(PagoFila {
            id: r.get(0)?, asociado_id: r.get(1)?, apellido_nombre: r.get(2)?, dni: r.get(3)?,
            periodo: r.get(4)?, fecha_pago: r.get(5)?, monto: r.get(6)?, medio: r.get(7)?,
            comprobante: r.get(8)?,
            registrado_por: format!("{} ({})", rol, nombre),
            registrado_por_rol: Some(rol),
            registrado_por_nombre: Some(nombre),
            movimiento_id: r.get(11)?,
            adjunto_nombre: r.get(12)?,
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
    pub adjunto_nombre: Option<String>,
    pub adjunto_datos: Option<String>,
}

pub fn registrar_pago_interno(db: &mut Connection, datos: &DatosPago, usuario_id: i64) -> R<i64> {
    if datos.monto <= 0 {
        return Err("El monto de la cuota debe ser mayor a 0".to_string());
    }

    let tx = db.transaction().map_err(s)?;

    // Validar que no se cobre dos veces el mismo período para el mismo asociado
    let ya_pagado: bool = tx.query_row(
        "SELECT COUNT(*) FROM pagos WHERE asociado_id=?1 AND periodo=?2 AND anulado=0",
        params![datos.asociado_id, datos.periodo.trim()],
        |r| r.get::<_, i64>(0),
    ).map_err(s)? > 0;

    if ya_pagado {
        return Err(format!("El asociado ya cuenta con un pago registrado para el período {}.", datos.periodo.trim()));
    }

    let asociado_nombre: String = tx.query_row("SELECT apellido_nombre FROM asociados WHERE id=?1", params![datos.asociado_id], |r| r.get(0)).map_err(s)?;
    
    // Formatear período legible: "2026-10" -> "Mes 10/26", "2026" -> "Anual 2026"
    let periodo_fmt = if datos.periodo.len() == 7 && datos.periodo.contains('-') {
        let parts: Vec<&str> = datos.periodo.split('-').collect();
        if parts.len() == 2 && parts[0].len() == 4 && parts[1].len() == 2 {
            let yy = &parts[0][2..];
            let mm = parts[1];
            format!("Mes {}/{}", mm, yy)
        } else {
            datos.periodo.clone()
        }
    } else if datos.periodo.len() == 4 {
        format!("Anual {}", datos.periodo)
    } else {
        datos.periodo.clone()
    };

    let desc = format!("Asociado N° {} - {}\n{}", datos.asociado_id, periodo_fmt, asociado_nombre);

    // 1. Crear movimiento en caja automático
    tx.execute(
        "INSERT INTO movimientos_caja(fecha, tipo, categoria, descripcion, monto, comprobante, adjunto_nombre, adjunto_datos, registrado_por) VALUES(date('now','localtime'), 'Ingreso', 'Cuotas', ?1, ?2, ?3, ?4, ?5, ?6)",
        params![desc, datos.monto, datos.comprobante, datos.adjunto_nombre, datos.adjunto_datos, usuario_id],
    ).map_err(s)?;
    let mov_id = tx.last_insert_rowid();

    // 2. Registrar pago
    tx.execute(
        "INSERT INTO pagos(asociado_id, periodo, fecha_pago, monto, medio, comprobante, anulado, registrado_por, movimiento_id) VALUES(?1, ?2, date('now','localtime'), ?3, ?4, ?5, 0, ?6, ?7)",
        params![datos.asociado_id, datos.periodo.trim(), datos.monto, datos.medio.trim(), datos.comprobante, usuario_id, mov_id],
    ).map_err(s)?;
    let pago_id = tx.last_insert_rowid();

    tx.commit().map_err(s)?;
    Ok(pago_id)
}

#[tauri::command]
pub fn registrar_pago(st: State<AppState>, datos: DatosPago) -> R<i64> {
    let u = auth_tesorero_o_admin(&st)?;
    let mut db = st.db.lock().map_err(s)?;
    let id = registrar_pago_interno(&mut db, &datos, u.id)?;
    auditar(&db, u.id, "CREAR", "pago", Some(id))?;
    Ok(id)
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
    pub motivo_anulacion: Option<String>,
    pub adjunto_nombre: Option<String>,
    /// "Rol (Nombre)" de quien cargó el movimiento; None en movimientos previos a la migración
    pub registrado_por: Option<String>,
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
        "SELECT m.id, m.fecha, m.tipo, m.categoria, m.descripcion, m.monto, m.comprobante, m.anulado, m.motivo_anulacion,
                m.adjunto_nombre, u.rol || ' (' || u.nombre || ')'
         FROM movimientos_caja m
         LEFT JOIN usuarios u ON u.id = m.registrado_por
         WHERE (?1 = 'Todos' OR m.tipo = ?1)
           AND (?2 = 'Todas' OR m.categoria = ?2)
           AND (?3 = '' OR m.descripcion LIKE '%'||?3||'%' OR m.comprobante LIKE '%'||?3||'%')
         ORDER BY m.fecha DESC, m.id DESC",
    ).map_err(s)?;
    let rows = q.query_map(params![tipo, categoria, busqueda.trim()], |r| {
        Ok(MovimientoCajaFila {
            id: r.get(0)?, fecha: r.get(1)?, tipo: r.get(2)?, categoria: r.get(3)?,
            descripcion: r.get(4)?, monto: r.get(5)?, comprobante: r.get(6)?, anulado: r.get(7)?,
            motivo_anulacion: r.get(8)?, adjunto_nombre: r.get(9)?, registrado_por: r.get(10)?,
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
    /// Archivo escaneado (PDF o imagen) como data URL; se guarda en la base para que viaje con los respaldos
    pub adjunto_nombre: Option<String>,
    pub adjunto_datos: Option<String>,
}

/// RNF08: límite de 10 MB por archivo adjunto
const LIMITE_ADJUNTO_BYTES: usize = 10 * 1024 * 1024;

#[tauri::command]
pub fn crear_movimiento_caja(st: State<AppState>, datos: DatosMovimientoCaja) -> R<i64> {
    let u = auth_tesorero_o_admin(&st)?;
    if datos.monto <= 0 {
        return Err("El monto del movimiento de caja debe ser mayor a 0".to_string());
    }
    // base64 ocupa ~4/3 del archivo original
    if datos.adjunto_datos.as_ref().map_or(false, |d| d.len() / 4 * 3 > LIMITE_ADJUNTO_BYTES) {
        return Err("El comprobante adjunto supera el límite de 10 MB".to_string());
    }
    let db = st.db.lock().map_err(s)?;
    db.execute(
        "INSERT INTO movimientos_caja(fecha, tipo, categoria, descripcion, monto, comprobante, adjunto_nombre, adjunto_datos, registrado_por)
         VALUES(date('now','localtime'), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![datos.tipo, datos.categoria.trim(), datos.descripcion.trim(), datos.monto, datos.comprobante,
                datos.adjunto_nombre, datos.adjunto_datos, u.id],
    ).map_err(s)?;
    Ok(db.last_insert_rowid())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdjuntoMovimiento {
    pub nombre: String,
    pub data_url: String,
}

/// El listado sólo trae el nombre del adjunto; el contenido se pide al abrirlo
#[tauri::command]
pub fn obtener_adjunto_movimiento(st: State<AppState>, id: i64) -> R<Option<AdjuntoMovimiento>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let fila: Option<(Option<String>, Option<String>)> = db
        .query_row("SELECT adjunto_nombre, adjunto_datos FROM movimientos_caja WHERE id=?1", params![id], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()
        .map_err(s)?;
    Ok(match fila {
        Some((nombre, Some(data_url))) => Some(AdjuntoMovimiento {
            nombre: nombre.unwrap_or_else(|| "comprobante".to_string()),
            data_url,
        }),
        _ => None,
    })
}

pub fn anular_movimiento_caja_interno(db: &mut Connection, id: i64, motivo: Option<&str>) -> R<()> {
    let tx = db.transaction().map_err(s)?;
    let motivo_txt = motivo.unwrap_or("Anulación registrada por tesorería / administración").trim();
    tx.execute(
        "UPDATE movimientos_caja SET anulado=1, motivo_anulacion=?1 WHERE id=?2",
        params![motivo_txt, id],
    ).map_err(s)?;
    // RNF05: Soft delete en pagos: se marca anulado=1 en vez de DELETE físico
    tx.execute("UPDATE pagos SET anulado=1 WHERE movimiento_id=?1", params![id]).map_err(s)?;
    tx.commit().map_err(s)?;
    Ok(())
}

#[tauri::command]
pub fn anular_movimiento_caja(st: State<AppState>, id: i64, motivo: Option<String>) -> R<()> {
    auth_tesorero_o_admin(&st)?;
    let mut db = st.db.lock().map_err(s)?;
    anular_movimiento_caja_interno(&mut db, id, motivo.as_deref())
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
    pub archivo_adjunto: Option<String>,
    pub asistentes_count: i64,
}

#[tauri::command]
pub fn listar_reuniones(st: State<AppState>) -> R<Vec<ReunionFila>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let mut q = db.prepare(
        "SELECT r.id, r.fecha, r.tipo, r.temas, r.acta, r.archivo_adjunto, COUNT(a.asociado_id)
         FROM reuniones r
         LEFT JOIN asistencias a ON a.reunion_id = r.id
         GROUP BY r.id
         ORDER BY r.fecha DESC, r.id DESC",
    ).map_err(s)?;
    let rows = q.query_map([], |r| {
        Ok(ReunionFila {
            id: r.get(0)?, fecha: r.get(1)?, tipo: r.get(2)?, temas: r.get(3)?,
            acta: r.get(4)?, archivo_adjunto: r.get(5)?, asistentes_count: r.get(6)?,
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
    let u = auth_secretaria_presidente_o_admin(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.execute(
        "INSERT INTO reuniones(fecha, tipo, temas, registrado_por) VALUES(?1, ?2, ?3, ?4)",
        params![datos.fecha.trim(), datos.tipo.trim(), datos.temas.trim(), u.id],
    ).map_err(s)?;
    Ok(db.last_insert_rowid())
}

#[tauri::command]
pub fn guardar_acta(st: State<AppState>, id: i64, acta: String, archivo_adjunto: Option<String>) -> R<()> {
    auth_secretaria_presidente_o_admin(&st)?;
    if archivo_adjunto.as_ref().map_or(false, |d| d.len() / 4 * 3 > LIMITE_ADJUNTO_BYTES) {
        return Err("El acta adjunta supera el límite de 10 MB".to_string());
    }
    let db = st.db.lock().map_err(s)?;
    db.execute(
        "UPDATE reuniones SET acta=?1, archivo_adjunto=?2 WHERE id=?3",
        params![acta.trim(), archivo_adjunto, id],
    ).map_err(s)?;
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineaRendicion {
    pub tipo: String,
    pub categoria: String,
    pub total: i64,
}

/// Totales por tipo y categoría de los movimientos no anulados del período de la rendición
pub fn detalle_rendicion_interno(db: &Connection, id: i64) -> R<Vec<LineaRendicion>> {
    let (desde, hasta): (String, String) = db.query_row(
        "SELECT desde, hasta FROM rendiciones WHERE id=?1",
        params![id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).map_err(|_| "La rendición de cuentas no existe".to_string())?;

    let mut q = db.prepare(
        "SELECT tipo, categoria, SUM(monto)
         FROM movimientos_caja
         WHERE anulado=0 AND fecha BETWEEN ?1 AND ?2
         GROUP BY tipo, categoria
         ORDER BY tipo DESC, SUM(monto) DESC",
    ).map_err(s)?;
    let rows = q.query_map(params![desde, hasta], |r| {
        Ok(LineaRendicion { tipo: r.get(0)?, categoria: r.get(1)?, total: r.get(2)? })
    }).map_err(s)?;
    let v = rows.collect::<Result<Vec<_>, _>>().map_err(s)?;
    Ok(v)
}

#[tauri::command]
pub fn detalle_rendicion(st: State<AppState>, id: i64) -> R<Vec<LineaRendicion>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    detalle_rendicion_interno(&db, id)
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
    let u = auth_tesorero_o_admin(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.execute(
        "INSERT INTO rendiciones(periodo, desde, hasta, generada_en, generada_por, estado) VALUES(?1, ?2, ?3, datetime('now','localtime'), ?4, 'Borrador')",
        params![datos.periodo.trim(), datos.desde.trim(), datos.hasta.trim(), u.id],
    ).map_err(s)?;
    let id = db.last_insert_rowid();
    auditar(&db, u.id, "CREAR", "rendicion", Some(id))?;
    Ok(id)
}

#[tauri::command]
pub fn aprobar_rendicion(st: State<AppState>, id: i64) -> R<()> {
    let u = auth_presidente_o_admin(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.execute(
        "UPDATE rendiciones SET estado='Aprobada', aprobada_por=?1, aprobada_en=datetime('now','localtime') WHERE id=?2",
        params![u.id, id],
    ).map_err(s)?;
    auditar(&db, u.id, "APROBAR", "rendicion", Some(id))?;
    Ok(())
}

pub fn eliminar_rendicion_interno(db: &Connection, id: i64) -> R<()> {
    let estado: String = db.query_row(
        "SELECT estado FROM rendiciones WHERE id=?1",
        params![id],
        |r| r.get(0),
    ).map_err(|_| "La rendición de cuentas no existe".to_string())?;

    if estado == "Aprobada" {
        return Err("No se puede eliminar una rendición de cuentas que ya ha sido aprobada".to_string());
    }

    db.execute("DELETE FROM rendiciones WHERE id=?1", params![id]).map_err(s)?;
    Ok(())
}

#[tauri::command]
pub fn eliminar_rendicion(st: State<AppState>, id: i64) -> R<()> {
    let u = auth_tesorero_o_admin(&st)?;
    let db = st.db.lock().map_err(s)?;
    eliminar_rendicion_interno(&db, id)?;
    auditar(&db, u.id, "ELIMINAR", "rendicion", Some(id))
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
    pub cargo: Option<String>,
    pub rol: String,
    pub activo: i64,
}

#[tauri::command]
pub fn listar_usuarios(st: State<AppState>) -> R<Vec<UsuarioFila>> {
    auth_superadmin_o_asesor(&st)?;
    let db = st.db.lock().map_err(s)?;
    let mut q = db.prepare("SELECT u.id, u.nombre, u.dni, CASE WHEN u.rol='Superadmin' THEN NULL ELSE c.cargo END, u.rol, u.activo FROM usuarios u LEFT JOIN comision_directiva c ON c.dni = u.dni ORDER BY u.id").map_err(s)?;
    let rows = q.query_map([], |r| {
        Ok(UsuarioFila {
            id: r.get(0)?, nombre: r.get(1)?, dni: r.get(2)?, cargo: r.get(3)?,
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
    pub rol: String,
    pub clave: Option<String>,
}

#[tauri::command]
pub fn crear_usuario(st: State<AppState>, datos: DatosUsuario) -> R<i64> {
    let u = auth_superadmin(&st)?;
    let db = st.db.lock().map_err(s)?;
    let clave = datos.clave.unwrap_or_else(|| "admin123".to_string());
    let hash_str = db::hash(&clave);
    db.execute(
        "INSERT INTO usuarios(nombre, dni, email, rol, clave_hash) VALUES(?1, ?2, NULL, ?3, ?4)",
        params![datos.nombre.trim(), datos.dni.trim(), datos.rol.trim(), hash_str],
    ).map_err(s)?;
    let id = db.last_insert_rowid();
    auditar(&db, u.id, "CREAR", "usuario", Some(id))?;
    Ok(id)
}

#[tauri::command]
pub fn actualizar_usuario(st: State<AppState>, id: i64, datos: DatosUsuario) -> R<()> {
    let u = auth_superadmin(&st)?;
    let db = st.db.lock().map_err(s)?;
    if let Some(ref c) = datos.clave {
        if !c.trim().is_empty() {
            let hash_str = db::hash(c.trim());
            db.execute("UPDATE usuarios SET clave_hash=?1 WHERE id=?2", params![hash_str, id]).map_err(s)?;
        }
    }
    db.execute(
        "UPDATE usuarios SET nombre=?1, dni=?2, email=NULL, rol=?3 WHERE id=?4",
        params![datos.nombre.trim(), datos.dni.trim(), datos.rol.trim(), id],
    ).map_err(s)?;
    auditar(&db, u.id, "ACTUALIZAR", "usuario", Some(id))?;
    Ok(())
}

#[tauri::command]
pub fn cambiar_estado_usuario(st: State<AppState>, id: i64, activo: bool) -> R<()> {
    let u = auth_superadmin(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.execute("UPDATE usuarios SET activo=?1 WHERE id=?2", params![activo as i64, id]).map_err(s)?;
    auditar(&db, u.id, if activo { "ACTIVAR" } else { "DESACTIVAR" }, "usuario", Some(id))?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopiaSeguridadFila {
    pub nombre_archivo: String,
    pub fecha: String,
    pub tamano_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultadoBackup {
    pub creado: bool,
    pub archivo: String,
    pub mensaje: String,
}

pub fn ejecutar_copia_interna(st: &AppState) -> R<ResultadoBackup> {
    let db = st.db.lock().map_err(s)?;

    // 1. Verificar si existen copias previas en el directorio
    let copias_dir = st.data_dir.join("copias");
    std::fs::create_dir_all(&copias_dir).map_err(s)?;

    let mut hay_copias = false;
    if let Ok(entries) = std::fs::read_dir(&copias_dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() && entry.file_name().to_string_lossy().ends_with(".db") {
                    hay_copias = true;
                    break;
                }
            }
        }
    }

    // 2. Comparar las filas modificadas por esta conexión (total_changes) con las registradas en el
    //    último respaldo. PRAGMA data_version no sirve: sólo cambia con escrituras de OTRAS conexiones.
    let cambios_actuales: i64 = db.query_row("SELECT total_changes()", [], |r| r.get(0)).map_err(s)?;
    let cambios_respaldados = *st.cambios_ultimo_respaldo.lock().map_err(s)?;

    // Si ya existe al menos una copia física y no hubo escrituras desde el último respaldo, omitir backup
    if hay_copias && cambios_actuales == cambios_respaldados {
        let archivo_previo: String = db
            .query_row("SELECT valor FROM configuracion WHERE clave='ultimo_archivo_backup'", [], |r| r.get(0))
            .optional()
            .map_err(s)?
            .unwrap_or_else(|| "Último respaldo vigente".to_string());
        return Ok(ResultadoBackup {
            creado: false,
            archivo: archivo_previo,
            mensaje: "Omitido: la base de datos no contiene cambios nuevos desde el último respaldo.".to_string(),
        });
    }

    // 3. Si hubo cambios o no existe copia, generar snapshot seguro mediante VACUUM INTO
    //    (VACUUM INTO falla si el destino existe: dos copias en el mismo segundo llevan sufijo)
    let now_str: String = db.query_row("SELECT strftime('%Y%m%d_%H%M%S','now','localtime')", [], |r| r.get(0)).map_err(s)?;
    let mut filename = format!("cooperar_backup_{}.db", now_str);
    let mut sufijo = 2;
    while copias_dir.join(&filename).exists() {
        filename = format!("cooperar_backup_{}_{}.db", now_str, sufijo);
        sufijo += 1;
    }
    let dest_str = copias_dir.join(&filename).to_string_lossy().to_string();

    db.execute("VACUUM INTO ?1", params![dest_str]).map_err(s)?;

    let fecha_humana: String = db.query_row("SELECT datetime('now','localtime')", [], |r| r.get(0)).map_err(s)?;
    db.execute("INSERT INTO configuracion(clave, valor) VALUES('ultima_copia', ?1) ON CONFLICT(clave) DO UPDATE SET valor=?1", params![fecha_humana]).map_err(s)?;
    db.execute("INSERT INTO configuracion(clave, valor) VALUES('ultimo_archivo_backup', ?1) ON CONFLICT(clave) DO UPDATE SET valor=?1", params![filename]).map_err(s)?;

    // Se registra después de las escrituras de configuración para que no cuenten como cambios nuevos
    *st.cambios_ultimo_respaldo.lock().map_err(s)? =
        db.query_row("SELECT total_changes()", [], |r| r.get(0)).map_err(s)?;

    Ok(ResultadoBackup {
        creado: true,
        archivo: filename.clone(),
        mensaje: format!("✓ Copia de seguridad creada con éxito: {}", filename),
    })
}

#[tauri::command]
pub fn crear_copia_seguridad(st: State<AppState>) -> R<ResultadoBackup> {
    // HU09: la Presidencia también puede respaldar (restaurar sigue siendo exclusivo del Superadmin)
    let u = auth(&st)?;
    if u.rol != "Superadmin" && u.rol != "Presidente" {
        return Err("Acceso denegado: sólo el Superadministrador o la Presidencia pueden crear copias de seguridad".to_string());
    }
    ejecutar_copia_interna(&st)
}

#[tauri::command]
pub fn listar_copias_seguridad(st: State<AppState>) -> R<Vec<CopiaSeguridadFila>> {
    auth_superadmin_o_asesor(&st)?;
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

/// Sanitiza rutas para evitar vulnerabilidades de Path Traversal
pub fn sanitizar_nombre_archivo(raw: &str) -> Result<String, String> {
    let clean = std::path::Path::new(raw)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Nombre de archivo inválido".to_string())?;

    if clean.is_empty() || clean.contains("..") || clean.contains('/') || clean.contains('\\') {
        return Err("Ruta o nombre de archivo inseguro".to_string());
    }
    Ok(clean.to_string())
}

pub fn restaurar_copia_interna(st: &AppState, archivo: &str) -> R<String> {
    let clean_name = sanitizar_nombre_archivo(archivo)?;
    if !clean_name.ends_with(".db") {
        return Err("El archivo de respaldo debe tener extensión .db".to_string());
    }
    let copias_dir = st.data_dir.join("copias");
    let backup_path = copias_dir.join(&clean_name);
    if !backup_path.exists() {
        return Err(format!("El archivo de respaldo '{}' no existe en el almacenamiento", clean_name));
    }

    // Verificar integridad del archivo de respaldo
    let backup_conn = Connection::open(&backup_path).map_err(s)?;
    let integrity: String = backup_conn.query_row("PRAGMA integrity_check", [], |r| r.get(0)).map_err(s)?;
    if integrity != "ok" {
        return Err(format!("El archivo de respaldo está corrupto: {}", integrity));
    }

    // Restaurar directamente sobre la base activa usando rusqlite backup
    let mut db = st.db.lock().map_err(s)?;
    let backup = rusqlite::backup::Backup::new(&backup_conn, &mut *db).map_err(s)?;
    backup.run_to_completion(100, std::time::Duration::from_millis(50), None).map_err(s)?;
    drop(backup);

    let _ = db.execute(
        "INSERT INTO configuracion(clave, valor) VALUES('ultima_restauracion', datetime('now','localtime')) ON CONFLICT(clave) DO UPDATE SET valor=datetime('now','localtime')",
        [],
    );

    Ok(format!("Base de datos restaurada correctamente desde el respaldo: {}", clean_name))
}

#[tauri::command]
pub fn restaurar_copia_seguridad(st: State<AppState>, archivo: String) -> R<String> {
    auth_superadmin(&st)?;
    restaurar_copia_interna(&st, &archivo)
}

pub fn eliminar_copia_interna(st: &AppState, archivo: &str) -> R<String> {
    let clean_name = sanitizar_nombre_archivo(archivo)?;
    if !clean_name.ends_with(".db") {
        return Err("El archivo de respaldo debe tener extensión .db".to_string());
    }
    let copias_dir = st.data_dir.join("copias");
    let backup_path = copias_dir.join(&clean_name);
    if !backup_path.exists() {
        return Err(format!("El archivo de respaldo '{}' no existe en el almacenamiento", clean_name));
    }
    std::fs::remove_file(&backup_path).map_err(s)?;
    Ok(format!("Copia de seguridad '{}' eliminada correctamente", clean_name))
}

#[tauri::command]
pub fn eliminar_copia_seguridad(st: State<AppState>, archivo: String) -> R<String> {
    auth_superadmin(&st)?;
    eliminar_copia_interna(&st, &archivo)
}

#[tauri::command]
pub fn obtener_configuracion(st: State<AppState>, clave: String) -> R<Option<String>> {
    // Claves públicas accesibles antes de iniciar sesión (pantalla de login)
    let es_publica = matches!(clave.as_str(), "logo_cooperadora" | "asociacion_nombre" | "nombre_escuela");
    if !es_publica {
        auth(&st)?;
    }
    let db = st.db.lock().map_err(s)?;
    db.query_row("SELECT valor FROM configuracion WHERE clave=?1", params![clave], |r| r.get(0)).optional().map_err(s)
}

#[tauri::command]
pub fn guardar_configuracion(st: State<AppState>, clave: String, valor: String) -> R<()> {
    let u = auth(&st)?;
    if u.rol != "Superadmin" && u.rol != "Secretaria" && u.rol != "Presidente" {
        return Err("Acceso denegado: sólo el Superadministrador, la Presidencia o la Secretaría pueden actualizar la configuración institucional".to_string());
    }
    let db = st.db.lock().map_err(s)?;
    db.execute("INSERT INTO configuracion(clave, valor) VALUES(?1, ?2) ON CONFLICT(clave) DO UPDATE SET valor=?2", params![clave, valor]).map_err(s)?;
    Ok(())
}

#[tauri::command]
pub fn obtener_ruta_datos(st: State<AppState>, ) -> R<String> {
    auth_superadmin_o_asesor(&st)?;
    Ok(st.data_dir.to_string_lossy().to_string())
}

// ----------------------------------------------------
// COMISIÓN DIRECTIVA Y DOCUMENTACIÓN DE ASAMBLEAS
// ----------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MiembroComisionFila {
    pub id: i64,
    pub orden: i64,
    pub cargo: String,
    pub asociado_id: Option<i64>,
    pub personal_establecimiento_id: Option<i64>,
    pub nombre: String,
    pub dni: String,
    pub cuil: String,
    pub domicilio: String,
    pub localidad: String,
    pub telefono: String,
    pub email: String,
    pub vencimiento: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentoAsambleaFila {
    pub id: i64,
    pub tipo: String,
    pub titulo: String,
    pub periodo: String,
    pub fecha_generacion: String,
    pub generado_por: String,
    pub archivo_pdf: String,
    pub datos_json: String,
    pub aprobado: i64,
    pub aprobado_por: Option<String>,
    pub aprobado_en: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuardarDocumentoParams {
    pub tipo: String,
    pub titulo: String,
    pub periodo: String,
    pub datos_json: String,
    pub pdf_bytes_base64: String,
}

#[tauri::command]
pub fn listar_comision_directiva(st: State<AppState>) -> R<Vec<MiembroComisionFila>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let mut stmt = db.prepare(
        "SELECT id, orden, cargo, asociado_id, personal_establecimiento_id, nombre, dni, cuil, domicilio, localidad, telefono, email, vencimiento 
         FROM comision_directiva ORDER BY orden ASC"
    ).map_err(s)?;
    let rows = stmt.query_map([], |r| {
        Ok(MiembroComisionFila {
            id: r.get(0)?,
            orden: r.get(1)?,
            cargo: r.get(2)?,
            asociado_id: r.get(3)?,
            personal_establecimiento_id: r.get(4)?,
            nombre: r.get(5)?,
            dni: r.get(6)?,
            cuil: r.get(7)?,
            domicilio: r.get(8)?,
            localidad: r.get(9)?,
            telefono: r.get(10)?,
            email: r.get(11)?,
            vencimiento: r.get(12)?,
        })
    }).map_err(s)?;

    let mut res = Vec::new();
    for r in rows {
        res.push(r.map_err(s)?);
    }
    Ok(res)
}

#[tauri::command]
pub fn guardar_miembro_comision(st: State<AppState>, miembro: MiembroComisionFila) -> R<()> {
    let u = auth_secretaria_o_admin(&st)?;
    let db = st.db.lock().map_err(s)?;
    if miembro.id == 0 {
        db.execute(
            "INSERT INTO comision_directiva(orden, cargo, asociado_id, personal_establecimiento_id, nombre, dni, cuil, domicilio, localidad, telefono, email, vencimiento)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                miembro.orden, miembro.cargo, miembro.asociado_id, miembro.personal_establecimiento_id, miembro.nombre, miembro.dni, miembro.cuil,
                miembro.domicilio, miembro.localidad, miembro.telefono, miembro.email, miembro.vencimiento
            ],
        ).map_err(s)?;
    } else {
        db.execute(
            "UPDATE comision_directiva SET orden=?1, cargo=?2, asociado_id=?3, personal_establecimiento_id=?4, nombre=?5, dni=?6, cuil=?7, domicilio=?8, localidad=?9, telefono=?10, email=?11, vencimiento=?12
             WHERE id=?13",
            params![
                miembro.orden, miembro.cargo, miembro.asociado_id, miembro.personal_establecimiento_id, miembro.nombre, miembro.dni, miembro.cuil,
                miembro.domicilio, miembro.localidad, miembro.telefono, miembro.email, miembro.vencimiento, miembro.id
            ],
        ).map_err(s)?;
    }
    let accion = if miembro.id == 0 { "CREAR" } else { "ACTUALIZAR" };
    let id = if miembro.id == 0 { db.last_insert_rowid() } else { miembro.id };
    auditar(&db, u.id, accion, "miembro_comision", Some(id))
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PersonalEstablecimientoFila {
    pub id: i64,
    pub cargo: String,
    pub nombre: String,
    pub dni: String,
    pub telefono: String,
    pub email: String,
    pub vinculo_nomina: String,
}

#[tauri::command]
pub fn listar_personal_establecimiento(st: State<AppState>) -> R<Vec<PersonalEstablecimientoFila>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let mut stmt = db.prepare(
        "SELECT id, cargo, nombre, dni, telefono, email, vinculo_nomina 
         FROM personal_establecimiento ORDER BY id ASC"
    ).map_err(s)?;
    let rows = stmt.query_map([], |r| {
        Ok(PersonalEstablecimientoFila {
            id: r.get(0)?,
            cargo: r.get(1)?,
            nombre: r.get(2)?,
            dni: r.get(3)?,
            telefono: r.get(4)?,
            email: r.get(5)?,
            vinculo_nomina: r.get(6)?,
        })
    }).map_err(s)?;

    let mut res = Vec::new();
    for r in rows {
        res.push(r.map_err(s)?);
    }
    Ok(res)
}

#[tauri::command]
pub fn guardar_personal_establecimiento(st: State<AppState>, p: PersonalEstablecimientoFila) -> R<PersonalEstablecimientoFila> {
    let u = auth_secretaria_o_admin(&st)?;
    let db = st.db.lock().map_err(s)?;
    let id = if p.id == 0 {
        db.execute(
            "INSERT INTO personal_establecimiento(cargo, nombre, dni, telefono, email, vinculo_nomina)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
            params![p.cargo, p.nombre, p.dni, p.telefono, p.email, p.vinculo_nomina],
        ).map_err(s)?;
        db.last_insert_rowid()
    } else {
        db.execute(
            "UPDATE personal_establecimiento SET cargo=?1, nombre=?2, dni=?3, telefono=?4, email=?5, vinculo_nomina=?6
             WHERE id=?7",
            params![p.cargo, p.nombre, p.dni, p.telefono, p.email, p.vinculo_nomina, p.id],
        ).map_err(s)?;
        p.id
    };

    // Mantener compatibilidad con vínculos históricos y permitir cualquier autoridad de la nómina.
    if let Some(id_text) = p.vinculo_nomina.strip_prefix("AUTORIDAD:") {
        let autoridad_id: i64 = id_text.parse().map_err(|_| "Vínculo de autoridad inválido".to_string())?;
        let updated = db.execute(
            "UPDATE comision_directiva SET nombre=?1, dni=?2, telefono=?3, email=?4 WHERE id=?5",
            params![p.nombre, p.dni, p.telefono, p.email, autoridad_id],
        ).map_err(s)?;
        if updated == 0 {
            return Err("La autoridad seleccionada no existe".to_string());
        }
    } else if p.vinculo_nomina == "ASESOR" {
        let _ = db.execute(
            "UPDATE comision_directiva SET nombre=?1, dni=?2, telefono=?3, email=?4 WHERE orden=16 OR cargo LIKE '%ASESOR%'",
            params![p.nombre, p.dni, p.telefono, p.email],
        );
    } else if p.vinculo_nomina == "REV_CTAS_DOC_TIT" {
        let _ = db.execute(
            "UPDATE comision_directiva SET nombre=?1, dni=?2, telefono=?3, email=?4 WHERE orden=13 OR cargo LIKE '%TITULAR DOC%'",
            params![p.nombre, p.dni, p.telefono, p.email],
        );
    } else if p.vinculo_nomina == "REV_CTAS_DOC_SUP" {
        let _ = db.execute(
            "UPDATE comision_directiva SET nombre=?1, dni=?2, telefono=?3, email=?4 WHERE orden=15 OR cargo LIKE '%SUPLENTE DOC%'",
            params![p.nombre, p.dni, p.telefono, p.email],
        );
    }

    auditar(&db, u.id, if p.id == 0 { "CREAR" } else { "ACTUALIZAR" }, "personal_establecimiento", Some(id))?;
    Ok(PersonalEstablecimientoFila {
        id,
        cargo: p.cargo,
        nombre: p.nombre,
        dni: p.dni,
        telefono: p.telefono,
        email: p.email,
        vinculo_nomina: p.vinculo_nomina,
    })
}

#[tauri::command]
pub fn eliminar_personal_establecimiento(st: State<AppState>, id: i64) -> R<()> {
    let u = auth_secretaria_o_admin(&st)?;
    let db = st.db.lock().map_err(s)?;
    db.execute("DELETE FROM personal_establecimiento WHERE id=?1", params![id]).map_err(s)?;
    auditar(&db, u.id, "ELIMINAR", "personal_establecimiento", Some(id))
}

#[tauri::command]
pub fn listar_documentos_asambleas(st: State<AppState>) -> R<Vec<DocumentoAsambleaFila>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let mut stmt = db.prepare(
        "SELECT id, tipo, titulo, periodo, fecha_generacion, generado_por, archivo_pdf, datos_json, aprobado, aprobado_por, aprobado_en
         FROM documentos_asambleas ORDER BY id DESC"
    ).map_err(s)?;
    let rows = stmt.query_map([], |r| {
        Ok(DocumentoAsambleaFila {
            id: r.get(0)?,
            tipo: r.get(1)?,
            titulo: r.get(2)?,
            periodo: r.get(3)?,
            fecha_generacion: r.get(4)?,
            generado_por: r.get(5)?,
            archivo_pdf: r.get(6)?,
            datos_json: r.get(7)?,
            aprobado: r.get(8)?,
            aprobado_por: r.get(9)?,
            aprobado_en: r.get(10)?,
        })
    }).map_err(s)?;

    let mut res = Vec::new();
    for r in rows {
        res.push(r.map_err(s)?);
    }
    Ok(res)
}

fn decode_base64(s: &str) -> Result<Vec<u8>, String> {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut decode_map = [255u8; 256];
    for (i, &b) in TABLE.iter().enumerate() {
        decode_map[b as usize] = i as u8;
    }

    let clean = s.trim().replace(['\r', '\n', ' '], "");
    let mut buf = Vec::new();
    let mut accum: u32 = 0;
    let mut bits = 0;

    for &b in clean.as_bytes() {
        if b == b'=' {
            break;
        }
        let val = decode_map[b as usize];
        if val == 255 {
            continue;
        }
        accum = (accum << 6) | (val as u32);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            buf.push((accum >> bits) as u8);
        }
    }
    Ok(buf)
}

fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut res = String::new();
    let mut i = 0;
    while i < bytes.len() {
        let b0 = bytes[i];
        let b1 = if i + 1 < bytes.len() { bytes[i + 1] } else { 0 };
        let b2 = if i + 2 < bytes.len() { bytes[i + 2] } else { 0 };

        let triple = ((b0 as u32) << 16) | ((b1 as u32) << 8) | (b2 as u32);

        res.push(TABLE[((triple >> 18) & 0x3F) as usize] as char);
        res.push(TABLE[((triple >> 12) & 0x3F) as usize] as char);

        if i + 1 < bytes.len() {
            res.push(TABLE[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            res.push('=');
        }

        if i + 2 < bytes.len() {
            res.push(TABLE[(triple & 0x3F) as usize] as char);
        } else {
            res.push('=');
        }

        i += 3;
    }
    res
}

fn get_desktop_dir() -> std::path::PathBuf {
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        let p = std::path::PathBuf::from(userprofile).join("Desktop");
        if p.exists() {
            return p;
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let p = std::path::PathBuf::from(home).join("Desktop");
        if p.exists() {
            return p;
        }
    }
    std::path::PathBuf::from(".")
}

#[tauri::command]
pub fn guardar_documento_asamblea(st: State<AppState>, params: GuardarDocumentoParams) -> R<DocumentoAsambleaFila> {
    let u = auth_secretaria_o_admin(&st)?;
    let docs_dir = st.data_dir.join("documentos");
    std::fs::create_dir_all(&docs_dir).map_err(s)?;

    let db = st.db.lock().map_err(s)?;
    let timestamp: String = db.query_row("SELECT strftime('%Y%m%d_%H%M%S','now','localtime')", [], |r| r.get(0)).map_err(s)?;
    let fecha_hoy: String = db.query_row("SELECT strftime('%Y-%m-%d %H:%M','now','localtime')", [], |r| r.get(0)).map_err(s)?;

    let filename = format!("{}_{}.pdf", params.tipo.to_lowercase(), timestamp);
    let full_path = docs_dir.join(&filename);

    let bytes = decode_base64(&params.pdf_bytes_base64)?;
    std::fs::write(&full_path, &bytes).map_err(s)?;

    db.execute(
        "INSERT INTO documentos_asambleas(tipo, titulo, periodo, fecha_generacion, generado_por, archivo_pdf, datos_json)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            params.tipo,
            params.titulo,
            params.periodo,
            fecha_hoy,
            u.nombre,
            filename,
            params.datos_json
        ],
    ).map_err(s)?;

    let id = db.last_insert_rowid();
    auditar(&db, u.id, "GENERAR", "documento_asamblea", Some(id))?;

    Ok(DocumentoAsambleaFila {
        id,
        tipo: params.tipo,
        titulo: params.titulo,
        periodo: params.periodo,
        fecha_generacion: fecha_hoy,
        generado_por: u.nombre,
        archivo_pdf: filename,
        datos_json: params.datos_json,
        aprobado: 0,
        aprobado_por: None,
        aprobado_en: None,
    })
}

#[tauri::command]
pub fn aprobar_documento_asamblea(st: State<AppState>, id: i64) -> R<()> {
    let u = auth_secretaria_presidente_o_admin(&st)?;
    let db = st.db.lock().map_err(s)?;
    let updated = db.execute(
        "UPDATE documentos_asambleas SET aprobado=1, aprobado_por=?1, aprobado_en=strftime('%Y-%m-%d %H:%M','now','localtime') WHERE id=?2",
        params![u.nombre, id],
    ).map_err(s)?;
    if updated == 0 {
        return Err("Documento de asamblea no encontrado".to_string());
    }
    auditar(&db, u.id, "APROBAR", "documento_asamblea", Some(id))?;
    Ok(())
}

#[tauri::command]
pub fn eliminar_documento_asamblea(st: State<AppState>, id: i64) -> R<()> {
    let u = auth_secretaria_o_admin(&st)?;
    let db = st.db.lock().map_err(s)?;
    let archivo_pdf: Option<String> = db
        .query_row("SELECT archivo_pdf FROM documentos_asambleas WHERE id=?1", params![id], |r| r.get(0))
        .optional()
        .map_err(s)?;

    if let Some(filename) = archivo_pdf {
        if let Ok(clean_name) = sanitizar_nombre_archivo(&filename) {
            let pdf_path = st.data_dir.join("documentos").join(clean_name);
            let _ = std::fs::remove_file(pdf_path);
        }
    }

    db.execute("DELETE FROM documentos_asambleas WHERE id=?1", params![id]).map_err(s)?;
    auditar(&db, u.id, "ELIMINAR", "documento_asamblea", Some(id))
}

#[tauri::command]
pub fn leer_archivo_documento(st: State<AppState>, archivo_pdf: String) -> R<String> {
    auth(&st)?;
    let clean_name = sanitizar_nombre_archivo(&archivo_pdf)?;
    let pdf_path = st.data_dir.join("documentos").join(clean_name);
    if !pdf_path.exists() {
        return Err("El archivo PDF no existe en el disco".to_string());
    }
    let bytes = std::fs::read(&pdf_path).map_err(s)?;
    Ok(encode_base64(&bytes))
}

#[tauri::command]
pub fn exportar_pdf_escritorio(st: State<AppState>, nombre_archivo: String, pdf_bytes_base64: String) -> R<String> {
    auth(&st)?;
    let nombre_archivo = sanitizar_nombre_archivo(&nombre_archivo)?;
    let bytes = decode_base64(&pdf_bytes_base64)?;

    let desktop_dir = get_desktop_dir();
    let target_folder = desktop_dir.join("Cooperar Documentos");
    let _ = std::fs::create_dir_all(&target_folder);

    let clean_name = if nombre_archivo.ends_with(".pdf") {
        nombre_archivo
    } else {
        format!("{}.pdf", nombre_archivo)
    };

    let target_file = target_folder.join(&clean_name);
    std::fs::write(&target_file, bytes).map_err(s)?;

    Ok(target_file.to_string_lossy().to_string())
}

#[tauri::command]
pub fn guardar_pdf_en_ruta(st: State<AppState>, ruta_destino: String, pdf_bytes_base64: String) -> R<String> {
    // La ruta la elige el usuario en el diálogo de guardado, por eso no se restringe a datos/
    auth(&st)?;
    let bytes = decode_base64(&pdf_bytes_base64)?;

    let path = std::path::PathBuf::from(&ruta_destino);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&path, bytes).map_err(s)?;
    Ok(path.to_string_lossy().to_string())
}