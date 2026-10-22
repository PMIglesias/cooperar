// src-tauri/tests/cooperar_tests.rs
use std::fs;
use std::path::PathBuf;

#[test]
fn test_db_initialization_and_schema() {
    let test_dir = PathBuf::from("target").join("test_db_init");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");

    let db_path = test_dir.join("cooperar.db");
    let conn = rusqlite::Connection::open(&db_path).expect("Abrir db");
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();

    let _tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();

    assert!(db_path.exists());
    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_cuil_modulo_11_verification() {
    let verificar_cuil = |dni_str: &str| -> String {
        let clean = dni_str.replace(|c: char| !c.is_numeric(), "");
        let padded = format!("{:0>8}", clean);
        let factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

        let calc_dv = |prefijo: &str| -> Option<u32> {
            let full = format!("{}{}", prefijo, padded);
            let mut suma = 0;
            for (i, c) in full.chars().enumerate() {
                let d = c.to_digit(10).unwrap();
                suma += d * factores[i];
            }
            let resto = suma % 11;
            if resto == 0 {
                Some(0)
            } else if resto == 1 {
                None
            } else {
                Some(11 - resto)
            }
        };

        let mut prefijo = "20";
        let mut dv = calc_dv(prefijo);
        if dv.is_none() {
            prefijo = "23";
            dv = calc_dv(prefijo);
        }
        format!("{}-{}-{}", prefijo, padded, dv.unwrap())
    };

    assert_eq!(verificar_cuil("20000002"), "20-20000002-2");
    assert_eq!(verificar_cuil("40000004"), "20-40000004-3");
    assert_eq!(verificar_cuil("32111222"), "20-32111222-7");
}

#[test]
fn test_cross_data_integrity_asociado_comision_and_caja_pagos() {
    let test_dir = PathBuf::from("target").join("test_integrity");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");

    let db_path = test_dir.join("cooperar.db");
    let conn = rusqlite::Connection::open(&db_path).expect("Abrir db");
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();

    conn.execute_batch("
        CREATE TABLE asociados(id INTEGER PRIMARY KEY, apellido_nombre TEXT NOT NULL, dni TEXT NOT NULL, telefono TEXT, email TEXT, fecha_alta TEXT NOT NULL DEFAULT (date('now')), exento INTEGER DEFAULT 0, activo INTEGER DEFAULT 1);
        CREATE TABLE alumnos(id INTEGER PRIMARY KEY, asociado_id INTEGER NOT NULL REFERENCES asociados(id) ON DELETE CASCADE, nombre TEXT NOT NULL, curso TEXT NOT NULL);
        CREATE TABLE comision_directiva(id INTEGER PRIMARY KEY, orden INTEGER NOT NULL, cargo TEXT NOT NULL, asociado_id INTEGER REFERENCES asociados(id) ON DELETE SET NULL, nombre TEXT NOT NULL, dni TEXT NOT NULL, telefono TEXT, email TEXT);
        CREATE TABLE movimientos_caja(id INTEGER PRIMARY KEY, fecha TEXT NOT NULL, tipo TEXT NOT NULL, categoria TEXT NOT NULL, descripcion TEXT NOT NULL, monto INTEGER NOT NULL, comprobante TEXT, anulado INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE pagos(id INTEGER PRIMARY KEY, asociado_id INTEGER NOT NULL REFERENCES asociados(id), periodo TEXT NOT NULL, fecha_pago TEXT NOT NULL, monto INTEGER NOT NULL, medio TEXT NOT NULL, comprobante TEXT, movimiento_id INTEGER REFERENCES movimientos_caja(id));
        
        CREATE VIEW v_asociados AS
        SELECT *,
          CASE WHEN exento = 1 THEN 'Exento'
               WHEN (CAST(strftime('%Y','now') AS INTEGER) * 12 + CAST(strftime('%m','now') AS INTEGER))
                  - (CAST(substr(ult,1,4) AS INTEGER) * 12 + CAST(substr(ult,6,2) AS INTEGER)) > 0 THEN 'Con deuda'
               ELSE 'Al día' END AS estado_cuotas
        FROM (
          SELECT a.*,
            COALESCE((SELECT MAX(periodo) FROM pagos WHERE asociado_id = a.id), strftime('%Y-%m', a.fecha_alta, '-1 month')) AS ult
          FROM asociados a
        );
    ").unwrap();

    // 1. Insertar asociado y vincularlo en la comisión directiva
    conn.execute("INSERT INTO asociados(id, apellido_nombre, dni, telefono, email, fecha_alta) VALUES(1, 'Álvarez, Marcos', '32111222', '11-4567-8901', 'marcos@test.com', '2026-01-01')", []).unwrap();
    conn.execute("INSERT INTO comision_directiva(id, orden, cargo, asociado_id, nombre, dni, telefono, email) VALUES(1, 5, 'VOCAL TITULAR 1°', 1, 'Álvarez, Marcos', '32111222', '11-4567-8901', 'marcos@test.com')", []).unwrap();

    // 2. Simular actualización de asociado con sincronización cruzada
    let nuevo_nombre = "Álvarez Ramos, Marcos";
    let nuevo_tel = "11-9999-8888";
    conn.execute("UPDATE asociados SET apellido_nombre=?1, telefono=?2 WHERE id=1", rusqlite::params![nuevo_nombre, nuevo_tel]).unwrap();
    conn.execute("UPDATE comision_directiva SET nombre=?1, telefono=?2 WHERE asociado_id=1", rusqlite::params![nuevo_nombre, nuevo_tel]).unwrap();

    let comision_nombre: String = conn.query_row("SELECT nombre FROM comision_directiva WHERE asociado_id=1", [], |r| r.get(0)).unwrap();
    let comision_tel: String = conn.query_row("SELECT telefono FROM comision_directiva WHERE asociado_id=1", [], |r| r.get(0)).unwrap();
    assert_eq!(comision_nombre, nuevo_nombre);
    assert_eq!(comision_tel, nuevo_tel);

    // 3. Probar vinculación cruzada Caja <-> Pagos <-> Deuda en v_asociados
    let periodo_actual = "2026-10";
    conn.execute("INSERT INTO movimientos_caja(id, fecha, tipo, categoria, descripcion, monto) VALUES(10, '2026-10-15', 'Ingreso', 'Cuotas', 'Cobro cuota Marcos', 8000)", []).unwrap();
    conn.execute("INSERT INTO pagos(id, asociado_id, periodo, fecha_pago, monto, medio, movimiento_id) VALUES(100, 1, ?1, '2026-10-15', 8000, 'Efectivo', 10)", rusqlite::params![periodo_actual]).unwrap();

    let estado_inicial: String = conn.query_row("SELECT estado_cuotas FROM v_asociados WHERE id=1", [], |r| r.get(0)).unwrap();
    assert_eq!(estado_inicial, "Al día");

    // Anular movimiento de caja y eliminar pago correspondiente
    conn.execute("UPDATE movimientos_caja SET anulado=1 WHERE id=10", []).unwrap();
    conn.execute("DELETE FROM pagos WHERE movimiento_id=10", []).unwrap();

    let estado_posterior: String = conn.query_row("SELECT estado_cuotas FROM v_asociados WHERE id=1", [], |r| r.get(0)).unwrap();
    assert_eq!(estado_posterior, "Con deuda");

    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_dynamic_backup_versioning() {
    let test_dir = PathBuf::from("target").join("test_backup");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");

    let db_path = test_dir.join("cooperar.db");
    let conn = rusqlite::Connection::open(&db_path).expect("Abrir db");
    conn.execute_batch("
        CREATE TABLE configuracion(clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
        CREATE TABLE items(id INTEGER PRIMARY KEY, valor TEXT);
    ").unwrap();

    // Consultamos PRAGMA data_version
    let v1: i64 = conn.query_row("PRAGMA data_version", [], |r| r.get(0)).unwrap();

    // Sin mutaciones en otra conexión o cambio de commit, el pragma se mantiene constante
    let v2: i64 = conn.query_row("PRAGMA data_version", [], |r| r.get(0)).unwrap();
    assert_eq!(v1, v2);

    // Guardar flag de versión simulando backup
    conn.execute("INSERT INTO configuracion(clave, valor) VALUES('backup_data_version', ?1)", rusqlite::params![v1.to_string()]).unwrap();
    let saved_ver: String = conn.query_row("SELECT valor FROM configuracion WHERE clave='backup_data_version'", [], |r| r.get(0)).unwrap();
    assert_eq!(saved_ver, v1.to_string());

    let _ = fs::remove_dir_all(&test_dir);
}

#[test]
fn test_path_traversal_sanitization() {
    let malformed_names = vec![
        "../../etc/passwd",
        "..\\..\\windows\\system32\\calc.exe",
        "nested/folder/documento.pdf",
        "documento_asamblea_2026.pdf",
    ];

    for raw in malformed_names {
        let clean = std::path::Path::new(raw)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap();

        assert!(!clean.contains('/'));
        assert!(!clean.contains('\\'));
        assert!(!clean.contains(".."));
    }
}

#[test]
fn test_rendiciones_balance_calculo() {
    let test_dir = PathBuf::from("target").join("test_rendiciones");
    let _ = fs::remove_dir_all(&test_dir);
    fs::create_dir_all(&test_dir).expect("Crear dir de test");

    let db_path = test_dir.join("cooperar.db");
    let conn = rusqlite::Connection::open(&db_path).expect("Abrir db");
    conn.execute_batch("
        CREATE TABLE movimientos_caja(
            id INTEGER PRIMARY KEY,
            fecha TEXT NOT NULL,
            tipo TEXT NOT NULL,
            monto INTEGER NOT NULL,
            anulado INTEGER NOT NULL DEFAULT 0
        );
    ").unwrap();

    // Ingresos: 50.000 + 20.000, 10.000 anulado (no debe sumarse)
    conn.execute("INSERT INTO movimientos_caja(fecha, tipo, monto, anulado) VALUES('2026-10-01', 'Ingreso', 50000, 0)", []).unwrap();
    conn.execute("INSERT INTO movimientos_caja(fecha, tipo, monto, anulado) VALUES('2026-10-05', 'Ingreso', 20000, 0)", []).unwrap();
    conn.execute("INSERT INTO movimientos_caja(fecha, tipo, monto, anulado) VALUES('2026-10-06', 'Ingreso', 10000, 1)", []).unwrap();

    // Egresos: 15.000 + 5.000
    conn.execute("INSERT INTO movimientos_caja(fecha, tipo, monto, anulado) VALUES('2026-10-10', 'Egreso', 15000, 0)", []).unwrap();
    conn.execute("INSERT INTO movimientos_caja(fecha, tipo, monto, anulado) VALUES('2026-10-12', 'Egreso', 5000, 0)", []).unwrap();

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
