const MAX_IMAGE_DIMENSION = 1280
const JPEG_QUALITY = 0.85

/** Redimensionne et encode en JPEG base64 (sans prefixe data:) pour Ollama vision. */
export async function prepareImageForOllama(source: File | Blob): Promise<string> {
  const bitmap = await createImageBitmap(source)
  let { width, height } = bitmap

  const maxDim = Math.max(width, height)
  if (maxDim > MAX_IMAGE_DIMENSION) {
    const scale = MAX_IMAGE_DIMENSION / maxDim
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Impossible de preparer l\'image.')

  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  const base64 = dataUrl.split(',')[1]
  if (!base64) throw new Error('Encodage image echoue.')
  return base64
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(file.name)
}

export async function readImageFromClipboard(data: DataTransfer | null): Promise<File | null> {
  if (!data) return null
  for (const item of data.items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
}
