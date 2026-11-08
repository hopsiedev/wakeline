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
        Command::Scan { .. } => not_yet("scan"),
        Command::Watch => not_yet("watch"),
        Command::Export { .. } => not_yet("export"),
        Command::Mcp => {
            eprintln!(
                "Herramientas MCP previstas: {}",
                wakeline_mcp::TOOL_NAMES.join(", ")
            );
            not_yet("mcp")
        }
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
