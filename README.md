<p align="center">
  <img src="assets/brand/wakeline-icon.png" width="96" alt="Wakeline">
</p>

<h1 align="center">Wakeline</h1>

<p align="center"><b>A pending-work inbox for the projects you build with AI agents.</b></p>

<p align="center">English · <a href="README.es.md">Español</a></p>

---

Wakeline is a Windows desktop app that watches the project folders you choose and gathers the errors, tasks, and ideas left behind in your AI coding sessions and repository docs into cards.

Each card keeps its origin (the session, the command that failed, or the file where it was found) and follows a simple workflow: accept it, mark it as done, or dismiss it. Wakeline organizes what needs your attention; it does not edit your code on its own, and it only scans the folders you select.

## Why use Wakeline

When you work across several projects or run multiple AI sessions a day, unfinished work gets buried fast:

- A command fails three times in the middle of a long terminal session, you move on to something else, and an hour later you cannot remember which file broke.
- An agent finishes a feature and notes at the end of its reply that edge-case validation is still pending. Once you close that terminal tab, the note is gone.
- Follow-up tasks end up split between `README.md`, roadmap notes, and chat histories across different repositories.

Wakeline reads those traces in the background and puts them in one inbox, grouping repeated failures into a single card so the same error does not clutter your list ten times.

## Use cases

### 1. Pick up a failing file without digging through terminal history

Say a type check fails in `app/layout.tsx` while running `npm run typecheck` during an AI session. Instead of scrolling through hundreds of lines of terminal output to find which session hit the error, you open the card in Wakeline, review the context and how many times it happened, and jump straight to the file in VS Code or resume that Claude session.

### 2. Catch follow-ups the agent left for later

You often ask an agent to solve one part of a problem and leave the rest for later. When the agent mentions pending work or suggests a follow-up idea in its reply, Wakeline turns it into a task or idea card tied to that project folder and branch.

### 3. Switch between projects without losing track

If you bounce between a web app, an Expo mobile project, and a Rust workspace, you can add just those folders in Settings. Wakeline ignores the rest of your disk, groups cards by project, and sends a Windows tray notification only when a new error card appears.

### 4. Work through cards from chat with MCP

Wakeline includes an MCP server (`wakeline mcp`) over `stdio`. Once connected to Claude Code, Codex, or Antigravity, you can ask your agent in chat:

> "Check the open cards for this project and help me fix the error in `app/layout.tsx`."

The agent can query your inbox (`list_cards`, `get_card`), log a new item (`create_card`), or mark a card done (`complete_card`) once you finish. By design, there is no delete tool: an agent can never wipe your card history.

## What it reads today (and what it doesn't)

| Source | What Wakeline collects |
| --- | --- |
| Claude Code sessions | Repeated tool/command errors and pending work or ideas mentioned in `~/.claude/projects` sessions whose working directory belongs to your watched folders |
| Project docs | Pending items, known gaps, and roadmap sections in Markdown files (`README`, `ROADMAP`, `TODO`, `docs/*.md`) inside your selected folders |
| Manual and MCP | Cards created directly in the desktop app or through the MCP server |

**Clear boundaries:**

- **Only scans folders you select.** Until you pick a folder, Wakeline stays empty.
- **Never touches secrets.** A fixed exclusion list (`.env`, credential stores, private keys, session tokens) and a redaction filter strip sensitive tokens before any card is created.
- **Stays on your machine.** Watched folders and card statuses are saved locally in `%APPDATA%\wakeline\state.json`, and you can export open cards to `docs/TODO.md` anytime.

## Repository layout

```text
crates/
  wakeline-core   # session and doc parsers, stable fingerprints, exclusions, local state
  wakeline-cli    # CLI (`wakeline scan`, `wakeline watch`, `wakeline export`, `wakeline mcp`)
  wakeline-mcp    # stdio MCP server (list_cards, get_card, create_card, complete_card)
apps/
  desktop         # Windows desktop app (Tauri v2 + React + MUI)
assets/brand/     # app icons
```

## Development

Requirements on Windows 11: Rust (stable), Node.js 20+, and WebView2.

```bash
# Run core, CLI, and MCP tests
cargo test -p wakeline-core -p wakeline-cli -p wakeline-mcp

# Run the CLI or start the MCP server
cargo run -p wakeline-cli -- --help

# Start the desktop app in development mode
cd apps/desktop
npm install
npm run tauri dev
```

## License

Dual-licensed under [MIT](LICENSE-MIT) or [Apache 2.0](LICENSE-APACHE), at your option.

The desktop interface is based on [Minimal UI Kit](https://github.com/minimal-ui-kit/material-kit-react) (free edition, MIT). See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
