# TODO: Wakeline

Manually maintained project backlog. Completed release work is recorded below;
remaining validation is tracked separately.

## Tasks

- [ ] Configure free signing for future automatic updates _(Distribution: after manual releases)_
  - Done when: tauri.conf.json contains a valid public key and the maintainer configures signing secrets in Actions. No private key is stored in the repository.
- [x] Publish a verifiable, traceable release _(Windows and Linux distribution)_
  - Completed: [v0.1.1](https://github.com/hopsiedev/wakeline/releases/tag/v0.1.1) provides Windows ZIP, Linux AppImage/DEB, the Linux CLI archive, SHA-256 checksums, and metadata for verified commit `9d396884e7cc1f70ec55e3a58b387bc05b42a967`. Tauri signing and latest.json are requirements for future automatic updates, not these manual packages.
- [ ] Verify manual updates and data preservation _(ZIP, AppImage, and DEB)_
  - Done when: replacing an earlier version as described in RELEASE.md preserves watched folders and decisions. ZIP updates never launch MSI; DEB updates use the package manager. The app identifies its current version and links to downloads.
- [ ] Validate Linux on real desktops _(Ubuntu 22.04+ and Debian 12+)_
  - Done when: folder selection, watching, MCP, GitHub, copying, notifications, and closing the app are tested on real X11/Wayland desktops. The CI X11 startup smoke test does not replace this validation.
- [ ] Measure full application idle resource usage _(Step 8: performance)_
  - Done when: reproducible CPU and RAM measurements cover open and minimized windows, including WebView2. Document the scope of the CPU < 1% and RAM < 100 MB budgets, and resolve or document deviations.
- [ ] Complete the Contastack pilot _(Original 0.1 release criterion)_
  - Done when: two weeks of daily use are recorded with fewer than 20% of cards dismissed. Track and resolve or document any remaining issues; this criterion remains open after the 0.1.1 publication.

## Ideas

- [ ] Prepare macOS distribution _(After Windows and Linux)_
  - Done when: a macOS runner builds a downloadable DMG, with platform-specific installation and update verification.
