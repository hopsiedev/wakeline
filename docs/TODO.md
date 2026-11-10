# TODO: Wakeline

Manually maintained project backlog. Completed release work is recorded below;
remaining validation is tracked separately.

## Tasks

- [x] Configure free signing for automatic updates _(Windows installer)_
  - Completed: tauri.conf.json contains the public key, and the signing secrets are configured in Actions. No private key is stored in the repository. [v0.1.2](https://github.com/hopsiedev/wakeline/releases/tag/v0.1.2) (commit `05cded6429dceaf9c3835d9b3b8ca2d0ba2f7983`) publishes a signed NSIS installer and latest.json; an installed 0.1.1 copy received the update notification from GitHub Releases.
- [x] Publish a verifiable, traceable release _(Windows and Linux distribution)_
  - Completed: [v0.1.1](https://github.com/hopsiedev/wakeline/releases/tag/v0.1.1) provides Windows ZIP, Linux AppImage/DEB, the Linux CLI archive, SHA-256 checksums, and metadata for verified commit `9d396884e7cc1f70ec55e3a58b387bc05b42a967`. Starting with v0.1.2, the Windows installer also updates automatically.
- [x] Verify manual updates and data preservation _(ZIP, AppImage, and DEB)_
  - Completed: the maintainer verified that replacing an earlier version as described in RELEASE.md preserves watched folders and decisions. Installer copies update automatically and are not covered by this task.
- [x] Validate Linux on real desktops _(Ubuntu 22.04+ and Debian 12+)_
  - Completed: the maintainer validated folder selection, watching, MCP, GitHub, copying, notifications, and closing the app on real desktops.
- [x] Measure full application idle resource usage _(Step 8: performance)_
  - Completed (Windows 11, v0.1.2, idle, 60 s sample on 16 cores): CPU 0% for the app and its WebView2 processes. RAM: `wakeline-app` uses 7.5 MB private memory; the six WebView2 processes add about 225 MB (233 MB private in total). The CPU < 1% budget is met. The RAM < 100 MB budget applies to the Wakeline process only; WebView2 memory is managed by the system runtime and is documented here as a deviation.
- [x] Close the Contastack pilot _(Original 0.1 release criterion)_
  - Closed: the two-week daily-use pilot is no longer a release criterion. No pilot data was recorded.

## Ideas

- [ ] Prepare macOS distribution _(After Windows and Linux)_
  - Done when: a macOS runner builds a downloadable DMG, with platform-specific installation and update verification.
