import { useState, type ReactNode } from 'react'
import {
  Rocket,
  Network,
  Send,
  Link2,
  RefreshCw,
  FolderKanban,
  Tv,
  GlobeLock,
  ShieldCheck,
  Keyboard,
  LifeBuoy,
  Terminal,
  ChevronRight,
  Lock,
} from 'lucide-react'
import { Card, CardContent } from '@/ui/primitives/Card'
import { Badge } from '@/ui/primitives/Badge'
import { Button } from '@/ui/primitives/Button'
import { useNavigation, isMacPlatform } from '@/hooks/useNavigation'
import type { NavRoute } from '@/types'

interface GuideStep {
  title: string
  body: string
}

interface GuideSection {
  id: string
  icon: ReactNode
  title: string
  blurb: string
  steps: GuideStep[]
  link?: { label: string; route: NavRoute }
  code?: { label: string; lines: string[] }
}

const SECTIONS: GuideSection[] = [
  {
    id: 'start',
    icon: <Rocket className="h-4 w-4" />,
    title: 'Getting started',
    blurb:
      'MeshDrop Go moves files directly between devices — no cloud, no account, no size limits. There are two ways to send something: to one of your own paired devices, or to anyone through a one-time link.',
    steps: [
      {
        title: 'Send to your own device',
        body: 'Pair two devices once, then drag files onto the Share page and pick the device. Files stream straight across, end-to-end encrypted.',
      },
      {
        title: 'Share with anyone',
        body: 'Create a Drop Code — a short link and code. The other person enters the code on their device to pull the file, no pairing required.',
      },
      {
        title: 'Both sides need the app',
        body: 'Transfers are peer-to-peer, so the sender and receiver each run MeshDrop Go. Nothing is stored on a server in between.',
      },
    ],
  },
  {
    id: 'devices',
    icon: <Network className="h-4 w-4" />,
    title: 'Pair your devices',
    blurb: 'Pairing links your own devices so they can send files and sync folders directly.',
    steps: [
      { title: 'Open Devices', body: 'Go to Devices and choose “Pair device”.' },
      {
        title: 'Exchange the code or QR',
        body: 'Show your pairing code (or QR) and enter it on the other device — or scan the QR. If both devices are on the same network, a prompt may offer to pair them on the spot.',
      },
      {
        title: 'Paired and ready',
        body: 'Once paired, the device appears in your Share list and can be used for Sync. The pairing is cryptographically verified — no shared password.',
      },
    ],
    link: { label: 'Open Devices', route: '/devices' },
  },
  {
    id: 'send',
    icon: <Send className="h-4 w-4" />,
    title: 'Send files to a device',
    blurb: 'The everyday case: move files from one of your devices to another.',
    steps: [
      { title: 'Pick the files', body: 'On the Share page, drag files in or use the share button to browse.' },
      {
        title: 'Choose the destination',
        body: 'Pick a paired device from the list. The receiver sees an approval prompt and the transfer starts on accept.',
      },
      {
        title: 'Watch progress',
        body: 'Live progress, speed and history live on the Transfers page.',
      },
    ],
    link: { label: 'Go to Share', route: '/dashboard' },
  },
  {
    id: 'drop',
    icon: <Link2 className="h-4 w-4" />,
    title: 'Drop codes (share with anyone)',
    blurb: 'A Drop Code is a one-time link. The recipient enters the code and downloads the files — no account, no pairing.',
    steps: [
      { title: 'Create the code', body: 'On the Share page choose “Get a link” / “Share a file”, select your files or a folder, then switch to the code view.' },
      {
        title: 'Choose how long it lasts',
        body: 'Expiration runs from 5 minutes to 7 days, or choose Never for a permanent link. You can also cap the number of downloads, or leave it unlimited.',
      },
      {
        title: 'Send the code',
        body: 'Copy the link or the short code (e.g. DROP-XXXX-XXXX) and pass it on however you like.',
      },
      {
        title: 'The other side claims it',
        body: 'The recipient opens Receive, enters the code, and the files come straight to them. You can revoke a code at any time from the active-shares list.',
      },
    ],
    link: { label: 'Go to Share', route: '/dashboard' },
  },
  {
    id: 'sync',
    icon: <RefreshCw className="h-4 w-4" />,
    title: 'Sync folders',
    blurb: 'Keep a folder identical across your devices — automatically, encrypted, no cloud.',
    steps: [
      { title: 'Add a folder', body: 'On Sync, add a local folder and choose the paired device to sync it with.' },
      {
        title: 'Invites',
        body: 'If the other device starts the sync, you’ll get an invite to accept or decline. Use “List invites” to find pending ones.',
      },
      {
        title: 'Control it',
        body: 'Pause, resume, or run a pass on demand. Changes made on either side flow to the other.',
      },
    ],
    link: { label: 'Open Sync', route: '/sync' },
  },
  {
    id: 'folders',
    icon: <FolderKanban className="h-4 w-4" />,
    title: 'Shared Folders',
    blurb: 'Publish a folder as a private site served over the mesh. Anyone with the code can browse and download from it.',
    steps: [
      { title: 'Publish', body: 'Open Shared Folders, publish a folder, and share the resulting code.' },
      {
        title: 'Receive one',
        body: 'Folders shared *to* you appear here too — open them to browse and download files.',
      },
      {
        title: 'Options',
        body: 'You can choose read-only or read-write and set an expiration, including Never.',
      },
    ],
    link: { label: 'Open Shared Folders', route: '/shared-folders' },
  },
  {
    id: 'party',
    icon: <Tv className="h-4 w-4" />,
    title: 'Watch Party',
    blurb: 'Watch a video together, in sync, without uploading it anywhere.',
    steps: [
      { title: 'Create a room', body: 'Share a video file and create a watch-party room. You get a room code.' },
      {
        title: 'Invite',
        body: 'Others join by entering the room code. Play, pause and seek stay in sync for everyone.',
      },
      { title: 'Optional voice', body: 'A built-in voice channel lets you talk while you watch.' },
    ],
    link: { label: 'Open Watch Party', route: '/party' },
  },
  {
    id: 'tunnels',
    icon: <GlobeLock className="h-4 w-4" />,
    title: 'Tunnels',
    blurb: 'Expose a local port (a dev server, a dashboard) through a tunnel code, without opening your firewall.',
    steps: [
      { title: 'Open a tunnel', body: 'On Tunnels, pick the local port to expose and create a tunnel code.' },
      {
        title: 'Share the code',
        body: 'Anyone with the code can connect to that port through the mesh. Close the tunnel when you’re done.',
      },
    ],
    link: { label: 'Open Tunnels', route: '/tunnels' },
  },
  {
    id: 'privacy',
    icon: <ShieldCheck className="h-4 w-4" />,
    title: 'Privacy & security',
    blurb: 'What keeps your files yours.',
    steps: [
      {
        title: 'End-to-end encrypted',
        body: 'Every connection uses the Noise protocol. Only the two devices can read the traffic — there is no server in the middle.',
      },
      {
        title: 'No cloud, no accounts, no telemetry',
        body: 'Your files and keys stay on your devices. Nothing is uploaded to us because there is no “us” server.',
      },
      { title: 'Open source', body: 'The app and engine are MIT-licensed. See the About page for the full stack.' },
    ],
    link: { label: 'About MeshDrop', route: '/about' },
  },
  {
    id: 'shortcuts',
    icon: <Keyboard className="h-4 w-4" />,
    title: 'Keyboard shortcuts',
    blurb: 'Move around without the mouse.',
    steps: [
      { title: `${isMacPlatform() ? '⌘' : 'Ctrl+'}K`, body: 'Open the command palette — jump to any page or device, or run quick actions.' },
      { title: `${isMacPlatform() ? '⌘' : 'Ctrl+'}B`, body: 'Collapse or expand the sidebar.' },
      { title: `${isMacPlatform() ? '⌘' : 'Ctrl+'}1 … 9`, body: 'Jump straight to a section in the sidebar, in order.' },
    ],
  },
  {
    id: 'help',
    icon: <LifeBuoy className="h-4 w-4" />,
    title: 'Troubleshooting',
    blurb: 'The usual suspects, and where to look.',
    steps: [
      {
        title: 'A device isn’t showing up',
        body: 'Make sure MeshDrop Go is open on both devices and they’re online. Devices find each other over the DHT — give it a moment, and check Diagnostics if it stays quiet.',
      },
      {
        title: '“Connection lost — reconnecting…”',
        body: 'That banner means the link to the local engine dropped. It reconnects on its own; no action needed.',
      },
      {
        title: 'Where did a received file go?',
        body: 'Received files land in your download folder, set on the Settings page.',
      },
      { title: 'A link expired', body: 'Create a new one with the expiration set to Never so it doesn’t.' },
    ],
    link: { label: 'Open Diagnostics', route: '/diagnostics' },
  },
  {
    id: 'cli',
    icon: <Terminal className="h-4 w-4" />,
    title: 'Command line (CLI)',
    blurb:
      'Prefer the terminal, or running on a server or NAS with no display? MeshDrop ships a headless host and a “mesh” command-line client that drive the exact same engine as this app — no window required.',
    steps: [
      {
        title: 'Install (Node 18+)',
        body: 'npm install -g @meshdrop-go/host — then run “mesh”. No global install? “npx @meshdrop-go/host …” works for a one-off. Runs on Windows, Linux and macOS.',
      },
      {
        title: 'Or run it on a NAS / server with Docker',
        body: 'Pull ghcr.io/aamirali51/meshdrop-host and run it with network_mode: host (required — the default bridge hides the LAN address and breaks peer discovery). The identity lives in /data — back that volume up.',
      },
      {
        title: 'Start a node',
        body: '“mesh host” runs a headless node against a storage folder and prints its pairing code. Point the CLI at a running node with “--host http://127.0.0.1:PORT --token <token>”, or let a command start one automatically.',
      },
      {
        title: 'Run it as a service',
        body: '“mesh service install” sets up systemd (Linux), launchd (macOS) or a logon task (Windows) so the node starts on boot and restarts on failure. “--dry-run” prints the unit first; “mesh service status” checks it.',
      },
      {
        title: 'Configure',
        body: 'Defaults live in <store>/config.json (name, port, downloads, bind, profile). Flags and environment variables override it — e.g. MESHDROP_HOST_NAME, MESHDROP_HOST_PORT.',
      },
      {
        title: 'Logs & monitoring',
        body: 'The daemon writes <store>/host.log — “mesh logs --follow”. Prometheus can scrape GET /metrics, and “mesh doctor” runs a self-check.',
      },
      {
        title: 'Automate a folder',
        body: '“mesh watch <dir> --to <peer>” sends every new file that appears to a device; “mesh watch <dir> --as site” keeps a folder published as a shared folder.',
      },
      {
        title: 'Keep it fresh',
        body: '“mesh update” checks npm for a newer release. Everything the GUI does is available here, and “--json” makes any command scriptable.',
      },
    ],
    code: {
      label: 'mesh — install, run, automate',
      lines: [
        'npm install -g @meshdrop-go/host      # install',
        'mesh service install --name nas        # start on boot (systemd/launchd/Windows)',
        '',
        'mesh status --watch                    # live peers, connection, transfers',
        'mesh drop ./recipes --never            # share link that never expires',
        'mesh get DROP-XXXX-XXXX                # receive a code',
        'mesh peek DROP-XXXX-XXXX               # is it online? (no download)',
        'mesh send ~/report.pdf --to nas        # send to a device',
        'mesh watch ~/inbox --to nas            # auto-send new files',
        'mesh site publish ./portfolio          # publish a folder',
        'mesh logs --follow                     # tail the daemon log',
        'mesh update                            # check for a newer release',
        'mesh help                              # every command',
      ],
    },
  },
]

