// src-tauri/src/db.rs
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use rand_core::OsRng;
use rusqlite::Connection;
use std::path::Path;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS usuarios(
  id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, dni TEXT UNIQUE, email TEXT UNIQUE,
  rol TEXT NOT NULL CHECK(rol IN ('Presidente','Secretaria','Tesorero','Superadmin')),
  clave_hash TEXT NOT NULL, activo INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS asociados(
  id INTEGER PRIMARY KEY, apellido_nombre TEXT NOT NULL, dni TEXT NOT NULL UNIQUE,
  telefono TEXT, email TEXT, fecha_alta TEXT NOT NULL DEFAULT (date('now','localtime')),
  exento INTEGER NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS alumnos(
  id INTEGER PRIMARY KEY, asociado_id INTEGER NOT NULL REFERENCES asociados(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL, curso TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS movimientos_caja(
  id INTEGER PRIMARY KEY, fecha TEXT NOT NULL, tipo TEXT NOT NULL CHECK(tipo IN ('Ingreso','Egreso')),
  categoria TEXT NOT NULL, descripcion TEXT NOT NULL, monto INTEGER NOT NULL,
  comprobante TEXT, anulado INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS pagos(
  id INTEGER PRIMARY KEY, asociado_id INTEGER NOT NULL REFERENCES asociados(id),
  periodo TEXT NOT NULL, fecha_pago TEXT NOT NULL, monto INTEGER NOT NULL, medio TEXT NOT NULL,
  comprobante TEXT, registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
  movimiento_id INTEGER REFERENCES movimientos_caja(id));
CREATE TABLE IF NOT EXISTS reuniones(
  id INTEGER PRIMARY KEY, fecha TEXT NOT NULL, tipo TEXT NOT NULL CHECK(tipo IN ('Comisión','Asamblea')),
  temas TEXT NOT NULL, acta TEXT);
CREATE TABLE IF NOT EXISTS asistencias(
  reunion_id INTEGER NOT NULL REFERENCES reuniones(id) ON DELETE CASCADE,
  asociado_id INTEGER NOT NULL REFERENCES asociados(id), PRIMARY KEY(reunion_id, asociado_id));
CREATE TABLE IF NOT EXISTS rendiciones(
  id INTEGER PRIMARY KEY, periodo TEXT NOT NULL, desde TEXT NOT NULL, hasta TEXT NOT NULL,
  generada_en TEXT NOT NULL, generada_por INTEGER NOT NULL REFERENCES usuarios(id),
  estado TEXT NOT NULL DEFAULT 'Borrador' CHECK(estado IN ('Borrador','Aprobada')),
  aprobada_por INTEGER REFERENCES usuarios(id), aprobada_en TEXT, pdf TEXT);
CREATE TABLE IF NOT EXISTS configuracion(clave TEXT PRIMARY KEY, valor TEXT NOT NULL);

DROP VIEW IF EXISTS v_asociados;
CREATE VIEW v_asociados AS
SELECT *,
  CASE WHEN exento = 1 THEN 'Exento'
       WHEN (CAST(strftime('%Y','now','localtime') AS INTEGER) * 12 + CAST(strftime('%m','now','localtime') AS INTEGER))
          - (CAST(substr(ult,1,4) AS INTEGER) * 12 + CAST(substr(ult,6,2) AS INTEGER)) > 0 THEN 'Con deuda'
       ELSE 'Al día' END AS estado_cuotas
FROM (
  SELECT a.*,
    (SELECT group_concat(nombre || ' (' || curso || ')', ', ') FROM alumnos WHERE asociado_id = a.id) AS alumnos,
    COALESCE((SELECT MAX(periodo) FROM pagos WHERE asociado_id = a.id), strftime('%Y-%m', a.fecha_alta, '-1 month')) AS ult
  FROM asociados a
);
";

pub fn hash(clave: &str) -> String {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default().hash_password(clave.as_bytes(), &salt).expect("hash").to_string()
}

pub fn verify(clave: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|h| Argon2::default().verify_password(clave.as_bytes(), &h).is_ok())
        .unwrap_or(false)
}

pub fn init(dir: &Path) -> Result<Connection, Box<dyn std::error::Error>> {
    std::fs::create_dir_all(dir)?;
    let conn = Connection::open(dir.join("cooperar.db"))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    conn.execute_batch(SCHEMA)?;
    let n: i64 = conn.query_row("SELECT COUNT(*) FROM usuarios", [], |r| r.get(0))?;
    if n == 0 {
        let clave_hash = hash("admin123");

        // 1. Los 4 usuarios del sistema (acceso por DNI con contraseña inicial: admin123)
        conn.execute(
            "INSERT INTO usuarios(nombre, dni, email, rol, clave_hash) VALUES
             ('Administrador General', '10000001', 'admin@cooperar.local', 'Superadmin', ?1),
             ('Carlos Gómez', '20000002', 'presidente@cooperar.local', 'Presidente', ?1),
             ('Mariana López', '30000003', 'secretaria@cooperar.local', 'Secretaria', ?1),
             ('Roberto Fernández', '40000004', 'tesorero@cooperar.local', 'Tesorero', ?1)",
            [&clave_hash],
        )?;

        // 2. Asociados genéricos
        conn.execute(
            "INSERT INTO asociados(id, apellido_nombre, dni, telefono, email, fecha_alta, exento) VALUES
             (1, 'Álvarez, Marcos', '32111222', '11-4567-8901', 'marcos.alvarez@email.com', date('now', '-3 months'), 0),
             (2, 'Fernández, Valeria', '29888777', '11-9876-5432', 'valeria.fernandez@email.com', date('now', '-6 months'), 0),
             (3, 'Gómez, Santiago', '34555666', '11-2233-4455', 'santiago.gomez@email.com', date('now', '-1 year'), 1),
             (4, 'López, Mariana', '31222333', '11-6677-8899', 'mariana.lopez@email.com', date('now', '-2 months'), 0),
             (5, 'Martínez, Diego', '28777666', '11-3344-5566', 'diego.martinez@email.com', date('now', '-5 months'), 0),
             (6, 'Rodríguez, Laura', '33444555', '11-5566-7788', 'laura.rodriguez@email.com', date('now', '-1 month'), 0),
             (7, 'Romero, Pablo', '30111444', '11-7788-9900', 'pablo.romero@email.com', date('now', '-4 months'), 0),
             (8, 'Sánchez, Elena', '27999111', '11-8899-0011', 'elena.sanchez@email.com', date('now', '-8 months'), 0)",
            [],
        )?;

        // 3. Alumnos asociados
        conn.execute(
            "INSERT INTO alumnos(asociado_id, nombre, curso) VALUES
             (1, 'Lucía Álvarez', '3° A'),
             (2, 'Mateo Fernández', '5° B'),
             (2, 'Sofía Fernández', '1° A'),
             (3, 'Ignacio Gómez', '2° C'),
             (4, 'Camila López', '4° A'),
             (5, 'Tomás Martínez', '6° B'),
             (6, 'Benjamín Rodríguez', '1° B'),
             (7, 'Martina Romero', '2° A'),
             (8, 'Joaquín Sánchez', '5° A')",
            [],
        )?;

        // 4. Movimientos de caja genéricos
        conn.execute(
            "INSERT INTO movimientos_caja(fecha, tipo, categoria, descripcion, monto) VALUES
             (date('now', '-10 days'), 'Ingreso', 'Cuotas', 'Cobro cuotas societarias mes anterior', 56000),
             (date('now', '-8 days'), 'Egreso', 'Insumos', 'Compra de artículos de limpieza y desinfección', 25400),
             (date('now', '-5 days'), 'Ingreso', 'Eventos', 'Recaudación kermesse familiar escolar', 185000),
             (date('now', '-3 days'), 'Egreso', 'Mantenimiento', 'Reparación luminarias patio y pasillos', 45000),
             (date('now', '-1 day'), 'Ingreso', 'Cuotas', 'Cobro cuotas mes en curso', 48000)",
            [],
        )?;

        // 5. Pagos registrados mes actual (dejando a asociado 2 con deuda)
        conn.execute(
            "INSERT INTO pagos(asociado_id, periodo, fecha_pago, monto, medio, comprobante, registrado_por) VALUES
             (1, strftime('%Y-%m','now','localtime'), date('now', '-3 days'), 8000, 'Efectivo', 'REC-001', 4),
             (4, strftime('%Y-%m','now','localtime'), date('now', '-2 days'), 8000, 'Transferencia', 'TRF-1029', 4),
             (5, strftime('%Y-%m','now','localtime'), date('now', '-2 days'), 8000, 'Efectivo', 'REC-002', 4),
             (6, strftime('%Y-%m','now','localtime'), date('now', '-1 day'), 8000, 'Transferencia', 'TRF-1033', 4),
             (7, strftime('%Y-%m','now','localtime'), date('now', '-1 day'), 8000, 'Efectivo', 'REC-003', 4),
             (8, strftime('%Y-%m','now','localtime'), date('now'), 8000, 'Transferencia', 'TRF-1045', 4)",
            [],
        )?;

        // 6. Reunión próxima y anterior
        conn.execute(
            "INSERT INTO reuniones(fecha, tipo, temas, acta) VALUES
             (date('now', '+12 days'), 'Comisión', 'Planificación mejoras edilicias de verano y balance de cuotas.', NULL),
             (date('now', '-20 days'), 'Asamblea', 'Aprobación de memoria y balance anual. Renovación de autoridades.', 'Acta N° 48 aprobada por unanimidad de socios presentes.')",
            [],
        )?;
    }
    conn.execute("INSERT OR IGNORE INTO configuracion VALUES('monto_cuota','8000')", [])?;
    conn.execute(
        "INSERT OR IGNORE INTO configuracion VALUES('ultima_copia', datetime('now','localtime'))",
        [],
    )?;
    Ok(conn)
}