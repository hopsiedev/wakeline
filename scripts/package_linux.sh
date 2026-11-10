#!/usr/bin/env bash
set -euo pipefail
version=$(node -p "require('./apps/desktop/src-tauri/tauri.conf.json').version")
commit=$(git rev-parse HEAD)
mkdir -p packages
cp target/release/bundle/appimage/*.AppImage target/release/bundle/deb/*.deb packages/
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
cp target/release/bundle/appimage/*.AppImage target/release/wakeline LICENSE-MIT THIRD_PARTY_LICENSES.md "$stage/"
cp RELEASE.md "$stage/README.md"
printf '{"version":"%s","commit":"%s","platform":"linux-x64"}\n' "$version" "$commit" > "$stage/build-info-linux-x64.json"
tar -czf "packages/Wakeline_${version}_linux-x64.tar.gz" -C "$stage" .
cp "$stage/build-info-linux-x64.json" packages/
(cd packages && sha256sum -- *.AppImage *.deb *.tar.gz > SHA256SUMS)
