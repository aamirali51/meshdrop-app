import type { PendingShare } from '@/types'

// ── Share-link generation ─────────────────────────────────────────────────
// Senders copy a single web link per drop. The claim page (web/) renders at
// /d/<code>: it deep-links into the app for installed recipients and shows
// the platform download for everyone else — so one link works for all.
//
// WEB_LINK_BASE is the GitHub Pages URL until the custom domain goes live
// (then switch it to https://meshdrop.app/d/ — no other change needed).
export const WEB_LINK_BASE = 'https://aamirali51.github.io/MeshDesk/d/'

export interface ShareLinkMeta {
  name?: string
  size?: number
}

export function buildShareLink(code: string, meta?: ShareLinkMeta): string {
  const params = new URLSearchParams()
  if (meta?.name) params.set('n', meta.name)
  if (meta && meta.size) params.set('s', String(meta.size))
  const qs = params.toString()
  return WEB_LINK_BASE + code + (qs ? '?' + qs : '')
}

// Human-friendly metadata for the claim page from a pending share: the name
// shown to the recipient and the size in bytes. Optional — a bare code link
// is still perfectly shareable.
export function shareLinkMeta(
  share: Pick<PendingShare, 'filename' | 'fileSize' | 'folderName' | 'files'>
): ShareLinkMeta {
  let name = share.filename
  if (share.folderName) name = share.folderName
  else if (share.files && share.files.length > 1) name = `${share.files.length} files`
  return { name, size: share.fileSize > 0 ? share.fileSize : undefined }
}
