# Diseño de Wakeline 0.1

Decisiones cerradas el 2026-11-08 en una sesión de preguntas (Q1 a Q36). Si una regla
cambia, se actualiza aquí primero y luego el código.

## Qué es

App de escritorio para Windows, open source (MIT + Apache-2.0), que vigila proyectos
hechos con agentes de IA y genera tarjetas de **Error**, **Tarea** e **Idea**.
La primera versión es para uso propio, con Contastack como proyecto piloto. Se
publica tras 2 semanas de uso diario con menos del 20% de tarjetas descartadas.

## Arquitectura

| Pieza | Qué hace |
| --- | --- |
| `crates/wakeline-core` | Fuentes, detectores, tarjetas, huellas, SQLite |
| `crates/wakeline-cli` | Binario `wakeline`: `scan`, `watch`, `export`, `mcp` |
| `crates/wakeline-mcp` | Servidor MCP: `list_cards`, `get_card`, `create_card`, `complete_card` (sin borrar) |
| `apps/desktop` | Tauri v2 + React + Vite + MUI, base gratuita MIT de Minimal UI Kit |

Bibliotecas: tokio, notify, gix, rusqlite (SQLite incluido), tree-sitter, rmcp, clap,
serde, toml.

Los datos viven en SQLite en `%APPDATA%\wakeline`. La exportación a Markdown
(`docs/TODO.md`, configurable) solo se hace a mano.

## Tarjetas

- **Tipos:** Error, Tarea, Idea.
- **Estados:** nueva, aceptada, hecha, descartada.
- **Huella:** tipo + origen + archivo + mensaje normalizado, sin números de línea,
  rutas temporales, horas ni IDs. Si la huella se repite, se suma al contador.
- **Cierre automático:** solo para lo que viene de señales (por ejemplo, el error de
  `tsc` desaparece). Lo que sale de sesiones e ideas lo cierra el usuario.
- **Agrupación por rama:** el error de `tsc` y el CI rojo del PR de la misma rama son
  una sola tarjeta con dos orígenes.
- **Origen enlazado:** `archivo:línea`, commit, sesión y mensaje, PR o issue. Botones:
  abrir en VS Code, reanudar sesión (`claude --resume <id>`), copiar como prompt.

## Fuentes de la 0.1

1. **Código:** comentarios `TODO`/`FIXME` (tree-sitter) y git, en tiempo real.
2. **Comandos configurados:** se lanzan tras unos 30 s sin cambios. Tests y build
   solo cuando se piden. Nunca se ejecuta nada que no esté en `wakeline.toml`.
3. **Sesiones de Claude Code** (`~/.claude/projects/**/*.jsonl`):
   - Lectura en streaming, guardando el offset de cada archivo. Si el archivo encoge,
     se relee entero.
   - La ruta real del proyecto se toma del campo `cwd`, no del nombre de la carpeta.
   - El orden se reconstruye con `parentUuid`; los `timestamp` no son monotónicos.
   - Se incluyen los subagentes (`<sesión>/subagents/*.jsonl`).
   - Se ignoran las líneas internas (`api-request`, metadatos repetidos).
   - Primera lectura: últimos 30 días. El resto se importa a pedido.
   - Reglas sin LLM: `tool_result` con `is_error`, frases como «pendiente», «queda»,
     «no pude», «falta», «TODO», «brecha conocida», «podríamos añadir» (español e inglés).
     Un error de herramienta repetido 2 veces o más pasa a Error directamente; el resto
     llega como «nueva».
4. **Documentos:** `specs/` («Brechas conocidas») y la hoja de ruta.
5. **GitHub (opcional, solo lectura, con la sesión de `gh`):**
   - Cada 5 minutos y al hacer `git push`.
   - Issue con `bug` → Error; `enhancement` → Idea; resto → Tarea. Al cerrarse el
     issue, la tarjeta se cierra.
   - CI rojo → Error. Cambios pedidos en revisión → Tarea. PR abierto más de 7 días → aviso.

Cursor, Antigravity y OpenCode llegan en la 0.2 mediante el trait `SessionSource`.

## Seguridad y privacidad

Exclusiones fijas que no se pueden desactivar: `~/.claude/sessions/`, `**/.env*`, las
tablas `account`, `credential` y `control_account` de OpenCode. Una línea que parezca
contener una clave o token se guarda oculta.

El LLM viene desactivado. Ollama local es la opción recomendada. Una API externa exige
permiso por proyecto y se ocultan los secretos antes de enviar. El modelo de Ollama se
elige probándolo en el equipo, no de memoria.

## Interfaz

La maqueta de referencia vive fuera del repo (`design/mockup.html`, solo en local).

- **Tema oscuro:** fondo en degradado vertical `#131313` → `#050505`, tarjetas `#1B1B1B`,
  superficies `#262626`, grises neutros, acento verde `#00A76F`.
- **Barra lateral al estilo Syka Code:** logo, avisos y búsqueda arriba; Resumen,
  Tarjetas, Pull requests y Configuración; árbol de proyectos con sus ramas.
- **Cinco pantallas:** Resumen, Tarjetas (tabla o kanban), Detalle, Proyectos y
  Configuración.
- **Idiomas:** español e inglés desde la 0.1. Por defecto, el idioma del sistema.
- **Ventana y bandeja:** abre al 86 % del área de trabajo, centrada. La ✕ la esconde en la bandeja (Wakeline sigue vigilando); se cierra del todo con «Cerrar Wakeline» en la bandeja o «Salir» en la cuenta. Una sola copia: abrirla otra vez trae al frente la que ya corre. Sin menú del navegador al hacer clic derecho.
- **Avisos:** notificación de Windows solo para errores nuevos, como máximo una cada
  10 minutos. Contador en el ícono de la bandeja.

## Fuera de la 0.1

Exportar a GitHub Issues o Linear, LLM externo para resumir, macOS y Linux,
sincronización entre equipos y fuentes de sesiones distintas de Claude Code.

## Rendimiento (se mide en pruebas)

- Leer 500 MB de sesiones en menos de 30 s.
- En reposo: menos de 1% de CPU y menos de 100 MB de RAM.

## Distribución

Instalador `.msi`/NSIS de Tauri en GitHub Releases, con actualizador firmado de Tauri.
Sin firma de código de Windows por ahora.
