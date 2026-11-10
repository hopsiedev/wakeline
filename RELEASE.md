# Wakeline — Windows and Linux / Windows y Linux

Wakeline is dual-licensed under MIT OR Apache-2.0. No commercial signing certificate
is required. Third-party notices are included. / Wakeline usa MIT O Apache-2.0 e
incluye los avisos de terceros. No requiere un certificado comercial.

## Windows x64 (ZIP)

Extract the entire ZIP into a writable folder and run `wakeline-app.exe`.
Keep `wakeline.exe` and `wakeline-portable.json` next to the app. The CLI provides
MCP (`wakeline.exe mcp`). Microsoft Edge WebView2 Runtime must already be installed:
https://developer.microsoft.com/microsoft-edge/webview2/

Extrae todo el ZIP en una carpeta con permiso de escritura y abre `wakeline-app.exe`.
Conserva `wakeline.exe` y `wakeline-portable.json` junto a la app. La CLI permite usar
MCP (`wakeline.exe mcp`). Es necesario tener instalado WebView2 Runtime.

The executables are unsigned; Windows may display an unknown publisher warning.
ZIP packaging does not suppress Windows security checks.
Los ejecutables no tienen certificado comercial y Windows puede mostrar un aviso.

## Linux x64 (Ubuntu 22.04+ / Debian 12+)

- AppImage: `chmod +x Wakeline_*.AppImage`, then open it. FUSE 2 may be required;
  if unavailable, use `./Wakeline_*.AppImage --appimage-extract-and-run`.
- DEB: install using `sudo apt install ./Wakeline_*.deb`. The CLI is installed as
  `/usr/bin/wakeline` and the desktop launcher opens Wakeline.
- For AppImage with MCP, extract the accompanying Linux archive and keep the
  `wakeline` CLI beside the AppImage, in a stable location. Do not configure MCP
  against a temporary `/tmp/.mount_*` path.
- Closing the Linux window exits the app. Tray support depends on the desktop.
- Resuming Claude uses `x-terminal-emulator`; install Claude Code separately.
  GitHub integration requires GitHub CLI and your own `gh auth login` session.

AppImage: marca el archivo como ejecutable y ábrelo. Si necesitas MCP, extrae el
archivo Linux que incluye la CLI y mantenla junto al AppImage. El DEB instala la
CLI automáticamente. Al cerrar la ventana de Linux, la aplicación termina.

## Updates / Actualizaciones

These initial packages use manual updates. Download only from:
https://github.com/hopsiedev/wakeline/releases

Exit Wakeline before replacing files. For ZIP/AppImage, extract the new release to
a separate folder, keeping the CLI beside the app; for DEB install the newer package.
Local state stays in `%APPDATA%\wakeline` on Windows and `$HOME/wakeline` on Linux.
The ZIP does not write a state file beside the executable. Never copy personal
state or Claude sessions into a release package.

Estas primeras versiones se actualizan manualmente. Cierra Wakeline, descarga la
versión nueva y extrae sus archivos en otra carpeta; para DEB, instala el paquete
nuevo. Tus carpetas vigiladas y decisiones se conservan en los datos locales.

SHA-256 checksums and build metadata identify each release's exact source commit.
Las sumas SHA-256 y los metadatos identifican el commit exacto de cada compilación.

## Release status / Estado del lanzamiento

Build and startup checks do not replace real desktop testing. The design's pilot
period and full desktop memory measurements remain release gates. A draft or a CI
artifact is a review build, not an announcement of stable support on every distro.

Las comprobaciones de CI no sustituyen el piloto ni las pruebas en escritorios
reales. Los artefactos y borradores sirven para revisar el lanzamiento.
