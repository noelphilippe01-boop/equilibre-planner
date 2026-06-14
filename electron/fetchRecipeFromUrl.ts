import type { Ingredient, Recipe } from '../src/types/index.js'
import { sanitizeRecipe, cleanRecipeText } from '../src/lib/recipeFormat.js'
import { extractRecipesFromPageText, type OllamaSettings } from './ollama.js'

const FETCH_TIMEOUT_MS = 20000
const MAX_HTML_CHARS = 500_000

export function normalizeImportUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('URL vide.')
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withProtocol)
  } catch {
    throw new Error('URL invalide.')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Seules les URLs http(s) sont acceptees.')
  }
  return url.toString()
}

export async function fetchPageHtml(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
        'User-Agent': 'Equilibre-Planner/0.1 (usage personnel)',
      },
      redirect: 'follow',
    })
    if (!response.ok) {
      throw new Error(`Page inaccessible (${response.status}).`)
    }
    const html = await response.text()
    if (!html.trim()) throw new Error('Page vide.')
    return html.slice(0, MAX_HTML_CHARS)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Delai depasse lors du chargement de la page.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

function parseDurationMinutes(value: unknown): number {
  if (typeof value === 'number' && value > 0) return Math.round(value)
  if (typeof value !== 'string') return 20
  const hours = Number(value.match(/(\d+)\s*h/i)?.[1] ?? 0)
  const minutes = Number(value.match(/(\d+)\s*m/i)?.[1] ?? 0)
  const isoHours = Number(value.match(/(\d+)H/i)?.[1] ?? 0)
  const isoMinutes = Number(value.match(/(\d+)M/i)?.[1] ?? 0)
  const total = Math.max(hours, isoHours) * 60 + Math.max(minutes, isoMinutes)
  return total > 0 ? total : 20
}

function parseServings(value: unknown): number {
  if (typeof value === 'number' && value > 0) return Math.round(value)
  if (Array.isArray(value)) return parseServings(value[0])
  if (typeof value === 'string') {
    const match = value.match(/\d+/)
    if (match) return Math.max(1, Number(match[0]))
  }
  return 2
}

function parseIngredientLine(line: string): Ingredient {
  const trimmed = cleanRecipeText(line)
  const match = trimmed.match(/^([\d.,/]+)\s*([a-zA-Zàâçéèêëîïôùûü.]+)?\s*(.*)$/)
  if (match && match[1]) {
    return {
      quantity: match[1],
      unit: (match[2] ?? '').trim(),
      name: (match[3] ?? trimmed).trim() || trimmed,
    }
  }
  return { name: trimmed, quantity: '', unit: '' }
}

function isRecipeType(value: unknown): boolean {
  if (typeof value === 'string') return value.toLowerCase() === 'recipe'
  if (Array.isArray(value)) return value.some(isRecipeType)
  return false
}

function collectRecipeNodes(data: unknown, out: Record<string, unknown>[]): void {
  if (!data) return
  if (Array.isArray(data)) {
    data.forEach((item) => collectRecipeNodes(item, out))
    return
  }
  if (typeof data !== 'object') return

  const obj = data as Record<string, unknown>
  if (isRecipeType(obj['@type'])) out.push(obj)
  if (obj['@graph']) collectRecipeNodes(obj['@graph'], out)
}

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = []
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(match[1]))
    } catch {
      // ignore invalid JSON-LD block
    }
  }
  return blocks
}

function extractInstructions(value: unknown): string[] {
  if (!value) return []
  if (typeof value === 'string') return [value.trim()].filter(Boolean)
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === 'string') return [item.trim()]
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        if (typeof obj.text === 'string') return [obj.text.trim()]
        if (typeof obj.name === 'string') return [obj.name.trim()]
        if (obj.itemListElement) return extractInstructions(obj.itemListElement)
      }
      return []
    }).filter(Boolean)
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (obj.itemListElement) return extractInstructions(obj.itemListElement)
    if (typeof obj.text === 'string') return [obj.text.trim()]
  }
  return []
}

function siteLabelFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Web'
  }
}

function mapSchemaRecipe(node: Record<string, unknown>, pageUrl: string): Recipe {
  const name = String(node.name ?? 'Recette importee').trim()
  const ingredientsRaw = node.recipeIngredient ?? node.ingredients ?? []
  const ingredients = (Array.isArray(ingredientsRaw) ? ingredientsRaw : [ingredientsRaw])
    .map((item) => (typeof item === 'string' ? parseIngredientLine(item) : parseIngredientLine(String(item))))
    .filter((ing) => ing.name)

  const prepMinutes = parseDurationMinutes(node.prepTime ?? node.totalTime)
  const id = `web-${slugify(name) || Date.now()}`

  return sanitizeRecipe(
    {
      id,
      name,
      servings: parseServings(node.recipeYield ?? node.yield),
      prepMinutes,
      ingredients,
      steps: extractInstructions(node.recipeInstructions),
      tags: ['web'],
      source: siteLabelFromUrl(pageUrl),
      sourceUrl: pageUrl,
      mealTypes: ['lunch', 'dinner'],
    },
    id,
  )
}

export function extractRecipesFromHtml(html: string, pageUrl: string): Recipe[] {
  const nodes: Record<string, unknown>[] = []
  for (const block of extractJsonLdBlocks(html)) {
    collectRecipeNodes(block, nodes)
  }

  const recipes = nodes.map((node) => mapSchemaRecipe(node, pageUrl))
  const seen = new Set<string>()
  return recipes.filter((recipe) => {
    const key = recipe.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return recipe.ingredients.length > 0 || recipe.steps.length > 0
  })
}

export function htmlToPlainText(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
  const text = withoutNoise
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

  return text.slice(0, 12000)
}

export function extractMetaTitle(html: string): string | undefined {
  const og = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
  if (og?.[1]) return og[1].trim()
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return title?.[1]?.replace(/\s+/g, ' ').trim()
}

export async function importRecipeFromUrl(
  settings: OllamaSettings,
  rawUrl: string,
): Promise<{ method: 'schema' | 'ai'; recipes: unknown }> {
  const url = normalizeImportUrl(rawUrl)
  const html = await fetchPageHtml(url)
  const schemaRecipes = extractRecipesFromHtml(html, url)

  if (schemaRecipes.length > 0) {
    return { method: 'schema', recipes: schemaRecipes }
  }

  const pageText = htmlToPlainText(html)
  if (pageText.length < 80) {
    throw new Error(
      'Recette non detectee automatiquement et texte insuffisant. Essayez l\'import par image.',
    )
  }

  const aiRaw = await extractRecipesFromPageText(
    settings,
    pageText,
    url,
    extractMetaTitle(html),
  )

  const parsed = aiRaw as { recipes?: Array<Record<string, unknown>> }
  const hostname = siteLabelFromUrl(url)
  if (Array.isArray(parsed.recipes)) {
    parsed.recipes = parsed.recipes.map((recipe) => ({
      ...recipe,
      sourceUrl: url,
      source: recipe.source ?? hostname,
    }))
  }

  return { method: 'ai', recipes: aiRaw }
}
