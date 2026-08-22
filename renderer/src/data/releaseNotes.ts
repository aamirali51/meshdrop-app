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
  version: '1.0.38',
  title: "What's New in MeshDrop",
  date: 'August 2026',
  features: [
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
