<p align="center">
  <img src="design/logo/wakeline-icon.png" width="96" alt="Wakeline">
</p>

<h1 align="center">Wakeline</h1>

<p align="center"><b>La estela que deja tu IA, convertida en una lista de tareas.</b></p>

<p align="center"><a href="README.md">English</a> · Español</p>

---

Wakeline es una app de escritorio para Windows, rápida y local, que vigila los
proyectos que construyes con agentes de IA. Lee lo que van dejando y lo convierte en
tres tipos de tarjeta:

- **Errores:** fallos de tipos, CI rojo en un pull request, errores de herramientas de la IA.
- **Tareas:** lo que la IA dijo que quedaba pendiente, comentarios `TODO`/`FIXME`, issues abiertos.
- **Ideas:** funciones que la IA propuso y nadie hizo todavía.

> **Estado:** en desarrollo (0.1 en curso). Aún no hay versión publicada.

## Cómo funciona

| Fuente | Qué lee Wakeline |
| --- | --- |
| Tu código | Comentarios `TODO` / `FIXME`, git y los comandos que configures (por ejemplo `npm run typecheck`) |
| Sesiones de IA | Registros de Claude Code (`~/.claude/projects`). Cursor, Antigravity y OpenCode llegan en la 0.2 |
| Documentos | Las especificaciones y hojas de ruta que le indiques |
| GitHub | Pull requests e issues, solo lectura, con tu sesión de `gh` |

El mismo problema visto en varios sitios es **una sola tarjeta** con varios orígenes.
Por ejemplo, un error de tipos en una rama y el CI rojo del pull request de esa rama.

## Principios

- **Local.** Todo se guarda en SQLite en tu equipo.
- **Sin IA obligatoria.** Las reglas funcionan sin conexión. El LLM es opcional, viene
  desactivado y se recomienda Ollama (local).
- **No toca secretos.** Una lista fija de exclusiones (`.env`, almacenes de credenciales,
  tokens de sesión) que no se puede desactivar.
- **Rápida.** Núcleo en Rust. La meta es leer 500 MB de sesiones en menos de 30 s y, en
  reposo, usar menos de 1% de CPU y menos de 100 MB de RAM.

## Estructura

```
crates/
  wakeline-core   # fuentes, tarjetas, deduplicación, almacenamiento
  wakeline-cli    # `wakeline scan`, `wakeline watch`, `wakeline export`
  wakeline-mcp    # servidor MCP para que tu agente lea y cierre tarjetas
apps/
  desktop         # Tauri v2 + React + MUI (basado en Minimal UI, MIT)
design/           # maquetas y logo
docs/             # notas de diseño
```

## Desarrollo

Requisitos: Rust (estable), Node.js 20+ y WebView2 (viene con Windows 11).

```bash
cargo test --workspace          # pruebas del núcleo y la CLI
cargo run -p wakeline-cli -- --help

cd apps/desktop
npm install
npm run tauri dev               # app de escritorio
```

## Licencia

Doble licencia [MIT](LICENSE-MIT) o [Apache 2.0](LICENSE-APACHE), a tu elección.

La interfaz se basa en [Minimal UI Kit](https://github.com/minimal-ui-kit/material-kit-react)
(edición gratuita, MIT). Ver [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
