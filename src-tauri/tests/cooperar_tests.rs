// src-tauri/tests/cooperar_tests.rs
use cooperar::{commands, db, AppState};
use rusqlite::params;
use std::fs;
use std::path::PathBuf;

#[test]
fn test_db_initialization_and_schema() {
    let test_dir = PathBuf::from("target").join("test_db_init_real");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");

    // 1. Invoca directamente la inicialización real de la base de datos de la aplicación
    let conn = db::init(&test_dir).expect("db::init debe inicializar la base exitosamente");

    // 2. Comprobar que las tablas institucionales y de seguridad existen
    let expected_tables = vec![
        "usuarios",
        "asociados",
        "alumnos",
        "movimientos_caja",
        "pagos",
        "reuniones",
        "rendiciones",
        "comision_directiva",
        "personal_establecimiento",
        "documentos_asambleas",
        "configuracion",
    ];

    for table in expected_tables {
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                params![table],
                |r| r.get(0),
            )
            .expect("Consulta de tabla sqlite_master");
        assert_eq!(count, 1, "La tabla {} debe existir en la base de datos", table);
    }

    // 3. Comprobar la vista de padrón
    let view_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='view' AND name='v_asociados'",
            [],
            |r| r.get(0),
        )
        .expect("Consulta de vista v_asociados");
    assert_eq!(view_count, 1, "La vista v_asociados debe estar creada");

    // 4. Comprobar usuarios iniciales con contraseña hashed
    let superadmin_hash: String = conn
        .query_row(
            "SELECT clave_hash FROM usuarios WHERE rol='Superadmin'",
            [],
            |r| r.get(0),
        )
        .expect("Usuario Superadmin inicial");
    assert!(db::verify("admin123", &superadmin_hash), "La contraseña inicial 'admin123' debe verificar contra el hash Argon2");

    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_cuil_modulo_11_verification() {
    // Llama directamente a la función oficial de la aplicación (db::calcular_cuil_modulo_11)
    assert_eq!(db::calcular_cuil_modulo_11("20000002"), Some("20-20000002-2".to_string()));
    assert_eq!(db::calcular_cuil_modulo_11("40000004"), Some("20-40000004-3".to_string()));
    assert_eq!(db::calcular_cuil_modulo_11("32111222"), Some("20-32111222-7".to_string()));

    // Resto 1 con prefijo 20: el algoritmo conmuta al prefijo 23
    assert_eq!(db::calcular_cuil_modulo_11("20000009"), Some("23-20000009-9".to_string()));

    // Casos con caracteres de formateo
    assert_eq!(db::calcular_cuil_modulo_11("32.111.222"), Some("20-32111222-7".to_string()));

    // Casos inválidos
    assert_eq!(db::calcular_cuil_modulo_11("123"), None);
    assert_eq!(db::calcular_cuil_modulo_11(""), None);
}

