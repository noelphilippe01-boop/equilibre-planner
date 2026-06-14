import type { Recipe } from '../types'

export interface ImportedSite {
  id: string
  name: string
  count: number
  listingUrl?: string
}

function siteKeyFromRecipe(recipe: Recipe): string | null {
  if (recipe.sourceUrl) {
    try {
      return new URL(recipe.sourceUrl).hostname.replace(/^www\./i, '').toLowerCase()
    } catch {
      // fall through
    }
  }
  const source = recipe.source?.trim()
  return source ? source.toLowerCase() : null
}

function siteNameFromRecipe(recipe: Recipe, key: string): string {
  return recipe.source?.trim() || key
}

function listingUrlFromExample(exampleUrl: string): string | undefined {
  try {
    const url = new URL(exampleUrl)
    const match = url.pathname.match(/^(\/(?:recettes|recipes|recette|recipe))(?:\/|$)/i)
    if (match) return `${url.origin}${match[1]}/`
    return `${url.origin}/`
  } catch {
    return undefined
  }
}

export function listImportedSites(recipes: Recipe[]): ImportedSite[] {
  const groups = new Map<string, { name: string; count: number; exampleUrl?: string }>()

  for (const recipe of recipes) {
    const key = siteKeyFromRecipe(recipe)
    if (!key) continue

    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
      if (!existing.exampleUrl && recipe.sourceUrl) {
        existing.exampleUrl = recipe.sourceUrl
      }
    } else {
      groups.set(key, {
        name: siteNameFromRecipe(recipe, key),
        count: 1,
        exampleUrl: recipe.sourceUrl,
      })
    }
  }

  return [...groups.entries()]
    .map(([id, entry]) => ({
      id,
      name: entry.name,
      count: entry.count,
      listingUrl: entry.exampleUrl ? listingUrlFromExample(entry.exampleUrl) : undefined,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'))
}
