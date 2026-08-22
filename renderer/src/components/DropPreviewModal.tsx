import { useState, useMemo, useEffect } from 'react'
import {
  Folder,
  FileText,
  Download,
  XCircle,
  CheckSquare,
  Square,
  Search,
  FileCode,
  FileArchive,
  Image as ImageIcon,
  Video,
  Music,
  Check
} from 'lucide-react'
import { useShares } from '@/hooks/useShares'
import { useNavigation } from '@/hooks/useNavigation'
import { useToast } from '@/hooks/useToast'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/format'

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
    return <ImageIcon className='h-4 w-4 text-sky-400' />
  }
  if (['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(ext)) {
    return <Video className='h-4 w-4 text-purple-400' />
  }
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) {
    return <Music className='h-4 w-4 text-emerald-400' />
  }
  if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) {
    return <FileArchive className='h-4 w-4 text-amber-400' />
  }
  if (['js', 'ts', 'tsx', 'jsx', 'json', 'html', 'css', 'py', 'go', 'rs', 'c', 'cpp'].includes(ext)) {
    return <FileCode className='h-4 w-4 text-indigo-400' />
  }
  return <FileText className='h-4 w-4 text-muted-foreground' />
}

export function DropPreviewModal() {
  const { claimPreview, clearClaimPreview, confirmClaimDownload, cancelClaimDownload } = useShares()
  const { navigate } = useNavigation()
  const { toast } = useToast()

  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [filterQuery, setFilterQuery] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Pre-select all files by default whenever a new claim preview arrives
  useEffect(() => {
    if (claimPreview && claimPreview.files) {
      setSelectedIndices(new Set(claimPreview.files.map((f) => f.index)))
      setFilterQuery('')
    }
  }, [claimPreview])

  if (!claimPreview) return null

  const files = claimPreview.files || []

  const filteredFiles = useMemo(() => {
    if (!filterQuery.trim()) return files
    const q = filterQuery.toLowerCase()
    return files.filter((f) => f.filename.toLowerCase().includes(q))
  }, [files, filterQuery])

  const selectedBytes = useMemo(() => {
    return files
      .filter((f) => selectedIndices.has(f.index))
      .reduce((sum, f) => sum + (f.fileSize || 0), 0)
  }, [files, selectedIndices])

  const toggleSelectAll = () => {
    if (selectedIndices.size === files.length) {
      setSelectedIndices(new Set())
    } else {
      setSelectedIndices(new Set(files.map((f) => f.index)))
    }
  }

  const toggleFile = (idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const handleCancel = async () => {
    try {
      await cancelClaimDownload({ shareId: claimPreview.shareId, code: claimPreview.code })
    } catch {}
    clearClaimPreview()
  }

  const handleDownload = async (indices?: number[]) => {
    const toDownload = indices || Array.from(selectedIndices)
    if (toDownload.length === 0) return

    setIsSubmitting(true)
    try {
      await confirmClaimDownload({
        shareId: claimPreview.shareId,
        selectedIndices: toDownload
      })
      clearClaimPreview()
      navigate('/transfers')
      toast.success(
        'Downloading Files',
        `Started receiving ${toDownload.length} file${toDownload.length === 1 ? '' : 's'} from ${claimPreview.code}`
      )
    } catch (err: any) {
      toast.error('Download Failed', err?.message || 'Could not start download')
    } finally {
      setIsSubmitting(false)
    }
  }

  const title = claimPreview.folderName
    ? `Folder: ${claimPreview.folderName}`
    : `Shared Files (${files.length})`

  return (
    <Modal
      open={!!claimPreview}
      onOpenChange={(o) => !o && handleCancel()}
      title={title}
      description={`Code ${claimPreview.code} · ${formatBytes(claimPreview.totalSize)} total`}
    >
      <div className='space-y-3.5 pt-1'>
        {/* Filter and Selection Header */}
        <div className='flex items-center justify-between gap-3'>
          {files.length > 4 && (
            <div className='relative flex-1'>
              <Search className='absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground' />
              <input
                type='text'
                placeholder='Search files...'
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className='h-8 w-full rounded-lg border border-border/70 bg-background/80 pl-8 pr-3 text-xs text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary'
              />
            </div>
          )}

          <div className='flex items-center gap-2 text-xs font-semibold text-muted-foreground ml-auto'>
            <button
              type='button'
              onClick={toggleSelectAll}
              className='flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-muted/70 hover:text-foreground'
            >
              {selectedIndices.size === files.length ? (
                <>
                  <CheckSquare className='h-3.5 w-3.5 text-primary' />
                  <span>Deselect All</span>
                </>
              ) : (
                <>
                  <Square className='h-3.5 w-3.5' />
                  <span>Select All</span>
                </>
              )}
            </button>
            <span>·</span>
            <span className='font-mono text-[11px]'>
              {selectedIndices.size}/{files.length} ({formatBytes(selectedBytes)})
            </span>
          </div>
        </div>

        {/* Scrollable File List */}
        <div className='max-h-64 overflow-y-auto rounded-xl border border-border/60 bg-muted/20 p-1 divide-y divide-border/20'>
          {filteredFiles.map((file) => {
            const isSelected = selectedIndices.has(file.index)
            return (
              <div
                key={file.index}
                onClick={() => toggleFile(file.index)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-colors cursor-pointer select-none ${
                  isSelected ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/50 text-muted-foreground'
                }`}
              >
                <div className='shrink-0'>
                  {isSelected ? (
                    <div className='flex h-4 w-4 items-center justify-center rounded bg-primary text-primary-foreground'>
                      <Check className='h-3 w-3 stroke-[3]' />
                    </div>
                  ) : (
                    <div className='h-4 w-4 rounded border border-border/80 bg-background' />
                  )}
                </div>

                <div className='shrink-0'>{getFileIcon(file.filename)}</div>

                <span className='min-w-0 flex-1 truncate font-medium text-foreground'>
                  {file.filename}
                </span>

                <span className='shrink-0 font-mono text-[11px] text-muted-foreground'>
                  {formatBytes(file.fileSize)}
                </span>
              </div>
            )
          })}

          {filteredFiles.length === 0 && (
            <div className='py-6 text-center text-xs text-muted-foreground'>
              No files matching "{filterQuery}"
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className='flex items-center gap-2.5 pt-2'>
          <Button
            type='button'
            variant='outline'
            onClick={handleCancel}
            disabled={isSubmitting}
            className='flex-1 font-semibold text-xs'
          >
            <XCircle className='mr-1.5 h-3.5 w-3.5' /> Cancel
          </Button>

          {selectedIndices.size < files.length && selectedIndices.size > 0 && (
            <Button
              type='button'
              onClick={() => handleDownload()}
              disabled={isSubmitting || selectedIndices.size === 0}
              className='flex-1 gap-1.5 font-bold text-xs'
            >
              <Download className='h-3.5 w-3.5' />
              Download ({selectedIndices.size})
            </Button>
          )}

          <Button
            type='button'
            variant={selectedIndices.size === files.length ? 'default' : 'secondary'}
            onClick={() => handleDownload(files.map((f) => f.index))}
            disabled={isSubmitting}
            className='flex-1 gap-1.5 font-bold text-xs'
          >
            <Download className='h-3.5 w-3.5' />
            Download All
          </Button>
        </div>
      </div>
    </Modal>
  )
}
