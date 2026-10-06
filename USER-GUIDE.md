# MeshDrop Go — User Guide

Direct, end-to-end-encrypted file transfer, folder sharing and sync between your
own devices — no cloud, no accounts. Files go device-to-device; nothing is stored
on a server.

This guide covers **installation** and **configuration** for the desktop app, the
Android app, and the headless CLI/Docker deployment for NAS and servers.

---

## 1. Install

### Desktop (Windows / macOS / Linux)
1. Download the latest installer from the releases page:
   `https://github.com/aamirali51/meshdrop-releases/releases/latest`
   - Windows: `MeshDrop-Setup-<version>.exe` (or the `-portable.exe`)
   - macOS: `.dmg` (Apple silicon = `arm64`, Intel = `x64`)
   - Linux: `.AppImage`
2. Install and open **MeshDrop Go**. It creates an identity on first run — no
   sign-up.
3. Updates are automatic (the app checks the release feed and offers the update).

### Android
- Download `MeshDrop-<version>.apk` from the same releases page and install it
  (enable "install unknown apps" for your browser/files app if prompted).
- Updates are offered in-app; the app downloads the new APK and hands off to the
  Android installer.

### Command line (CLI) — Windows, macOS, Linux
Requires **Node 18+**. Install Node first, then the CLI:

| OS | Install Node 18+ | Install the CLI |
|---|---|---|
| **Windows** | `winget install OpenJS.NodeJS.LTS` (or nodejs.org installer), then open a **new** PowerShell | `npm install -g @meshdrop-go/host` |
| **macOS** | `brew install node` (or nvm) | `npm install -g @meshdrop-go/host` |
| **Linux** | nvm, NodeSource, or your distro's `nodejs`/`npm` package | `npm install -g @meshdrop-go/host` (may need sudo, or a user prefix) |

```sh
npm install -g @meshdrop-go/host   &&   mesh version
```
- **Windows:** if `mesh` isn't recognised, add `%AppData%\npm` to PATH and reopen the terminal.
- **macOS:** on an `EACCES` error, use nvm or `npm config set prefix ~/.npm-global` — don't use sudo.
- **No global install?** `npx @meshdrop-go/host status` runs it once without installing.
- **Upgrade:** `npm install -g @meshdrop-go/host@latest` (or `mesh update`). **Remove:** `npm rm -g @meshdrop-go/host`.
- Then, on any always-on machine: `mesh service install` (systemd / launchd / Windows logon task).

### NAS / server (Docker) — recommended for always-on boxes
No Node needed — the image bundles everything.
```sh
docker run -d --name meshdrop --network host \
  -e PUID=1000 -e PGID=1000 -e MESHDROP_HOST_NAME=nas \
  -v ./meshdrop-data:/data -v ./meshdrop-downloads:/downloads \
  --restart unless-stopped ghcr.io/aamirali51/meshdrop-host:latest
```
Or use the repo's `docker-compose.yml` (`docker compose up -d`).
> **Host networking is required** (`network_mode: host`). Docker's default bridge
> hides the real LAN address, which breaks local peer discovery and slows
> transfers. See §8.

---

## 2. Pair your own devices (optional, for direct send + sync)

Pairing lets two of *your* devices talk to each other directly.

1. On device A: **Devices → Pair device**. Note the code (e.g.
   `MD-1234-5678-9ABC-DEF0`) or show the QR.
2. On device B: **Devices → Pair device → Enter code** (or scan the QR).
3. Both devices now appear in the **Share** list and can be used for Send and Sync.

On the same Wi-Fi they connect automatically (LAN discovery). Across networks
they connect through the DHT and, if needed, a relay.

Command line:
```sh
mesh whoami              # shows this device's pairing code
mesh pair MD-1234-5678-9ABC-DEF0
```

---

## 3. Send a file or folder to a device

**GUI:** **Share → pick the device → choose files/folder → Send.** The receiver
approves the transfer, then it runs peer-to-peer.

**CLI:**
```sh
mesh send ./report.pdf --to laptop
mesh ls devices          # find the name/id to use with --to
mesh ls transfers        # watch progress
```

---

## 4. Share a link anyone can use (Drop code)

No pairing required — the other side just needs the code.

**GUI:** **Share → Get a link/code.** Choose how long it lasts and how many
downloads:
- **Expiration:** 5 min → 7 days, or **Never** (a permanent link).
- **Max downloads:** a limit, or unlimited.

**CLI:**
```sh
mesh drop ./recipes --never              # permanent link
mesh drop ./backup.tar --days 7 --max 3
mesh ls drops                            # active links
mesh revoke DROP-5SEG-6QAD --yes         # cancel one
mesh extend DROP-5SEG-6QAD --minutes 60  # add time
```

**Receive a code** (GUI: **Receive → paste the code**; CLI:)
```sh
mesh peek DROP-5SEG-6QAD                 # is it online? shows the file list, no download
mesh get  DROP-5SEG-6QAD                 # download it (waits until finished)
```
Received files land in your downloads folder (configurable — §7/§8).

---

## 5. Sync folders (two-way)

**GUI:** **Sync → Add folder → pick the device → choose direction.** Changes then
propagate automatically.

**CLI:**
```sh
mesh sync add ~/Projects --to nas
mesh ls sync
mesh sync pause <id>   ·   mesh sync resume <id>
mesh ls invites        ·   mesh sync accept <id>
```

---

