mod commands;
mod scan;

use std::path::PathBuf;

use anyhow::Result;
use clap::{Parser, Subcommand};

/// Wakeline: la estela que deja tu IA, convertida en una lista de tareas.
#[derive(Parser)]
#[command(name = "wakeline", version)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Revisa un proyecto una vez y muestra las tarjetas encontradas.
    Scan {
        /// Carpeta del proyecto (por defecto, la actual).
        #[arg(default_value = ".")]
        path: PathBuf,
        /// Días de historial de sesiones a revisar.
        #[arg(long, default_value_t = 30, conflicts_with = "all_history")]
        days: u64,
        /// Revisa todo el historial de sesiones, sin límite de días.
        #[arg(long)]
        all_history: bool,
        /// Muestra las tarjetas de todos los proyectos, no solo de `path`.
        #[arg(long)]
        all_projects: bool,
        /// Carpeta de sesiones de Claude Code (por defecto, ~/.claude/projects).
        #[arg(long)]
        sessions_dir: Option<PathBuf>,
    },
    /// Vigila los proyectos configurados y actualiza las tarjetas al momento.
    Watch {
        /// Carpeta a vigilar si no hay carpetas en state.json (por defecto, las de state.json o `.`).
        #[arg(long)]
        path: Option<PathBuf>,
        /// Carpeta de sesiones de Claude Code (por defecto, ~/.claude/projects).
        #[arg(long)]
        sessions_dir: Option<PathBuf>,
        /// Tiempo de agrupación (debounce) en milisegundos tras un cambio.
        #[arg(long, default_value_t = 1200)]
        debounce_ms: u64,
        /// Sale tras detectar y procesar el primer cambio (para pruebas).
        #[arg(long, hide = true)]
        once: bool,
    },
    /// Escribe las tarjetas abiertas en el TODO.md del proyecto.
    Export {
        #[arg(default_value = ".")]
        path: PathBuf,
    },
    /// Muestra los comandos de `wakeline.toml` y pide permiso para ejecutarlos.
    Trust {
        #[arg(default_value = ".")]
        path: PathBuf,
        /// Aprueba sin preguntar.
        #[arg(long)]
        yes: bool,
    },
    /// Consulta GitHub una vez (solo lectura, con la sesión de `gh`) y muestra lo leído.
    Github {
        #[arg(default_value = ".")]
        path: PathBuf,
    },
    /// Ejecuta ya un comando aprobado de `wakeline.toml`.
    Run {
        /// Nombre del comando (`name` en `wakeline.toml`).
        name: String,
        /// Carpeta del proyecto (por defecto, la actual).
        #[arg(long, default_value = ".")]
        path: PathBuf,
    },
    /// Arranca el servidor MCP por stdio para que el agente de IA lea y cierre tarjetas.
    Mcp,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Scan {
            path,
            days,
            all_history,
            all_projects,
            sessions_dir,
        } => scan::run(scan::ScanOptions {
            project: path,
            sessions_dir,
            days: (!all_history).then_some(days),
            all_projects,
        }),
        Command::Watch {
            path,
            sessions_dir,
            debounce_ms,
            once,
        } => scan::watch(scan::WatchOptions {
            extra_path: path,
            sessions_dir,
            debounce_ms,
            once,
        }),
        Command::Export { path } => scan::export(path),
        Command::Trust { path, yes } => commands::trust(path, yes),
        Command::Run { name, path } => commands::run(path, name),
        Command::Github { path } => scan::github_once(path),
        Command::Mcp => Ok(wakeline_mcp::serve_stdio()?),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::CommandFactory;

    #[test]
    fn cli_definition_is_valid() {
        Cli::command().debug_assert();
    }
}
