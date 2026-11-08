mod scan;

use std::path::PathBuf;

use anyhow::{Result, bail};
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
    Watch,
    /// Escribe las tarjetas abiertas en el TODO.md del proyecto.
    Export {
        #[arg(default_value = ".")]
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
        Command::Watch => not_yet("watch"),
        Command::Export { path } => scan::export(path),
        Command::Mcp => Ok(wakeline_mcp::serve_stdio()?),
    }
}

fn not_yet(command: &str) -> Result<()> {
    bail!("`wakeline {command}` todavía no está implementado (Wakeline 0.1 en desarrollo)")
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
