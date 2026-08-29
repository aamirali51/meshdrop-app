# Bundled ffmpeg / ffprobe (watch-party remux)

These binaries power the watch-party **remux** path: when a viewer's device
cannot direct-play a file's container (e.g. an MKV on a phone that only
demuxes MP4), the host stream-copies the video track into MP4 (`-c:v copy`,
audio rebuilt with ffmpeg's built-in AAC encoder) so the viewer gets bytes it
can actually play. Nothing is re-encoded, so no GPU and near-zero CPU.

**Licensing:** every build below is **LGPL** — no GPL-triggering encoders
(x264/x265/xvid are disabled in the build config). MeshDrop only stream-copies
video and encodes AAC (built-in, not libfdk), so LGPL suffices and the MIT
posture stays clean. See `electron/remux.js` for how they're located at runtime.

**They are not committed** (~535 MB total). Fetch and verify them with:

```bash
node scripts/fetch-ffmpeg.js          # all platforms
node scripts/fetch-ffmpeg.js win32    # just one
```

The script downloads the pinned releases below, verifies SHA-256 against the
published checksums, and extracts only `ffmpeg`/`ffprobe` into this directory.
Set `FETCH_FFMPEG_FORCE=1` to re-download. CI runs this before every release
build, and `forge.config.js` ships the dir via `extraResource`.

## Pinned sources (reproducible)

| Platform | Source | Release | Asset | SHA-256 |
|---|---|---|---|---|
| win32 | BtbN/FFmpeg-Builds | autobuild-2026-08-28-17-08 | ffmpeg-n9.0.1-11-ge47273f4d9-win64-lgpl-9.0.zip | a9db905a…3f9d6e |
| linux | BtbN/FFmpeg-Builds | autobuild-2026-08-28-17-08 | ffmpeg-n9.0.1-11-ge47273f4d9-linux64-lgpl-9.0.tar.xz | 52a6a62d…66da70 |
| darwin | EricEngineering/ffmpeg-macos-lgpl | ffmpeg-7.1-r2 | ffmpeg-macos-lgpl-universal2.tar.gz | c725431e…bf1194 |

The darwin build is universal2 (arm64 + x86_64 in one binary). BtbN publishes
no macOS builds; the EricEngineering LGPL universal2 build covers both Mac
architectures. If a pinned release is ever taken down, bump the URL and digest
in `scripts/fetch-ffmpeg.js` (full digests are in the script's `SOURCES` map).

## Runtime layout

`electron/remux.js` resolves, in order:

1. `MESHDROP_FFMPEG` / `MESHDROP_FFPROBE` env overrides
2. `<app resources>/ffmpeg/<platform>/` (packaged via `extraResource`)
3. `<repo>/vendor/ffmpeg/<platform>/` (dev checkout, populated by this script)

Without the binaries the app still works: capability negotiation degrades to
direct-play-or-refuse with a clear reason (no silent black screens).
