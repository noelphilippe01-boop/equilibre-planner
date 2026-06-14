import type { Recipe } from '../src/types/index.js'
import type { OllamaSettings } from './ollama.js'
import {
  extractRecipesFromHtml,
  fetchPageHtml,
  importRecipeFromUrl,
  normalizeImportUrl,
} from './fetchRecipeFromUrl.js'

const LISTING_BLOCK = /\/(page|categorie|categories|category|tag|tags|author|search|feed|wp-json)\//i
const DEFAULT_MAX_LISTING_PAGES = 30
const UNLIMITED_LISTING_PAGES = 500
const REQUEST_DELAY_MS = 350
const AVG_FETCH_PARSE_MS = 450
const AVG_AI_RECIPE_MS = 22_000
const FETCH_TIMEOUT_MS = 15_000

function resolveMaxRecipes(value?: number): number {
  if (value == null || value <= 0) return Number.POSITIVE_INFINITY
  return value
}

function hasRecipeLimit(maxRecipes: number): boolean {
  return Number.isFinite(maxRecipes) && maxRecipes > 0
}

function sameSiteHost(a: string, b: string): boolean {
  const strip = (host: string) => host.toLowerCase().replace(/^www\./, '')
  return strip(a) === strip(b)
}

function takeUpTo<T>(items: T[], max: number): T[] {
  return hasRecipeLimit(max) ? items.slice(0, max) : items
}

export interface SiteImportProgress {
  phase: 'discover' | 'import'
  current: number
  total: number
  message: string
  recipeName?: string
}

export interface SiteImportResult {
  recipes: Recipe[]
  discovered: number
  imported: number
  skipped: number
  failed: string[]
  usedAi: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function discoveryCacheKey(rawStartUrl: string, maxRecipes?: number): string {
  return `${normalizeImportUrl(rawStartUrl)}|${maxRecipes ?? 0}`
}

let cachedDiscovery: { key: string; urls: string[] } | null = null

async function fetchWithTimeout(
  url: string,
  externalSignal?: AbortSignal,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  externalSignal?.addEventListener('abort', onAbort)

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: FETCH_HEADERS,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (externalSignal?.aborted) throw new Error('Operation annulee.')
      throw new Error(`Delai depasse pour ${url}`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
    externalSignal?.removeEventListener('abort', onAbort)
  }
}

function normalizeRecipeUrl(raw: string, base: URL): string | null {
  try {
    const url = new URL(raw, base)
    if (!sameSiteHost(url.hostname, base.hostname)) return null
    url.hash = ''
    url.search = ''
    if (!url.pathname.endsWith('/')) url.pathname += '/'
    return url.toString()
  } catch {
    return null
  }
}

export function isLikelyRecipePageUrl(url: URL): boolean {
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length !== 2) return false
  if (LISTING_BLOCK.test(url.pathname)) return false

  const recipeRoots = ['recettes', 'recette', 'recipes', 'recipe']
  const root = segments[0].toLowerCase()
  if (!recipeRoots.includes(root)) return false

  const slug = segments[1].toLowerCase()
  if (['page', 'categorie', 'categories', 'tag', 'tags'].includes(slug)) return false
  return slug.length > 2
}

function extractLinksFromHtml(html: string, base: URL): string[] {
  const links = new Set<string>()
  const hrefRegex = /href=["']([^"'#]+)["']/gi
  let match: RegExpExecArray | null
  while ((match = hrefRegex.exec(html)) !== null) {
    const normalized = normalizeRecipeUrl(match[1], base)
    if (!normalized) continue
    try {
      if (isLikelyRecipePageUrl(new URL(normalized))) links.add(normalized)
    } catch {
      // ignore bad URL
    }
  }
  return [...links]
}

function extractListingPages(html: string, base: URL): string[] {
  const pages = new Set<string>()
  const start = normalizeRecipeUrl(base.toString(), base)
  if (start) pages.add(start)

  const hrefRegex = /href=["']([^"'#]+)["']/gi
  let match: RegExpExecArray | null
  while ((match = hrefRegex.exec(html)) !== null) {
    const normalized = normalizeRecipeUrl(match[1], base)
    if (!normalized) continue
    try {
      const url = new URL(normalized)
      if (!sameSiteHost(url.hostname, base.hostname)) continue
      if (/\/page\/\d+\/?$/i.test(url.pathname)) pages.add(normalized)
      if (url.pathname === base.pathname || url.pathname === `${base.pathname}/`) {
        pages.add(normalized)
      }
    } catch {
      // ignore
    }
  }
  return [...pages]
}

const FETCH_HEADERS = {
  Accept: 'application/xml,text/xml,text/html,application/xhtml+xml,*/*',
  'User-Agent': 'Equilibre-Planner/0.1 (usage personnel)',
}

function isXmlSitemap(body: string): boolean {
  const trimmed = body.trimStart()
  return trimmed.startsWith('<?xml') || trimmed.startsWith('<urlset') || trimmed.startsWith('<sitemapindex')
}