#[test]
fn test_cross_data_integrity_asociado_comision_and_caja_pagos() {
    let test_dir = PathBuf::from("target").join("test_integrity_real");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");

    let mut conn = db::init(&test_dir).expect("Inicializar base de datos");

    // 1. Obtener el asociado 1 y verificar vinculación existente en Comisión Directiva (Álvarez Marcos)
    let nombre_comision_previo: String = conn
        .query_row(
            "SELECT nombre FROM comision_directiva WHERE asociado_id=1",
            [],
            |r| r.get(0),
        )
        .expect("Miembro de comisión directiva vinculado al asociado 1");
    assert_eq!(nombre_comision_previo, "Álvarez, Marcos");

    // 2. Modificar asociado usando la función real de la aplicación
    let nuevos_datos = commands::DatosAsociado {
        apellido_nombre: "Álvarez Ramos, Marcos".to_string(),
        dni: "32111222".to_string(),
        telefono: Some("11-9999-8888".to_string()),
        email: Some("marcos.nuevo@test.com".to_string()),
        tipo_vinculo: "Docente".to_string(),
        fecha_alta: None,
        alumnos: vec![commands::NuevoAlumno {
            nombre: "Lucía Álvarez Ramos".to_string(),
            curso: "3° A".to_string(),
        }],
    };

    commands::actualizar_asociado_interno(&mut conn, 1, &nuevos_datos)
        .expect("actualizar_asociado_interno debe sincronizar datos");

    // Verificar sincronización cruzada automática en la comisión directiva
    let comision_nombre: String = conn
        .query_row(
            "SELECT nombre FROM comision_directiva WHERE asociado_id=1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let comision_tel: String = conn
        .query_row(
            "SELECT telefono FROM comision_directiva WHERE asociado_id=1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(comision_nombre, "Álvarez Ramos, Marcos");
    assert_eq!(comision_tel, "11-9999-8888");

    // 3. Probar vinculación cruzada Caja <-> Pagos <-> Estado de colaboración en v_asociados
    // Año lectivo dinámico para que no dependa del año en que se ejecuta el test
    let anio_actual: String = conn
        .query_row("SELECT strftime('%Y','now','localtime')", [], |r| r.get(0))
        .unwrap();

    let datos_pago = commands::DatosPago {
        asociado_id: 3, // Asociado 3 arranca sin bonos abonados
        periodo: anio_actual.clone(),
        concepto: "BONO_ANUAL".to_string(),
        monto: 12000,
        medio: "Efectivo".to_string(),
        comprobante: Some("BONO-TEST-999".to_string()),
        adjunto_nombre: None,
        adjunto_datos: None,
        observaciones: None,
    };

    let estado_previo: String = conn
        .query_row("SELECT estado_colaboracion FROM v_asociados WHERE id=3", [], |r| r.get(0))
        .unwrap();
    assert_eq!(estado_previo, "No colaboró", "Sin bonos, la familia no figura como colaboradora");

    // Llamar a registrar_pago_interno
    let pago_id = commands::registrar_pago_interno(&mut conn, &datos_pago, 4)
        .expect("registrar_pago_interno debe registrar el bono y su movimiento en caja");

    let mov_id: i64 = conn
        .query_row("SELECT movimiento_id FROM pagos WHERE id=?1", params![pago_id], |r| r.get(0))
        .unwrap();

    // El ingreso automático en caja queda a nombre del usuario que cobró el bono
    let registrado_por_mov: i64 = conn
        .query_row("SELECT registrado_por FROM movimientos_caja WHERE id=?1", params![mov_id], |r| r.get(0))
        .unwrap();
    assert_eq!(registrado_por_mov, 4, "El movimiento de caja debe registrar al usuario que cobró");

    // El asociado debe quedar como colaborador del año
    let estado_colaboro: String = conn
        .query_row("SELECT estado_colaboracion FROM v_asociados WHERE id=3", [], |r| r.get(0))
        .unwrap();
    assert_eq!(estado_colaboro, "Colaboró");

    // 4. Anular movimiento de caja usando anular_movimiento_caja_interno
    commands::anular_movimiento_caja_interno(
        &mut conn,
        mov_id,
        Some("Comprobante duplicado por error de ventanilla"),
    )
    .expect("anular_movimiento_caja_interno debe anular el movimiento");

    // RNF05: Soft delete - El pago no debe ser eliminado de la base, sino marcado como anulado=1
    let (pago_anulado, pago_monto): (i64, i64) = conn
        .query_row("SELECT anulado, monto FROM pagos WHERE id=?1", params![pago_id], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .expect("El registro de pago debe preservarse en la base (soft delete)");
    assert_eq!(pago_anulado, 1, "El pago debe estar marcado como anulado=1");
    assert_eq!(pago_monto, 12000);

    // RF14: El motivo de anulación debe haberse registrado en movimientos_caja
    let motivo_guardado: String = conn
        .query_row("SELECT motivo_anulacion FROM movimientos_caja WHERE id=?1", params![mov_id], |r| r.get(0))
        .unwrap();
    assert_eq!(motivo_guardado, "Comprobante duplicado por error de ventanilla");

    // Sin el bono activo, la familia vuelve a figurar como no colaboradora (sin generar deuda)
    let estado_no_colaboro: String = conn
        .query_row("SELECT estado_colaboracion FROM v_asociados WHERE id=3", [], |r| r.get(0))
        .unwrap();
    assert_eq!(estado_no_colaboro, "No colaboró");

    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_dynamic_backup_and_restoration() {
    let test_dir = PathBuf::from("target").join("test_backup_real");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");

    let conn = db::init(&test_dir).expect("Inicializar base de datos");
    let state = AppState::new(conn, test_dir.clone());

    // 1. Ejecutar copia interna por primera vez
    let r1 = commands::ejecutar_copia_interna(&state).expect("ejecutar_copia_interna debe crear primer backup");
    assert!(r1.creado, "La primera copia de seguridad debe crearse exitosamente");
    let backup_file = r1.archivo;
    assert!(test_dir.join("copias").join(&backup_file).exists(), "El archivo de copia debe existir físicamente en disco");

    // 2. Si no hubo mutaciones de datos, la siguiente llamada debe omitir el backup (ahorro de disco)
    let r2 = commands::ejecutar_copia_interna(&state).expect("ejecutar_copia_interna sin cambios");
    assert!(!r2.creado, "Si los datos no sufrieron alteraciones, no debe duplicar copias");

    // 3. Tras una modificación de datos, la siguiente copia SÍ debe crearse
    {
        let db = state.db.lock().unwrap();
        db.execute("INSERT INTO configuracion(clave, valor) VALUES('test_flag', 'modificado')", []).unwrap();
    }
    let r3 = commands::ejecutar_copia_interna(&state).expect("ejecutar_copia_interna con cambios");
    assert!(r3.creado, "Si hubo cambios desde el último respaldo, debe generarse una copia nueva");
    assert_ne!(r3.archivo, backup_file, "La nueva copia no debe pisar a la anterior aunque se cree en el mismo segundo");
    assert!(test_dir.join("copias").join(&r3.archivo).exists(), "La tercera copia debe existir físicamente en disco");

    let r4 = commands::ejecutar_copia_interna(&state).expect("ejecutar_copia_interna sin cambios nuevos");
    assert!(!r4.creado, "Sin cambios posteriores a la tercera copia, no debe duplicarse");

    // 4. Probar restauración de copia de seguridad (RF21): volver al estado de la primera copia

    // Restauramos desde la copia previa
    let res_restore = commands::restaurar_copia_interna(&state, &backup_file).expect("Restauración de backup");
    assert!(res_restore.contains("restaurada correctamente"));

    // El flag modificado no debe existir porque restauramos el estado anterior
    {
        let db = state.db.lock().unwrap();
        let existe_flag: i64 = db.query_row("SELECT COUNT(*) FROM configuracion WHERE clave='test_flag'", [], |r| r.get(0)).unwrap();
        assert_eq!(existe_flag, 0, "Los datos deben volver al estado del snapshot restaurado");
    }

    // 4. Probar eliminación de copia de seguridad
    let res_delete = commands::eliminar_copia_interna(&state, &backup_file).expect("Eliminar backup");
    assert!(res_delete.contains("eliminada correctamente"));
    assert!(!test_dir.join("copias").join(&backup_file).exists(), "El archivo de copia debe haberse borrado físicamente");

    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_path_traversal_sanitization() {
    let malformed_names = vec![
        "../../etc/passwd",
        "..\\..\\windows\\system32\\calc.exe",
        "nested/folder/documento.pdf",
    ];

    for raw in malformed_names {
        let res = commands::sanitizar_nombre_archivo(raw);
        if let Ok(clean) = res {
            assert!(!clean.contains('/'));
            assert!(!clean.contains('\\'));
            assert!(!clean.contains(".."));
        }
    }

    // Nombre válido legítimo
    let valid = commands::sanitizar_nombre_archivo("documento_asamblea_2026.pdf").expect("Archivo válido");
    assert_eq!(valid, "documento_asamblea_2026.pdf");
}

#[test]
fn test_pagos_duplicate_and_amount_validations() {
    let test_dir = PathBuf::from("target").join("test_pagos_val_real");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");

    let mut conn = db::init(&test_dir).expect("Inicializar base de datos");

    let anio_actual: String = conn
        .query_row("SELECT strftime('%Y','now','localtime')", [], |r| r.get(0))
        .unwrap();

    // 1. Rechazo de monto menor o igual a cero
    let pago_invalido = commands::DatosPago {
        asociado_id: 1,
        periodo: anio_actual.clone(),
        concepto: "BONO_ANUAL".to_string(),
        monto: 0,
        medio: "Efectivo".to_string(),
        comprobante: None,
        adjunto_nombre: None,
        adjunto_datos: None,
        observaciones: None,
    };
    let err_monto = commands::registrar_pago_interno(&mut conn, &pago_invalido, 4);
    assert!(err_monto.is_err(), "No se debe permitir registrar un bono con monto <= 0");

    // 2. Bono válido (asociado 3 no tiene bonos del año)
    let pago_valido = commands::DatosPago {
        asociado_id: 3,
        periodo: anio_actual.clone(),
        concepto: "BONO_ANUAL".to_string(),
        monto: 12000,
        medio: "Transferencia".to_string(),
        comprobante: Some("BONO-001".to_string()),
        adjunto_nombre: None,
        adjunto_datos: None,
        observaciones: None,
    };
    let pago_id = commands::registrar_pago_interno(&mut conn, &pago_valido, 4).expect("Registro de bono legítimo");
    assert!(pago_id > 0);

    // 3. Segundo bono anual del mismo año para el mismo asociado -> debe rechazarse
    let pago_duplicado = commands::DatosPago {
        asociado_id: 3,
        periodo: anio_actual.clone(),
        concepto: "BONO_ANUAL".to_string(),
        monto: 12000,
        medio: "Efectivo".to_string(),
        comprobante: Some("BONO-DUPLICADO".to_string()),
        adjunto_nombre: None,
        adjunto_datos: None,
        observaciones: None,
    };
    let err_duplicado = commands::registrar_pago_interno(&mut conn, &pago_duplicado, 4);
    assert!(err_duplicado.is_err(), "Se debe rechazar un bono anual duplicado para el mismo año");

    // 4. El bono de materiales del mismo año SÍ debe poder registrarse (concepto distinto)
    let pago_materiales = commands::DatosPago {
        asociado_id: 3,
        periodo: anio_actual.clone(),
        concepto: "MATERIALES".to_string(),
        monto: 5000,
        medio: "Efectivo".to_string(),
        comprobante: Some("MAT-001".to_string()),
        adjunto_nombre: None,
        adjunto_datos: None,
        observaciones: None,
    };
    assert!(commands::registrar_pago_interno(&mut conn, &pago_materiales, 4).is_ok());

    // 5. Un concepto desconocido se rechaza
    let pago_concepto_invalido = commands::DatosPago {
        asociado_id: 3,
        periodo: anio_actual.clone(),
        concepto: "CUOTA_SOCIAL".to_string(),
        monto: 5000,
        medio: "Efectivo".to_string(),
        comprobante: None,
        adjunto_nombre: None,
        adjunto_datos: None,
        observaciones: None,
    };
    let err_concepto = commands::registrar_pago_interno(&mut conn, &pago_concepto_invalido, 4);
    assert!(err_concepto.is_err(), "Sólo se aceptan los conceptos del bono contribución");

    // 6. El año lectivo debe tener 4 dígitos (se puede pagar el ciclo entrante, no un texto libre)
    let pago_anio_invalido = commands::DatosPago {
        asociado_id: 3,
        periodo: "2027-03".to_string(),
        concepto: "BONO_ANUAL".to_string(),
        monto: 12000,
        medio: "Efectivo".to_string(),
        comprobante: None,
        adjunto_nombre: None,
        adjunto_datos: None,
        observaciones: None,
    };
    assert!(commands::registrar_pago_interno(&mut conn, &pago_anio_invalido, 4).is_err());

    // 7. Pagar por adelantado el ciclo entrante es válido y no altera el estado del año corriente
    let anio_entrante = (anio_actual.parse::<i32>().unwrap() + 1).to_string();
    let pago_entrante = commands::DatosPago {
        asociado_id: 7,
        periodo: anio_entrante.clone(),
        concepto: "BONO_ANUAL".to_string(),
        monto: 12000,
        medio: "Transferencia".to_string(),
        comprobante: Some("BONO-2027-001".to_string()),
        adjunto_nombre: None,
        adjunto_datos: None,
        observaciones: None,
    };
    assert!(commands::registrar_pago_interno(&mut conn, &pago_entrante, 4).is_ok(), "El ciclo entrante se puede abonar");
    let estado_7: String = conn
        .query_row("SELECT estado_colaboracion FROM v_asociados WHERE id=7", [], |r| r.get(0))
        .unwrap();
    assert_eq!(estado_7, "No colaboró", "El bono del año entrante no cuenta para el año corriente");

    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_eliminar_rendicion_protection() {
    let test_dir = PathBuf::from("target").join("test_rendicion_protection");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");

    let conn = db::init(&test_dir).expect("Inicializar base de datos");

    // Crear rendición en estado Borrador
    conn.execute(
        "INSERT INTO rendiciones(id, periodo, desde, hasta, generada_en, generada_por, estado)
         VALUES(10, '2026-10', '2026-10-01', '2026-10-31', datetime('now'), 1, 'Borrador')",
        [],
    ).unwrap();

    // Eliminar borrador debe funcionar
    assert!(commands::eliminar_rendicion_interno(&conn, 10).is_ok());

    // Crear rendición en estado Aprobada
    conn.execute(
        "INSERT INTO rendiciones(id, periodo, desde, hasta, generada_en, generada_por, estado)
         VALUES(20, '2026-09', '2026-09-01', '2026-09-30', datetime('now'), 1, 'Aprobada')",
        [],
    ).unwrap();

    // Intentar eliminar rendición aprobada debe ser rechazado
    let res = commands::eliminar_rendicion_interno(&conn, 20);
    assert!(res.is_err());
    assert_eq!(
        res.unwrap_err(),
        "No se puede eliminar una rendición de cuentas que ya ha sido aprobada"
    );

    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_rendiciones_balance_calculo() {
    let test_dir = PathBuf::from("target").join("test_rendiciones_calc");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");

    let conn = db::init(&test_dir).expect("Inicializar base de datos");

    // Limpiamos movimientos para el test de cálculo
    conn.execute("DELETE FROM movimientos_caja", []).unwrap();

    // Ingresos: 50.000 + 20.000, 10.000 anulado (no debe sumarse)
    conn.execute("INSERT INTO movimientos_caja(fecha, tipo, categoria, descripcion, monto, anulado) VALUES('2026-10-01', 'Ingreso', 'Cuotas', 'Cuotas', 50000, 0)", []).unwrap();
    conn.execute("INSERT INTO movimientos_caja(fecha, tipo, categoria, descripcion, monto, anulado) VALUES('2026-10-05', 'Ingreso', 'Donaciones', 'Donación', 20000, 0)", []).unwrap();
    conn.execute("INSERT INTO movimientos_caja(fecha, tipo, categoria, descripcion, monto, anulado) VALUES('2026-10-06', 'Ingreso', 'Cuotas', 'Anulado', 10000, 1)", []).unwrap();

    // Egresos: 15.000 + 5.000
    conn.execute("INSERT INTO movimientos_caja(fecha, tipo, categoria, descripcion, monto, anulado) VALUES('2026-10-10', 'Egreso', 'Insumos', 'Librería', 15000, 0)", []).unwrap();
    conn.execute("INSERT INTO movimientos_caja(fecha, tipo, categoria, descripcion, monto, anulado) VALUES('2026-10-12', 'Egreso', 'Limpieza', 'Lavandina', 5000, 0)", []).unwrap();

    let ing: i64 = conn.query_row(
        "SELECT COALESCE(SUM(monto), 0) FROM movimientos_caja WHERE tipo='Ingreso' AND anulado=0 AND fecha BETWEEN '2026-10-01' AND '2026-10-31'",
        [],
        |r| r.get(0)
    ).unwrap();

    let egr: i64 = conn.query_row(
        "SELECT COALESCE(SUM(monto), 0) FROM movimientos_caja WHERE tipo='Egreso' AND anulado=0 AND fecha BETWEEN '2026-10-01' AND '2026-10-31'",
        [],
        |r| r.get(0)
    ).unwrap();

    assert_eq!(ing, 70000);
    assert_eq!(egr, 20000);
    assert_eq!(ing - egr, 50000);

    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_rendicion_anual_detalle_mensual() {
    let test_dir = PathBuf::from("target").join("test_rendicion_mensual");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");
    let conn = db::init(&test_dir).expect("Inicializar base de datos");
    conn.execute("DELETE FROM movimientos_caja", []).unwrap();

    // Ejercicio mayo 2026 - abril 2027 con movimientos sólo en mayo, octubre y abril
    conn.execute("INSERT INTO movimientos_caja(fecha, tipo, categoria, descripcion, monto) VALUES('2026-05-03', 'Ingreso', 'Cuotas', 'Cuotas', 30000)", []).unwrap();
    conn.execute("INSERT INTO movimientos_caja(fecha, tipo, categoria, descripcion, monto) VALUES('2026-10-15', 'Egreso', 'Artículos de Limpieza', 'Limpieza', 8000)", []).unwrap();
    conn.execute("INSERT INTO movimientos_caja(fecha, tipo, categoria, descripcion, monto, anulado) VALUES('2026-10-16', 'Ingreso', 'Donaciones', 'Anulado', 99999, 1)", []).unwrap();
    conn.execute("INSERT INTO movimientos_caja(fecha, tipo, categoria, descripcion, monto) VALUES('2027-04-30', 'Ingreso', 'Donaciones', 'Donación', 5000)", []).unwrap();
    // Fuera del ejercicio: no debe aparecer
    conn.execute("INSERT INTO movimientos_caja(fecha, tipo, categoria, descripcion, monto) VALUES('2026-04-30', 'Ingreso', 'Cuotas', 'Ejercicio anterior', 70000)", []).unwrap();
    conn.execute(
        "INSERT INTO rendiciones(periodo, desde, hasta, generada_en, generada_por) VALUES('Ejercicio 2026/2027', '2026-05-01', '2027-04-30', date('now'), (SELECT id FROM usuarios LIMIT 1))",
        [],
    ).unwrap();
    let id = conn.last_insert_rowid();

    let meses = commands::detalle_mensual_rendicion_interno(&conn, id).expect("Detalle mensual");
    assert_eq!(meses.len(), 12, "El ejercicio debe tener los 12 meses, de mayo a abril");
    assert_eq!(meses[0].mes, "2026-05");
    assert_eq!(meses[11].mes, "2027-04");
    assert_eq!((meses[0].ingresos, meses[0].egresos), (30000, 0));
    assert_eq!((meses[5].ingresos, meses[5].egresos), (0, 8000), "Octubre suma el egreso y descarta el anulado");
    assert_eq!((meses[1].ingresos, meses[1].egresos), (0, 0), "Un mes sin movimientos queda en 0");
    assert_eq!(meses[11].ingresos, 5000);

    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_actualizar_rendicion_recalcula_sin_recrear() {
    let test_dir = PathBuf::from("target").join("test_actualizar_rendicion");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");
    let conn = db::init(&test_dir).expect("Inicializar base de datos");
    conn.execute("DELETE FROM movimientos_caja", []).unwrap();

    conn.execute(
        "INSERT INTO rendiciones(id, periodo, desde, hasta, generada_en, generada_por)
         VALUES(70, 'Octubre 2026', '2026-10-01', '2026-10-31', datetime('now'), 1)",
        [],
    ).unwrap();
    conn.execute("INSERT INTO movimientos_caja(fecha,tipo,categoria,descripcion,monto) VALUES('2026-10-05','Ingreso','Cuota Social','bono',10000)", []).unwrap();

    let fecha = commands::actualizar_rendicion_interno(&conn, 70).expect("Actualizar rendición");
    assert!(!fecha.is_empty(), "Devuelve la fecha de actualización");

    let (guardada, snapshot): (String, String) = conn
        .query_row("SELECT actualizada_en, snapshot FROM rendiciones WHERE id=70", [], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .unwrap();
    assert_eq!(guardada, fecha);
    assert!(snapshot.contains("Cuota Social") && snapshot.contains("10000"), "El snapshot guarda el detalle actual: {}", snapshot);

    // Un movimiento nuevo del período se refleja al volver a actualizar, sin recrear la rendición
    conn.execute("INSERT INTO movimientos_caja(fecha,tipo,categoria,descripcion,monto) VALUES('2026-10-20','Egreso','Artículos de limpieza','limpieza',2500)", []).unwrap();
    commands::actualizar_rendicion_interno(&conn, 70).expect("Segunda actualización");
    let lineas = commands::detalle_rendicion_interno(&conn, 70).unwrap();
    let total_egresos: i64 = lineas.iter().filter(|l| l.tipo == "Egreso").map(|l| l.total).sum();
    assert_eq!(total_egresos, 2500);
    let existen: i64 = conn.query_row("SELECT COUNT(*) FROM rendiciones WHERE id=70", [], |r| r.get(0)).unwrap();
    assert_eq!(existen, 1, "La rendición es la misma, solo se actualizaron sus valores");

    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_saldo_ejercicio_anterior() {
    let test_dir = PathBuf::from("target").join("test_saldo_anterior");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");
    let conn = db::init(&test_dir).expect("Inicializar base de datos");
    conn.execute("DELETE FROM movimientos_caja", []).unwrap();

    // 1. Sin ejercicio anterior ni movimientos: queda para carga manual
    let sin_datos = commands::saldo_ejercicio_anterior_interno(&conn, "2026-05-01").expect("Consulta de saldo");
    assert_eq!(sin_datos.origen, "sin_datos");
    assert_eq!(sin_datos.saldo, 0);

    // 2. Sin acta, se usa el acumulado de caja anterior al ejercicio
    conn.execute("INSERT INTO movimientos_caja(fecha,tipo,categoria,descripcion,monto) VALUES('2026-01-10','Ingreso','Cuota Social','x',50000)", []).unwrap();
    conn.execute("INSERT INTO movimientos_caja(fecha,tipo,categoria,descripcion,monto) VALUES('2026-03-01','Egreso','Artículos de limpieza','y',20000)", []).unwrap();
    // Un movimiento dentro del ejercicio no debe sumar
    conn.execute("INSERT INTO movimientos_caja(fecha,tipo,categoria,descripcion,monto) VALUES('2026-06-01','Ingreso','Donación de dinero','z',99999)", []).unwrap();
    let desde_caja = commands::saldo_ejercicio_anterior_interno(&conn, "2026-05-01").expect("Consulta de saldo");
    assert_eq!(desde_caja.origen, "caja");
    assert_eq!(desde_caja.saldo, 30000, "Ingresos menos egresos anteriores al ejercicio");

    // 3. Si existe el acta del ejercicio anterior, manda su saldo próximo ejercicio
    conn.execute(
        "INSERT INTO actas(id, tipo, numero, foja, fecha_asamblea, periodo_desde, periodo_hasta,
                           cuadro_financiero, estado)
         VALUES(60, 'Asamblea Anual Ordinaria', 'N° 5', '7', '2026-04-20', '2025', '2026',
                '{\"saldoProximoEjercicio\":\"45000\"}', 'Firmada')",
        [],
    ).unwrap();
    let desde_acta = commands::saldo_ejercicio_anterior_interno(&conn, "2026-05-01").expect("Consulta de saldo");
    assert_eq!(desde_acta.origen, "acta");
    assert_eq!(desde_acta.saldo, 45000, "Toma el saldo del acta anterior");
    assert!(desde_acta.detalle.contains("N° 5"), "El detalle identifica el acta: {}", desde_acta.detalle);

    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_acta_firmada_impacta_en_la_cooperadora() {
    let test_dir = PathBuf::from("target").join("test_acta_cooperadora");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");
    let conn = db::init(&test_dir).expect("Inicializar base de datos");

    // Acta de asamblea con la cuota social y la caja chica aprobadas
    conn.execute(
        "INSERT INTO actas(id, tipo, numero, foja, fecha_asamblea, periodo_desde, periodo_hasta,
                           cuota_social, caja_chica, estado)
         VALUES(50, 'Asamblea Anual Ordinaria', 'N° 12', '15', '2026-05-10', '2025', '2026', 9000, 30000, 'Firmada')",
        [],
    ).unwrap();

    commands::aplicar_valores_acta(&conn, 50).expect("Aplicar valores del acta");

    let bono: String = conn
        .query_row("SELECT valor FROM configuracion WHERE clave='bono_anual'", [], |r| r.get(0))
        .unwrap();
    let caja_chica: String = conn
        .query_row("SELECT valor FROM configuracion WHERE clave='caja_chica'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(bono, "9000", "La cuota social fijada pasa al Bono Contribución Anual");
    assert_eq!(caja_chica, "30000", "El monto aprobado pasa a Caja Chica");

    // Editar el acta firmada vuelve a impactar en los valores
    conn.execute("UPDATE actas SET cuota_social=11000, caja_chica=45000 WHERE id=50", []).unwrap();
    commands::aplicar_valores_acta(&conn, 50).unwrap();
    let bono_nuevo: String = conn
        .query_row("SELECT valor FROM configuracion WHERE clave='bono_anual'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(bono_nuevo, "11000");

    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_rendicion_unifica_categorias_y_registra_actualizacion() {
    let test_dir = PathBuf::from("target").join("test_rendicion_categorias");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");

    let conn = db::init(&test_dir).expect("Inicializar base de datos");
    conn.execute("DELETE FROM movimientos_caja", []).unwrap();
    // Datos históricos: la misma contribución asentada con dos nombres distintos
    conn.execute("INSERT INTO movimientos_caja(fecha,tipo,categoria,descripcion,monto) VALUES('2026-10-01','Ingreso','Cuotas','Cuota vieja',8000)", []).unwrap();
    conn.execute("INSERT INTO movimientos_caja(fecha,tipo,categoria,descripcion,monto) VALUES('2026-10-02','Ingreso','Bono Contribución','Bono nuevo',12000)", []).unwrap();
    drop(conn);

    // Al reinicializar, la migración corrige las categorías a la nomenclatura vigente
    let conn = db::init(&test_dir).expect("Reinicializar base de datos");
    let categorias: Vec<String> = {
        let mut q = conn.prepare("SELECT DISTINCT categoria FROM movimientos_caja ORDER BY categoria").unwrap();
        let filas = q.query_map([], |r| r.get::<_, String>(0)).unwrap();
        filas.collect::<Result<Vec<_>, _>>().unwrap()
    };
    assert_eq!(categorias, vec!["Cuota Social"], "Bono y cuota vieja quedan como Cuota Social");

    // La rendición del período las muestra como una sola línea con la suma
    conn.execute(
        "INSERT INTO rendiciones(id, periodo, desde, hasta, generada_en, generada_por, estado)
         VALUES(100, 'Octubre 2026', '2026-10-01', '2026-10-31', datetime('now'), 1, 'Borrador')",
        [],
    ).unwrap();
    let lineas = commands::detalle_rendicion_interno(&conn, 100).expect("Detalle de la rendición");
    let ingresos: Vec<&commands::LineaRendicion> = lineas.iter().filter(|l| l.tipo == "Ingreso").collect();
    assert_eq!(ingresos.len(), 1, "Una sola línea de ingreso por categoría");
    assert_eq!(ingresos[0].categoria, "Cuota Social");
    assert_eq!(ingresos[0].total, 20000, "Suma de todas las contribuciones del período");

    // Una rendición aprobada se recalcula y deja registrada la fecha de actualización
    conn.execute("UPDATE rendiciones SET estado='Aprobada', snapshot=NULL WHERE id=100", []).unwrap();
    assert!(commands::refrescar_rendicion_aprobada(&conn, 100).expect("Refrescar rendición"), "Sin snapshot previo corresponde actualizar");
    let actualizada: Option<String> = conn
        .query_row("SELECT actualizada_en FROM rendiciones WHERE id=100", [], |r| r.get(0))
        .unwrap();
    assert!(actualizada.is_some(), "Se informa la fecha de actualización");

    // Sin cambios en la caja no vuelve a actualizar
    assert!(!commands::refrescar_rendicion_aprobada(&conn, 100).expect("Refrescar sin cambios"));

    // Si se agrega un movimiento al período, el detalle se recalcula y se vuelve a actualizar
    conn.execute("INSERT INTO movimientos_caja(fecha,tipo,categoria,descripcion,monto) VALUES('2026-10-20','Egreso','Artículos de limpieza','Lavandina',3000)", []).unwrap();
    assert!(commands::refrescar_rendicion_aprobada(&conn, 100).expect("Refrescar con cambios"));
    let lineas = commands::detalle_rendicion_interno(&conn, 100).expect("Detalle actualizado");
    let egresos: Vec<&commands::LineaRendicion> = lineas.iter().filter(|l| l.tipo == "Egreso").collect();
    assert_eq!(egresos.len(), 1);
    assert_eq!(egresos[0].total, 3000, "La rendición toma la caja actual del período");

    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_movimiento_caja_fecha_real_y_registro() {
    let test_dir = PathBuf::from("target").join("test_caja_fecha_real");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");
    let conn = db::init(&test_dir).expect("Inicializar base de datos");

    let datos = |fecha: Option<&str>| commands::DatosMovimientoCaja {
        tipo: "Egreso".to_string(),
        categoria: "Artículos de Limpieza".to_string(),
        descripcion: "Compra de lavandina".to_string(),
        monto: 4500,
        comprobante: None,
        adjunto_nombre: None,
        adjunto_datos: None,
        fecha: fecha.map(str::to_string),
    };

    // Egreso pagado días antes de cargarlo: la fecha real se guarda aparte de la de registro
    let id = commands::crear_movimiento_caja_interno(&conn, &datos(Some("2026-01-15")), 1).expect("Movimiento con fecha pasada");
    let (fecha, registrado_en): (String, String) = conn
        .query_row("SELECT fecha, registrado_en FROM movimientos_caja WHERE id=?1", params![id], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap();
    assert_eq!(fecha, "2026-01-15");
    assert_ne!(registrado_en.get(0..10), Some("2026-01-15"), "La fecha de registro es la de carga en el sistema");

    assert!(commands::crear_movimiento_caja_interno(&conn, &datos(Some("2999-01-01")), 1).is_err(), "No se aceptan fechas futuras");
    assert!(commands::crear_movimiento_caja_interno(&conn, &datos(Some("2026-02-30")), 1).is_err(), "No se aceptan fechas inexistentes");

    // Sin fecha se toma la del día
    let id_hoy = commands::crear_movimiento_caja_interno(&conn, &datos(None), 1).expect("Movimiento del día");
    let es_hoy: bool = conn
        .query_row("SELECT fecha = date('now','localtime') FROM movimientos_caja WHERE id=?1", params![id_hoy], |r| r.get(0))
        .unwrap();
    assert!(es_hoy);

    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_directivo_no_ocupa_cargos_de_comision() {
    let test_dir = PathBuf::from("target").join("test_directivo_comision");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");
    let conn = db::init(&test_dir).expect("Inicializar base de datos");

    conn.execute("INSERT INTO asociados(apellido_nombre, dni, tipo_vinculo) VALUES('Directora, Ana', '17000001', 'DIRECTIVO_ESCOLAR')", []).unwrap();
    let directora = conn.last_insert_rowid();
    let miembro = |cargo: &str, asociado_id: Option<i64>, personal_id: Option<i64>| commands::MiembroComisionFila {
        id: 1, orden: 1, cargo: cargo.to_string(), asociado_id, personal_establecimiento_id: personal_id,
        nombre: "Ana Directora".to_string(), dni: "17000001".to_string(), cuil: String::new(), domicilio: String::new(),
        localidad: String::new(), telefono: String::new(), email: String::new(), vencimiento: "31/12/2027".to_string(),
    };

    assert!(commands::validar_vinculo_comision(&conn, &miembro("PRESIDENTE", Some(directora), None)).is_err());
    assert!(commands::validar_vinculo_comision(&conn, &miembro("VOCAL TITULAR 1°", None, Some(1))).is_err());
    assert!(commands::validar_vinculo_comision(&conn, &miembro("ASESOR", None, Some(1))).is_ok());
    assert!(commands::validar_vinculo_comision(&conn, &miembro("REV. CTAS. TITULAR DOC.", None, Some(1))).is_ok());
    // Un asociado común sí puede presidir
    assert!(commands::validar_vinculo_comision(&conn, &miembro("PRESIDENTE", Some(1), None)).is_ok());

    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_db_migration_from_legacy_schema() {
    let test_dir = PathBuf::from("target").join("test_legacy_migration");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");

    // Crear base de datos simulando el esquema de versiones anteriores (sin columna anulado en pagos, etc.)
    {
        let legacy_conn = rusqlite::Connection::open(test_dir.join("cooperar.db")).unwrap();
        legacy_conn.execute_batch("
            CREATE TABLE usuarios(id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, dni TEXT UNIQUE, email TEXT UNIQUE, rol TEXT NOT NULL, clave_hash TEXT NOT NULL, activo INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE asociados(id INTEGER PRIMARY KEY, apellido_nombre TEXT NOT NULL, dni TEXT NOT NULL UNIQUE, telefono TEXT, email TEXT, fecha_alta TEXT NOT NULL DEFAULT (date('now','localtime')), exento INTEGER NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE pagos(id INTEGER PRIMARY KEY, asociado_id INTEGER NOT NULL, periodo TEXT NOT NULL, fecha_pago TEXT NOT NULL, monto INTEGER NOT NULL, medio TEXT NOT NULL, comprobante TEXT, registrado_por INTEGER NOT NULL, movimiento_id INTEGER);
            CREATE TABLE movimientos_caja(id INTEGER PRIMARY KEY, fecha TEXT NOT NULL, tipo TEXT NOT NULL, categoria TEXT NOT NULL, descripcion TEXT NOT NULL, monto INTEGER NOT NULL, comprobante TEXT, anulado INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE reuniones(id INTEGER PRIMARY KEY, fecha TEXT NOT NULL, tipo TEXT NOT NULL, temas TEXT NOT NULL, acta TEXT);
        ").unwrap();
    }

    // Ahora invocar db::init sobre esa base de datos existente:
    // Debe aplicar las migraciones preventivas, crear vistas e índices sin fallar
    let conn = db::init(&test_dir).expect("db::init debe migrar automáticamente una base preexistente");

    // Verificar que la columna anulado existe y el índice parcial está activo
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM pagos WHERE anulado=0", [], |r| r.get(0)).unwrap();
    assert_eq!(count, 8, "Los bonos de demostración del año corriente deben quedar activos");

    // Las columnas agregadas en la Etapa 3 también deben existir tras la migración
    for (tabla, columna) in [
        ("movimientos_caja", "registrado_por"),
        ("movimientos_caja", "adjunto_datos"),
        ("reuniones", "registrado_por"),
        ("reuniones", "archivo_adjunto"),
        ("asociados", "tiene_hermanos"),
        ("pagos", "concepto"),
    ] {
        let existe: i64 = conn
            .query_row(&format!("SELECT COUNT(*) FROM pragma_table_info('{}') WHERE name='{}'", tabla, columna), [], |r| r.get(0))
            .unwrap();
        assert_eq!(existe, 1, "La migración debe agregar {}.{}", tabla, columna);
    }

    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_reparacion_fks_hacia_usuarios_legacy() {
    let test_dir = PathBuf::from("target").join("test_reparacion_legacy");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");

    // Base migrada con la versión anterior: usuarios ya admite Asesor, pero pagos quedó apuntando a usuarios_legacy
    {
        let roto = rusqlite::Connection::open(test_dir.join("cooperar.db")).unwrap();
        roto.execute_batch("
            CREATE TABLE usuarios(id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, dni TEXT UNIQUE, email TEXT UNIQUE,
              rol TEXT NOT NULL CHECK(rol IN ('Presidente','Secretaria','Tesorero','Superadmin','Asesor')),
              clave_hash TEXT NOT NULL, activo INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE usuarios_legacy(id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, dni TEXT UNIQUE, email TEXT UNIQUE,
              rol TEXT NOT NULL, clave_hash TEXT NOT NULL, activo INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE asociados(id INTEGER PRIMARY KEY, apellido_nombre TEXT NOT NULL, dni TEXT NOT NULL UNIQUE, telefono TEXT, email TEXT,
              fecha_alta TEXT NOT NULL DEFAULT (date('now','localtime')), exento INTEGER NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE pagos(id INTEGER PRIMARY KEY, asociado_id INTEGER NOT NULL REFERENCES asociados(id), periodo TEXT NOT NULL,
              fecha_pago TEXT NOT NULL, monto INTEGER NOT NULL, medio TEXT NOT NULL, comprobante TEXT, anulado INTEGER NOT NULL DEFAULT 0,
              registrado_por INTEGER NOT NULL REFERENCES usuarios_legacy(id), movimiento_id INTEGER);
        ").unwrap();
    }

    let conn = db::init(&test_dir).expect("db::init debe reparar las referencias a usuarios_legacy");

    let referencias: i64 = conn
        .query_row("SELECT COUNT(*) FROM sqlite_master WHERE sql LIKE '%usuarios_legacy%'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(referencias, 0, "Ninguna tabla debe seguir apuntando a usuarios_legacy");

    let fk_activas: i64 = conn.query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap();
    assert_eq!(fk_activas, 1, "La integridad referencial debe quedar activa");

    let violaciones: i64 = conn.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| r.get(0)).unwrap();
    assert_eq!(violaciones, 0, "Los datos sembrados deben respetar todas las FKs");

    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_fecha_alta_asociado() {
    let test_dir = PathBuf::from("target").join("test_fecha_alta");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");
    let mut conn = db::init(&test_dir).expect("Inicializar base de datos");

    let datos = |dni: &str, fecha_alta: Option<&str>| commands::DatosAsociado {
        apellido_nombre: format!("Prueba, {}", dni),
        dni: dni.to_string(),
        telefono: None,
        email: None,
        tipo_vinculo: "PADRE_TUTOR".to_string(),
        fecha_alta: fecha_alta.map(str::to_string),
        alumnos: vec![],
    };

    // 1. El alta acepta una fecha explícita y el padrón la devuelve
    let id = commands::crear_asociado_interno(&mut conn, &datos("99999901", Some("2025-03-01")))
        .expect("Alta con fecha de alta explícita");
    let fecha: String = conn.query_row("SELECT fecha_alta FROM asociados WHERE id=?1", params![id], |r| r.get(0)).unwrap();
    assert_eq!(fecha, "2025-03-01");
    let fecha_vista: String = conn
        .query_row("SELECT fecha_alta FROM v_asociados WHERE id=?1", params![id], |r| r.get(0))
        .unwrap();
    assert_eq!(fecha_vista, "2025-03-01", "La fecha de alta debe estar disponible en el padrón");

    // 2. Si no se informa, el alta usa la fecha del día
    let id_hoy = commands::crear_asociado_interno(&mut conn, &datos("99999902", None)).expect("Alta sin fecha");
    let es_hoy: bool = conn
        .query_row("SELECT fecha_alta = date('now','localtime') FROM asociados WHERE id=?1", params![id_hoy], |r| r.get(0))
        .unwrap();
    assert!(es_hoy, "Sin fecha informada, el alta debe tomar la fecha del día");

    // 3. Fechas inexistentes, futuras o con otro formato se rechazan
    assert!(commands::crear_asociado_interno(&mut conn, &datos("99999903", Some("2026-02-30"))).is_err());
    assert!(commands::crear_asociado_interno(&mut conn, &datos("99999904", Some("2999-01-01"))).is_err());
    assert!(commands::crear_asociado_interno(&mut conn, &datos("99999905", Some("01/03/2025"))).is_err());

    // 4. En la edición, la fecha nueva se guarda y omitirla conserva la registrada
    let mut edicion = datos("99999901", Some("2024-12-15"));
    commands::actualizar_asociado_interno(&mut conn, id, &edicion).expect("Edición con fecha de alta");
    let fecha_editada: String = conn.query_row("SELECT fecha_alta FROM asociados WHERE id=?1", params![id], |r| r.get(0)).unwrap();
    assert_eq!(fecha_editada, "2024-12-15");

    edicion.fecha_alta = None;
    commands::actualizar_asociado_interno(&mut conn, id, &edicion).expect("Edición sin fecha de alta");
    let fecha_conservada: String = conn.query_row("SELECT fecha_alta FROM asociados WHERE id=?1", params![id], |r| r.get(0)).unwrap();
    assert_eq!(fecha_conservada, "2024-12-15", "Omitir la fecha en la edición no debe borrarla");

    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_bono_materiales_con_hermanos() {
    let test_dir = PathBuf::from("target").join("test_bono_hermanos");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");
    let mut conn = db::init(&test_dir).expect("Inicializar base de datos");

    // Familia con dos alumnos: la condición de hermanos se deriva de los alumnos cargados
    let datos = commands::DatosAsociado {
        apellido_nombre: "Hermanos, Familia".to_string(),
        dni: "99999910".to_string(),
        telefono: None,
        email: None,
        tipo_vinculo: "PADRE_TUTOR".to_string(),
        fecha_alta: None,
        alumnos: vec![
            commands::NuevoAlumno { nombre: "Primer Hermano".to_string(), curso: "2° A".to_string() },
            commands::NuevoAlumno { nombre: "Segundo Hermano".to_string(), curso: "5° B".to_string() },
        ],
    };
    let id = commands::crear_asociado_interno(&mut conn, &datos).expect("Alta con hermanos");

    let (hermanos, cantidad): (i64, i64) = conn
        .query_row("SELECT tiene_hermanos, cantidad_alumnos FROM v_asociados WHERE id=?1", params![id], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .unwrap();
    assert_eq!(hermanos, 1, "Dos alumnos vinculados marcan la familia con hermanos");
    assert_eq!(cantidad, 2, "El padrón debe informar la cantidad de alumnos");

    // Con un solo alumno no corresponde la tarifa con hermanos
    let unico = commands::DatosAsociado {
        apellido_nombre: "Único, Alumno".to_string(),
        dni: "99999911".to_string(),
        telefono: None,
        email: None,
        tipo_vinculo: "PADRE_TUTOR".to_string(),
        fecha_alta: None,
        alumnos: vec![commands::NuevoAlumno { nombre: "Hijo Único".to_string(), curso: "1° A".to_string() }],
    };
    let id_unico = commands::crear_asociado_interno(&mut conn, &unico).expect("Alta con un solo alumno");
    let hermanos_unico: i64 = conn
        .query_row("SELECT tiene_hermanos FROM v_asociados WHERE id=?1", params![id_unico], |r| r.get(0))
        .unwrap();
    assert_eq!(hermanos_unico, 0);

    // Al quitar un alumno en la edición, la condición vuelve a 0 automáticamente
    let mut un_solo = datos.clone();
    un_solo.alumnos.truncate(1);
    commands::actualizar_asociado_interno(&mut conn, id, &un_solo).expect("Edición con un solo alumno");
    let hermanos_tras_edicion: i64 = conn
        .query_row("SELECT tiene_hermanos FROM v_asociados WHERE id=?1", params![id], |r| r.get(0))
        .unwrap();
    assert_eq!(hermanos_tras_edicion, 0, "La condición se recalcula en cada edición");

    // Se vuelven a cargar los dos alumnos para el resto del test
    commands::actualizar_asociado_interno(&mut conn, id, &datos).expect("Edición con dos alumnos");

    // El bono de materiales se cobra por alumno: la app manda el total ya calculado
    // (2 alumnos × tarifa con hermanos) y el recibo deja constancia de la cantidad
    let anio: String = conn.query_row("SELECT strftime('%Y','now','localtime')", [], |r| r.get(0)).unwrap();
    let pago = commands::DatosPago {
        asociado_id: id,
        periodo: anio.clone(),
        concepto: "MATERIALES".to_string(),
        monto: 8000,
        medio: "Efectivo".to_string(),
        comprobante: Some("MAT-H-001".to_string()),
        adjunto_nombre: None,
        adjunto_datos: None,
        observaciones: Some("  Entregado por la abuela del alumno  ".to_string()),
    };
    let pago_id = commands::registrar_pago_interno(&mut conn, &pago, 4).expect("Bono de materiales");

    let (concepto, periodo, monto): (String, String, i64) = conn
        .query_row("SELECT concepto, periodo, monto FROM pagos WHERE id=?1", params![pago_id], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?))
        })
        .unwrap();
    assert_eq!(concepto, "MATERIALES");
    assert_eq!(periodo, anio);
    assert_eq!(monto, 8000);

    // La observación se guarda recortada y vuelve a mostrarse en el historial
    let observacion: Option<String> = conn
        .query_row("SELECT observaciones FROM pagos WHERE id=?1", params![pago_id], |r| r.get(0))
        .unwrap();
    assert_eq!(observacion.as_deref(), Some("Entregado por la abuela del alumno"));

    let descripcion: String = conn
        .query_row(
            "SELECT descripcion FROM movimientos_caja WHERE id=(SELECT movimiento_id FROM pagos WHERE id=?1)",
            params![pago_id],
            |r| r.get(0),
        )
        .unwrap();
    assert!(
        descripcion.contains("Bono contribución materiales") && descripcion.contains("(2 alumnos)"),
        "El asiento de caja debe detallar concepto y cantidad de alumnos: {}",
        descripcion
    );

    // La vista informa el detalle por concepto: sólo materiales abonado
    let (bono_pagado, mat_pagado): (i64, i64) = conn
        .query_row("SELECT bono_anual_pagado, materiales_pagado FROM v_asociados WHERE id=?1", params![id], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .unwrap();
    assert_eq!((bono_pagado, mat_pagado), (0, 1), "Debe distinguirse el concepto abonado");

    // El bono anual del mismo año sigue disponible como concepto independiente
    let bono = commands::DatosPago {
        asociado_id: id,
        periodo: anio,
        concepto: "BONO_ANUAL".to_string(),
        monto: 9000,
        medio: "Transferencia".to_string(),
        comprobante: Some("BONO-H-001".to_string()),
        adjunto_nombre: None,
        adjunto_datos: None,
        observaciones: None,
    };
    assert!(commands::registrar_pago_interno(&mut conn, &bono, 4).is_ok(), "Ambos conceptos conviven en el mismo año");

    let (bono_pagado_final, mat_pagado_final): (i64, i64) = conn
        .query_row("SELECT bono_anual_pagado, materiales_pagado FROM v_asociados WHERE id=?1", params![id], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .unwrap();
    assert_eq!((bono_pagado_final, mat_pagado_final), (1, 1), "Con ambos bonos abonados la ficha marca los dos");

    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_saldos_banco_solo_tesoreria_y_auditoria() {
    let test_dir = PathBuf::from("target").join("test_saldos_banco");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");
    let conn = db::init(&test_dir).expect("Inicializar base de datos");

    let secretaria = commands::Usuario { id: 3, nombre: "Mariana López".to_string(), rol: "Secretaria".to_string() };
    let presidente = commands::Usuario { id: 2, nombre: "Carlos Gómez".to_string(), rol: "Presidente".to_string() };
    let tesorero = commands::Usuario { id: 4, nombre: "Roberto Fernández".to_string(), rol: "Tesorero".to_string() };

    // Los saldos en banco sólo los puede modificar la Tesorería (o el Superadmin)
    assert!(commands::guardar_configuracion_interno(&conn, &presidente, "saldo_cuenta_corriente", "250000").is_err());
    assert!(commands::guardar_configuracion_interno(&conn, &secretaria, "saldo_plazo_fijo", "100000").is_err());
    // El resto de la configuración institucional sigue habilitada para la Presidencia y la Secretaría
    assert!(commands::guardar_configuracion_interno(&conn, &presidente, "distrito", "Morón").is_ok());
    assert!(commands::guardar_configuracion_interno(&conn, &secretaria, "localidad", "Morón").is_ok());

    // Tesorería guarda el saldo: se normaliza a dígitos y queda auditado con fecha, usuario y detalle
    commands::guardar_configuracion_interno(&conn, &tesorero, "saldo_cuenta_corriente", "$ 250.000")
        .expect("La Tesorería puede guardar el saldo");
    let guardado: String = conn
        .query_row("SELECT valor FROM configuracion WHERE clave='saldo_cuenta_corriente'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(guardado, "250000", "El saldo se guarda sólo con dígitos");

    let (usuario_id, fecha, detalle): (i64, String, String) = conn
        .query_row(
            "SELECT usuario_id, fecha_hora, detalle FROM auditoria WHERE entidad='configuracion' ORDER BY id DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    assert_eq!(usuario_id, 4, "La auditoría registra quién hizo el cambio");
    assert!(!fecha.is_empty(), "La auditoría registra la fecha y hora");
    assert!(
        detalle.contains("Cuenta corriente") && detalle.contains("250000"),
        "El detalle guarda el valor nuevo: {}",
        detalle
    );

    // Guardar el mismo valor no duplica el registro en el historial
    commands::guardar_configuracion_interno(&conn, &tesorero, "saldo_cuenta_corriente", "250000").unwrap();
    let registros: i64 = conn
        .query_row("SELECT COUNT(*) FROM auditoria WHERE entidad='configuracion'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(registros, 1, "Sin cambio real no se agrega otra entrada");

    let _ = fs::remove_dir_all(&test_dir);
}

