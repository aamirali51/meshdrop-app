/**
 * File preview generator for thumbnails and text snippets
 */

export async function generateFilePreview(
  file: File
): Promise<{ thumbnail?: string; previewText?: string }> {
  try {
    const isImage =
      file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(file.name)
    const isText =
      file.type.startsWith('text/') ||
      /\.(json|md|txt|ts|tsx|js|jsx|css|html|py|sh|yaml|yml|c|cpp|h|java|kt|go|rs)$/i.test(
        file.name
      )

    if (isImage) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      // Scale down image to low-res thumbnail canvas
      const img = new Image()
      img.src = dataUrl
      await new Promise((r) => (img.onload = r))

      const canvas = document.createElement('canvas')
      const maxDim = 240
      let w = img.width || maxDim
      let h = img.height || maxDim
      if (w > h) {
        if (w > maxDim) {
          h = Math.round((h * maxDim) / w)
          w = maxDim
        }
      } else {
        if (h > maxDim) {
          w = Math.round((w * maxDim) / h)
          h = maxDim
        }
      }

      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0, w, h)
        const thumbnail = canvas.toDataURL('image/jpeg', 0.7)
        return { thumbnail }
      }
      return { thumbnail: dataUrl }
    }

    if (isText && file.size < 2 * 1024 * 1024) {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsText(file.slice(0, 4000))
      })
      const previewText = text.slice(0, 500)
      return { previewText }
    }
  } catch (err) {
    console.warn('[FilePreview] Failed to generate preview:', err)
  }
  return {}
}
