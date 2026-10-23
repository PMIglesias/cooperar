// src-tauri/src/lib.rs
pub mod commands;
pub mod db;

use std::path::PathBuf;
use std::sync::Mutex;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub sesion: Mutex<Option<commands::Usuario>>,
    pub data_dir: PathBuf,
}

impl AppState {
    pub fn new(conn: rusqlite::Connection, data_dir: PathBuf) -> Self {
        Self {
            db: Mutex::new(conn),
            sesion: Mutex::new(None),
            data_dir,
        }
    }

    pub fn with_user(conn: rusqlite::Connection, data_dir: PathBuf, usuario: commands::Usuario) -> Self {
        Self {
            db: Mutex::new(conn),
            sesion: Mutex::new(Some(usuario)),
            data_dir,
        }
    }
}
