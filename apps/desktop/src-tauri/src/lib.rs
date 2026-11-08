/// Arranca la app de escritorio. Los comandos que lean tarjetas del núcleo se
/// registran aquí cuando exista el almacenamiento.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar Wakeline");
}