## 6. Shared Folders (publish a folder as a private site)

Serve a folder over the mesh; visitors with the code browse and download it.

```sh
mesh site publish ./portfolio --name portfolio
mesh ls sites
mesh site rm <siteId>
```

---

## 7. Watch Party & Tunnels

- **Watch Party** — watch a video in sync: **Watch Party → Create** (pick a file),
  others **Join** with the code (`mesh party create movie.mp4` / `mesh party join <code>`).
- **Tunnels** — expose a local port to others: `mesh tunnel open --port 8080`,
  they run `mesh tunnel join <code>`.

---

## 8. Run on a NAS / server

### Option A — Docker (Synology, QNAP, unRAID, any Linux host)
`docker-compose.yml`:
```yaml
services:
  meshdrop:
    image: ghcr.io/aamirali51/meshdrop-host:latest
    container_name: meshdrop
    network_mode: host            # REQUIRED
    environment:
      - PUID=1000                 # match your host user (NAS convention)
      - PGID=1000
      - MESHDROP_HOST_PORT=41990
      - MESHDROP_HOST_NAME=nas
    volumes:
      - ./meshdrop-data:/data             # identity + config + logs — BACK THIS UP
      - ./meshdrop-downloads:/downloads   # received files
      - /volume1/share:/share:ro          # optional: folders to publish/send
    restart: unless-stopped
```
```sh
docker compose up -d
docker compose logs -f              # or: mesh logs --follow
```

### Option B — Node service (Linux systemd / macOS launchd / Windows)
```sh
npm i -g @meshdrop-go/host
mesh service install --name nas        # user systemd unit (or launchd/Task)
mesh service install --system          # system-wide (needs root)
mesh service status
mesh logs --follow
mesh service uninstall --yes
```
Preview before touching anything: `mesh service install --dry-run`.

---

## 9. Configuration reference

Defaults live in `<store>/config.json` (store default: `~/.meshdrop-host`;
`/data` in Docker). CLI flags and environment variables override the file.

| Setting | config.json | Environment | Flag | Default |
|---|---|---|---|---|
| Store / identity | — | `MESHDROP_HOST_STORAGE` | `--storage` | `~/.meshdrop-host` |
| Downloads | `downloads` | `MESHDROP_HOST_DOWNLOADS` | `--downloads` | `~/Downloads` |
| Port | `port` | `MESHDROP_HOST_PORT` | `--port` | `41990` |
| Device name | `name` | `MESHDROP_HOST_NAME` | `--name` | hostname |
| Bind address | `bind` | `MESHDROP_HOST_BIND` | `--bind` | `127.0.0.1` |
| Profile | `profile` | — | `--profile` | `desktop` (`server` = bigger windows) |

**Security note:** the API is loopback-only by default and token-authed
(`<store>/api-token`). Binding to a LAN address (`--bind 0.0.0.0`) exposes it —
the token is then the only gate; prefer a VPN or reverse proxy for remote access.

---

## 10. Monitoring

- **Health:** `GET /health` → `{"ok":true}`
- **Metrics (Prometheus):** `GET /metrics` → `meshdrop_up`, `meshdrop_peers`,
  `meshdrop_dht_nodes`, `meshdrop_active_transfers`, `meshdrop_shares`,
  `meshdrop_sites`, `meshdrop_uptime_seconds`.
- **Logs:** `<store>/host.log` (`mesh logs --follow`).
- **Self-check:** `mesh doctor`.

---

## 11. Command-line cheat sheet

```
mesh status [--watch]                 peers, connection, transfers
mesh whoami                           this device + pairing code
mesh doctor                           diagnostics
mesh ls devices|peers|drops|transfers|sync|sites|tunnels|rooms|invites
mesh send <path…> --to <peer>         send to a device
mesh drop <path…> [--never|--days N]  create a share link
mesh get <code>   ·  mesh peek <code> receive / check a link
mesh pair <code>  ·  mesh unpair <peer>
mesh sync add|rm|pause|resume|run|accept|decline
mesh site publish|rm  ·  mesh tunnel open|close|join  ·  mesh party create|join|leave
mesh watch <dir> [--to <peer>|--as site]   folder automation
mesh config get|set                   engine settings
mesh logs [--follow]  ·  mesh events  ·  mesh update
mesh service install|status|uninstall
mesh host [--name <n>] [--profile server] [--bind <addr>]
```
Every command supports `--json`; `mesh commands --json` lists them all;
`mesh help` is the built-in cheat sheet.

---

## 12. Troubleshooting

| Symptom | Fix |
|---|---|
| A code says "offline" | The sender's app/host must be running and the code unexpired (`mesh peek <code>`). |
| Device not showing up | Both online? Same network helps (LAN discovery). Give the DHT a few seconds. |
| "store already owned" | A host is already running on that store — use it (`mesh --host … --token …`) or a different `--store`. Stale locks reclaim automatically. |
| Received files: where? | The downloads folder (Settings → download folder, or `downloads` in config.json). |
| Docker: peers not found | Use `network_mode: host`. |
| Update check | `mesh update` (desktop/Android update in-app). |

---

## 13. Privacy & security

- Connections are **end-to-end encrypted**; the relay only helps peers find each
  other and never sees file contents.
- No accounts, no telemetry; your identity and keys live only in your store.
- **Back up your store** (`/data`, `~/.meshdrop-host`) — it holds your identity,
  config and log.
