//! `wakeline trust` y `wakeline run`: aprobar y lanzar los comandos de `wakeline.toml`.

use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use wakeline_core::commands::{
    self, CONFIG_FILE, CommandResult, CommandRunner, RunStatus, Trigger, TrustStatus,
};
use wakeline_core::store::LocalState;

/// Muestra los comandos con su argv completo y pide confirmación antes de aprobarlos.
pub fn trust(project: PathBuf, yes: bool) -> Result<()> {
    let root = canonical(&project)?;
    let loaded = commands::load(&root)
        .map_err(anyhow::Error::msg)?
        .with_context(|| format!("{} no tiene {CONFIG_FILE}", root.display()))?;

    let state_path = LocalState::default_path();
    let mut state = LocalState::load(&state_path);
    match commands::trust_status(&state, &root, &loaded.hash) {
        TrustStatus::Approved => {
            println!("Los comandos de {} ya están aprobados.", root.display());
            return Ok(());
        }
        TrustStatus::Changed => println!("{CONFIG_FILE} cambió desde la última aprobación."),
        TrustStatus::Pending => {}
    }

    println!("Comandos de {}:", root.display());
    for command in &loaded.config.commands {
        let when = match command.on {
            Trigger::Idle => "tras 30 s sin cambios",
            Trigger::Manual => "a mano",
        };
        let cwd = command.cwd.as_deref().unwrap_or(".");
        println!("  {} ({when}, en {cwd}): {:?}", command.name, command.run);
    }

    if !yes {
        print!("¿Permitir que Wakeline ejecute estos comandos? [y/N] ");
        std::io::stdout().flush()?;
        let mut answer = String::new();
        std::io::stdin().lock().read_line(&mut answer)?;
        if !matches!(answer.trim(), "y" | "Y" | "s" | "S") {
            println!("No se aprobó nada.");
            return Ok(());
        }
    }
    commands::approve(&mut state, &root, &loaded.hash);
    state.save(&state_path)?;
    println!("Aprobado. Si {CONFIG_FILE} cambia, habrá que aprobarlo otra vez.");
    Ok(())
}

/// Lanza un comando aprobado y muestra sus tarjetas.
pub fn run(project: PathBuf, name: String) -> Result<()> {
    let root = canonical(&project)?;
    let runner = CommandRunner::spawn(
        LocalState::default_path(),
        commands::results_path(),
        Duration::from_secs(commands::IDLE_DELAY_SECS),
        |_| {},
    );
    println!("Ejecutando {name}...");
    let result = runner.run_now(&root, &name).map_err(anyhow::Error::msg)?;
    print_result(&result);
    if result.status == RunStatus::NotStarted {
        bail!("no se pudo lanzar {name}");
    }
    Ok(())
}

pub fn print_result(result: &CommandResult) {
    let detail = result
        .detail
        .as_deref()
        .map(|d| format!(" ({d})"))
        .unwrap_or_default();
    let status = match result.status {
        RunStatus::Passed => "pasó",
        RunStatus::Failed => "falló",
        RunStatus::TimedOut => "superó el tiempo",
        RunStatus::NotStarted => "no se lanzó",
    };
    println!("{}: {status}{detail}", result.command);
    for card in &result.cards {
        let location = card.location().unwrap_or_else(|| "-".into());
        println!("  ×{:<3} {location}  {}", card.occurrences, card.title);
    }
}

fn canonical(path: &Path) -> Result<PathBuf> {
    let canonical = std::fs::canonicalize(path)
        .with_context(|| format!("no existe la carpeta {}", path.display()))?;
    let text = canonical.to_string_lossy();
    Ok(PathBuf::from(text.strip_prefix(r"\\?\").unwrap_or(&text)))
}
