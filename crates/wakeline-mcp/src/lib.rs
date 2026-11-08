//! Servidor MCP de Wakeline. Permite que el agente de IA consulte el backlog y
//! cierre tarjetas desde el chat. Nunca borra: no existe una herramienta de borrado.
//!
//! La implementación con `rmcp` llega después del lector de sesiones.

/// Herramientas que expondrá el servidor, en este orden.
pub const TOOL_NAMES: [&str; 4] = ["list_cards", "get_card", "create_card", "complete_card"];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn there_is_no_delete_tool() {
        assert!(TOOL_NAMES.iter().all(|name| !name.contains("delete")));
    }
}
