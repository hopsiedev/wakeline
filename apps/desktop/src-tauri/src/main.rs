// Evita la ventana de consola extra en Windows en las versiones de producción.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    wakeline_app::run();
}
