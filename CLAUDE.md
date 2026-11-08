# Wakeline: guía para Claude

Lee `docs/diseno.md` antes de cambiar algo: ahí están las decisiones cerradas. Si una
regla cambia, actualiza primero ese archivo y después el código y las pruebas.

## Qué es
App de escritorio open source para Windows que vigila proyectos hechos con IA y genera
tarjetas de Error, Tarea e Idea a partir del código, las sesiones de Claude Code, los
documentos y GitHub. Núcleo en Rust, interfaz en Tauri v2 + React + MUI.

## Comandos
```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cd apps/desktop && npm run build        # frontend
cd apps/desktop && npm run tauri dev    # app completa
```
Antes de cada commit deben pasar fmt, clippy y los tests. Antes de cada push, lo mismo
que corre el CI (`.github/workflows/ci.yml`): no se sube si algo falla.

## Entorno
- Windows. La toolchain por defecto es `stable-x86_64-pc-windows-gnu` con el gcc de
  MSYS2; no hay Visual Studio Build Tools instalados.
- Usa `python` (no `python3`). Para editar archivos usa Edit y Write; los heredoc con
  apóstrofes fallan en este entorno.
- Los archivos usan CRLF en Windows (`core.autocrlf=true`).

## Reglas de trabajo
- Todo entra por PR: rama, `gh pr create`, CI en verde y `gh pr merge --merge`. Nunca push
  directo a `main` ni `--force`.
- El usuario escribe en español; responde en español, directo.
- No pidas ni aceptes tokens o contraseñas en el chat.
- Commits pequeños, con la línea `Co-Authored-By` de la sesión.

## Arquitectura (no romper)
- **Local primero:** los datos viven en SQLite en `%APPDATA%\wakeline`.
- **Nunca leer secretos:** las exclusiones fijas de `docs/diseno.md` no se pueden
  desactivar ni saltar, tampoco en pruebas.
- **Solo lectura con GitHub:** Wakeline no escribe en GitHub en la 0.1.
- **Solo comandos configurados:** nunca ejecutes nada que no esté en `wakeline.toml`.
- **Huellas estables:** cambiar la normalización de mensajes rompe la deduplicación
  de los usuarios; hazlo con pruebas y con migración.
- **Sesiones en streaming:** jamás cargar un `.jsonl` entero en memoria (hay archivos de
  más de 60 MB).
- **Antes de usar una API de una biblioteca, compruébala en el código instalado** (en
  `~/.cargo/registry` o `node_modules`); no la escribas de memoria.

## Interfaz
- Basada en la edición gratuita MIT de Minimal UI Kit. No uses código de la versión de
  pago: su licencia prohíbe redistribuirlo.
- Fondo: degradado `#131313` → `#050505`; tarjetas `#1B1B1B`. Nada azulado.
- Todos los textos en `es.json` y `en.json`; ningún texto fijo en los componentes.
