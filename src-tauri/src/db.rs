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

CREATE TABLE IF NOT EXISTS personal_establecimiento(
  id INTEGER PRIMARY KEY,
  cargo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  dni TEXT NOT NULL,
  telefono TEXT NOT NULL,
  email TEXT NOT NULL,
  vinculo_nomina TEXT DEFAULT 'NINGUNO'
);

CREATE TABLE IF NOT EXISTS comision_directiva(
  id INTEGER PRIMARY KEY,
  orden INTEGER NOT NULL,
  cargo TEXT NOT NULL,
  asociado_id INTEGER REFERENCES asociados(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  dni TEXT NOT NULL,
  cuil TEXT NOT NULL,
  domicilio TEXT NOT NULL,
  localidad TEXT NOT NULL,
  telefono TEXT NOT NULL,
  email TEXT NOT NULL,
  vencimiento TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documentos_asambleas(
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  periodo TEXT NOT NULL,
  fecha_generacion TEXT NOT NULL,
  generado_por TEXT NOT NULL,
  archivo_pdf TEXT NOT NULL,
  datos_json TEXT NOT NULL
);

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
             ('Mariana López', '31222333', 'secretaria@cooperar.local', 'Secretaria', ?1),
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

    // Migración por si la tabla comision_directiva ya existía sin asociado_id
    let _ = conn.execute("ALTER TABLE comision_directiva ADD COLUMN asociado_id INTEGER REFERENCES asociados(id) ON DELETE SET NULL", []);

    // 7. Dummy data para Comisión Directiva si está vacía
    let n_comision: i64 = conn.query_row("SELECT COUNT(*) FROM comision_directiva", [], |r| r.get(0)).unwrap_or(0);
    if n_comision == 0 {
        conn.execute(
            "INSERT INTO comision_directiva(orden, cargo, asociado_id, nombre, dni, cuil, domicilio, localidad, telefono, email, vencimiento) VALUES
             (1, 'PRESIDENTE', NULL, 'Carlos Gómez', '20000002', '20-20000002-2', 'Av. San Martín 1420', 'Morón', '11-4567-1111', 'carlos.gomez@email.com', '31/12/2027'),
             (2, 'VICEPRESIDENTE', 2, 'Fernández, Valeria', '29888777', '27-29888777-4', 'Belgrano 450', 'Morón', '11-9876-5432', 'valeria.fernandez@email.com', '31/12/2027'),
             (3, 'SECRETARIO', 4, 'López, Mariana', '31222333', '27-31222333-8', 'Mitre 830', 'Morón', '11-6677-8899', 'mariana.lopez@email.com', '31/12/2027'),
             (4, 'TESORERO', NULL, 'Roberto Fernández', '40000004', '20-40000004-3', 'Sarmiento 112', 'Morón', '11-3344-4444', 'roberto.fernandez@email.com', '31/12/2027'),
             (5, 'VOCAL TITULAR 1°', 1, 'Álvarez, Marcos', '32111222', '20-32111222-7', 'Rivadavia 310', 'Morón', '11-4567-8901', 'marcos.alvarez@email.com', '31/12/2027'),
             (6, 'VOCAL TITULAR 2°', 8, 'Sánchez, Elena', '27999111', '27-27999111-5', 'Caseros 650', 'Morón', '11-8899-0011', 'elena.sanchez@email.com', '31/12/2027'),
             (7, 'VOCAL TITULAR 3°', 7, 'Romero, Pablo', '30111444', '20-30111444-2', 'Alsina 920', 'Morón', '11-7788-9900', 'pablo.romero@email.com', '31/12/2027'),
             (8, 'VOCAL SUPLENTE 1°', 5, 'Martínez, Diego', '28777666', '20-28777666-9', 'Brown 710', 'Morón', '11-3344-5566', 'diego.martinez@email.com', '31/12/2027'),
             (9, 'VOCAL SUPLENTE 2°', 6, 'Rodríguez, Laura', '33444555', '27-33444555-0', 'Salta 184', 'Morón', '11-5566-7788', 'laura.rodriguez@email.com', '31/12/2027'),
             (10, 'VOCAL SUPLENTE 3°', 3, 'Gómez, Santiago', '34555666', '20-34555666-3', 'Jujuy 530', 'Morón', '11-2233-4455', 'santiago.gomez@email.com', '31/12/2027'),
             (11, 'REV. CTAS. TITULAR 1°', NULL, 'Patricia Benítez', '24111333', '27-24111333-2', 'Colón 230', 'Morón', '11-4455-1234', 'patricia.benitez@email.com', '31/12/2027'),
             (12, 'REV. CTAS. TITULAR 2°', NULL, 'Gonzalo Morales', '26555444', '20-26555444-7', '25 de Mayo 415', 'Morón', '11-5566-2345', 'gonzalo.morales@email.com', '31/12/2027'),
             (13, 'REV. CTAS. TITULAR DOC.', NULL, 'Claudia Navarro', '23888999', '27-23888999-6', 'Sucre 890', 'Morón', '11-6677-3456', 'claudia.navarro@email.com', '31/12/2027'),
             (14, 'REV. CTAS. SUPLENTE 1°', NULL, 'Federico Castro', '31777888', '20-31777888-4', 'Maza 1040', 'Morón', '11-7788-4567', 'federico.castro@email.com', '31/12/2027'),
             (15, 'REV. CTAS. SUPLENTE DOC.', NULL, 'Silvia Peralta', '22444111', '27-22444111-9', 'Chacabuco 312', 'Morón', '11-8899-5678', 'silvia.peralta@email.com', '31/12/2027'),
             (16, 'ASESOR', NULL, 'Director/a Escolar', '18000000', '27-18000000-5', 'Directorio 500', 'Morón', '11-4629-0000', 'escuela12@educacion.gob.ar', '31/12/2027')",
            [],
        )?;
    }

    // 7.b Dummy data para Personal del Establecimiento si está vacía
    let n_personal: i64 = conn.query_row("SELECT COUNT(*) FROM personal_establecimiento", [], |r| r.get(0)).unwrap_or(0);
    if n_personal == 0 {
        conn.execute(
            "INSERT INTO personal_establecimiento(cargo, nombre, dni, telefono, email, vinculo_nomina) VALUES
             ('Director/a', 'Prof. Martín Valenzuela', '18000000', '11-4629-0000', 'escuela12@educacion.gob.ar', 'ASESOR'),
             ('Vicedirector/a', 'Lic. Andrea Benítez', '21333444', '11-4629-0001', 'andrea.benitez@educacion.gob.ar', 'NINGUNO'),
             ('Secretario/a Escolar', 'Prof. Esteban Quispe', '23111222', '11-4629-0002', 'esteban.quispe@educacion.gob.ar', 'NINGUNO'),
             ('Docente de Grado', 'Claudia Navarro', '23888999', '11-6677-3456', 'claudia.navarro@email.com', 'REV_CTAS_DOC_TIT'),
             ('Docente de Grado', 'Silvia Peralta', '22444111', '11-8899-5678', 'silvia.peralta@email.com', 'REV_CTAS_DOC_SUP')",
            [],
        )?;
    }
    let configuraciones_base = [
        ("monto_cuota", "8000"),
        ("distrito", "Morón"),
        ("numero_escuela", "E.P. N° 12"),
        ("nombre_escuela", "General José de San Martín"),
        ("asociacion_nombre", "Asoc. Cooperadora Escuela Primaria N° 12"),
        ("cue", "060123400"),
        ("cuit", "30-67891234-9"),
        ("domicilio_escuela", "Nuestra Señora del Buen Viaje 450"),
        ("barrio", "Centro"),
        ("localidad", "Morón"),
        ("telefono_escuela", "011-4629-1234"),
        ("email_institucional", "cooperadora.ep12.moron@gmail.com"),
        ("banco_nombre", "Banco de la Provincia de Buenos Aires"),
        ("banco_sucursal", "Sucursal 5012 - Morón"),
        ("cuenta_corriente", "5012-12345/6"),
        ("cbu", "0140012301501201234567"),
        ("alias", "COOP.EP12.MORON"),
        ("cuota_mensual", "8000"),
        ("cuota_anual", "80000"),
    ];

    for (k, v) in configuraciones_base {
        conn.execute("INSERT OR IGNORE INTO configuracion(clave, valor) VALUES(?1, ?2)", [k, v])?;
    }

    conn.execute(
        "INSERT OR IGNORE INTO configuracion VALUES('ultima_copia', datetime('now','localtime'))",
        [],
    )?;

    // 9. Dummy data en documentos_asambleas: PIA 2024 y 2025 con sus respectivas NCD
    let n_docs: i64 = conn.query_row("SELECT COUNT(*) FROM documentos_asambleas", [], |r| r.get(0)).unwrap_or(0);
    if n_docs <= 2 {
        // Limpiamos los 2 temporales previos si los hubiera para insertar el set completo de 4 documentos congruentes
        conn.execute("DELETE FROM documentos_asambleas", [])?;
        conn.execute(
            "INSERT INTO documentos_asambleas(id, tipo, titulo, periodo, fecha_generacion, generado_por, archivo_pdf, datos_json) VALUES
             (1, 'NOMINA_COMISION', 'Nómina Comisión Directiva Ejercicio 2024', '2024', '2024-05-15 18:30', 'Carlos Gómez', 'nomina_comision_2024.pdf', '{\"ejercicio\":\"2024\",\"periodo\":\"2024\",\"totalCargos\":16,\"distrito\":\"Morón\",\"escuela\":\"E.P. N° 12\",\"asociacion\":\"Asoc. Cooperadora Escuela Primaria N° 12\"}'),
             (2, 'PIA_COOPERADORA', 'Planilla de Información Anual (P.I.A.) 2023/2024', '2024', '2024-05-20 19:15', 'Roberto Fernández', 'pia_cooperadoras_2024.pdf', '{\"ejercicio\":\"2023/2024\",\"periodo\":\"2024\",\"saldoInicialCaja\":120000,\"saldoInicialBanco\":180000,\"totalCuotas\":380000,\"totalDonaciones\":25000,\"totalRifas\":45000,\"totalFestivales\":130000,\"totalKiosco\":60000,\"intereses\":4500,\"reintegrados\":1500,\"subsidios\":200000,\"otrosIngresosA\":15000,\"otrosIngresosB\":10000,\"ropaCalzado\":35000,\"librosUtiles\":60000,\"excursiones\":40000,\"emergencias\":12000,\"golosinasPremios\":18000,\"materialDidactico\":45000,\"mantSubsidios\":120000,\"mantFondosPropios\":65000,\"limpieza\":32000,\"combustible\":20000,\"libreria\":15000,\"mobiliario\":50000,\"organizacionRifas\":10000,\"organizacionFestivales\":25000,\"gastosKiosco\":30000,\"otrosGastosA\":8000,\"otrosGastosB\":5000,\"cuotaSocialAprobada\":5000,\"cajaChicaAprobada\":30000}'),
             (3, 'NOMINA_COMISION', 'Nómina Comisión Directiva Ejercicio 2025', '2025', '2025-05-14 18:45', 'Carlos Gómez', 'nomina_comision_2025.pdf', '{\"ejercicio\":\"2025\",\"periodo\":\"2025\",\"totalCargos\":16,\"distrito\":\"Morón\",\"escuela\":\"E.P. N° 12\",\"asociacion\":\"Asoc. Cooperadora Escuela Primaria N° 12\"}'),
             (4, 'PIA_COOPERADORA', 'Planilla de Información Anual (P.I.A.) 2024/2025', '2025', '2025-05-18 19:00', 'Roberto Fernández', 'pia_cooperadoras_2025.pdf', '{\"ejercicio\":\"2024/2025\",\"periodo\":\"2025\",\"saldoInicialCaja\":150000,\"saldoInicialBanco\":230000,\"totalCuotas\":480000,\"totalDonaciones\":35000,\"totalRifas\":60000,\"totalFestivales\":185000,\"totalKiosco\":80000,\"intereses\":6000,\"reintegrados\":2000,\"subsidios\":250000,\"otrosIngresosA\":20000,\"otrosIngresosB\":15000,\"ropaCalzado\":45000,\"librosUtiles\":80000,\"excursiones\":55000,\"emergencias\":15000,\"golosinasPremios\":22000,\"materialDidactico\":60000,\"mantSubsidios\":150000,\"mantFondosPropios\":85000,\"limpieza\":42000,\"combustible\":25000,\"libreria\":20000,\"mobiliario\":70000,\"organizacionRifas\":15000,\"organizacionFestivales\":35000,\"gastosKiosco\":40000,\"otrosGastosA\":10000,\"otrosGastosB\":7000,\"cuotaSocialAprobada\":8000,\"cajaChicaAprobada\":40000}')",
            [],
        )?;
    }

    Ok(conn)
}