async function fetchRobotsSitemapUrls(origin: string, signal?: AbortSignal): Promise<string[]> {
  const urls = new Set<string>()
  try {
    const response = await fetchWithTimeout(`${origin}/robots.txt`, signal)
    if (!response.ok) return []
    const text = await response.text()
    for (const match of text.matchAll(/^Sitemap:\s*(\S+)/gim)) {
      urls.add(match[1].trim())
    }
  } catch {
    // ignore robots.txt errors
  }
  return [...urls]
}

async function collectRecipeUrlsFromSitemapXml(
  xml: string,
  recipeUrls: Set<string>,
  signal?: AbortSignal,
): Promise<void> {
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim())

  for (const loc of locs) {
    if (signal?.aborted) throw new Error('Operation annulee.')

    if (loc.endsWith('.xml')) {
      try {
        const nested = await fetchWithTimeout(loc, signal)
        if (!nested.ok) continue
        const nestedXml = await nested.text()
        if (!isXmlSitemap(nestedXml)) continue
        await collectRecipeUrlsFromSitemapXml(nestedXml, recipeUrls, signal)
      } catch (error) {
        if (error instanceof Error && error.message === 'Operation annulee.') throw error
        // ignore nested sitemap errors
      }
      continue
    }
    try {
      const url = new URL(loc)
      if (isLikelyRecipePageUrl(url)) recipeUrls.add(url.toString())
    } catch {
      // ignore
    }
  }
}

async function fetchSitemapRecipeUrls(origin: string, signal?: AbortSignal): Promise<string[]> {
  const sitemapUrls = [
    ...(await fetchRobotsSitemapUrls(origin, signal)),
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
  ]
  const recipeUrls = new Set<string>()

  for (const sitemapUrl of [...new Set(sitemapUrls)]) {
    if (signal?.aborted) throw new Error('Operation annulee.')
    try {
      const response = await fetchWithTimeout(sitemapUrl, signal)
      if (!response.ok) continue
      const xml = await response.text()
      if (!isXmlSitemap(xml)) continue
      await collectRecipeUrlsFromSitemapXml(xml, recipeUrls, signal)
      if (recipeUrls.size > 0) break
    } catch (error) {
      if (error instanceof Error && error.message === 'Operation annulee.') throw error
      // try next sitemap
    }
  }

  return [...recipeUrls]
}

export async function discoverRecipeUrls(
  rawStartUrl: string,
  maxRecipesInput: number,
  options?: {
    onProgress?: (progress: SiteImportProgress) => void
    signal?: AbortSignal
  },
): Promise<string[]> {
  const maxRecipes = resolveMaxRecipes(maxRecipesInput)
  const startUrl = normalizeImportUrl(rawStartUrl)
  const base = new URL(startUrl)
  const origin = base.origin
  const found = new Set<string>()
  const onProgress = options?.onProgress
  const signal = options?.signal

  onProgress?.({
    phase: 'discover',
    current: 0,
    total: 1,
    message: 'Recherche dans le sitemap…',
  })

  for (const url of await fetchSitemapRecipeUrls(origin, signal)) {
    found.add(url)
    if (hasRecipeLimit(maxRecipes) && found.size >= maxRecipes) {
      return takeUpTo([...found], maxRecipes)
    }
  }

  if (hasRecipeLimit(maxRecipes) && found.size >= maxRecipes) {
    return takeUpTo([...found], maxRecipes)
  }

  if (found.size > 0) {
    onProgress?.({
      phase: 'discover',
      current: found.size,
      total: found.size,
      message: `${found.size} recette(s) trouvee(s) dans le sitemap.`,
    })
    return takeUpTo([...found], maxRecipes)
  }

  onProgress?.({
    phase: 'discover',
    current: 0,
    total: 1,
    message: 'Exploration des pages recettes…',
  })

  const listingQueue = [startUrl]
  const visitedListings = new Set<string>()
  let listingPagesScanned = 0

  const listingPageLimit = hasRecipeLimit(maxRecipes)
    ? DEFAULT_MAX_LISTING_PAGES
    : UNLIMITED_LISTING_PAGES

  while (listingQueue.length > 0 && listingPagesScanned < listingPageLimit) {
    if (signal?.aborted) throw new Error('Operation annulee.')

    const listingUrl = listingQueue.shift()!
    if (visitedListings.has(listingUrl)) continue
    visitedListings.add(listingUrl)
    listingPagesScanned += 1

    onProgress?.({
      phase: 'discover',
      current: found.size,
      total: hasRecipeLimit(maxRecipes) ? maxRecipes : 0,
      message: `Exploration page ${listingPagesScanned}… (${found.size} recettes trouvees)`,
    })

    try {
      const html = await fetchPageHtml(listingUrl)
      for (const link of extractLinksFromHtml(html, base)) {
        found.add(link)
        if (hasRecipeLimit(maxRecipes) && found.size >= maxRecipes) {
          return takeUpTo([...found], maxRecipes)
        }
      }
      for (const page of extractListingPages(html, base)) {
        if (!visitedListings.has(page)) listingQueue.push(page)
      }
    } catch {
      // ignore listing page errors
    }

    await sleep(REQUEST_DELAY_MS)
  }

  return takeUpTo([...found], maxRecipes)
}

