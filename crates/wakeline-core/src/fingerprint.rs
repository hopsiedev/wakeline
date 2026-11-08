//! Huella de una tarjeta: identifica "el mismo problema" aunque cambie la línea, la
//! hora o una ruta temporal. Si dos señales dan la misma huella, son una sola tarjeta.
//!
//! La huella debe ser estable entre versiones: cambiar esta normalización hace que
//! los usuarios vean tarjetas duplicadas. Por eso usa FNV-1a (estable) y no el hasher
//! de la biblioteca estándar.

use std::fmt;

use serde::{Deserialize, Serialize};

use crate::card::{CardKind, SourceKind};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Fingerprint(String);

impl Fingerprint {
    pub fn new(kind: CardKind, source: SourceKind, path: Option<&str>, message: &str) -> Self {
        let path = path.map(normalize_path).unwrap_or_default();
        let key = format!(
            "{}\u{1f}{}\u{1f}{}\u{1f}{}",
            kind.tag(),
            source.tag(),
            path,
            normalize_message(message)
        );
        Self(format!("{:016x}", fnv1a(key.as_bytes())))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Fingerprint {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// Ruta en forma comparable: barras normales, minúsculas y sin `:línea:columna`.
pub fn normalize_path(path: &str) -> String {
    strip_location(&path.trim().replace('\\', "/").to_lowercase())
}

/// Mensaje sin lo que cambia entre apariciones del mismo problema.
pub fn normalize_message(message: &str) -> String {
    let lower = message.to_lowercase();
    let mut out: Vec<String> = Vec::new();
    let mut previous_was_line_word = false;

    for raw in lower.split_whitespace() {
        let token = normalize_token(raw, previous_was_line_word);
        previous_was_line_word = matches!(
            raw.trim_matches(|c: char| !c.is_alphanumeric()),
            "line" | "línea" | "linea" | "ln" | "col" | "column" | "columna"
        );
        out.push(token);
    }
    out.join(" ")
}

fn normalize_token(raw: &str, after_line_word: bool) -> String {
    let core = raw.trim_matches(|c: char| matches!(c, ',' | ';' | '"' | '\'' | '`' | '«' | '»'));

    if is_temp_path(core) {
        return "<tmp>".into();
    }
    // Hora, fecha e ID se miran antes de quitar `:línea`, que cortaría `14:52:07`.
    let bare = core.trim_matches(|c: char| matches!(c, '(' | ')' | '[' | ']' | '{' | '}' | ':'));
    let replacement = if bare.is_empty() {
        None
    } else if after_line_word && bare.chars().all(|c| c.is_ascii_digit()) {
        Some("#")
    } else if is_time(bare) {
        Some("<time>")
    } else if is_date(bare) {
        Some("<date>")
    } else if is_id(bare) {
        Some("<id>")
    } else {
        None
    };
    match replacement {
        Some(r) => core.replacen(bare, r, 1),
        None => strip_location(&core.replace('\\', "/")),
    }
}

/// `archivo.ts:38:5` → `archivo.ts`; `archivo.ts(38,5):` → `archivo.ts`.
fn strip_location(token: &str) -> String {
    let mut s = token.trim_end_matches(':').to_string();

    if let Some(open) = s.rfind('(')
        && s.ends_with(')')
        && s[open + 1..s.len() - 1]
            .chars()
            .all(|c| c.is_ascii_digit() || c == ',')
        && open > 0
    {
        s.truncate(open);
    }

    loop {
        match s.rfind(':') {
            Some(i) if i + 1 < s.len() && s[i + 1..].chars().all(|c| c.is_ascii_digit()) => {
                // No cortar la unidad de Windows (`c:`): solo números tras los dos puntos.
                s.truncate(i);
            }
            _ => break,
        }
    }
    s
}

fn is_temp_path(token: &str) -> bool {
    let t = token.replace('\\', "/");
    t.contains("/appdata/local/temp/") || t.starts_with("/tmp/") || t.contains("/var/folders/")
}

fn is_time(token: &str) -> bool {
    let t = token.trim_end_matches(|c: char| !c.is_ascii_digit());
    let parts: Vec<&str> = t.split(':').collect();
    (parts.len() == 2 || parts.len() == 3)
        && parts
            .iter()
            .all(|p| (1..=2).contains(&p.len()) && p.chars().all(|c| c.is_ascii_digit()))
}

fn is_date(token: &str) -> bool {
    let b = token.as_bytes();
    b.len() >= 10
        && b[..4].iter().all(u8::is_ascii_digit)
        && b[4] == b'-'
        && b[5..7].iter().all(u8::is_ascii_digit)
        && b[7] == b'-'
        && b[8..10].iter().all(u8::is_ascii_digit)
}

/// UUID o identificador hexadecimal largo (hashes de commit, IDs de sesión).
fn is_id(token: &str) -> bool {
    let b = token.as_bytes();
    let is_uuid = b.len() == 36
        && b.iter().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => *c == b'-',
            _ => c.is_ascii_hexdigit(),
        });
    if is_uuid {
        return true;
    }
    let hex_or_dash = token.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    let hex_len = token.chars().filter(char::is_ascii_hexdigit).count();
    let has_digit = token.chars().any(|c| c.is_ascii_digit());
    let has_letter = token.chars().any(|c| c.is_ascii_alphabetic());
    hex_or_dash && hex_len >= 7 && has_digit && has_letter
}

fn fnv1a(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fp(path: &str, message: &str) -> Fingerprint {
        Fingerprint::new(CardKind::Error, SourceKind::Command, Some(path), message)
    }

    #[test]
    fn same_error_on_another_line_is_the_same_card() {
        assert_eq!(
            fp(
                "components/ecf/estado.tsx:38",
                "components/ecf/estado.tsx(38,5): error TS2339: Property 'estado' does not exist"
            ),
            fp(
                "components/ecf/estado.tsx:41",
                "components/ecf/estado.tsx(41,9): error TS2339: Property 'estado' does not exist"
            ),
        );
    }

    #[test]
    fn a_different_error_code_is_a_different_card() {
        assert_ne!(
            fp("a.ts", "error TS2339: Property 'x' does not exist"),
            fp("a.ts", "error TS2304: Cannot find name 'x'"),
        );
    }

    #[test]
    fn windows_and_unix_paths_match() {
        assert_eq!(
            fp(r"Components\Ecf\Estado.tsx", "falla"),
            fp("components/ecf/estado.tsx", "falla")
        );
    }

    #[test]
    fn times_dates_ids_and_temp_paths_are_ignored() {
        assert_eq!(
            normalize_message(
                "build failed at 14:52:07 on 2026-11-08T14:52 in C:\\Users\\U\\AppData\\Local\\Temp\\x1\\out.log (session 3ee6d09d-1a88-430b-ad98-41254031eed8, commit 6d22581)"
            ),
            normalize_message(
                "Build failed at 09:03 on 2026-11-09 in C:\\Users\\U\\AppData\\Local\\Temp\\zz\\out.log (session 11111111-2222-4333-8444-555555555555, commit a1b2c3d)"
            ),
        );
    }

    #[test]
    fn line_numbers_after_the_word_line_are_ignored() {
        assert_eq!(
            normalize_message("unexpected token at line 12"),
            normalize_message("Unexpected token at line 340")
        );
    }

    #[test]
    fn source_and_kind_are_part_of_the_identity() {
        let as_error = Fingerprint::new(CardKind::Error, SourceKind::Session, None, "falta X");
        let as_task = Fingerprint::new(CardKind::Task, SourceKind::Session, None, "falta X");
        assert_ne!(as_error, as_task);
    }

    #[test]
    fn fingerprint_is_stable_across_versions() {
        // Si esta prueba falla, cambió la normalización: los usuarios verían tarjetas
        // duplicadas. Hace falta una migración antes de cambiar el valor esperado.
        let f = Fingerprint::new(
            CardKind::Error,
            SourceKind::Command,
            Some("src/main.rs"),
            "error[E0425]: cannot find value `x` in this scope",
        );
        assert_eq!(f.as_str(), "15f47d110a22cd40");
        assert_eq!(
            f,
            Fingerprint::new(
                CardKind::Error,
                SourceKind::Command,
                Some("src/main.rs:10:5"),
                "error[E0425]: cannot find value `x` in this scope",
            )
        );
    }
}
