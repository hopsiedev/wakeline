# Wakeline: Windows and Linux

Wakeline is dual-licensed under MIT OR Apache-2.0, at your option. Third-party
license notices are included. No commercial signing certificate is required.

Download published packages from [GitHub Releases](https://github.com/hopsiedev/wakeline/releases).

## Windows x64 (ZIP)

Extract the entire ZIP into a writable folder and run `wakeline-app.exe`.
Keep `wakeline.exe` and `wakeline-portable.json` beside the app. The CLI provides
MCP through `wakeline.exe mcp`.

[Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
must already be installed. The executables are unsigned; Windows may display an
unknown publisher warning. ZIP packaging does not suppress Windows security checks.

## Linux x64 (Ubuntu 22.04+ / Debian 12+)

- AppImage: run `chmod +x Wakeline_*.AppImage`, then open it. FUSE 2 may be required;
  if unavailable, use `./Wakeline_*.AppImage --appimage-extract-and-run`.
- DEB: install using `sudo apt install ./Wakeline_*.deb`. The CLI is installed as
  `/usr/bin/wakeline`, and the desktop launcher opens Wakeline.
- For AppImage with MCP, extract the accompanying Linux archive and keep the
  `wakeline` CLI beside the AppImage in a stable location. Do not configure MCP
  against a temporary `/tmp/.mount_*` path.
- Closing the Linux window exits the app. Tray support depends on the desktop.
- Resuming Claude uses `x-terminal-emulator`; install Claude Code separately.
  GitHub integration requires GitHub CLI and your own `gh auth login` session.

## Manual updates

These initial packages use manual updates. Exit Wakeline before replacing files.
For ZIP/AppImage, extract the new release into a separate folder, keeping the CLI
beside the app. For DEB, install the newer package through the package manager.

Local state stays in `%APPDATA%\wakeline` on Windows and `$HOME/wakeline` on Linux.
The ZIP does not write a state file beside the executable. Never copy personal
state or Claude sessions into a release package.

SHA-256 checksums and build metadata identify each release's exact source commit.

## Build and publication

Pull requests and pushes to `main` run checks and build review artifacts for both
platforms. Version tags run the release workflow and create a draft with packages;
the workflow never publishes it automatically. The tag must match the app version.

Review the packages, checksums, and commit metadata before publishing a draft.
Automatic updater signing and `latest.json` are reserved for a future release;
the current manual packages do not require signing secrets.

## Remaining validation

Build and startup checks do not replace real desktop testing. Version 0.1.1 has
been published, while manual update and data preservation testing, real Linux
desktop validation, full application resource measurements, and the pilot period
remain open in [the project backlog](docs/TODO.md). A passing X11 smoke test does
not establish support for every Linux distribution or desktop.
