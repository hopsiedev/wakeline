//! Lectores de la salida de los comandos: un error por tarjeta, con `archivo:línea` (Q46).
//!
//! - `tsc`: formato sin colores, `ruta(línea,col): error TS2304: mensaje`.
//! - `cargo`: líneas JSON de `--message-format=json` (solo nivel `error`).
//! - `eslint`: salida de `-f json` (solo severidad 2).
//! - `raw`: no lee nada; el comando fallido da una sola tarjeta.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParserKind {
    Tsc,
    Cargo,
    Eslint,
    #[default]
    Raw,
}

/// Un error leído de la salida. La ruta es tal como la escribe la herramienta.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedError {
    pub path: Option<String>,
    pub line: Option<usize>,
    pub message: String,
}

pub fn parse(kind: ParserKind, output: &str) -> Vec<ParsedError> {
    match kind {
        ParserKind::Tsc => parse_tsc(output),
        ParserKind::Cargo => parse_cargo(output),
        ParserKind::Eslint => parse_eslint(output),
        ParserKind::Raw => Vec::new(),
    }
}

fn parse_tsc(output: &str) -> Vec<ParsedError> {
    let mut out = Vec::new();
    for line in output.lines() {
        let line = line.trim_end();
        // `src/a.ts(3,7): error TS2304: Cannot find name 'x'.`
        if let Some((location, rest)) = line.split_once("): error ")
            && let Some((path, position)) = location.rsplit_once('(')
        {
            let line_number = position.split(',').next().and_then(|n| n.parse().ok());
            out.push(ParsedError {
                path: Some(path.trim().to_string()),
                line: line_number,
                message: rest.trim().to_string(),
            });
        } else if let Some(rest) = line.strip_prefix("error TS") {
            // Errores sin archivo, por ejemplo de configuración.
            out.push(ParsedError {
                path: None,
                line: None,
                message: format!("TS{}", rest.trim()),
            });
        }
    }
    out
}

#[derive(Deserialize)]
struct CargoLine {
    reason: String,
    message: Option<CargoMessage>,
}

#[derive(Deserialize)]
struct CargoMessage {
    level: String,
    message: String,
    code: Option<CargoCode>,
    #[serde(default)]
    spans: Vec<CargoSpan>,
}

#[derive(Deserialize)]
struct CargoCode {
    code: String,
}

#[derive(Deserialize)]
struct CargoSpan {
    file_name: String,
    line_start: usize,
    is_primary: bool,
}

fn parse_cargo(output: &str) -> Vec<ParsedError> {
    let mut out = Vec::new();
    for line in output.lines() {
        let Ok(parsed) = serde_json::from_str::<CargoLine>(line) else {
            continue;
        };
        let Some(message) = parsed.message else {
            continue;
        };
        if parsed.reason != "compiler-message" || message.level != "error" {
            continue;
        }
        // El resumen «could not compile» no tiene spans y repite lo anterior.
        let Some(span) = message.spans.iter().find(|s| s.is_primary) else {
            continue;
        };
        let text = match message.code {
            Some(code) => format!("{}: {}", code.code, message.message),
            None => message.message,
        };
        out.push(ParsedError {
            path: Some(span.file_name.clone()),
            line: Some(span.line_start),
            message: text,
        });
    }
    out
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EslintFile {
    file_path: String,
    #[serde(default)]
    messages: Vec<EslintMessage>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EslintMessage {
    severity: u8,
    message: String,
    line: Option<usize>,
    rule_id: Option<String>,
}

fn parse_eslint(output: &str) -> Vec<ParsedError> {
    // npm puede escribir líneas antes del JSON; se busca el arreglo.
    let Some(start) = output.find('[') else {
        return Vec::new();
    };
    let Some(end) = output.rfind(']') else {
        return Vec::new();
    };
    let Ok(files) = serde_json::from_str::<Vec<EslintFile>>(&output[start..=end]) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for file in files {
        for message in file.messages.into_iter().filter(|m| m.severity == 2) {
            let text = match message.rule_id {
                Some(rule) => format!("{}: {}", rule, message.message),
                None => message.message,
            };
            out.push(ParsedError {
                path: Some(file.file_path.clone()),
                line: message.line,
                message: text,
            });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_tsc_errors_with_file_and_line() {
        let output = "src/app.ts(3,7): error TS2304: Cannot find name 'x'.\n\
                      src/b.tsx(10,1): warning nada\n\
                      error TS5023: Unknown compiler option 'foo'.\n\
                      Found 2 errors.\n";
        let errors = parse(ParserKind::Tsc, output);
        assert_eq!(errors.len(), 2);
        assert_eq!(errors[0].path.as_deref(), Some("src/app.ts"));
        assert_eq!(errors[0].line, Some(3));
        assert_eq!(errors[0].message, "TS2304: Cannot find name 'x'.");
        assert_eq!(errors[1].path, None);
        assert!(errors[1].message.starts_with("TS5023"));
    }

    #[test]
    fn reads_cargo_json_errors_only() {
        let output = concat!(
            r#"{"reason":"compiler-artifact","target":{}}"#,
            "\n",
            r#"{"reason":"compiler-message","message":{"level":"warning","message":"unused","code":null,"spans":[{"file_name":"src/a.rs","line_start":1,"is_primary":true}]}}"#,
            "\n",
            r#"{"reason":"compiler-message","message":{"level":"error","message":"cannot find value `x`","code":{"code":"E0425"},"spans":[{"file_name":"src/lib.rs","line_start":12,"is_primary":true}]}}"#,
            "\n",
            r#"{"reason":"compiler-message","message":{"level":"error","message":"could not compile","code":null,"spans":[]}}"#,
            "\n",
        );
        let errors = parse(ParserKind::Cargo, output);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].path.as_deref(), Some("src/lib.rs"));
        assert_eq!(errors[0].line, Some(12));
        assert_eq!(errors[0].message, "E0425: cannot find value `x`");
    }

    #[test]
    fn reads_eslint_json_errors_only() {
        let output = r#"> lint
[{"filePath":"C:\\p\\src\\a.ts","messages":[
  {"severity":1,"message":"aviso","line":1,"ruleId":"no-console"},
  {"severity":2,"message":"'x' is not defined.","line":4,"ruleId":"no-undef"}
]}]"#;
        let errors = parse(ParserKind::Eslint, output);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].path.as_deref(), Some(r"C:\p\src\a.ts"));
        assert_eq!(errors[0].line, Some(4));
        assert_eq!(errors[0].message, "no-undef: 'x' is not defined.");
    }

    #[test]
    fn raw_reads_nothing() {
        assert!(parse(ParserKind::Raw, "error: algo").is_empty());
    }
}
