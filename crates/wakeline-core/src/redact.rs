//! Oculta secretos antes de guardar texto de una sesión. Las sesiones de IA a veces
//! contienen claves pegadas por el usuario o impresas por un comando.

/// Prefijos de tokens conocidos. Lo que sigue al prefijo se oculta.
const TOKEN_PREFIXES: &[&str] = &[
    "sk-ant-",
    "sk-proj-",
    "sk-",
    "ghp_",
    "gho_",
    "ghs_",
    "ghu_",
    "github_pat_",
    "glpat-",
    "xoxb-",
    "xoxp-",
    "AKIA",
    "AIza",
    "pk_live_",
    "sk_live_",
    "rk_live_",
    "whsec_",
];

/// Palabras que, seguidas de `=` o `:`, anuncian un secreto (`API_KEY=...`).
const SECRET_KEYS: &[&str] = &[
    "password",
    "passwd",
    "secret",
    "token",
    "api_key",
    "apikey",
    "api-key",
    "private_key",
];

pub fn redact(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for (i, word) in text.split(' ').enumerate() {
        if i > 0 {
            out.push(' ');
        }
        out.push_str(&redact_word(word));
    }
    out
}

fn redact_word(word: &str) -> String {
    if let Some(rest) = word.strip_prefix("Bearer:") {
        return format!("Bearer:{}", mask(rest));
    }
    for prefix in TOKEN_PREFIXES {
        if let Some(pos) = word.find(prefix) {
            let tail = &word[pos + prefix.len()..];
            let secret_len = tail
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
                .count();
            if secret_len >= 12 {
                let end = pos + prefix.len() + secret_len;
                return format!("{}{}••••{}", &word[..pos], prefix, &word[end..]);
            }
        }
    }
    let lower = word.to_ascii_lowercase();
    for key in SECRET_KEYS {
        if let Some(pos) = lower.find(key) {
            let after = pos + key.len();
            let rest = &word[after..];
            if let Some(value) = rest.strip_prefix('=').or_else(|| rest.strip_prefix(':')) {
                let value = value.trim_matches(|c| c == '"' || c == '\'');
                if value.len() >= 6 {
                    return format!("{}=••••", &word[..after]);
                }
            }
        }
    }
    word.to_string()
}

fn mask(value: &str) -> String {
    if value.len() >= 8 {
        "••••".into()
    } else {
        value.into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hides_known_token_formats() {
        let text = "usa ghp_abcdefghijklmnop1234 y sk-ant-api03-AAAABBBBCCCCDDDD";
        let out = redact(text);
        assert!(!out.contains("abcdefghijklmnop1234"));
        assert!(!out.contains("AAAABBBBCCCCDDDD"));
        assert!(out.contains("ghp_••••"));
    }

    #[test]
    fn hides_assigned_secrets() {
        let out = redact("DATABASE_PASSWORD=hunter2hunter2 listo");
        assert_eq!(out, "DATABASE_PASSWORD=•••• listo");
    }

    #[test]
    fn leaves_normal_text_alone() {
        let text = "falta probar la caja sin conexión; el token de perfil se firma en el servidor";
        assert_eq!(redact(text), text);
    }
}
