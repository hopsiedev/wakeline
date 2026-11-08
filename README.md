<p align="center">
  <img src="design/logo/wakeline-icon.png" width="96" alt="Wakeline">
</p>

<h1 align="center">Wakeline</h1>

<p align="center"><b>The wake your AI leaves behind, turned into a to-do list.</b></p>

<p align="center">English · <a href="README.es.md">Español</a></p>

---

Wakeline is a fast, local-first desktop app for Windows that watches the projects
you build with AI coding agents. It reads what they leave behind and turns it into
three kinds of cards:

- **Errors**: failing type checks, red CI on a pull request, tool errors the agent hit.
- **Tasks**: what the agent said was still pending, `TODO`/`FIXME` comments, open issues.
- **Ideas**: features the agent proposed and nobody built yet.

> **Status:** early development (0.1 in progress). Nothing is released yet.

## How it works

| Source | What Wakeline reads |
| --- | --- |
| Your code | `TODO` / `FIXME` comments, git, and the commands you configure (for example `npm run typecheck`) |
| AI sessions | Claude Code session logs (`~/.claude/projects`). Cursor, Antigravity and OpenCode are planned for 0.2 |
| Docs | Specs and roadmap files you point it to |
| GitHub | Pull requests and issues, read-only, through your existing `gh` login |

The same problem seen in several places becomes **one card** with several sources.
For example, a type error on a branch and the red CI of that branch's pull request.

## Principles

- **Local first.** Everything is stored in SQLite on your machine.
- **No AI required.** The rules work offline. An LLM is optional, off by default,
  and Ollama (local) is the recommended choice.
- **Never touches secrets.** A fixed exclusion list (`.env`, credential stores,
  session tokens) cannot be turned off.
- **Fast.** Rust core. The goal is to read 500 MB of sessions in under 30 s and stay
  under 1% CPU and 100 MB of RAM when idle.

## Project layout

```
crates/
  wakeline-core   # sources, cards, deduplication, storage
  wakeline-cli    # `wakeline scan`, `wakeline watch`, `wakeline export`
  wakeline-mcp    # MCP server so your AI agent can read and close cards
apps/
  desktop         # Tauri v2 + React + MUI (based on Minimal UI, MIT)
design/           # mockups and logo
docs/             # design notes
```

## Development

Requirements: Rust (stable), Node.js 20+, and WebView2 (included in Windows 11).

```bash
cargo test --workspace          # core and CLI tests
cargo run -p wakeline-cli -- --help

cd apps/desktop
npm install
npm run tauri dev               # desktop app
```

## License

Dual-licensed under [MIT](LICENSE-MIT) or [Apache 2.0](LICENSE-APACHE), at your option.

The desktop UI is based on [Minimal UI Kit](https://github.com/minimal-ui-kit/material-kit-react)
(free edition, MIT). See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
