// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use cooperar::{commands, db, AppState};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;


/// Resuelve la carpeta de datos en modo 100% portable:
/// - En producción (release): utiliza la subcarpeta `datos` situada exactamente junto al ejecutable (.exe).
/// - En desarrollo (debug): utiliza la subcarpeta `datos` relativa al directorio de ejecución del proyecto.
/// - Fallback: si no hubiera permisos de escritura en la carpeta del ejecutable, recurre a app_data_dir.
fn resolve_portable_dir(app: &tauri::App) -> PathBuf {
    #[cfg(not(debug_assertions))]
    {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                let portable_dir = exe_dir.join("datos");
                if std::fs::create_dir_all(&portable_dir).is_ok() {
                    return portable_dir;
                }
            }
        }
    }

    let local_dir = PathBuf::from("datos");
    if std::fs::create_dir_all(&local_dir).is_ok() {
        return local_dir;
    }

    app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = resolve_portable_dir(app);
            let conn = db::init(&dir)?;
            app.manage(AppState {
                db: Mutex::new(conn),
                sesion: Mutex::new(None),
                data_dir: dir,
            });

            // Respaldo automático periódico cada 30 minutos (1800 segundos)
            let app_handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(30 * 60));
                if let Some(state) = app_handle.try_state::<AppState>() {
                    let _ = commands::ejecutar_copia_interna(&state);
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Respaldo automático al cerrar la ventana principal / aplicación
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.try_state::<AppState>() {
                    let _ = commands::ejecutar_copia_interna(&state);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::login,
            commands::logout,
            commands::resumen_inicio,
            commands::resumen_padron,
            commands::listar_asociados,
            commands::obtener_asociado,
            commands::crear_asociado,
            commands::actualizar_asociado,
            commands::marcar_exento,
            commands::dar_de_baja,
            commands::reactivar_asociado,
            commands::listar_pagos,
            commands::obtener_historial_pagos_asociado,
            commands::registrar_pago,
            commands::listar_movimientos_caja,
            commands::resumen_caja,
            commands::crear_movimiento_caja,
            commands::anular_movimiento_caja,
            commands::listar_reuniones,
            commands::crear_reunion,
            commands::guardar_acta,
            commands::listar_rendiciones,
            commands::crear_rendicion,
            commands::aprobar_rendicion,
            commands::eliminar_rendicion,
            commands::listar_usuarios,
            commands::crear_usuario,
            commands::actualizar_usuario,
            commands::cambiar_estado_usuario,
            commands::crear_copia_seguridad,
            commands::listar_copias_seguridad,
            commands::restaurar_copia_seguridad,
            commands::eliminar_copia_seguridad,
            commands::obtener_configuracion,
            commands::guardar_configuracion,
            commands::obtener_ruta_datos,
            commands::listar_comision_directiva,
            commands::guardar_miembro_comision,
            commands::listar_personal_establecimiento,
            commands::guardar_personal_establecimiento,
            commands::eliminar_personal_establecimiento,
            commands::listar_documentos_asambleas,
            commands::guardar_documento_asamblea,
            commands::eliminar_documento_asamblea,
            commands::leer_archivo_documento,
            commands::exportar_pdf_escritorio,
            commands::guardar_pdf_en_ruta,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar Cooperar");
}