//! Reglas sin IA para sacar tareas e ideas del texto final de una sesión.
//!
//! Solo se mira la respuesta con la que la IA cierra un turno (`end_turn`): la
//! narración intermedia («ahora falta X») casi siempre se resuelve en el mismo turno
//! y daría ruido.

use crate::card::CardKind;

/// Frases que anuncian una idea (algo que se podría hacer).
const IDEA_PHRASES: &[&str] = &[
    "podríamos añadir",
    "podríamos agregar",
    "podríamos hacer",
    "sería bueno",
    "se podría añadir",
    "se podría agregar",
    "más adelante se puede",
    "más adelante podríamos",
    "valdría la pena",
    "como mejora",
    "we could add",
    "could also add",
    "it would be nice",
    "nice to have",
    "a future improvement",
];

/// Frases que solo cuentan cuando abren la oración (evita tomar «documentos pendientes:»
/// o «commits pendientes:» como tareas).
const TASK_STARTERS: &[&str] = &[
    "pendiente:",
    "pendientes:",
    "lo pendiente:",
    "lo que sigue pendiente:",
    "lo que queda pendiente:",
    "prueba pendiente:",
    "todo:",
    "follow-up:",
];

/// Frases que anuncian algo pendiente o sin verificar en cualquier parte de la oración.
const TASK_PHRASES: &[&str] = &[
    "queda pendiente",
    "quedan pendientes",
    "quedan dos pendientes",
    "sigue pendiente",
    "siguen pendientes",
    "falta probar",
    "falta revisar",
    "falta implementar",
    "falta añadir",
    "falta conectar",
    "falta pasarlo",
    "no pude probar",
    "no pude comprobar",
    "no pude verificar",
    "no pude confirmar",
    "brecha conocida",
    "brechas conocidas",
    "still pending",
    "left to do",
    "still need to",
    "couldn't test",
    "couldn't verify",
    "couldn't run",
    "could not test",
    "could not verify",
    "could not run",
    "not yet implemented",
    "known gap",
    "follow up later",
];

/// Frases donde «pendiente» es del dominio contable o del propio cuestionario de diseño.
const NOISE_PATTERNS: &[&str] = &[
    "rd$",
    "us$",
    "saldo pendiente",
    "monto pendiente",
    "pago pendiente",
    "cobro pendiente",
    "cuenta pendiente",
    "cuánto queda pendiente",
    "ronda 2 (",
    "siguen pendientes.",
    "lo que sigue pendiente",
    "lo que queda pendiente (",
    "es la parte que no pude comprobar",
];

/// Una tarea o idea encontrada en el texto.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Finding {
    pub kind: CardKind,
    /// La frase completa donde apareció, limpia de Markdown.
    pub text: String,
}

const MAX_LEN: usize = 240;

pub fn find_in_assistant_text(text: &str) -> Vec<Finding> {
    let mut findings = Vec::new();
    let mut in_code = false;

    for line in text.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") {
            in_code = !in_code;
            continue;
        }
        if in_code || trimmed.starts_with('#') || trimmed.contains('❓') {
            continue;
        }
        for sentence in split_sentences(line) {
            let clean = clean_markdown(sentence);
            if clean.chars().count() < 16 {
                continue;
            }
            let lower = clean.to_lowercase();
            if is_noise_sentence(&clean, &lower) {
                continue;
            }
            let unquoted = strip_guillemets(&lower);
            let kind = if IDEA_PHRASES.iter().any(|p| unquoted.contains(p)) {
                CardKind::Idea
            } else if TASK_STARTERS.iter().any(|p| unquoted.starts_with(p))
                || TASK_PHRASES.iter().any(|p| unquoted.contains(p))
            {
                CardKind::Task
            } else {
                continue;
            };
            if !findings.iter().any(|f: &Finding| f.text == clean) {
                findings.push(Finding { kind, text: clean });
            }
        }
    }
    findings
}

