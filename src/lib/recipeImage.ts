import { RECIPE_IMAGE_MAX_LENGTH } from './others'

const attempts = [{ size: 1200, quality: 0.8 }, { size: 1000, quality: 0.72 }, { size: 800, quality: 0.65 }, { size: 640, quality: 0.6 }]

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch { /* Fall back to an <img>, which some Safari versions decode more formats with. */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

/**
 * Turn a photo from the camera roll into a small JPEG data URL (longest side ≤ 1200 px) so a
 * recipe image fits in local storage and the cloud workspace. Smaller sizes are tried if needed.
 */
export async function prepareRecipeImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/') && !/\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name)) throw new Error('Välj en bildfil.')
  let decoded
  try { decoded = await decode(file) } catch { throw new Error('Bilden kunde inte läsas. Prova en JPEG- eller PNG-bild.') }
  try {
    for (const { size, quality } of attempts) {
      const scale = Math.min(1, size / Math.max(decoded.width, decoded.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(decoded.width * scale))
      canvas.height = Math.max(1, Math.round(decoded.height * scale))
      const context = canvas.getContext('2d')
      if (!context) break
      context.fillStyle = '#ffffff' // Transparent PNGs get a white background in JPEG.
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height)
      const url = canvas.toDataURL('image/jpeg', quality)
      if (url.startsWith('data:image/jpeg') && url.length <= RECIPE_IMAGE_MAX_LENGTH) return url
    }
  } finally { decoded.close() }
  throw new Error('Bilden är för stor att spara. Välj en mindre bild.')
}
