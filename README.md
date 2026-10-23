# Cooperar - Sistema Integral de Gestión para Asociaciones Cooperadoras Escolares

![Cooperar Banner](https://img.shields.io/badge/Cooperar-v1.0.0-2563eb?style=for-the-badge&logo=tauri)
![Tauri](https://img.shields.io/badge/Tauri-v2.0-24c8db?style=for-the-badge&logo=tauri)
![Rust](https://img.shields.io/badge/Rust-1.80+-orange?style=for-the-badge&logo=rust)
![React](https://img.shields.io/badge/React-18.3-61dafb?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6?style=for-the-badge&logo=typescript)
![SQLite](https://img.shields.io/badge/SQLite-3-003b57?style=for-the-badge&logo=sqlite)

---

## 1. Introducción y Resumen de la Aplicación

**Cooperar** es una solución de escritorio moderna, robusta y completamente **portable**, concebida específicamente para dar respuesta a las necesidades de gestión administrativa, contable y documental de las **Asociaciones Cooperadoras Escolares** (orientada a las directivas de la Dirección de Cooperación Escolar y normativas provinciales/nacionales de la República Argentina).

El sistema centraliza y profesionaliza la administración escolar eliminando planillas manuales y duplicaciones, brindando trazabilidad absoluta sobre los fondos recaudados, la situación de los asociados y el cumplimiento de los recaudos legales ante asambleas escolares.

### Características Principales

- **100% Portable y Offline**: Opera de forma autónoma sin depender de servidores en la nube ni conexión a Internet. La base de datos y los archivos residen en la subcarpeta `datos/` junto al ejecutable.
- **Padrón de Asociados y Alumnos**: Registro detallado de familias asociadas y múltiples alumnos vinculados (nombre, grado/curso), con cálculo de estado societario en tiempo real.
- **Cobranzas y Cuotas Sociales**: Emisión de recibos oficiales con numeración correlativa, identificación de emisor y asiento inmediato en el Libro Diario de Caja.
- **Libro Diario de Caja Transaccional**: Control cronológico de ingresos y egresos clasificados por categoría, soporte de comprobantes digitales, anulación transaccional y validación de importes decimales.
- **Nómina de Comisión Directiva y Personal**: Gestión de los 16 cargos reglamentarios de la Comisión Directiva, integración con el Personal Directivo y Docente (Asesor y Revisores de Cuentas Docentes), y cálculo automático de CUIL mediante Módulo 11 oficial de ANSES/AFIP.
- **Generación y Visor de Documentación Oficial**: Emisión en formato PDF de la **Nómina de Comisión Directiva** y de la **Planilla de Información Anual (P.I.A.)** con membrete, logo institucional y firmas reglamentarias para su presentación en asambleas.
- **Gestión de Asambleas y Actas**: Registro de reuniones ordinarias y asambleas, lista de presentes y redacción digital de actas.
- **Rendición de Cuentas con Aprobación Jerárquica**: Balances periódicos confeccionados por Tesorería y aprobados mediante firma del Presidente.
- **Respaldo Dinámico Inteligente**: Copias de seguridad automáticas (cada 30 min y al cerrar) y manuales con detección de cambios mediante `PRAGMA data_version` para evitar copias redundantes.
- **Personalización Institucional con Recorte Circular**: Carga y ajuste interactivo del logo institucional mediante Canvas HTML5 con zoom (50%-300%) y traslación táctil/arrastre.

### Tecnologías Utilizadas

- **Backend**: [Rust](https://www.rust-lang.org/) (edición 2021) utilizando el framework [Tauri v2](https://v2.tauri.app/) para una aplicación nativa ultraliviana, segura y de alto rendimiento.
- **Base de Datos**: [SQLite 3](https://sqlite.org/) (vía `rusqlite` con `bundled` y `PRAGMA foreign_keys = ON`).
- **Frontend**: [React 18](https://react.dev/) + [TypeScript 5.5](https://www.typescriptlang.org/) montado sobre [Vite 5](https://vitejs.dev/).
- **Diseño & Estilos**: Vanilla CSS Modules, diseño líquido adaptativo con tokens HSL curados, compatibilidad con temas claros/oscuros, microanimaciones y tipografía [@fontsource/inter](https://fontsource.org/fonts/inter) empaquetada localmente.
- **Generación Vectorial de PDFs**: [pdf-lib](https://pdf-lib.js.org/) para armado directo de planillas y documentos legales en el cliente.
- **Cifrado y Seguridad**: [Argon2id](https://github.com/P-H-C/phc-winner-argon2) para hashing seguro de contraseñas de acceso.

### Reglas de Negocio

1. **Determinación del Estado Societario**: La vista `v_asociados` calcula dinámicamente si el socio está:
   - `Exento`: Si tiene la bandera de exención explícita activada por secretaría.
   - `Al día`: Si la diferencia en meses entre la fecha actual y su último período abonado activo (`MAX(periodo)` en `pagos WHERE anulado = 0`) es menor o igual a cero.
   - `Con deuda`: Si adeuda uno o más períodos mensuales transcurridos desde su alta.
2. **Sincronización Bidireccional Caja ↔ Cobranzas**: Todo cobro de cuota genera un registro en `pagos` y un asiento de `Ingreso` en `movimientos_caja`.
3. **Auditoría y Soft-Delete (RNF05)**: Al anular un movimiento en caja, el pago societario vinculado se preserva marcándose como `anulado = 1` en lugar de eliminarse físicamente, revirtiendo al socio a estado de deuda de forma transaccional y registrando obligatoriamente el motivo de la anulación (RF14).
4. **Protección contra Pagos Duplicados**: El sistema rechaza montos menores o iguales a cero e impide registrar más de un pago activo para un mismo período y asociado mediante validación de negocio e índice único en base de datos.
5. **Consistencia de Nómina**: La edición de datos de un socio (DNI, teléfono, email, apellido y nombre) actualiza automáticamente en cascada su fila correspondiente en `comision_directiva` si ocupa un cargo activo.
6. **Protección de Rendiciones Aprobadas**: Las rendiciones de cuentas creadas por el rol `Tesorero` nacen en estado `Borrador` y son aprobadas por `Presidente` o `Superadmin`. Una vez aprobada, el sistema bloquea su eliminación para resguardar la inmutabilidad de los balances consolidados.
7. **Respaldo Dinámico y Restauración (RF21)**: Si la versión de datos (`PRAGMA data_version`) no se incrementó desde la última copia y ya existe un archivo físico de respaldo, se omite la creación de un nuevo archivo para preservar almacenamiento. El sistema permite restaurar instantáneamente el estado completo de la base de datos a partir de cualquier copia íntegra con verificación de integridad previa.
8. **Libro de Actas y Adjuntos Digitales (RF16)**: Permite la redacción oficial de actas de asambleas y reuniones de comisión directiva, admitiendo el adjunto de actas escaneadas o documentación respaldatoria en formato PDF o imagen.


## 2. Instructivo para la Instalación Local

### Prerrequisitos

Asegúrese de contar con las siguientes herramientas instaladas en su entorno:

1. **Node.js**: Versión 18.x o superior ([Descargar Node.js](https://nodejs.org/)).
2. **Rust & Cargo**: Versión 1.80 o superior ([Instalar Rust con rustup](https://rustup.rs/)).
3. **Herramientas de C++ / Windows SDK** (en Windows): Microsoft C++ Build Tools (incluido con Visual Studio).

### Pasos de Instalación

1. **Clonar o descargar el repositorio**:

   ```bash
   git clone https://github.com/PMIglesias/cooperar.git
   cd cooperar
   ```

2. **Instalar dependencias del Frontend**:

   ```bash
   npm install
   ```

3. **Ejecutar en Modo Desarrollo**:

   ```bash
   npm run tauri dev
   ```

   _El comando compilará el backend en Rust, iniciará el servidor de desarrollo de Vite y abrirá la ventana nativa de Cooperar._

4. **Compilar el Paquete de Producción**:
   ```bash
   npm run tauri build
   ```
   _El instalador o ejecutable portable generado se ubicará en `src-tauri/target/release/`._

### Credenciales Predeterminadas (Primer Inicio)

Al iniciar la aplicación por primera vez en una base de datos limpia, se generan los siguientes usuarios de acceso (Contraseña inicial: `admin123`):

| Rol            | Nombre                | DNI de Acceso | Contraseña |
| :------------- | :-------------------- | :------------ | :--------- |
| **Superadmin** | Administrador General | `10000001`    | `admin123` |
| **Presidente** | Carlos Gómez          | `20000002`    | `admin123` |
| **Secretaria** | Mariana López         | `31222333`    | `admin123` |
| **Tesorero**   | Roberto Fernández     | `40000004`    | `admin123` |

---

## 3. Estructura del Proyecto

```
cooperar/
├── src-tauri/                       # Backend nativo en Rust
│   ├── Cargo.toml                   # Dependencias Rust (tauri, rusqlite, argon2, etc.)
│   ├── tauri.conf.json              # Configuración de ventana, permisos e identificador Tauri
│   ├── src/
│   │   ├── main.rs                  # Inicialización de la app, estado portable e hilo de backup
│   │   ├── db.rs                    # Esquema relacional SQLite, migración y datos semilla
│   │   └── commands.rs              # Comandos IPC de Tauri, lógica de negocio y seguridad
│   └── tests/
│       └── cooperar_tests.rs        # Suite de pruebas automatizadas de integración y unitarias
├── src/                             # Frontend en React 18 + TypeScript
│   ├── main.tsx                     # Punto de entrada de la UI y montado del DOM
│   ├── App.tsx                      # Enrutamiento modular por vistas
│   ├── api.ts                       # Clientes tipados de invocación IPC (`invoke`) y generadores
│   ├── context.ts                   # Contexto global de sesión, perfil y logo cooperadora
│   ├── components/                  # Componentes reutilizables
│   │   ├── Layout.tsx               # Estructura base de pantalla (Sidebar colapsable + Contenido)
│   │   ├── Sidebar.tsx              # Menú de navegación interactivo con logo y roles
│   │   └── ui/                      # Sistema de diseño (DataTable, Modal, Button, Badge, Field, etc.)
│   ├── pages/                       # Vistas principales de la aplicación
│   │   ├── Login.tsx                # Pantalla de autenticación con logo público
│   │   ├── Dashboard.tsx            # Métricas, balances rápidos y accesos directos
│   │   ├── Asociados.tsx            # Padrón de asociados, alumnos, altas, bajas y edición
│   │   ├── Cuotas.tsx               # Cobro de cuotas, emisión de recibos e historial
│   │   ├── Caja.tsx                 # Libro diario, ingresos/egresos y anulación
│   │   ├── ComisionDirectiva.tsx    # Nómina de 16 cargos, personal y configuración con logo
│   │   ├── Documentacion.tsx        # Generador de Nómina y Planilla PIA en PDF
│   │   ├── Reuniones.tsx            # Actas de comisión y asambleas
│   │   ├── Rendiciones.tsx          # Balances mensuales y circuito de aprobación
│   │   └── Usuarios.tsx             # Cuentas de usuarios y gestión de copias de seguridad
│   ├── utils/
│   │   └── pdfGenerators.ts         # Generador de documentos oficiales con pdf-lib
│   └── styles/                      # Sistema de variables y reset CSS global
└── package.json                     # Scripts y dependencias del ecosistema Node
```

---

## 4. Seguridad

1. **Cifrado Criptográfico de Contraseñas**:
   - Se utiliza **Argon2id** (ganador del Password Hashing Competition) para el almacenamiento de claves en base de datos con generación de _salt_ aleatorio mediante `rand_core::OsRng`.
2. **Prevención contra Path Traversal**:
   - En las operaciones de lectura y eliminación de documentos generados eliminar_documento_asamblea, leer_archivo_documento, se aplica aislamiento forzoso del nombre de archivo utilizando `std::path::Path::new(&archivo).file_name()`, impidiendo cualquier escape hacia directorios superiores del sistema operativo mediante secuencias relativas (`../`).
3. **Persistencia Portable Concurrente Segura**:
   - SQLite configurado en modo transaccional ACID con `PRAGMA foreign_keys = ON;`.
   - Bloqueo concurrente controlado mediante `std::sync::Mutex` en el estado global `AppState` de Tauri.
4. **Sanitización de Consultas SQL**:
   - Todas las sentencias y comandos rusqlite utilizan parámetros vinculados (`params![]`), neutralizando cualquier riesgo de inyección SQL.

---

## 5. Autorización (RBAC)

El sistema implementa un modelo de **Control de Acceso Basado en Roles** (_Role-Based Access Control_) verificado estrictamente a nivel de comandos de backend en Rust:

| Función / Operación                | Comando Backend                                  |     Superadmin     |     Presidente     |     Secretaria     |      Tesorero      |
| :--------------------------------- | :----------------------------------------------- | :----------------: | :----------------: | :----------------: | :----------------: |
| Acceso a Métricas y Consultas      | `resumen_inicio`, `listar_*`                     | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| Alta/Baja/Edición de Asociados     | `actualizar_asociado`, `crear_asociado`          | :white_check_mark: |        :x:         | :white_check_mark: |        :x:         |
| Gestión de Nómina y Personal       | `guardar_miembro_comision`, `guardar_personal_*` | :white_check_mark: |        :x:         | :white_check_mark: |        :x:         |
| Redacción de Actas de Reunión      | `guardar_acta`, `crear_reunion`                  | :white_check_mark: |        :x:         | :white_check_mark: |        :x:         |
| Cobranza y Movimientos de Caja     | `registrar_pago`, `crear_movimiento_caja`        | :white_check_mark: |        :x:         |        :x:         | :white_check_mark: |
| Anulación de Movimientos en Caja   | `anular_movimiento_caja`                         | :white_check_mark: |        :x:         |        :x:         | :white_check_mark: |
| Creación de Rendición de Cuentas   | `crear_rendicion` (Borrador)                     | :white_check_mark: |        :x:         |        :x:         | :white_check_mark: |
| Aprobación de Rendición de Cuentas | `aprobar_rendicion`                              | :white_check_mark: | :white_check_mark: |        :x:         |        :x:         |
| Gestión de Usuarios y Accesos      | `crear_usuario`, `actualizar_usuario`            | :white_check_mark: |        :x:         |        :x:         |        :x:         |
| Generación de Copias de Seguridad  | `crear_copia_seguridad`                          | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |

---

## 6. Experiencia de Usuario (UX)

- **Diseño Estético y Minimalista**: Paleta armónica moderna con bordes redondeados suaves, sombras sutiles y contrastes accesibles conformes a las pautas WCAG 2.1.
- **Sidebar Colapsable Dinámica**: Menú lateral que puede expandirse o contraerse a conveniencia, guardando su estado en `localStorage` y mostrando el logo cooperador y las insignias de rol de forma adaptativa.
- **Tablas de Datos con Scrollbar Independiente**: El componente `DataTable` garantiza visualización óptima en pantallas estándar y portátiles, con anchos mínimos configurados por columna, encabezaos fijos y `scrollbar-gutter: stable`.
- **Editor y Recortador Circular de Logo**: Permite previsualizar la imagen cargada dentro de un círculo guía, desplazándola mediante arrastre y ajustando el zoom con un slider continuo, asegurando un encuadre perfecto.
- **Diálogos de Confirmación Contextuales**: Acciones destructivas (bajas, anulaciones o eliminaciones) requieren confirmación explícita mediante modales accesibles.
- **Feedback No Invasivo**: Avisos flotantes claros y badges semánticos (verde para socios al día, ámbar para socios con deuda, azul para exentos).

---

## 7. Testing y Aseguramiento de Calidad

Se implementaron pruebas automatizadas tanto en el backend utilizando el harness nativo de Rust (`cargo test`) como en el frontend para validar las reglas de negocio críticas, el tipado y el empaquetado final.

### Pruebas Automatizadas de Backend (Rust)

El backend implementa una arquitectura desacoplada como crate library (`cooperar`) permitiendo que la suite de pruebas de integración ubicada en `src-tauri/tests/cooperar_tests.rs` importe e invoque directamente las funciones reales de la aplicación (`db::init`, `calcular_cuil_modulo_11`, `actualizar_asociado_interno`, `registrar_pago_interno`, `anular_movimiento_caja_interno`, `ejecutar_copia_interna`, `restaurar_copia_interna`, `eliminar_rendicion_interno`, `sanitizar_nombre_archivo`):

1. **Esquema e Inicialización Real**: Valida la inicialización completa mediante `db::init`, creación de tablas, vista `v_asociados`, integridad referencial y verificación del hashing Argon2 en usuarios iniciales.
2. **Verificación de CUIL (Módulo 11 Oficial)**: Comprobación matemática del algoritmo oficial de ANSES/AFIP importado directamente de la lógica de la aplicación.
3. **Validación de Pagos y Prevención de Duplicados**: Rechazo estricto de montos menores o iguales a cero e impedimento de registrar pagos duplicados para el mismo período y asociado.
4. **Vinculación Cruzada, Sincronización y Soft-Delete (RNF05 / RF14)**:
   - Sincronización automática de datos entre el padrón de asociados y la nómina de la comisión directiva.
   - Vinculación Caja ↔ Pagos: período dinámico independiente de la fecha del año, registro transaccional, anulación con motivo obligatorio (`motivo_anulacion`), preservación del pago mediante soft-delete (`anulado = 1`) y recálculo instantáneo del estado de deuda.
5. **Protección de Rendiciones Aprobadas**: Valida que una rendición consolidada con estado `Aprobada` rechace cualquier intento de borrado.
6. **Balance Financiero de Rendiciones**: Verifica la exclusión matemática exacta de movimientos anulados en los balances.
7. **Respaldo Dinámico y Restauración (RF21)**: Valida la prevención de copias redundantes mediante `PRAGMA data_version` y la restauración íntegra y segura de la base de datos a través de SQLite Backup API.
8. **Seguridad contra Path Traversal**: Verifica que la función `sanitizar_nombre_archivo` de la aplicación depure y neutralice eficazmente secuencias maliciosas (`../../etc/passwd`, `..\calc.exe`).
9. **Migración Preventiva y Compatibilidad Hacia Atrás**: Valida la capacidad de inicializar la app sobre bases de datos preexistentes generadas en versiones anteriores, aplicando automáticamente las migraciones antes de procesar las vistas e índices.

### Ejecución de Pruebas:

```bash
# 1. Ejecutar pruebas unitarias y de integración de backend:
cd src-tauri
cargo test --test cooperar_tests

# 2. Validar tipado TypeScript en el frontend:
cd ..
npx tsc --noEmit

# 3. Validar compilación de producción con Vite:
npm run build
```

**Resultado de la ejecución oficial (100% Aprobado):**

```
running 9 tests
test test_path_traversal_sanitization ........................... ok
test test_cuil_modulo_11_verification ........................... ok
test test_pagos_duplicate_and_amount_validations ................ ok
test test_cross_data_integrity_asociado_comision_and_caja_pagos . ok
test test_db_migration_from_legacy_schema ....................... ok
test test_eliminar_rendicion_protection ......................... ok
test test_rendiciones_balance_calculo ........................... ok
test test_dynamic_backup_and_restoration ........................ ok
test test_db_initialization_and_schema .......................... ok

test result: ok. 9 passed; 0 failed; 0 ignored; finished in 1.66s
```

## Licencia

Proyecto desarrollado para uso administrativo e institucional en Asociaciones Cooperadoras Escolares.
Distribuido bajo licencia propietaria / comunitaria según las directivas del establecimiento educativo.
