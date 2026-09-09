import { useState } from 'react'
import { Inbox, Share2, HardDrive, Check, Search, Monitor, Apple, Terminal, Smartphone, FileText, Image as ImageIcon, Film, Music, Archive as ArchiveIcon, Code2 } from 'lucide-react'
import { Button } from '@/ui/primitives/Button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/ui/primitives/Card'
import { Input } from '@/ui/primitives/Input'
import { Badge } from '@/ui/primitives/Badge'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/ui/primitives/Tooltip'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/ui/primitives/Sheet'
import { StatTile } from '@/ui/primitives/StatTile'
import { EmptyState } from '@/ui/primitives/EmptyState'
import { Skeleton } from '@/ui/primitives/Skeleton'
import { ProgressRing } from '@/ui/primitives/ProgressRing'
import { DeviceAvatar } from '@/ui/primitives/DeviceAvatar'
import { FileIcon } from '@/ui/primitives/FileIcon'
import { useTheme } from '@/hooks/useTheme'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-border/40 bg-card/40 p-5">
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</h3>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  )
}

// Dev-only hidden route — not in sidebar, not indexed. Rendered via MainLayout
// when hash is #/_design (and import.meta.env.DEV). Shows every primitive in
// both themes for visual sign-off before Wave 1 consumes them.
export function DesignPreview() {
  const { theme, toggle } = useTheme()
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black tracking-tight">/_design — Primitive gallery</h1>
            <p className="text-xs text-muted-foreground">Dev-only · not in sidebar · renders both themes via the toggle.</p>
          </div>
          <Button variant="outline" size="sm" onClick={toggle} aria-label="Toggle theme">
            Theme: {theme} — toggle
          </Button>
        </div>

        <Section title="Button — variants">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </Section>

        <Section title="Button — sizes + loading">
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Search"><Search className="h-4 w-4" /></Button>
          <Button loading>Loading</Button>
          <Button variant="outline" loading>Outline loading</Button>
        </Section>

        <Section title="Card">
          <Card className="w-[320px]">
            <CardHeader>
              <CardTitle>Card title</CardTitle>
              <CardDescription>Card description — muted.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Card content area. Hover shows shadow lift.</p>
            </CardContent>
            <CardFooter>
              <Button size="sm">Action</Button>
            </CardFooter>
          </Card>
        </Section>

        <Section title="Input">
          <div className="w-64 space-y-2">
            <Input placeholder="Placeholder" aria-label="Example input" />
            <Input defaultValue="With value" aria-label="With value" />
            <Input placeholder="Disabled" disabled aria-label="Disabled" />
          </div>
        </Section>

        <Section title="Badge">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="info">Info</Badge>
        </Section>

        <Section title="Tooltip">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm">Hover me</Button>
            </TooltipTrigger>
            <TooltipContent>Tooltip content</TooltipContent>
          </Tooltip>
        </Section>

        <Section title="Sheet (bottom modal, mobile-friendly)">
          <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>Open sheet</Button>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Sheet title</SheetTitle>
                <SheetDescription>Sheet description — Esc closes, drag handle on mobile.</SheetDescription>
              </SheetHeader>
              <p className="text-sm text-muted-foreground">Sheet body. This is the bottom-sheet primitive; on desktop it centers as a modal.</p>
            </SheetContent>
          </Sheet>
        </Section>

        <Section title="StatTile">
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile label="Active shares" value="12" hint="In the last 24h" icon={<Share2 className="h-4 w-4" />} />
            <StatTile label="Transfers" value="3 pending" hint="2 sending · 1 receiving" icon={<HardDrive className="h-4 w-4" />} />
            <StatTile label="Peers online" value="2" hint="Direct LAN" icon={<Monitor className="h-4 w-4" />} />
          </div>
        </Section>

        <Section title="EmptyState">
          <div className="w-full max-w-md">
            <EmptyState
              icon={<Inbox className="h-6 w-6" />}
              title="Nothing here yet"
              description="Share a file to get started — it will appear here."
              action={<Button size="sm"><Share2 className="h-4 w-4" /> Share a file</Button>}
            />
          </div>
        </Section>

        <Section title="Skeleton — shapes: text / row / card / ring">
          <div className="flex w-full flex-col gap-3">
            <div className="flex gap-3">
              <Skeleton shape="text" className="w-32" />
              <Skeleton shape="text" className="w-48" />
            </div>
            <Skeleton shape="row" />
            <Skeleton shape="card" />
            <div className="flex gap-3">
              <Skeleton shape="ring" />
              <Skeleton shape="ring" />
            </div>
          </div>
        </Section>

        <Section title="ProgressRing — sizes + colors">
          <ProgressRing value={18} size="sm" />
          <ProgressRing value={42} size="md" />
          <ProgressRing value={76} size="lg" />
          <ProgressRing value={100} size="md" color="success" />
          <ProgressRing value={58} size="md" color="warning" />
          <ProgressRing value={33} size="md" color="muted" />
        </Section>

        <Section title="DeviceAvatar — platform icon + presence pulse">
          <DeviceAvatar name="Alice MacBook" os="macos" presence="online" pulse />
          <DeviceAvatar name="Win Desktop" os="windows" presence="online" pulse />
          <DeviceAvatar name="Linux Box" os="linux" presence="away" />
          <DeviceAvatar name="Pixel 7" os="android" presence="busy" />
          <DeviceAvatar name="iPhone" os="ios" presence="offline" />
          <DeviceAvatar name="Extra Large" os="windows" size="lg" presence="online" pulse />
          <DeviceAvatar name="S" os="macos" size="sm" presence="online" />
        </Section>

        <Section title="FileIcon — by mime/extension">
          <FileIcon filename="report.pdf" />
          <FileIcon filename="photo.jpg" />
          <FileIcon filename="clip.mp4" />
          <FileIcon filename="song.mp3" />
          <FileIcon filename="archive.zip" />
          <FileIcon filename="app.tsx" />
          <FileIcon filename="data.csv" />
          <FileIcon isFolder filename="My Folder" />
          <FileIcon filename="notes.txt" size="sm" />
          <FileIcon filename="large.bin" size="lg" />
        </Section>

        {/* Token swatches — quick visual check that CSS variables resolved. */}
        <Section title="Token swatches">
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-md bg-primary px-2 py-1 text-primary-foreground">primary</span>
            <span className="rounded-md bg-[rgb(var(--meshdrop-cyan))] px-2 py-1 text-white">cyan</span>
            <span className="rounded-md border border-border bg-card px-2 py-1">card</span>
            <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">muted</span>
            <span className="rounded-md bg-[rgb(var(--success))] px-2 py-1 text-white">success</span>
            <span className="rounded-md bg-[rgb(var(--warning))] px-2 py-1 text-white">warning</span>
            <span className="rounded-md bg-destructive px-2 py-1 text-destructive-foreground">destructive</span>
          </div>
        </Section>

        <p className="text-center text-[11px] text-muted-foreground">
          End of /_design gallery — toggle theme to verify both themes. Icons used above are decorative — presence/mime text is labeled via aria-labels on the primitives themselves.
        </p>
      </div>
    </TooltipProvider>
  )
}
