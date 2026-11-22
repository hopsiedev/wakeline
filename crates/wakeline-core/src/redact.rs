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

/// Lo que la palabra anterior anuncia sobre la siguiente (`password: valor`, `token = valor`).
#[derive(Clone, Copy, PartialEq)]
enum Pending {
    None,
    /// Terminó en una clave (`password`): falta ver si sigue un `=` o un `:`.
    Separator,
    /// Terminó en clave y separador (`password:`): la siguiente palabra es el valor.
    Value,
}

pub fn redact(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut pending = Pending::None;
    for (i, word) in text.split(' ').enumerate() {
        if i > 0 {
            out.push(' ');
        }
        // Varios espacios seguidos no cambian lo que se espera.
        if word.is_empty() {
            continue;
        }
        match std::mem::replace(&mut pending, Pending::None) {
            Pending::Value => {
                if let Some(masked) = mask_spaced_value(word) {
                    out.push_str(&masked);
                    // Si la palabra seguía en otra línea, esa parte puede anunciar otro secreto.
                    if word.contains(LINE_BREAKS) {
                        pending = announces(word);
                    }
                    continue;
                }
            }
            Pending::Separator if matches!(word, "=" | ":" | ":=" | "=>") => {
                out.push_str(word);
                pending = Pending::Value;
                continue;
            }
            _ => {}
        }
        out.push_str(&redact_word(word));
        pending = announces(word);
    }
    out
}

/// Una palabra puede traer varias líneas: solo se parte por espacios.
const LINE_BREAKS: [char; 3] = ['\n', '\r', '\t'];
const QUOTES: [char; 3] = ['"', '\'', '`'];

/// Mira si la palabra termina en una clave de [`SECRET_KEYS`], con o sin separador
/// (`password`, `DB_PASSWORD:`, `"api_key":`, `token=`).
fn announces(word: &str) -> Pending {
    let tail = word
        .rsplit(LINE_BREAKS)
        .next()
        .unwrap_or(word)
        .to_ascii_lowercase();
    let (name, has_separator) = match [":=", "=>", ":", "="]
        .iter()
        .find_map(|separator| tail.strip_suffix(separator))
    {
        Some(name) => (name, true),
        None => (tail.as_str(), false),
    };
    let name = name.trim_end_matches(QUOTES);
    if !SECRET_KEYS.iter().any(|key| name.ends_with(key)) {
        return Pending::None;
    }
    if has_separator {
        Pending::Value
    } else {
        Pending::Separator
    }
}

/// Oculta el valor escrito tras `clave: ` o `clave = `, conservando comillas y puntuación.
/// `None` si no parece un secreto; lo que venga en líneas siguientes se revisa aparte.
fn mask_spaced_value(word: &str) -> Option<String> {
    let (head, rest) = match word.find(LINE_BREAKS) {
        Some(pos) => word.split_at(pos),
        None => (word, ""),
    };
    let unquoted = head.strip_prefix(QUOTES).unwrap_or(head);
    // También se recorta lo que cierra el objeto o la lista (`"valor"}`, `"valor"],`).
    let value = unquoted
        .trim_end_matches(|c| QUOTES.contains(&c) || matches!(c, ',' | ';' | '}' | ']' | ')'));
    if !looks_secret(value) {
        return None;
    }
    let opening = &head[..head.len() - unquoted.len()];
    let closing = &unquoted[value.len()..];
    let rest = if rest.is_empty() {
        String::new()
    } else {
        redact_word(rest)
    };
    Some(format!("{opening}••••{closing}{rest}"))
}

/// El código está lleno de `token: string` y `password = hash(entrada)`. Tras un espacio
/// solo se oculta lo que parece un secreto escrito tal cual: sin paréntesis ni corchetes
/// y con algún dígito o símbolo.
fn looks_secret(value: &str) -> bool {
    value.len() >= 6
        && !value.contains(['(', ')', '[', ']', '{', '}', '<', '>'])
        && value
            .chars()
            .any(|c| c.is_ascii_digit() || matches!(c, '@' | '#' | '$' | '%' | '!'))
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
    fn hides_secrets_written_after_a_space() {
        assert_eq!(
            redact("password: hunter2hunter2 listo"),
            "password: •••• listo"
        );
        assert_eq!(redact("API_KEY = \"abc123def456\";"), "API_KEY = \"••••\";");
        assert_eq!(redact("token  :=  'P@ssword!'"), "token  :=  '••••'");
        assert_eq!(
            redact("{\"client_secret\": \"s3cr3t-value\", \"name\": \"demo\"}"),
            "{\"client_secret\": \"••••\", \"name\": \"demo\"}"
        );
        // El secreto es la última clave del objeto o de la lista.
        assert_eq!(
            redact("{\"name\": \"demo\", \"client_secret\": \"s3cr3t-value\"}"),
            "{\"name\": \"demo\", \"client_secret\": \"••••\"}"
        );
        assert_eq!(
            redact("[{\"api_key\": \"abc123def456\"}]"),
            "[{\"api_key\": \"••••\"}]"
        );
        // El operador va pegado a la clave.
        assert_eq!(redact("token:= 'P@ssword!'"), "token:= '••••'");
        assert_eq!(redact("secret=> \"abc123def456\","), "secret=> \"••••\",");
    }

    #[test]
    fn spaced_secrets_keep_the_following_lines() {
        let out = redact("+DB_PASSWORD: hunter2hunter2\n+PORT: 5432\n+API_KEY: abc123def456\n fin");
        assert_eq!(out, "+DB_PASSWORD: ••••\n+PORT: 5432\n+API_KEY: ••••\n fin");
    }

    #[test]
    fn leaves_code_after_a_secret_key_alone() {
        for text in [
            "password: string;",
            "token: Option<String>,",
            "const token = await getToken();",
            "const password = hashPassword(input1);",
            "\"password\": \"Password\",",
            "\"token\": \"Your token is ready\",",
            "secret: false",
            "max_tokens: 100000",
            "el token : caduca pronto",
        ] {
            assert_eq!(redact(text), text);
        }
    }

    #[test]
    fn leaves_normal_text_alone() {
        let text = "falta probar la caja sin conexión; el token de perfil se firma en el servidor";
        assert_eq!(redact(text), text);
    }
}
