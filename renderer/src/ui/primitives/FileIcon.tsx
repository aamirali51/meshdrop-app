import {
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  File as FileGeneric,
  Folder,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type FileIconSize = 'sm' | 'md' | 'lg'

const sizeClasses: Record<FileIconSize, string> = {
  sm: 'h-8 w-8 rounded-md [&>svg]:h-4 [&>svg]:w-4',
  md: 'h-10 w-10 rounded-lg [&>svg]:h-5 [&>svg]:w-5',
  lg: 'h-12 w-12 rounded-xl [&>svg]:h-6 [&>svg]:w-6',
}

function pickIcon(mime?: string, ext?: string, isFolder?: boolean) {
  if (isFolder) return Folder
  const m = (mime ?? '').toLowerCase()
  const e = (ext ?? '').toLowerCase().replace(/^\./, '')
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'heic', 'avif'].includes(e)) return FileImage
  if (m.startsWith('video/') || ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v'].includes(e)) return FileVideo
  if (m.startsWith('audio/') || ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'].includes(e)) return FileAudio
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(e) || m.includes('zip') || m.includes('archive')) return FileArchive
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'cs', 'rb', 'php', 'swift', 'kt', 'css', 'html'].includes(e)) return FileCode
  if (['csv', 'xlsx', 'xls', 'ods'].includes(e)) return FileSpreadsheet
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt'].includes(e) || m.startsWith('text/')) return FileText
  return FileGeneric
}

interface FileIconProps {
  mime?: string
  extension?: string
  filename?: string
  isFolder?: boolean
  size?: FileIconSize
  className?: string
  'aria-label'?: string
}

export function FileIcon({ mime, extension, filename, isFolder, size = 'md', className, 'aria-label': ariaLabel }: FileIconProps) {
  const extFromName = filename ? filename.split('.').pop() : undefined
  const ext = extension ?? extFromName
  const Icon = pickIcon(mime, ext, isFolder)
  return (
    <div
      role="img"
      aria-label={ariaLabel ?? (isFolder ? 'Folder' : ext ? `${ext.toUpperCase()} file` : 'File')}
      className={cn('inline-flex shrink-0 items-center justify-center bg-muted text-muted-foreground border border-border/40', sizeClasses[size], className)}
    >
      <Icon aria-hidden />
    </div>
  )
}
