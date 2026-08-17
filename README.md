# MeshDrop

**Zero-cloud P2P file sharing.** Direct, end-to-end encrypted file transfers between your own devices. No accounts, no cloud, no size limits.

![MeshDrop Interface](images/screenshot.png)

---

## Ecosystem

This repository contains the desktop (Electron) and mobile (React Native) clients. The P2P engine lives in a separate public repo so it can be reused independently.

| Repository | Visibility | Contents |
|------------|-----------|----------|
| **meshdrop-app** (this repo) | Private | Desktop + mobile clients |
| [meshdrop-core](https://github.com/aamirali51/meshdrop-core) | Public | P2P engine — `@mesh/core` |
| [meshdrop-releases](https://github.com/aamirali51/meshdrop-releases) | Public | Release artifacts for the auto-updater |

---

## Features

- **Zero-Cloud & E2EE** — Direct peer-to-peer file transfers encrypted with Noise protocol (`Noise_XX_25519_ChaChaPoly_BLAKE2b`). No third-party server ever touches your files or metadata.
- **Code-Based & QR Pairing** — Connect devices using short `MD-` pairing codes or QR scans. Trust is verified via HMAC-SHA256 challenge-response without transmitting raw codes.
- **One-Time Anonymous Drops** — Send files instantly using single-use `DROP-` codes without pairing devices beforehand.
- **LAN & Internet Routing** — Automatic local network peer discovery via mDNS/LAN broadcast, with seamless public DHT fallback and TCP relay tunnelling for restrictive NATs.
- **Resumable Chunked Transfers** — Chunk-scheduled transfers with per-block and whole-file SHA-256 verification. Interrupted transfers resume automatically from the last verified block.
- **Portable Mode with Custom Install** — Run as a single-file portable executable (`MeshDrop-<version>-portable.exe`) with an interactive **Install to Folder** option:
  - Custom target directory picker
  - Desktop shortcut creation
  - Start Menu integration
  - Windows Auto-Start option
- **System Tray & Window Management** — Runs smoothly in the background system tray. Double-clicking desktop icons or tray notifications restores and focuses the app instantly.
- **Incoming Approval Gate** — Optional manual acceptance holds incoming file requests until explicitly accepted.

---

## Architecture

```mermaid
graph TD
    R["Renderer - React UI"] <-->|gated IPC| M["Electron Main Process"]
    M -->|owns MeshEngine in-process| C["@mesh/core"]
    C <-->|hyperswarm| N["DHT / LAN Peers"]
    C <-->|corestore| S[("Hyperbee Storage")]
    C -.->|same engine| RN["MeshDrop Mobile - Node threads"]
```

- **`@mesh/core`** ([meshdrop-core](https://github.com/aamirali51/meshdrop-core)) — The standalone, platform-agnostic P2P networking and transfer engine. Zero Electron or DOM dependencies. Runs in-process on Desktop and via Node threads on mobile.
- **Desktop Application (`electron/`, `renderer/`)** — Glassmorphic React UI built with TypeScript, Vite, and Tailwind CSS, connected to main process IPC bridges (`contextIsolation` enabled).

---

## Supported Platforms

| Platform | Distribution Format | Status |
| :--- | :--- | :--- |
| **Windows** | NSIS Installer (`.exe`), Single-File Portable (`.exe`) | ✅ v1.0.14 |
| **macOS** | DMG Package (`.dmg`, arm64) | ✅ v1.0.14 |
| **Linux** | AppImage (`.AppImage`, x86_64) | ✅ v1.0.14 |
| **Android** | React Native APK (`.apk`) | ✅ v1.0.14 |

Pre-built downloads: [GitHub Releases](https://github.com/aamirali51/meshdrop-releases/releases)

---

## Development Setup

Prerequisites: Node.js 20+.

Clone both repos as siblings:

```bash
git clone https://github.com/aamirali51/meshdrop-app.git
git clone https://github.com/aamirali51/meshdrop-core.git
cd meshdrop-app
npm install
```

```bash
# Start local development server (Vite + Electron)
npm run dev

# Run side-by-side local P2P instances for testing
npm run dev:p2p

# Run end-to-end engine test suite
npm test
```

The relative paths `../../meshdrop-core` in `electron/engine.js`, `electron/handlers.js`, and `file:../../meshdrop-core` in `meshdrop-mobile-rn81/package.json` resolve from this sibling layout.

---

## Packaging & Building

```bash
# Package production build locally (NSIS + DMG + AppImage in dist/)
npm run build:pack

# Package & upload to GitHub Releases (requires GH_TOKEN)
npm run build:release
```

Generated build outputs in `dist/`:
- `MeshDrop-Setup-<version>.exe` (Windows — NSIS installer)
- `MeshDrop-<version>-portable.exe` (Windows — single-file portable)
- `MeshDrop-<version>-mac-arm64.dmg` (macOS — Apple Silicon)
- `MeshDrop-<version>-linux-x86_64.AppImage` (Linux)

All artifacts are published to [meshdrop-releases](https://github.com/aamirali51/meshdrop-releases/releases).

---

## CI/CD

The GitHub Actions workflow (`.github/workflows/release.yml`) triggers on `v*` tags and:

1. Builds desktop apps for Windows, macOS, and Linux in parallel
2. Publishes artifacts to the `meshdrop-releases` GitHub Release
3. Signs portable builds with `MESHDROP_UPDATE_KEY` (if configured)
4. Builds the Android APK and attaches it to the same release

Required secrets in this repo:

| Secret | Purpose |
|--------|---------|
| `RELEASES_PAT` | Classic PAT with `repo` scope — uploads artifacts to `meshdrop-releases` |
| `MESHDROP_UPDATE_KEY` | Ed25519 private key — signs portable APK/exe for integrity verification (optional) |

---

## Contributing

MeshDrop is open source — bug reports, documentation, UI polish, and engine
improvements are all welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the
dev setup, contribution workflow, and our DCO sign-off requirement.

---

## License & Trademark

MeshDrop is **open source** under the **[MIT License](LICENSE)** (SPDX: `MIT`). The entire
codebase — the `@mesh/core` engine, the desktop application, and packaging code —
is free to use, modify, and distribute, including commercially.

The **"MeshDrop" name, logo, and icons are protected trademarks** of the copyright holder and
are governed by the [Trademark Policy](TRADEMARK_POLICY.md) — a separate document from the MIT
License. You may fork and reuse all of the code freely, but you may not ship derivative products
under the MeshDrop name or brand without written permission.
