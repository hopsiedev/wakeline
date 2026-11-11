//! Optional provider configuration, with no credential fields.
use serde::{Deserialize, Serialize};
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub mode: String,
    pub endpoint: String,
    pub model: String,
}

pub fn validate(config: &Config) -> Result<(), String> {
    if !["off", "ollama", "api"].contains(&config.mode.as_str()) {
        return Err("INVALID_PROVIDER".into());
    }
    if config.mode != "off"
        && (config.model.trim().is_empty()
            || !(config.endpoint.starts_with("https://")
                || config.endpoint.starts_with("http://127.0.0.1:")
                || config.endpoint.starts_with("http://localhost:")))
    {
        return Err("INVALID_PROVIDER_ENDPOINT_OR_MODEL".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_provider_without_persisting_secrets() {
        assert!(
            validate(&Config {
                mode: "off".into(),
                ..Default::default()
            })
            .is_ok()
        );
        assert!(
            validate(&Config {
                mode: "api".into(),
                endpoint: "http://external.invalid".into(),
                model: "model".into()
            })
            .is_err()
        );
        assert!(
            validate(&Config {
                mode: "api".into(),
                endpoint: "https://example.com/v1".into(),
                model: "model".into()
            })
            .is_ok()
        );
        let value = serde_json::to_value(Config {
            mode: "ollama".into(),
            endpoint: "http://localhost:11434".into(),
            model: "model".into(),
        })
        .unwrap();
        assert!(value.get("api_key").is_none());
    }
}
