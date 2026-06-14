/** Modeles Ollama susceptibles de lire des images (OCR, photos). */
export function isVisionModel(name: string): boolean {
  const key = name.toLowerCase()
  return (
    key.includes('vision') ||
    key.includes('llava') ||
    key.includes('moondream') ||
    key.includes('minicpm') ||
    key.includes('bakllava')
  )
}

export function filterVisionModels(models: string[]): string[] {
  return models.filter(isVisionModel)
}