async function importRecipeFast(
  settings: OllamaSettings,
  url: string,
  useAiFallback: boolean,
): Promise<{ recipe: Recipe | null; usedAi: boolean }> {
  try {
    const html = await fetchPageHtml(url)
    const schemaRecipes = extractRecipesFromHtml(html, url)
    if (schemaRecipes.length > 0) {
      return { recipe: schemaRecipes[0], usedAi: false }
    }
    if (!useAiFallback) return { recipe: null, usedAi: false }

    const result = await importRecipeFromUrl(settings, url)
    let recipes: Recipe[] = []
    if (Array.isArray(result.recipes)) {
      recipes = result.recipes as Recipe[]
    } else {
      const parsed = result.recipes as { recipes?: Recipe[] }
      recipes = parsed.recipes ?? []
    }
    return { recipe: recipes[0] ?? null, usedAi: result.method === 'ai' }
  } catch {
    return { recipe: null, usedAi: false }
  }
}

export interface SiteImportEstimate {
  discovered: number
  discoverSeconds: number
  estimatedImportSeconds: number
  estimatedTotalSeconds: number
}

export function estimateImportSeconds(recipeCount: number, useAiFallback: boolean): number {
  if (recipeCount <= 0) return 0
  if (useAiFallback) return (recipeCount * AVG_AI_RECIPE_MS) / 1000
  return (recipeCount * (REQUEST_DELAY_MS + AVG_FETCH_PARSE_MS)) / 1000
}

export async function estimateSiteImport(
  rawStartUrl: string,
  options: {
    maxRecipes?: number
    useAiFallback?: boolean
    signal?: AbortSignal
    onProgress?: (progress: SiteImportProgress) => void
  },
): Promise<SiteImportEstimate> {
  const discoverStart = Date.now()
  const cacheKey = discoveryCacheKey(rawStartUrl, options.maxRecipes)
  const urls = await discoverRecipeUrls(rawStartUrl, options.maxRecipes ?? 0, {
    onProgress: options.onProgress,
    signal: options.signal,
  })
  cachedDiscovery = { key: cacheKey, urls }
  const discoverSeconds = (Date.now() - discoverStart) / 1000

  if (urls.length === 0) {
    throw new Error(
      'Aucune recette trouvee. Essayez l\'URL d\'une liste (ex. https://www.lescommis.com/recettes/).',
    )
  }

  const useAiFallback = options.useAiFallback ?? false
  const estimatedImportSeconds = estimateImportSeconds(urls.length, useAiFallback)

  return {
    discovered: urls.length,
    discoverSeconds,
    estimatedImportSeconds,
    estimatedTotalSeconds: discoverSeconds + estimatedImportSeconds,
  }
}

export async function importRecipesFromSite(
  settings: OllamaSettings,
  rawStartUrl: string,
  options: {
    maxRecipes?: number
    useAiFallback?: boolean
    signal?: AbortSignal
    onProgress?: (progress: SiteImportProgress) => void
  },
): Promise<SiteImportResult> {
  const maxRecipes = resolveMaxRecipes(options.maxRecipes)
  const useAiFallback = options.useAiFallback ?? false
  const failed: string[] = []
  const importedRecipes: Recipe[] = []
  let usedAi = 0
  let skipped = 0

  const cacheKey = discoveryCacheKey(rawStartUrl, options.maxRecipes)
  const cached = cachedDiscovery?.key === cacheKey ? cachedDiscovery.urls : null
  const urls =
    cached ??
    (await discoverRecipeUrls(rawStartUrl, options.maxRecipes ?? 0, {
      onProgress: options.onProgress,
      signal: options.signal,
    }))
  if (!cached) {
    cachedDiscovery = { key: cacheKey, urls }
  }
  if (urls.length === 0) {
    throw new Error(
      'Aucune recette trouvee. Essayez l\'URL d\'une liste (ex. https://www.lescommis.com/recettes/).',
    )
  }

  for (let i = 0; i < urls.length; i++) {
    if (options.signal?.aborted) break

    const url = urls[i]
    options.onProgress?.({
      phase: 'import',
      current: i + 1,
      total: urls.length,
      message: `Import ${i + 1}/${urls.length}`,
      recipeName: url,
    })

    const { recipe, usedAi: aiUsed } = await importRecipeFast(settings, url, useAiFallback)
    if (recipe) {
      importedRecipes.push(recipe)
      if (aiUsed) usedAi += 1
      options.onProgress?.({
        phase: 'import',
        current: i + 1,
        total: urls.length,
        message: `Import ${i + 1}/${urls.length}`,
        recipeName: recipe.name,
      })
    } else {
      skipped += 1
      failed.push(url)
    }

    await sleep(REQUEST_DELAY_MS)
  }

  return {
    recipes: importedRecipes,
    discovered: urls.length,
    imported: importedRecipes.length,
    skipped,
    failed,
    usedAi,
  }
}
