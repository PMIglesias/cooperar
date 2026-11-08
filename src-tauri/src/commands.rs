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
    auditar_con_detalle(db, usuario_id, accion, entidad, entidad_id, None)
}

/// Igual que `auditar`, pero guarda además el detalle del cambio (por ejemplo "Cuenta corriente: 0 → 250000")
fn auditar_con_detalle(
    db: &Connection,
    usuario_id: i64,
    accion: &str,
    entidad: &str,
    entidad_id: Option<i64>,
    detalle: Option<&str>,
) -> R<()> {
    db.execute(
        "INSERT INTO auditoria(usuario_id, accion, entidad, entidad_id, detalle) VALUES(?1, ?2, ?3, ?4, ?5)",
        params![usuario_id, accion, entidad, entidad_id, detalle],
    ).map_err(s)?;
    Ok(())
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditoriaFila {
    pub id: i64,
    pub usuario: String,
    pub fecha_hora: String,
    pub accion: String,
    pub entidad: String,
    pub entidad_id: Option<i64>,
    /// Detalle legible del cambio (valores anteriores y nuevos), cuando aplica
    pub detalle: Option<String>,
}

#[tauri::command]
pub fn listar_auditoria(st: State<AppState>) -> R<Vec<AuditoriaFila>> {
    auth_superadmin(&st)?;
    let db = st.db.lock().map_err(s)?;
    let mut stmt = db.prepare(
        "SELECT a.id, COALESCE(u.nombre, 'Sistema'), a.fecha_hora, a.accion, a.entidad, a.entidad_id, a.detalle
         FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id
         ORDER BY a.id DESC",
    ).map_err(s)?;
    let rows = stmt.query_map([], |r| Ok(AuditoriaFila {
        id: r.get(0)?, usuario: r.get(1)?, fecha_hora: r.get(2)?, accion: r.get(3)?,
        entidad: r.get(4)?, entidad_id: r.get(5)?, detalle: r.get(6)?,
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
    /// Bonos anuales del año corriente ya abonados (familias distintas)
    pub bonos_cobrados: i64,
    /// Asociados activos: el total de familias a las que se les ofrece el bono
    pub bonos_total: i64,
    /// Familias que abonaron los materiales del año corriente
    pub materiales_cobrados: i64,
    pub proxima_reunion: Option<String>,
    pub ultimos_movimientos: Vec<Movimiento>,
    pub ultima_copia: Option<String>,
}

#[tauri::command]
pub fn resumen_inicio(st: State<AppState>) -> R<ResumenInicio> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let saldo_caja = one(&db, "SELECT COALESCE(SUM(CASE tipo WHEN 'Ingreso' THEN monto ELSE -monto END),0) FROM movimientos_caja WHERE anulado=0")?;
    let bonos_cobrados = one(&db, "SELECT COUNT(DISTINCT asociado_id) FROM pagos WHERE anulado=0 AND concepto='BONO_ANUAL' AND substr(periodo,1,4)=strftime('%Y','now','localtime')")?;
    let bonos_total = one(&db, "SELECT COUNT(*) FROM v_asociados WHERE activo=1")?;
    let materiales_cobrados = one(&db, "SELECT COUNT(DISTINCT asociado_id) FROM pagos WHERE anulado=0 AND concepto='MATERIALES' AND substr(periodo,1,4)=strftime('%Y','now','localtime')")?;
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
    Ok(ResumenInicio { saldo_caja, bonos_cobrados, bonos_total, materiales_cobrados, proxima_reunion, ultimos_movimientos, ultima_copia })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumenPadron { pub activos: i64, pub colaboraron: i64, pub no_colaboraron: i64 }

#[tauri::command]
pub fn resumen_padron(st: State<AppState>) -> R<ResumenPadron> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    Ok(ResumenPadron {
        activos: one(&db, "SELECT COUNT(*) FROM v_asociados WHERE activo=1")?,
        colaboraron: one(&db, "SELECT COUNT(*) FROM v_asociados WHERE activo=1 AND estado_colaboracion='Colaboró'")?,
        no_colaboraron: one(&db, "SELECT COUNT(*) FROM v_asociados WHERE activo=1 AND estado_colaboracion='No colaboró'")?,
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
    pub cantidad_alumnos: i64,
    pub tiene_hermanos: i64,
    pub estado_colaboracion: String,
    /// 1 si la familia abonó el bono de la cooperadora del año corriente
    pub bono_anual_pagado: i64,
    /// 1 si la familia abonó el bono de materiales del año corriente
    pub materiales_pagado: i64,
    pub activo: i64,
    pub tipo_vinculo: String,
    pub fecha_alta: String,
}

#[tauri::command]
pub fn listar_asociados(st: State<AppState>, busqueda: String, estado_colaboracion: String, estado: String) -> R<Vec<AsociadoFila>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let activo_cond = match estado.trim() {
        "Activos" | "Activo" => "AND activo=1",
        "Dados de baja" | "Baja" => "AND activo=0",
        _ => "", // "Todos"
    };
    let sql = format!(
        "SELECT id,apellido_nombre,dni,telefono,email,alumnos,cantidad_alumnos,tiene_hermanos,
                estado_colaboracion,bono_anual_pagado,materiales_pagado,activo,tipo_vinculo,fecha_alta
         FROM v_asociados
         WHERE (1=1 {})
           AND (?1='' OR apellido_nombre LIKE '%'||?1||'%' OR dni LIKE '%'||?1||'%')
           AND (?2='Todos' OR ?2='' OR estado_colaboracion=?2)
         ORDER BY apellido_nombre",
        activo_cond
    );
    let mut q = db.prepare(&sql).map_err(s)?;
    let rows = q
        .query_map(params![busqueda.trim(), estado_colaboracion], |r| {
            Ok(AsociadoFila {
                id: r.get(0)?, apellido_nombre: r.get(1)?, dni: r.get(2)?,
                telefono: r.get(3)?, email: r.get(4)?, alumnos: r.get(5)?,
                cantidad_alumnos: r.get(6)?, tiene_hermanos: r.get(7)?,
                estado_colaboracion: r.get(8)?,
                bono_anual_pagado: r.get(9)?, materiales_pagado: r.get(10)?,
                activo: r.get(11)?,
                tipo_vinculo: r.get(12)?, fecha_alta: r.get(13)?,
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
    pub cantidad_alumnos: i64,
    pub lista_alumnos: Vec<AlumnoItem>,
    pub estado_colaboracion: String,
    /// 1 si la familia abonó el bono anual del año corriente
    pub bono_anual_pagado: i64,
    /// 1 si la familia abonó el bono de materiales del año corriente
    pub materiales_pagado: i64,
    pub tiene_hermanos: i64,
    pub activo: i64,
    pub tipo_vinculo: String,
}

#[tauri::command]
pub fn obtener_asociado(st: State<AppState>, id: i64) -> R<AsociadoDetalle> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let detalle = db.query_row(
        "SELECT id,apellido_nombre,dni,telefono,email,fecha_alta,alumnos,cantidad_alumnos,
                estado_colaboracion,bono_anual_pagado,materiales_pagado,tiene_hermanos,activo,tipo_vinculo
         FROM v_asociados WHERE id=?1",
        params![id],
        |r| Ok((
            r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, Option<String>>(3)?,
            r.get::<_, Option<String>>(4)?, r.get::<_, String>(5)?, r.get::<_, Option<String>>(6)?,
            r.get::<_, i64>(7)?, r.get::<_, String>(8)?, r.get::<_, i64>(9)?,
            r.get::<_, i64>(10)?, r.get::<_, i64>(11)?, r.get::<_, i64>(12)?, r.get::<_, String>(13)?,
        )),
    )
    .map_err(s)?;

    let mut q = db.prepare("SELECT id,nombre,curso FROM alumnos WHERE asociado_id=?1 ORDER BY id").map_err(s)?;
    let alumnos_rows = q.query_map(params![id], |r| Ok(AlumnoItem { id: r.get(0)?, nombre: r.get(1)?, curso: r.get(2)? })).map_err(s)?;
    let lista_alumnos = alumnos_rows.collect::<Result<Vec<_>, _>>().map_err(s)?;

    Ok(AsociadoDetalle {
        id: detalle.0, apellido_nombre: detalle.1, dni: detalle.2, telefono: detalle.3,
        email: detalle.4, fecha_alta: detalle.5, alumnos: detalle.6, cantidad_alumnos: detalle.7,
        lista_alumnos, estado_colaboracion: detalle.8,
        bono_anual_pagado: detalle.9, materiales_pagado: detalle.10,
        tiene_hermanos: detalle.11, activo: detalle.12, tipo_vinculo: detalle.13,
    })
}

#[derive(Deserialize, Clone)]
pub struct NuevoAlumno { pub nombre: String, pub curso: String }

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DatosAsociado {
    pub apellido_nombre: String,
    pub dni: String,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub alumnos: Vec<NuevoAlumno>,
    pub tipo_vinculo: String,
    /// Fecha de alta (AAAA-MM-DD). Si se omite en el alta se usa la del día;
    /// en la edición, omitirla conserva la fecha ya registrada.
    #[serde(default)]
    pub fecha_alta: Option<String>,
}

/// La condición de hermanos no se carga a mano: se deriva de la cantidad de alumnos
/// vinculados (dos o más) y habilita la tarifa "con hermanos" del bono.
pub fn sincronizar_tiene_hermanos(tx: &rusqlite::Transaction, asociado_id: i64) -> R<()> {
    tx.execute(
        "UPDATE asociados SET tiene_hermanos =
           CASE WHEN (SELECT COUNT(*) FROM alumnos WHERE asociado_id = ?1) > 1 THEN 1 ELSE 0 END
         WHERE id = ?1",
        params![asociado_id],
    )
    .map_err(s)?;
    Ok(())
}

/// Valida la fecha de alta (AAAA-MM-DD real y no futura) y la devuelve normalizada.
/// `None` significa "no informada": el alta usa hoy y la edición conserva la existente.
pub fn normalizar_fecha_alta(db: &Connection, valor: Option<&str>) -> R<Option<String>> {
    let Some(fecha) = valor.map(str::trim).filter(|f| !f.is_empty()) else {
        return Ok(None);
    };
    let (valida, futura): (bool, bool) = db
        .query_row("SELECT date(?1) IS ?1, ?1 > date('now','localtime')", params![fecha], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .map_err(s)?;
    if !valida {
        return Err("La fecha de alta no es válida: usá el formato AAAA-MM-DD".to_string());
    }
    if futura {
        return Err("La fecha de alta no puede ser posterior a hoy".to_string());
    }
    Ok(Some(fecha.to_string()))
}

pub fn crear_asociado_interno(db: &mut Connection, datos: &DatosAsociado) -> R<i64> {
    let fecha_alta = normalizar_fecha_alta(db, datos.fecha_alta.as_deref())?;
    let tx = db.transaction().map_err(s)?;
    tx.execute(
        "INSERT INTO asociados(apellido_nombre,dni,telefono,email,tipo_vinculo,fecha_alta,tiene_hermanos)
         VALUES(?1,?2,?3,?4,?5,COALESCE(?6, date('now','localtime')),0)",
        params![datos.apellido_nombre.trim(), datos.dni.trim(), datos.telefono, datos.email, datos.tipo_vinculo, fecha_alta],
    )
    .map_err(s)?;
    let id = tx.last_insert_rowid();
    for a in &datos.alumnos {
        if !a.nombre.trim().is_empty() {
            tx.execute("INSERT INTO alumnos(asociado_id,nombre,curso) VALUES(?1,?2,?3)", params![id, a.nombre.trim(), a.curso.trim()]).map_err(s)?;
        }
    }
    sincronizar_tiene_hermanos(&tx, id)?;
    tx.commit().map_err(s)?;
    Ok(id)
}

#[tauri::command]
pub fn crear_asociado(st: State<AppState>, datos: DatosAsociado) -> R<i64> {
    let u = auth_secretaria_presidente_o_admin(&st)?;
    let mut db = st.db.lock().map_err(s)?;
    let id = crear_asociado_interno(&mut db, &datos)?;
    auditar(&db, u.id, "CREAR", "asociado", Some(id))?;
    Ok(id)
}

pub fn actualizar_asociado_interno(db: &mut Connection, id: i64, datos: &DatosAsociado) -> R<()> {
    let fecha_alta = normalizar_fecha_alta(db, datos.fecha_alta.as_deref())?;
    let tx = db.transaction().map_err(s)?;
    tx.execute(
        "UPDATE asociados SET apellido_nombre=?1,dni=?2,telefono=?3,email=?4,tipo_vinculo=?5,
                fecha_alta=COALESCE(?6, fecha_alta) WHERE id=?7",
        params![datos.apellido_nombre.trim(), datos.dni.trim(), datos.telefono, datos.email, datos.tipo_vinculo, fecha_alta, id],
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
    sincronizar_tiene_hermanos(&tx, id)?;
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
    /// BONO_ANUAL | MATERIALES (CUOTA_MENSUAL sólo en registros históricos)
    pub concepto: String,
    pub fecha_pago: String,
    pub monto: i64,
    pub medio: String,
    pub comprobante: Option<String>,
    pub registrado_por: String,
    pub registrado_por_rol: Option<String>,
    pub registrado_por_nombre: Option<String>,
    pub movimiento_id: Option<i64>,
    pub adjunto_nombre: Option<String>,
    /// Nota libre cargada al registrar el bono
    pub observaciones: Option<String>,
}

#[tauri::command]
pub fn listar_pagos(st: State<AppState>, busqueda: String, anio: String, concepto: String) -> R<Vec<PagoFila>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let mut q = db.prepare(
        "SELECT p.id, p.asociado_id, a.apellido_nombre, a.dni, p.periodo, p.concepto, p.fecha_pago, p.monto, p.medio,
                p.comprobante, u.nombre, u.rol, p.movimiento_id, m.adjunto_nombre, p.observaciones
         FROM pagos p
         JOIN asociados a ON a.id = p.asociado_id
         JOIN usuarios u ON u.id = p.registrado_por
         LEFT JOIN movimientos_caja m ON m.id = p.movimiento_id
         WHERE (?1 = '' OR a.apellido_nombre LIKE '%'||?1||'%' OR a.dni LIKE '%'||?1||'%' OR p.comprobante LIKE '%'||?1||'%')
           AND (?2 = 'Todos' OR ?2 = '' OR p.periodo = ?2)
           AND (?3 = 'Todos' OR ?3 = '' OR p.concepto = ?3)
         ORDER BY p.fecha_pago DESC, p.id DESC",
    ).map_err(s)?;
    let rows = q.query_map(params![busqueda.trim(), anio.trim(), concepto.trim()], |r| {
        let nombre: String = r.get(10)?;
        let rol: String = r.get(11)?;
        Ok(PagoFila {
            id: r.get(0)?, asociado_id: r.get(1)?, apellido_nombre: r.get(2)?, dni: r.get(3)?,
            periodo: r.get(4)?, concepto: r.get(5)?,
            fecha_pago: r.get(6)?, monto: r.get(7)?, medio: r.get(8)?,
            comprobante: r.get(9)?,
            registrado_por: format!("{} ({})", rol, nombre),
            registrado_por_rol: Some(rol),
            registrado_por_nombre: Some(nombre),
            movimiento_id: r.get(12)?,
            adjunto_nombre: r.get(13)?,
            observaciones: r.get(14)?,
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
        "SELECT p.id, p.asociado_id, a.apellido_nombre, a.dni, p.periodo, p.concepto, p.fecha_pago, p.monto, p.medio,
                p.comprobante, u.nombre, u.rol, p.movimiento_id, m.adjunto_nombre, p.observaciones
         FROM pagos p
         JOIN asociados a ON a.id = p.asociado_id
         JOIN usuarios u ON u.id = p.registrado_por
         LEFT JOIN movimientos_caja m ON m.id = p.movimiento_id
         WHERE p.asociado_id = ?1
         ORDER BY p.periodo DESC, p.fecha_pago DESC",
    ).map_err(s)?;
    let rows = q.query_map(params![asociado_id], |r| {
        let nombre: String = r.get(10)?;
        let rol: String = r.get(11)?;
        Ok(PagoFila {
            id: r.get(0)?, asociado_id: r.get(1)?, apellido_nombre: r.get(2)?, dni: r.get(3)?,
            periodo: r.get(4)?, concepto: r.get(5)?,
            fecha_pago: r.get(6)?, monto: r.get(7)?, medio: r.get(8)?,
            comprobante: r.get(9)?,
            registrado_por: format!("{} ({})", rol, nombre),
            registrado_por_rol: Some(rol),
            registrado_por_nombre: Some(nombre),
            movimiento_id: r.get(12)?,
            adjunto_nombre: r.get(13)?,
            observaciones: r.get(14)?,
        })
    }).map_err(s)?;
    let v = rows.collect::<Result<Vec<_>, _>>().map_err(s)?;
    Ok(v)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatosPago {
    pub asociado_id: i64,
    /// Año lectivo del bono: el corriente o el entrante (se puede pagar en 2026 el ciclo 2027)
    pub periodo: String,
    /// BONO_ANUAL | MATERIALES
    pub concepto: String,
    pub monto: i64,
    pub medio: String,
    pub comprobante: Option<String>,
    pub adjunto_nombre: Option<String>,
    pub adjunto_datos: Option<String>,
    /// Nota libre del cobro (quién entregó el dinero, aclaraciones, etc.)
    #[serde(default)]
    pub observaciones: Option<String>,
}

/// Concepto: bono contribución anual (por familia y por año)
pub const CONCEPTO_BONO_ANUAL: &str = "BONO_ANUAL";
/// Concepto: bono contribución de materiales (por alumno)
pub const CONCEPTO_MATERIALES: &str = "MATERIALES";

/// Etiqueta legible del concepto para recibos y descripciones de caja
pub fn etiqueta_concepto(concepto: &str) -> &'static str {
    match concepto {
        CONCEPTO_BONO_ANUAL => "Bono contribución anual",
        CONCEPTO_MATERIALES => "Bono contribución materiales",
        _ => "Cuota social",
    }
}

pub fn registrar_pago_interno(db: &mut Connection, datos: &DatosPago, usuario_id: i64) -> R<i64> {
    if datos.monto <= 0 {
        return Err("El monto del bono contribución debe ser mayor a 0".to_string());
    }

    let concepto = datos.concepto.trim().to_uppercase();
    if concepto != CONCEPTO_BONO_ANUAL && concepto != CONCEPTO_MATERIALES {
        return Err("El concepto debe ser el bono contribución anual o el de materiales".to_string());
    }

    let anio = datos.periodo.trim();
    if anio.len() != 4 || !anio.chars().all(|c| c.is_ascii_digit()) {
        return Err("El año del bono debe tener 4 dígitos (por ejemplo 2026 o 2027)".to_string());
    }

    let tx = db.transaction().map_err(s)?;

    // El bono es colaborativo y se abona una vez por concepto y año lectivo
    let ya_pagado: bool = tx.query_row(
        "SELECT COUNT(*) FROM pagos WHERE asociado_id=?1 AND concepto=?2 AND periodo=?3 AND anulado=0",
        params![datos.asociado_id, concepto, anio],
        |r| r.get::<_, i64>(0),
    ).map_err(s)? > 0;

    if ya_pagado {
        return Err(format!(
            "El asociado ya tiene registrado el {} del año {}.",
            etiqueta_concepto(&concepto).to_lowercase(),
            anio
        ));
    }

    let asociado_nombre: String = tx.query_row("SELECT apellido_nombre FROM asociados WHERE id=?1", params![datos.asociado_id], |r| r.get(0)).map_err(s)?;

    // Los materiales se cobran por alumno: el recibo deja constancia de cuántos son
    let detalle_alumnos = if concepto == CONCEPTO_MATERIALES {
        let cantidad: i64 = tx
            .query_row("SELECT COUNT(*) FROM alumnos WHERE asociado_id=?1", params![datos.asociado_id], |r| r.get(0))
            .map_err(s)?;
        format!(" ({} {})", cantidad.max(1), if cantidad == 1 { "alumno" } else { "alumnos" })
    } else {
        String::new()
    };

    let desc = format!(
        "Asociado N° {} - {} {}{}\n{}",
        datos.asociado_id, etiqueta_concepto(&concepto), anio, detalle_alumnos, asociado_nombre
    );

    // 1. Crear movimiento en caja automático (el bono se asienta como "Cuota Social",
    //    que es la categoría con la que debe figurar en la rendición de cuentas)
    tx.execute(
        "INSERT INTO movimientos_caja(fecha, tipo, categoria, descripcion, monto, comprobante, adjunto_nombre, adjunto_datos, registrado_por, registrado_en) VALUES(date('now','localtime'), 'Ingreso', 'Cuota Social', ?1, ?2, ?3, ?4, ?5, ?6, datetime('now','localtime'))",
        params![desc, datos.monto, datos.comprobante, datos.adjunto_nombre, datos.adjunto_datos, usuario_id],
    ).map_err(s)?;
    let mov_id = tx.last_insert_rowid();

    // 2. Registrar pago (con la nota libre del cobro, si la hubiera)
    let observaciones = datos.observaciones.as_deref().map(str::trim).filter(|o| !o.is_empty());
    tx.execute(
        "INSERT INTO pagos(asociado_id, periodo, concepto, fecha_pago, monto, medio, comprobante, observaciones, anulado, registrado_por, movimiento_id) VALUES(?1, ?2, ?3, date('now','localtime'), ?4, ?5, ?6, ?7, 0, ?8, ?9)",
        params![datos.asociado_id, anio, concepto, datos.monto, datos.medio.trim(), datos.comprobante, observaciones, usuario_id, mov_id],
    ).map_err(s)?;
    let pago_id = tx.last_insert_rowid();

    tx.commit().map_err(s)?;
    Ok(pago_id)
}

#[tauri::command]
pub fn registrar_pago(st: State<AppState>, datos: DatosPago) -> R<i64> {
    let u = auth_tesorero_o_admin(&st)?;
    if datos.adjunto_datos.as_ref().map_or(false, |d| d.len() / 4 * 3 > LIMITE_ADJUNTO_BYTES) {
        return Err("El comprobante adjunto supera el límite de 10 MB".to_string());
    }
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
    /// Fecha y hora en que se cargó en el sistema; `fecha` es la fecha real de la operación
    pub registrado_en: Option<String>,
    /// "A" | "B" para los ingresos cargados como "Otros": en el acta se suman en
    /// "3. Otros ingresos / subsidios" a) o b), conservando el detalle de la categoría.
    pub grupo_otros: Option<String>,
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
                m.adjunto_nombre, u.rol || ' (' || u.nombre || ')', m.registrado_en, m.grupo_otros
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
            registrado_en: r.get(11)?, grupo_otros: r.get(12)?,
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
    /// Fecha real de la operación (AAAA-MM-DD); si no viene se toma la del día
    pub fecha: Option<String>,
    /// Para ingresos cargados en "Otros": "A" o "B" (renglón del acta donde se suman)
    #[serde(default)]
    pub grupo_otros: Option<String>,
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
    crear_movimiento_caja_interno(&db, &datos, u.id)
}

pub fn crear_movimiento_caja_interno(db: &Connection, datos: &DatosMovimientoCaja, usuario_id: i64) -> R<i64> {
    let fecha = datos.fecha.as_deref().map(str::trim).filter(|f| !f.is_empty());
    if let Some(f) = fecha {
        let (valida, futura): (bool, bool) = db
            .query_row("SELECT date(?1) IS ?1, ?1 > date('now','localtime')", params![f], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(s)?;
        if !valida {
            return Err("La fecha del movimiento no es válida".to_string());
        }
        if futura {
            return Err("La fecha del movimiento no puede ser posterior a hoy".to_string());
        }
    }
    // "Otros" ingresos se clasifican en a) o b) para el cuadro del acta; el resto no lleva grupo
    let grupo_otros = match datos.grupo_otros.as_deref().map(str::trim).map(str::to_uppercase).as_deref() {
        None | Some("") => None,
        Some("A") => Some("A".to_string()),
        Some("B") => Some("B".to_string()),
        Some(_) => return Err("El grupo de otros ingresos debe ser a) o b)".to_string()),
    };
    let grupo_otros = if datos.tipo.trim() == "Ingreso" { grupo_otros } else { None };

    db.execute(
        "INSERT INTO movimientos_caja(fecha, tipo, categoria, descripcion, monto, comprobante, adjunto_nombre, adjunto_datos, registrado_por, registrado_en, grupo_otros)
         VALUES(COALESCE(?9, date('now','localtime')), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now','localtime'), ?10)",
        params![datos.tipo, datos.categoria.trim(), datos.descripcion.trim(), datos.monto, datos.comprobante,
                datos.adjunto_nombre, datos.adjunto_datos, usuario_id, fecha, grupo_otros],
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

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionActa {
    pub orden: i64,
    pub descripcion: String,
    pub resultado: String,
    pub observacion: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActaFila {
    pub id: i64,
    pub reunion_id: Option<i64>,
    pub tipo: String,
    pub numero: String,
    pub foja: String,
    pub fecha_asamblea: String,
    pub socios_activos_asistentes: i64,
    pub periodo_desde: String,
    pub periodo_hasta: String,
    pub cuota_social: i64,
    pub cuota_periodicidad: String,
    pub caja_chica: i64,
    pub cuadro_financiero: serde_json::Value,
    pub observaciones: String,
    pub archivo_adjunto: Option<String>,
    pub estado: String,
    pub decisiones: Vec<DecisionActa>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuardarActaDetallada {
    pub id: Option<i64>,
    pub reunion_id: Option<i64>,
    pub tipo: String,
    pub numero: String,
    pub foja: String,
    pub fecha_asamblea: String,
    pub socios_activos_asistentes: i64,
    pub periodo_desde: String,
    pub periodo_hasta: String,
    pub cuota_social: i64,
    pub cuota_periodicidad: String,
    pub caja_chica: i64,
    #[serde(default)]
    pub cuadro_financiero: serde_json::Value,
    pub observaciones: String,
    pub archivo_adjunto: Option<String>,
    pub decisiones: Vec<DecisionActa>,
}

#[tauri::command]
pub fn listar_actas(st: State<AppState>) -> R<Vec<ActaFila>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    let mut stmt = db.prepare(
        "SELECT id, reunion_id, tipo, numero, foja, fecha_asamblea, socios_activos_asistentes,
                periodo_desde, periodo_hasta, cuota_social, cuota_periodicidad, caja_chica, cuadro_financiero,
                observaciones, archivo_adjunto, estado
         FROM actas ORDER BY fecha_asamblea DESC, id DESC",
    ).map_err(s)?;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, i64>(0)?, r.get::<_, Option<i64>>(1)?, r.get::<_, String>(2)?,
            r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?,
            r.get::<_, i64>(6)?, r.get::<_, String>(7)?, r.get::<_, String>(8)?,
            r.get::<_, i64>(9)?, r.get::<_, String>(10)?, r.get::<_, i64>(11)?,
            r.get::<_, String>(12)?, r.get::<_, String>(13)?, r.get::<_, Option<String>>(14)?, r.get::<_, String>(15)?,
        ))
    }).map_err(s)?;
    let mut result = Vec::new();
    for row in rows {
        let (id, reunion_id, tipo, numero, foja, fecha_asamblea, socios, desde, hasta, cuota, periodicidad, caja, cuadro_financiero, observaciones, archivo, estado) = row.map_err(s)?;
        let mut decisions = db.prepare(
            "SELECT orden, descripcion, resultado, observacion FROM acta_decisiones WHERE acta_id=?1 ORDER BY orden",
        ).map_err(s)?;
        let decisions = decisions.query_map(params![id], |r| Ok(DecisionActa {
            orden: r.get(0)?, descripcion: r.get(1)?, resultado: r.get(2)?, observacion: r.get(3)?,
        })).map_err(s)?.collect::<Result<Vec<_>, _>>().map_err(s)?;
        result.push(ActaFila {
            id, reunion_id, tipo, numero, foja, fecha_asamblea,
            socios_activos_asistentes: socios, periodo_desde: desde, periodo_hasta: hasta,
            cuota_social: cuota, cuota_periodicidad: periodicidad, caja_chica: caja,
            cuadro_financiero: serde_json::from_str(&cuadro_financiero).unwrap_or_else(|_| serde_json::json!({})),
            observaciones, archivo_adjunto: archivo, estado, decisiones: decisions,
        });
    }
    Ok(result)
}

#[tauri::command]
pub fn guardar_acta_detallada(st: State<AppState>, datos: GuardarActaDetallada) -> R<ActaFila> {
    let u = auth_secretaria_presidente_o_admin(&st)?;
    let db = st.db.lock().map_err(s)?;
    let tx = db.unchecked_transaction().map_err(s)?;
    let id = if let Some(id) = datos.id {
        tx.execute(
            "UPDATE actas SET reunion_id=?1,tipo=?2,numero=?3,foja=?4,fecha_asamblea=?5,
             socios_activos_asistentes=?6,periodo_desde=?7,periodo_hasta=?8,cuota_social=?9,
             cuota_periodicidad=?10,caja_chica=?11,cuadro_financiero=?12,observaciones=?13,archivo_adjunto=?14
             WHERE id=?15",
            params![datos.reunion_id, datos.tipo.trim(), datos.numero.trim(), datos.foja.trim(), datos.fecha_asamblea,
                    datos.socios_activos_asistentes, datos.periodo_desde, datos.periodo_hasta,
                    datos.cuota_social, datos.cuota_periodicidad, datos.caja_chica,
                    serde_json::to_string(&datos.cuadro_financiero).map_err(s)?,
                    datos.observaciones.trim(), datos.archivo_adjunto, id],
        ).map_err(s)?;
        tx.execute("DELETE FROM acta_decisiones WHERE acta_id=?1", params![id]).map_err(s)?;
        id
    } else {
        tx.execute(
            "INSERT INTO actas(reunion_id,tipo,numero,foja,fecha_asamblea,socios_activos_asistentes,
             periodo_desde,periodo_hasta,cuota_social,cuota_periodicidad,caja_chica,cuadro_financiero,observaciones,
             archivo_adjunto,registrado_por)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
            params![datos.reunion_id, datos.tipo.trim(), datos.numero.trim(), datos.foja.trim(), datos.fecha_asamblea,
                    datos.socios_activos_asistentes, datos.periodo_desde, datos.periodo_hasta, datos.cuota_social,
                    datos.cuota_periodicidad, datos.caja_chica,
                    serde_json::to_string(&datos.cuadro_financiero).map_err(s)?,
                    datos.observaciones.trim(), datos.archivo_adjunto, u.id],
        ).map_err(s)?;
        tx.last_insert_rowid()
    };
    for decision in &datos.decisiones {
        tx.execute(
            "INSERT INTO acta_decisiones(acta_id,orden,descripcion,resultado,observacion) VALUES(?1,?2,?3,?4,?5)",
            params![id, decision.orden, decision.descripcion.trim(), decision.resultado, decision.observacion.trim()],
        ).map_err(s)?;
    }

    tx.commit().map_err(s)?;

    // Si el acta ya está firmada, lo fijado impacta enseguida en la configuración
    let estado_acta: String = db
        .query_row("SELECT estado FROM actas WHERE id=?1", params![id], |r| r.get(0))
        .map_err(s)?;
    if estado_acta == "Firmada" {
        aplicar_valores_acta(&db, id)?;
    }

    auditar(&db, u.id, "GUARDAR", "acta", Some(id))?;
    drop(db);
    listar_actas(st).and_then(|items| items.into_iter().find(|a| a.id == id).ok_or_else(|| "No se pudo recuperar el acta guardada".to_string()))
}

/// Lo fijado en el acta de asamblea impacta en la configuración de la cooperadora:
/// la cuota social pasa a ser el Bono Contribución Anual y la caja chica su monto aprobado.
pub fn aplicar_valores_acta(db: &Connection, id: i64) -> R<()> {
    let (cuota_social, caja_chica): (i64, i64) = db.query_row(
        "SELECT cuota_social, caja_chica FROM actas WHERE id=?1",
        params![id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).map_err(|_| "El acta no existe".to_string())?;

    db.execute(
        "INSERT INTO configuracion(clave, valor) VALUES('bono_anual', ?1)
         ON CONFLICT(clave) DO UPDATE SET valor=?1",
        params![cuota_social.to_string()],
    ).map_err(s)?;
    db.execute(
        "INSERT INTO configuracion(clave, valor) VALUES('caja_chica', ?1)
         ON CONFLICT(clave) DO UPDATE SET valor=?1",
        params![caja_chica.to_string()],
    ).map_err(s)?;
    Ok(())
}

#[tauri::command]
pub fn aprobar_acta(st: State<AppState>, id: i64) -> R<()> {
    let u = auth_presidente_o_admin(&st)?;
    let db = st.db.lock().map_err(s)?;
    let updated = db.execute(
        "UPDATE actas SET estado='Firmada' WHERE id=?1 AND estado='Borrador'",
        params![id],
    ).map_err(s)?;
    if updated == 0 {
        return Err("El acta no existe o ya fue aprobada".to_string());
    }
    aplicar_valores_acta(&db, id)?;
    auditar(&db, u.id, "APROBAR", "acta", Some(id))
}

#[tauri::command]
pub fn eliminar_acta(st: State<AppState>, id: i64) -> R<()> {
    let u = auth_superadmin(&st)?;
    let db = st.db.lock().map_err(s)?;
    let tx = db.unchecked_transaction().map_err(s)?;
    let deleted = tx.execute("DELETE FROM actas WHERE id=?1", params![id]).map_err(s)?;
    if deleted == 0 {
        return Err("El acta no existe".to_string());
    }
    tx.commit().map_err(s)?;
    auditar(&db, u.id, "ELIMINAR", "acta", Some(id))
}

// ----------------------------------------------------
// RENDICIONES DE CUENTAS
// ----------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaldoEjercicioAnterior {
    /// Importe sugerido para "Saldo ejercicio anterior"
    pub saldo: i64,
    /// "acta" | "caja" | "sin_datos"
    pub origen: String,
    /// Explicación del origen, para mostrarle al usuario de dónde salió el número
    pub detalle: String,
}

/// Saldo con el que arranca el ejercicio que comienza en `desde` (AAAA-MM-DD):
/// 1) el "Saldo próximo ejercicio" del acta del ejercicio anterior (documento aprobado);
/// 2) si no hay acta, el acumulado de caja anterior a `desde`;
/// 3) si tampoco hay movimientos, sin datos: queda la carga manual en el acta.
pub fn saldo_ejercicio_anterior_interno(db: &Connection, desde: &str) -> R<SaldoEjercicioAnterior> {
    let anio = desde.get(0..4).unwrap_or("").to_string();
    let acta: Option<(String, String, String)> = db
        .query_row(
            "SELECT numero, foja, cuadro_financiero FROM actas
             WHERE tipo = 'Asamblea Anual Ordinaria' AND periodo_hasta = ?1
             ORDER BY fecha_asamblea DESC, id DESC LIMIT 1",
            params![anio],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(s)?;

    if let Some((numero, foja, cuadro)) = acta {
        let json: serde_json::Value =
            serde_json::from_str(&cuadro).unwrap_or_else(|_| serde_json::json!({}));
        let valor = json
            .get("saldoProximoEjercicio")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let digitos: String = valor.chars().filter(|c| c.is_ascii_digit()).collect();
        if !digitos.is_empty() {
            return Ok(SaldoEjercicioAnterior {
                saldo: digitos.parse().unwrap_or(0),
                origen: "acta".to_string(),
                detalle: format!("Saldo próximo ejercicio del acta N° {} (foja {})", numero, foja),
            });
        }
    }

    let (acumulado, movimientos): (i64, i64) = db
        .query_row(
            "SELECT COALESCE(SUM(CASE tipo WHEN 'Ingreso' THEN monto ELSE -monto END), 0), COUNT(*)
             FROM movimientos_caja WHERE anulado = 0 AND fecha < ?1",
            params![desde],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(s)?;

    if movimientos > 0 {
        return Ok(SaldoEjercicioAnterior {
            saldo: acumulado,
            origen: "caja".to_string(),
            detalle: format!("Acumulado de caja anterior al {} (no incluye saldos en banco)", desde),
        });
    }

    Ok(SaldoEjercicioAnterior {
        saldo: 0,
        origen: "sin_datos".to_string(),
        detalle: "No hay ejercicio anterior registrado: ingresá el saldo de la última acta en papel".to_string(),
    })
}

#[tauri::command]
pub fn saldo_ejercicio_anterior(st: State<AppState>, desde: String) -> R<SaldoEjercicioAnterior> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    saldo_ejercicio_anterior_interno(&db, desde.trim())
}

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
    /// Última vez que el detalle aprobado se recalculó por cambios en la caja del período
    pub actualizada_en: Option<String>,
    pub total_ingresos: i64,
    pub total_egresos: i64,
    pub saldo_periodo: i64,
}

#[derive(Serialize, Deserialize)]
struct RendicionSnapshot {
    lineas: Vec<LineaRendicion>,
    meses: Vec<MesRendicion>,
}

#[tauri::command]
pub fn listar_rendiciones(st: State<AppState>) -> R<Vec<RendicionFila>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;

    // Antes de listar, se recalculan las rendiciones aprobadas: si la caja del período
    // cambió, se guarda el nuevo detalle y se registra la fecha de actualización.
    let aprobadas: Vec<i64> = {
        let mut q = db.prepare("SELECT id FROM rendiciones WHERE estado='Aprobada'").map_err(s)?;
        let filas = q.query_map([], |r| r.get::<_, i64>(0)).map_err(s)?;
        filas.collect::<Result<Vec<_>, _>>().map_err(s)?
    };
    for id in aprobadas {
        let _ = refrescar_rendicion_aprobada(&db, id);
    }

    // Los totales se calculan siempre desde la caja del período (no desde el snapshot)
    let mut q = db.prepare(
        "SELECT r.id, r.periodo, r.desde, r.hasta, r.generada_en, u1.nombre, r.estado, u2.nombre,
                r.aprobada_en, r.actualizada_en,
                COALESCE((SELECT SUM(monto) FROM movimientos_caja
                          WHERE tipo='Ingreso' AND anulado=0 AND fecha BETWEEN r.desde AND r.hasta), 0),
                COALESCE((SELECT SUM(monto) FROM movimientos_caja
                          WHERE tipo='Egreso' AND anulado=0 AND fecha BETWEEN r.desde AND r.hasta), 0)
         FROM rendiciones r
         JOIN usuarios u1 ON u1.id = r.generada_por
         LEFT JOIN usuarios u2 ON u2.id = r.aprobada_por
         ORDER BY r.desde DESC, r.id DESC",
    ).map_err(s)?;
    let rows = q.query_map([], |r| {
        let ing: i64 = r.get(10)?;
        let egr: i64 = r.get(11)?;
        Ok(RendicionFila {
            id: r.get(0)?, periodo: r.get(1)?, desde: r.get(2)?, hasta: r.get(3)?,
            generada_en: r.get(4)?, generada_por: r.get(5)?, estado: r.get(6)?,
            aprobada_por: r.get(7)?, aprobada_en: r.get(8)?, actualizada_en: r.get(9)?,
            total_ingresos: ing, total_egresos: egr, saldo_periodo: ing - egr,
        })
    }).map_err(s)?;
    let v = rows.collect::<Result<Vec<_>, _>>().map_err(s)?;
    Ok(v)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineaRendicion {
    pub tipo: String,
    pub categoria: String,
    pub total: i64,
    /// "A" | "B" cuando la categoría es un "Otro ingreso" clasificado para el acta
    #[serde(default)]
    pub grupo: Option<String>,
}

/// Vuelve a calcular el detalle de una rendición aprobada con los movimientos actuales del
/// período. Si el resultado cambió, guarda el nuevo snapshot y registra la fecha de actualización.
pub fn refrescar_rendicion_aprobada(db: &Connection, id: i64) -> R<bool> {
    let (estado, snapshot): (String, Option<String>) = db.query_row(
        "SELECT estado, snapshot FROM rendiciones WHERE id=?1", params![id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).map_err(|_| "La rendición de cuentas no existe".to_string())?;
    if estado != "Aprobada" {
        return Ok(false);
    }
    let actual = RendicionSnapshot {
        lineas: detalle_rendicion_actual(db, id)?,
        meses: detalle_mensual_rendicion_actual(db, id)?,
    };
    let json = serde_json::to_string(&actual).map_err(s)?;
    if snapshot.as_deref() == Some(json.as_str()) {
        return Ok(false);
    }
    db.execute(
        "UPDATE rendiciones SET snapshot=?1, actualizada_en=datetime('now','localtime') WHERE id=?2",
        params![json, id],
    ).map_err(s)?;
    Ok(true)
}

/// Totales por tipo y categoría de los movimientos no anulados del período de la rendición
pub fn detalle_rendicion_actual(db: &Connection, id: i64) -> R<Vec<LineaRendicion>> {
    let (desde, hasta): (String, String) = db.query_row(
        "SELECT desde, hasta FROM rendiciones WHERE id=?1",
        params![id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).map_err(|_| "La rendición de cuentas no existe".to_string())?;

    let mut q = db.prepare(
        "SELECT tipo, categoria, SUM(monto), grupo_otros
         FROM movimientos_caja
         WHERE anulado=0 AND fecha BETWEEN ?1 AND ?2
         GROUP BY tipo, categoria, grupo_otros
         ORDER BY tipo DESC, SUM(monto) DESC",
    ).map_err(s)?;
    let rows = q.query_map(params![desde, hasta], |r| {
        Ok(LineaRendicion { tipo: r.get(0)?, categoria: r.get(1)?, total: r.get(2)?, grupo: r.get(3)? })
    }).map_err(s)?;
    let v = rows.collect::<Result<Vec<_>, _>>().map_err(s)?;
    Ok(v)
}

pub fn detalle_rendicion_interno(db: &Connection, id: i64) -> R<Vec<LineaRendicion>> {
    detalle_rendicion_actual(db, id)
}

#[tauri::command]
pub fn detalle_rendicion(st: State<AppState>, id: i64) -> R<Vec<LineaRendicion>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    detalle_rendicion_interno(&db, id)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MesRendicion {
    /// AAAA-MM
    pub mes: String,
    pub ingresos: i64,
    pub egresos: i64,
}

/// Totales de cada mes del período de la rendición; los meses sin movimientos van en 0
pub fn detalle_mensual_rendicion_actual(db: &Connection, id: i64) -> R<Vec<MesRendicion>> {
    let (desde, hasta): (String, String) = db.query_row(
        "SELECT desde, hasta FROM rendiciones WHERE id=?1",
        params![id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).map_err(|_| "La rendición de cuentas no existe".to_string())?;

    let anio_mes = |fecha: &str| -> R<(i32, u32)> {
        let anio = fecha.get(0..4).and_then(|a| a.parse().ok());
        let mes = fecha.get(5..7).and_then(|m| m.parse().ok());
        match (anio, mes) {
            (Some(a), Some(m)) if (1..=12).contains(&m) => Ok((a, m)),
            _ => Err(format!("Fecha de rendición inválida: {}", fecha)),
        }
    };
    let (mut anio, mut mes) = anio_mes(&desde)?;
    let fin = anio_mes(&hasta)?;

    let mut q = db.prepare(
        "SELECT strftime('%Y-%m', fecha),
                SUM(CASE WHEN tipo='Ingreso' THEN monto ELSE 0 END),
                SUM(CASE WHEN tipo='Egreso' THEN monto ELSE 0 END)
         FROM movimientos_caja
         WHERE anulado=0 AND fecha BETWEEN ?1 AND ?2
         GROUP BY 1",
    ).map_err(s)?;
    let totales = q
        .query_map(params![desde, hasta], |r| Ok((r.get::<_, String>(0)?, (r.get::<_, i64>(1)?, r.get::<_, i64>(2)?))))
        .map_err(s)?
        .collect::<Result<std::collections::HashMap<_, _>, _>>()
        .map_err(s)?;

    let mut meses = Vec::new();
    // Tope de 10 años para no iterar sin fin ante un rango mal cargado
    while (anio, mes) <= fin && meses.len() < 120 {
        let clave = format!("{:04}-{:02}", anio, mes);
        let (ingresos, egresos) = totales.get(&clave).copied().unwrap_or((0, 0));
        meses.push(MesRendicion { mes: clave, ingresos, egresos });
        if mes == 12 { anio += 1; mes = 1; } else { mes += 1; }
    }
    Ok(meses)
}

pub fn detalle_mensual_rendicion_interno(db: &Connection, id: i64) -> R<Vec<MesRendicion>> {
    detalle_mensual_rendicion_actual(db, id)
}

#[tauri::command]
pub fn detalle_mensual_rendicion(st: State<AppState>, id: i64) -> R<Vec<MesRendicion>> {
    auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    detalle_mensual_rendicion_interno(&db, id)
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
        "INSERT INTO rendiciones(periodo, desde, hasta, generada_en, generada_por, estado) VALUES(?1, ?2, ?3, date('now','localtime'), ?4, 'Borrador')",
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
    let snapshot = RendicionSnapshot {
        lineas: detalle_rendicion_actual(&db, id)?,
        meses: detalle_mensual_rendicion_actual(&db, id)?,
    };
    db.execute(
        "UPDATE rendiciones SET estado='Aprobada', aprobada_por=?1, aprobada_en=date('now','localtime'), snapshot=?2
         WHERE id=?3 AND estado='Borrador'",
        params![u.id, serde_json::to_string(&snapshot).map_err(s)?, id],
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

/// Recalcula el detalle de la rendición con la caja actual del período y guarda la fecha de
/// actualización. Permite refrescar sin eliminar y volver a crear la rendición.
pub fn actualizar_rendicion_interno(db: &Connection, id: i64) -> R<String> {
    let snapshot = RendicionSnapshot {
        lineas: detalle_rendicion_actual(db, id)?,
        meses: detalle_mensual_rendicion_actual(db, id)?,
    };
    let json = serde_json::to_string(&snapshot).map_err(s)?;
    let actualizada: String = db
        .query_row("SELECT datetime('now','localtime')", [], |r| r.get(0))
        .map_err(s)?;

    db.execute(
        "UPDATE rendiciones SET snapshot=?1, actualizada_en=?2 WHERE id=?3",
        params![json, actualizada, id],
    ).map_err(s)?;
    Ok(actualizada)
}

#[tauri::command]
pub fn actualizar_rendicion(st: State<AppState>, id: i64) -> R<String> {
    let u = auth_tesorero_o_admin(&st)?;
    let db = st.db.lock().map_err(s)?;
    let actualizada = actualizar_rendicion_interno(&db, id)?;
    auditar(&db, u.id, "ACTUALIZAR", "rendicion", Some(id))?;
    Ok(actualizada)
}

#[tauri::command]
pub fn eliminar_rendicion(st: State<AppState>, id: i64) -> R<()> {
    let u = auth_superadmin(&st)?;
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

/// Saldos en banco de la cooperadora: sólo la Tesorería o el Superadministrador pueden
/// modificarlos, y cada cambio queda auditado con el valor anterior y el nuevo.
const SALDOS_BANCO: [(&str, &str); 2] = [
    ("saldo_cuenta_corriente", "Cuenta corriente (banco)"),
    ("saldo_plazo_fijo", "Plazo fijo (banco)"),
];

pub fn guardar_configuracion_interno(db: &Connection, usuario: &Usuario, clave: &str, valor: &str) -> R<()> {
    let saldo_banco = SALDOS_BANCO.iter().find(|(k, _)| *k == clave);
    if saldo_banco.is_some() {
        if usuario.rol != "Superadmin" && usuario.rol != "Tesorero" {
            return Err("Acceso denegado: sólo la Tesorería o el Superadministrador pueden actualizar los saldos en banco".to_string());
        }
    } else if usuario.rol != "Superadmin" && usuario.rol != "Secretaria" && usuario.rol != "Presidente" {
        return Err("Acceso denegado: sólo el Superadministrador, la Presidencia o la Secretaría pueden actualizar la configuración institucional".to_string());
    }

    // Los saldos se guardan sólo con dígitos, igual que en el formulario
    let valor = if saldo_banco.is_some() {
        valor.chars().filter(|c| c.is_ascii_digit()).collect::<String>()
    } else {
        valor.to_string()
    };

    let anterior: Option<String> = db
        .query_row("SELECT valor FROM configuracion WHERE clave=?1", params![clave], |r| r.get(0))
        .optional()
        .map_err(s)?;
    db.execute("INSERT INTO configuracion(clave, valor) VALUES(?1, ?2) ON CONFLICT(clave) DO UPDATE SET valor=?2", params![clave, valor]).map_err(s)?;

    // El cambio de saldos queda anexado al historial: fecha y usuario los pone la auditoría,
    // el detalle guarda el valor anterior y el nuevo.
    if let Some((_, etiqueta)) = saldo_banco {
        if anterior.as_deref() != Some(valor.as_str()) {
            let detalle = format!(
                "{}: {} → {}",
                etiqueta,
                anterior.unwrap_or_else(|| "sin dato".to_string()),
                valor
            );
            auditar_con_detalle(db, usuario.id, "CONFIGURAR", "configuracion", None, Some(&detalle))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn guardar_configuracion(st: State<AppState>, clave: String, valor: String) -> R<()> {
    let u = auth(&st)?;
    let db = st.db.lock().map_err(s)?;
    guardar_configuracion_interno(&db, &u, &clave, &valor)
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

/// Cargos de la comisión propiamente dicha (presidencia, secretaría, tesorería y vocales),
/// a diferencia de los revisores de cuentas y del asesor
pub fn es_cargo_de_comision(cargo: &str) -> bool {
    let c = cargo.to_uppercase();
    !c.starts_with("REV") && !c.contains("ASESOR")
}

/// El personal del establecimiento sólo puede figurar como asesor o revisor de cuentas docente;
/// los cargos de la comisión corresponden a los asociados
pub fn validar_vinculo_comision(db: &Connection, miembro: &MiembroComisionFila) -> R<()> {
    if !es_cargo_de_comision(&miembro.cargo) {
        return Ok(());
    }
    let error = format!(
        "El personal directivo de la escuela no puede ocupar el cargo {}: sólo puede figurar como asesor o revisor de cuentas docente",
        miembro.cargo
    );
    if miembro.personal_establecimiento_id.is_some() {
        return Err(error);
    }
    if let Some(asociado_id) = miembro.asociado_id {
        let tipo: Option<String> = db
            .query_row("SELECT tipo_vinculo FROM asociados WHERE id=?1", params![asociado_id], |r| r.get(0))
            .optional()
            .map_err(s)?;
        if tipo.as_deref() == Some("DIRECTIVO_ESCOLAR") {
            return Err(error);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn guardar_miembro_comision(st: State<AppState>, miembro: MiembroComisionFila) -> R<()> {
    let u = auth_secretaria_o_admin(&st)?;
    let db = st.db.lock().map_err(s)?;
    validar_vinculo_comision(&db, &miembro)?;
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
    if let Some(id_text) = p.vinculo_nomina.strip_prefix("AUTORIDAD:") {
        let autoridad_id: i64 = id_text.parse().map_err(|_| "Vínculo de autoridad inválido".to_string())?;
        let cargo: Option<String> = db
            .query_row("SELECT cargo FROM comision_directiva WHERE id=?1", params![autoridad_id], |r| r.get(0))
            .optional()
            .map_err(s)?;
        let cargo = cargo.ok_or_else(|| "La autoridad seleccionada no existe".to_string())?;
        if es_cargo_de_comision(&cargo) {
            return Err(format!(
                "El personal de la escuela no puede ocupar el cargo {}: sólo puede figurar como asesor o revisor de cuentas docente",
                cargo
            ));
        }
    }
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