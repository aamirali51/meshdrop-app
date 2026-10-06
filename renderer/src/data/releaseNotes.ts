export interface ReleaseNoteItem {
  version: string
  title: string
  date: string
  features: {
    title: string
    description: string
    icon: 'folder' | 'zap' | 'shield' | 'sparkles'
  }[]
}

export const LATEST_RELEASE_NOTES: ReleaseNoteItem = {
  version: '1.0.69',
  title: "What's New in MeshDrop Go",
  date: 'September 2026',
  features: [
    {
      icon: 'sparkles',
      title: 'Expanded Guide + Full-Width Layout',
      description:
        'The in-app Guide now covers installing the mesh CLI on Windows, macOS, Linux and NAS/Docker, and pages fill the whole window when you maximise it.'
    },
    {
      icon: 'sparkles',
      title: 'In-App Guide + mesh CLI',
      description:
        'A new Guide in the app walks through every feature step by step, and MeshDrop now ships a headless host and a `mesh` command-line client for servers, NAS boxes and scripts — install it with npm i -g @meshdrop-go/host.'
    },
    {
      icon: 'zap',
      title: 'Never-Expiring Links Fixed',
      description:
        'Choosing the "Never" expiration for a Drop Code now truly creates a permanent link. It was silently falling back to a 30-minute expiry, so the share appeared with a countdown.'
    },
    {
      icon: 'sparkles',
      title: 'UI Consistency Pass',
      description:
        'Unified colors, corner radii, typography and media playback surfaces across the app. Edge-to-edge screens, sheets and the bottom dock now respect the device safe area.'
    },
    {
      icon: 'shield',
      title: 'Desktop Launch Fix',
      description:
        'Fixed a startup failure on Windows, macOS and Linux where the packaged app could not load the P2P engine’s runtime modules and showed a “Cannot find module” error on launch.'
    },
    {
      icon: 'sparkles',
      title: 'Non-Expiring Share Links',
      description:
        'Drop Codes and shared folders can now be set to never expire — pick "Never" in the expiration presets to create a permanent link you can share anytime.'
    },
    {
      icon: 'folder',
      title: 'Folder Browsing & Selective Download',
      description:
        'When receiving a shared folder via Drop Code, you can now peruse all files, view individual file sizes, and selectively download only the files you want or grab the entire folder.'
    },
    {
      icon: 'zap',
      title: 'Ultra-Fast P2P Block Streaming',
      description:
        'Optimized direct peer-to-peer chunking and adaptive socket buffers for high-speed local Wi-Fi and direct DHT file transfers.'
    },
    {
      icon: 'shield',
      title: 'Enhanced End-to-End Privacy',
      description:
        'Direct Noise-protocol authenticated transfers with zero cloud logging, zero trackers, and automatic one-time code expiration.'
    }
  ]
}
