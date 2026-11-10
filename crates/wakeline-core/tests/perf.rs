//! Rendimiento de la lectura de sesiones (Q59): 500 MB en menos de 30 s.
//!
//! Va con `#[ignore]` porque escribe 500 MB en la carpeta temporal. Se corre a mano:
//!
//! ```text
//! cargo test --release -p wakeline-core --test perf -- --ignored --nocapture
//! ```

use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use wakeline_core::sessions::{claude, scan_files_incremental};
use wakeline_core::store::LocalState;

const TARGET_BYTES: u64 = 500 * 1024 * 1024;
const LIMIT: Duration = Duration::from_secs(30);

/// Escribe sesiones parecidas a las reales: mensajes, herramientas, errores, textos
/// con pendientes, subagentes y alguna línea de más de 1 MB.
fn generate(root: &Path, target: u64) -> u64 {
    let mut written = 0u64;
    let mut file_idx = 0usize;
    let big_output = "x".repeat(1_200_000);
    while written < target {
        let project = root.join(format!("C--proyecto-{}", file_idx % 8));
        let session = format!("sesion-{file_idx:05}");
        let path = if file_idx % 5 == 4 {
            let dir = project.join(&session).join("subagents");
            std::fs::create_dir_all(&dir).unwrap();
            dir.join("agent-1.jsonl")
        } else {
            std::fs::create_dir_all(&project).unwrap();
            project.join(format!("{session}.jsonl"))
        };
        let mut out = BufWriter::with_capacity(1 << 20, File::create(&path).unwrap());
        // Archivos de 2 a 40 MB, como los del uso diario.
        let file_target = (2 + (file_idx * 7) % 39) as u64 * 1024 * 1024;
        let mut file_written = 0u64;
        let mut turn = 0usize;
        while file_written < file_target && written + file_written < target {
            let lines = turn_lines(&session, file_idx, turn, &big_output);
            for line in lines {
                out.write_all(line.as_bytes()).unwrap();
                out.write_all(b"\n").unwrap();
                file_written += line.len() as u64 + 1;
            }
            turn += 1;
        }
        out.flush().unwrap();
        written += file_written;
        file_idx += 1;
    }
    written
}

fn turn_lines(session: &str, file_idx: usize, turn: usize, big_output: &str) -> Vec<String> {
    let ts = format!(
        "2026-11-0{}T10:{:02}:{:02}Z",
        1 + turn % 8,
        turn % 60,
        turn % 59
    );
    let cwd = format!(r"C:\\Users\\U\\proyecto-{}", file_idx % 8);
    let id = format!("toolu_{file_idx}_{turn}");
    let meta = format!(
        r#""sessionId":"{session}","timestamp":"{ts}","cwd":"{cwd}","gitBranch":"main","uuid":"u{turn}","parentUuid":"u{}""#,
        turn.saturating_sub(1)
    );
    let mut lines = vec![
        format!(
            r#"{{"type":"user",{meta},"message":{{"role":"user","content":"Revisa el módulo {turn} y corrige los errores de tipos que salgan al compilar."}}}}"#
        ),
        format!(
            r#"{{"type":"assistant",{meta},"message":{{"stop_reason":"tool_use","content":[{{"type":"tool_use","id":"{id}","name":"Bash","input":{{"command":"npx tsc --noEmit"}}}}]}}}}"#
        ),
    ];
    let output = if turn.is_multiple_of(97) {
        big_output.to_string()
    } else {
        "src/app.ts(3,7): error TS2304: Cannot find name 'x'. ".repeat(40)
    };
    lines.push(format!(
        r#"{{"type":"user",{meta},"message":{{"content":[{{"type":"tool_result","tool_use_id":"{id}","is_error":{},"content":"{output}"}}]}}}}"#,
        turn.is_multiple_of(3)
    ));
    let text = if turn.is_multiple_of(11) {
        "Listo. Queda pendiente probar la exportación en Windows y falta documentar el cambio."
    } else {
        "Corregí los tipos del módulo y los tests pasan en local."
    };
    lines.push(format!(
        r#"{{"type":"assistant",{meta},"message":{{"stop_reason":"end_turn","content":[{{"type":"text","text":"{text}"}}]}}}}"#
    ));
    if turn.is_multiple_of(13) {
        lines.push(format!(
            r#"{{"type":"api-request",{meta},"durationMs":1234}}"#
        ));
    }
    lines
}

/// Memoria del proceso en MB: (actual, pico).
#[cfg(windows)]
fn memory_mb() -> (f64, f64) {
    use windows_sys::Win32::System::ProcessStatus::{
        GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS,
    };
    use windows_sys::Win32::System::Threading::GetCurrentProcess;

    // SAFETY: estructura inicializada a cero con su tamaño en `cb`.
    unsafe {
        let mut counters: PROCESS_MEMORY_COUNTERS = std::mem::zeroed();
        counters.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
        GetProcessMemoryInfo(GetCurrentProcess(), &mut counters, counters.cb);
        (
            counters.WorkingSetSize as f64 / 1_048_576.0,
            counters.PeakWorkingSetSize as f64 / 1_048_576.0,
        )
    }
}

#[cfg(not(windows))]
fn memory_mb() -> (f64, f64) {
    (0.0, 0.0)
}

fn temp_root() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("wakeline-perf-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
#[ignore = "escribe 500 MB; se corre a mano con --release -- --ignored"]
fn reads_500_mb_of_sessions_in_under_30_seconds() {
    let root = temp_root();
    let started = Instant::now();
    let bytes = generate(&root, TARGET_BYTES);
    println!(
        "Generados {:.0} MB en {:.1?}",
        bytes as f64 / 1_048_576.0,
        started.elapsed()
    );

    let files = claude::discover(&root).unwrap();
    let mut state = LocalState::default();
    let (before, _) = memory_mb();
    let started = Instant::now();
    let report = scan_files_incremental(&files, &mut state).unwrap();
    let first = started.elapsed();
    println!(
        "Primera lectura: {} archivos, {:.0} MB, {} eventos, {} tarjetas en {:.2?} ({:.0} MB/s)",
        files.len(),
        report.bytes_read as f64 / 1_048_576.0,
        report.events_read,
        report.cards.len(),
        first,
        report.bytes_read as f64 / 1_048_576.0 / first.as_secs_f64()
    );
    let (after, peak) = memory_mb();
    println!("Memoria: {before:.0} MB antes, {after:.0} MB después, pico {peak:.0} MB");

    let started = Instant::now();
    let again = scan_files_incremental(&files, &mut state).unwrap();
    let second = started.elapsed();
    println!(
        "Segunda lectura (incremental): {} bytes en {second:.2?}",
        again.bytes_read
    );

    let _ = std::fs::remove_dir_all(&root);
    assert!(report.bytes_read >= TARGET_BYTES);
    assert!(!report.cards.is_empty());
    assert!(first < LIMIT, "la primera lectura tardó {first:.1?}");
    assert_eq!(again.bytes_read, 0);
    assert!(
        second < Duration::from_secs(2),
        "la incremental tardó {second:.1?}"
    );
}