fn is_noise_sentence(clean: &str, lower: &str) -> bool {
    if clean.ends_with('?') || clean.ends_with(':') || clean.starts_with('¿') {
        return true;
    }
    if NOISE_PATTERNS.iter().any(|p| lower.contains(p)) {
        return true;
    }
    clean.chars().next().is_some_and(|c| c.is_lowercase())
}

/// Quita el texto entre comillas (`«...»` o `"..."`) para no disparar reglas cuando la IA
/// menciona una frase literal de la interfaz o un ejemplo.
fn strip_guillemets(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_guillemet = false;
    let mut in_double = false;
    let has_even_quotes = s.chars().filter(|&c| c == '"').count() >= 2;
    for c in s.chars() {
        match c {
            '«' => in_guillemet = true,
            '»' => in_guillemet = false,
            '"' if has_even_quotes => in_double = !in_double,
            _ if !in_guillemet && !in_double => out.push(c),
            _ => {}
        }
    }
    out
}

fn split_sentences(line: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut start = 0;
    let bytes = line.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        let ends = matches!(b, b'.' | b'!' | b'?')
            && bytes.get(i + 1).is_none_or(|n| n.is_ascii_whitespace());
        if ends {
            out.push(&line[start..=i]);
            start = i + 1;
        }
    }
    if start < line.len() {
        out.push(&line[start..]);
    }
    out.into_iter()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect()
}

fn clean_markdown(sentence: &str) -> String {
    let s = sentence
        .trim()
        .trim_start_matches(['-', '*', '>', '#', ' '])
        .trim_start_matches(|c: char| c.is_ascii_digit() || c == '.' || c == ')')
        .trim();
    let s: String = s.chars().filter(|c| !matches!(c, '*' | '`')).collect();
    let s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if s.chars().count() > MAX_LEN {
        let cut: String = s.chars().take(MAX_LEN - 1).collect();
        format!("{cut}…")
    } else {
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_pending_work_and_ideas_in_spanish() {
        let text = "Listo, la caja ya funciona.\n\n\
                    - **Queda pendiente** probar la caja sin conexión en el móvil.\n\
                    - Podríamos añadir un aviso cuando el NCF esté por agotarse.";
        let found = find_in_assistant_text(text);
        assert_eq!(
            found,
            vec![
                Finding {
                    kind: CardKind::Task,
                    text: "Queda pendiente probar la caja sin conexión en el móvil.".into()
                },
                Finding {
                    kind: CardKind::Idea,
                    text: "Podríamos añadir un aviso cuando el NCF esté por agotarse.".into()
                },
            ]
        );
    }

    #[test]
    fn finds_english_phrases() {
        let found = find_in_assistant_text(
            "Done. I couldn't run the e2e tests because the browser is missing.",
        );
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].kind, CardKind::Task);
    }

    #[test]
    fn ignores_code_blocks() {
        let text = "Ejemplo:\n```rust\n// TODO: falta probar esto\n```\nTodo listo.";
        assert!(find_in_assistant_text(text).is_empty());
    }

    #[test]
    fn ignores_text_without_signals() {
        assert!(find_in_assistant_text("Hice el cambio y pasan las pruebas.").is_empty());
    }

    #[test]
    fn repeated_sentences_are_reported_once() {
        let text = "Queda pendiente probar en Windows.\nQueda pendiente probar en Windows.";
        assert_eq!(find_in_assistant_text(text).len(), 1);
    }

    #[test]
    fn ignores_questions_and_accounting_balances() {
        let text = "Saldo pendiente: una barra verde que se recalcula.\n\
                    Se pasa con RD$20,000 y queda pendiente por RD$40,000.\n\
                    Sigue pendiente tu respuesta: ¿debe mostrar el menú?\n\
                    ❓ Q12 - ¿Contastack es el proyecto piloto? Sigue pendiente.";
        assert!(find_in_assistant_text(text).is_empty());
    }
}
