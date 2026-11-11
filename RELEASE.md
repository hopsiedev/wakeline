# Wakeline: Windows and Linux

Wakeline is licensed under the MIT License. Third-party
license notices are included. No commercial signing certificate is required.

Download published packages from [GitHub Releases](https://github.com/hopsiedev/wakeline/releases).

## Windows x64 (installer)

Run `Wakeline_*_x64-setup.exe`. It installs Wakeline for the current user, with
`wakeline.exe` beside the app for MCP. Installed copies check after one minute and
every six hours, install new signed versions and restart automatically. To check
immediately, choose Check for updates in the account menu or Settings > Updates.
The updater downloads `latest.json` from the
latest published release and only installs an installer signed with Wakeline's key.

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

ZIP, AppImage and DEB packages use manual updates. Exit Wakeline before replacing files.
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
The release workflow signs the Windows installer with the `TAURI_SIGNING_PRIVATE_KEY`
repository secrets and writes `latest.json`. Installed copies see the update only
after the draft is published.

## Validation and preserved data

Version 0.1.7 keeps the existing app identifier and state path. Automated upgrade tests cover a private copy of the previous installed state across two save/load cycles, preserving existing fields. Existing WebView workflow/preferences have regression tests. Keep a backup and do not delete your user profile during an update.

The repository runs frontend tests, Rust tests, formatting, lint, clippy, package regressions, and Windows/Linux package builds. Linux smoke checks cover an X11 environment; desktop tray and notification behavior still depends on the user's distribution and permissions. See [0.1.6 release notes](RELEASE-NOTES.md) and the usage guides in [English](README.md) and [Spanish](README.es.md).
