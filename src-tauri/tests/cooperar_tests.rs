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

    // 3. Probar vinculación cruzada Caja <-> Pagos <-> Deuda en v_asociados
    // Período dinámico para que no dependa de si el test se ejecuta en octubre, noviembre o meses posteriores
    let periodo_actual: String = conn
        .query_row("SELECT strftime('%Y-%m','now','localtime')", [], |r| r.get(0))
        .unwrap();

    let datos_pago = commands::DatosPago {
        asociado_id: 2, // Asociado 2 inicia con deuda
        periodo: periodo_actual.clone(),
        monto: 8000,
        medio: "Efectivo".to_string(),
        comprobante: Some("REC-TEST-999".to_string()),
    };

    // Llamar a registrar_pago_interno
    let pago_id = commands::registrar_pago_interno(&mut conn, &datos_pago, 4)
        .expect("registrar_pago_interno debe registrar el pago y su movimiento en caja");

    let mov_id: i64 = conn
        .query_row("SELECT movimiento_id FROM pagos WHERE id=?1", params![pago_id], |r| r.get(0))
        .unwrap();

    // El ingreso automático en caja queda a nombre del usuario que cobró la cuota
    let registrado_por_mov: i64 = conn
        .query_row("SELECT registrado_por FROM movimientos_caja WHERE id=?1", params![mov_id], |r| r.get(0))
        .unwrap();
    assert_eq!(registrado_por_mov, 4, "El movimiento de caja debe registrar al usuario que cobró");

    // El asociado debe quedar "Al día"
    let estado_al_dia: String = conn
        .query_row("SELECT estado_cuotas FROM v_asociados WHERE id=2", [], |r| r.get(0))
        .unwrap();
    assert_eq!(estado_al_dia, "Al día");

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
    assert_eq!(pago_monto, 8000);

    // RF14: El motivo de anulación debe haberse registrado en movimientos_caja
    let motivo_guardado: String = conn
        .query_row("SELECT motivo_anulacion FROM movimientos_caja WHERE id=?1", params![mov_id], |r| r.get(0))
        .unwrap();
    assert_eq!(motivo_guardado, "Comprobante duplicado por error de ventanilla");

    // El asociado 2 debe figurar ahora nuevamente "Con deuda"
    let estado_deuda: String = conn
        .query_row("SELECT estado_cuotas FROM v_asociados WHERE id=2", [], |r| r.get(0))
        .unwrap();
    assert_eq!(estado_deuda, "Con deuda");

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

    let periodo_actual: String = conn
        .query_row("SELECT strftime('%Y-%m','now','localtime')", [], |r| r.get(0))
        .unwrap();

    // 1. Rechazo de monto menor o igual a cero
    let pago_invalido = commands::DatosPago {
        asociado_id: 1,
        periodo: periodo_actual.clone(),
        monto: 0,
        medio: "Efectivo".to_string(),
        comprobante: None,
    };
    let err_monto = commands::registrar_pago_interno(&mut conn, &pago_invalido, 4);
    assert!(err_monto.is_err(), "No se debe permitir registrar un pago con monto <= 0");

    // 2. Pago válido
    let pago_valido = commands::DatosPago {
        asociado_id: 3, // Asociado 3 no tiene pago en periodo actual
        periodo: periodo_actual.clone(),
        monto: 8000,
        medio: "Transferencia".to_string(),
        comprobante: Some("TRF-001".to_string()),
    };
    let pago_id = commands::registrar_pago_interno(&mut conn, &pago_valido, 4).expect("Registro de pago legítimo");
    assert!(pago_id > 0);

    // 3. Intento de registrar un segundo pago para el mismo período y asociado -> debe rechazarse
    let pago_duplicado = commands::DatosPago {
        asociado_id: 3,
        periodo: periodo_actual.clone(),
        monto: 8000,
        medio: "Efectivo".to_string(),
        comprobante: Some("REC-DUPLICADO".to_string()),
    };
    let err_duplicado = commands::registrar_pago_interno(&mut conn, &pago_duplicado, 4);
    assert!(err_duplicado.is_err(), "Se debe rechazar un pago duplicado para el mismo período");
    assert!(err_duplicado.unwrap_err().contains("ya cuenta con un pago registrado"));

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
    assert_eq!(count, 6);

    // Las columnas agregadas en la Etapa 3 también deben existir tras la migración
    for (tabla, columna) in [
        ("movimientos_caja", "registrado_por"),
        ("movimientos_caja", "adjunto_datos"),
        ("reuniones", "registrado_por"),
        ("reuniones", "archivo_adjunto"),
    ] {
        let existe: i64 = conn
            .query_row(&format!("SELECT COUNT(*) FROM pragma_table_info('{}') WHERE name='{}'", tabla, columna), [], |r| r.get(0))
            .unwrap();
        assert_eq!(existe, 1, "La migración debe agregar {}.{}", tabla, columna);
    }

    let _ = fs::remove_dir_all(&test_dir);
}