function scrollToId(id: string) {
  const el = typeof document !== 'undefined' ? document.getElementById(id) : null
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function Guide() {
  const { navigate } = useNavigation()
  const [active, setActive] = useState<string>('start')

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[210px_1fr]">
      <aside className="h-fit lg:sticky lg:top-4">
        <Card className="border-border/50">
          <CardContent className="p-2.5">
            <p className="px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">
              On this page
            </p>
            <nav aria-label="Guide sections" className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setActive(s.id)
                    scrollToId(s.id)
                  }}
                  className={
                    'flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                    (active === s.id
                      ? 'bg-primary/12 text-primary'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground')
                  }
                >
                  <span className={active === s.id ? 'text-primary' : 'text-muted-foreground'}>{s.icon}</span>
                  <span className="whitespace-nowrap lg:whitespace-normal">{s.title}</span>
                </button>
              ))}
            </nav>
          </CardContent>
        </Card>
      </aside>

      <div className="min-w-0 space-y-5">
        <Card className="overflow-hidden border-primary/25 bg-primary/5">
          <CardContent className="space-y-3 p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <Badge variant="info" className="gap-1">
                <Rocket className="h-3 w-3" /> Guide
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" /> End-to-end encrypted
              </Badge>
            </div>
            <h2 className="text-lg font-black tracking-tight text-foreground">How MeshDrop Go works</h2>
            <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
              This is the manual. Everything runs device-to-device with no account and no cloud — here's how to
              send files, share links, sync folders, and more. New to it? Start with “Getting started”, then “Pair
              your devices”.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="gap-1.5 text-xs font-bold" onClick={() => scrollToId('start')}>
                <Rocket className="h-3.5 w-3.5" /> Start here
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-primary/30 text-xs font-bold text-primary hover:bg-primary/10"
                onClick={() => navigate('/devices')}
              >
                <Network className="h-3.5 w-3.5" /> Pair a device
              </Button>
            </div>
          </CardContent>
        </Card>

        {SECTIONS.map((s) => (
          <Card key={s.id} id={s.id} className="scroll-mt-4 overflow-hidden border-border/50">
            <CardContent className="space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    {s.icon}
                  </div>
                  <h3 className="text-sm font-black tracking-tight text-foreground">{s.title}</h3>
                </div>
                {s.link && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 text-[11px] font-bold"
                    onClick={() => navigate(s.link!.route)}
                  >
                    {s.link.label} <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">{s.blurb}</p>

              <ol className="space-y-3">
                {s.steps.map((step, i) => (
                  <li key={step.title} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 font-mono text-[10px] font-extrabold text-primary">
                      {i + 1}
                    </span>
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-bold text-foreground">{step.title}</p>
                      <p className="max-w-prose text-[11px] leading-relaxed text-muted-foreground">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              {s.code && (
                <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/30">
                  <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5">
                    <Terminal className="h-3.5 w-3.5 text-meshdrop-cyan" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      {s.code.label}
                    </span>
                  </div>
                  <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-foreground">
                    {s.code.lines.join('\n')}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

      </div>
    </div>
  )
}
