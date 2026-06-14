import type { Ingredient, MealSlot, Recipe } from '../types/index.js'
import { DAYS } from '../types/index.js'

const MEAL_ORDER: MealSlot['mealType'][] = ['breakfast', 'lunch', 'dinner', 'snack']

const MEAL_TYPE_ALIASES: Record<string, MealSlot['mealType']> = {
  breakfast: 'breakfast',
  'petit-dejeuner': 'breakfast',
  'petit dejeuner': 'breakfast',
  lunch: 'lunch',
  dejeuner: 'lunch',
  dinner: 'dinner',
  diner: 'dinner',
  snack: 'snack',
  collation: 'snack',
}

const UNIT_ALIASES: Record<string, string> = {
  gr: 'g',
  g: 'g',
  gramme: 'g',
  grammes: 'g',
  kg: 'kg',
  ml: 'ml',
  cl: 'cl',
  l: 'l',
  litre: 'l',
  litr: 'l',
  citron: 'pc',
  citrons: 'pc',
  tasse: 'tasse',
  tasses: 'tasse',
  cuillere: 'c. a s.',
  'cuillere a soupe': 'c. a s.',
  'cuillères à soupe': 'c. a s.',
  tablespoon: 'c. a s.',
  tbsp: 'c. a s.',
  'c. a s.': 'c. a s.',
  'c.a.s.': 'c. a s.',
  teaspoon: 'c. a c.',
  tsp: 'c. a c.',
  pc: 'pc',
  piece: 'pc',
  pieces: 'pc',
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function normalizeMealType(value: unknown): MealSlot['mealType'] {
  if (typeof value !== 'string' || !value.trim()) return 'dinner'
  const key = normalizeKey(value)
  return MEAL_TYPE_ALIASES[key] ?? 'dinner'
}

export function normalizeDayName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const key = normalizeKey(value)
  const dayAliases: Record<string, string> = {
    lundi: 'Lundi',
    mardi: 'Mardi',
    mercredi: 'Mercredi',
    jeudi: 'Jeudi',
    vendredi: 'Vendredi',
    samedi: 'Samedi',
    dimanche: 'Dimanche',
    monday: 'Lundi',
    tuesday: 'Mardi',
    wednesday: 'Mercredi',
    thursday: 'Jeudi',
    friday: 'Vendredi',
    saturday: 'Samedi',
    sunday: 'Dimanche',
  }
  if (dayAliases[key]) return dayAliases[key]
  return DAYS.find((day) => normalizeKey(day) === key) ?? null
}

function normalizeUnit(unit: string): string {
  const key = normalizeKey(unit)
  return UNIT_ALIASES[key] ?? unit.trim()
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

/** Nettoie texte importe (web, OCR) : entites HTML, asterisques glossaire, espaces. */
export function cleanRecipeText(text: string): string {
  let value = decodeHtmlEntities(text).replace(/\u00a0/g, ' ')
  value = value.replace(/([a-zA-ZàâçéèêëîïôùûüÀ-Ÿ])\*+/g, '$1')
  value = value.replace(/\s+([.,;:!?])/g, '$1')
  value = value.replace(/\s{2,}/g, ' ')
  return value.trim()
}

export function normalizeRecipeSteps(steps: string[]): string[] {
  const result: string[] = []

  for (const raw of steps) {
    const step = cleanRecipeText(raw)
    if (!step) continue

    const parts = step
      .split(/(?=(?:^|\s)\d{1,2}[.)]\s+)/)
      .map((part) => part.trim())
      .filter(Boolean)

    if (parts.length > 1) {
      for (const part of parts) {
        const body = part.replace(/^\d{1,2}[.)]\s*/, '').trim()
        if (body) result.push(body)
      }
      continue
    }

    const body = step.replace(/^\d{1,2}[.)]\s*/, '').trim()
    result.push(body || step)
  }

  return result
}

/** Affichage lisible : une phrase par ligne dans une etape longue. */
export function formatStepForDisplay(step: string): string {
  return cleanRecipeText(step).replace(/(?<=[.!?…])\s+(?=[A-ZÉÈÀÂÎÔÙÇ0-9])/g, '\n')
}

export function sanitizeIngredient(ing: Ingredient): Ingredient {
  const name = cleanRecipeText(ing.name?.trim() ?? '')
  let quantity = cleanRecipeText(String(ing.quantity ?? ''))
  let unit = cleanRecipeText(String(ing.unit ?? ''))

  const embedded = quantity.match(/^([\d.,]+)\s*([a-zA-Zàâçéèêëîïôùûü. ]+)$/)
  if (embedded && !unit) {
    quantity = embedded[1]
    unit = embedded[2]
  }

  const qtyUnit = quantity.match(/^([\d.,]+)\s*(g|gr|kg|ml|cl|l)$/i)
  if (qtyUnit) {
    quantity = qtyUnit[1]
    unit = unit || qtyUnit[2]
  }

  unit = normalizeUnit(unit)

  if (unit && normalizeKey(quantity) === normalizeKey(unit)) {
    quantity = '1'
  }

  if (normalizeKey(unit) === normalizeKey(name) || normalizeKey(quantity) === normalizeKey(name)) {
    if (!quantity || normalizeKey(quantity) === normalizeKey(name)) quantity = '1'
    if (normalizeKey(unit) === normalizeKey(name)) unit = 'pc'
  }

  if (unit && quantity.toLowerCase().endsWith(unit.toLowerCase())) {
    quantity = quantity.slice(0, -unit.length).trim()
  }

  return { name, quantity, unit }
}

export function getIngredientParts(ing: Ingredient): { name: string; quantityLabel: string } {
  const clean = sanitizeIngredient(ing)
  let quantityLabel = ''
  if (clean.quantity && clean.unit) {
    quantityLabel = `${clean.quantity} ${clean.unit}`.replace(/\s+/g, ' ').trim()
  } else if (clean.quantity) {
    quantityLabel = clean.quantity
  } else if (clean.unit) {
    quantityLabel = clean.unit
  }
  return { name: clean.name, quantityLabel }
}

function parseQuantity(value: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  if (!trimmed) return null

  const mixed = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) {
    return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  }

  const fraction = trimmed.match(/^(\d+)\/(\d+)$/)
  if (fraction) {
    return Number(fraction[1]) / Number(fraction[2])
  }

  const numeric = Number(trimmed)
  return Number.isFinite(numeric) ? numeric : null
}

function formatScaledQuantity(value: number): string {
  if (value <= 0) return '0'

  const rounded = Math.round(value * 100) / 100
  if (Math.abs(rounded - Math.round(rounded)) < 0.05) {
    return String(Math.round(rounded))
  }

  if (rounded < 1) {
    const fractions: Array<[number, string]> = [
      [0.25, '1/4'],
      [0.33, '1/3'],
      [0.5, '1/2'],
      [0.66, '2/3'],
      [0.75, '3/4'],
    ]
    for (const [target, label] of fractions) {
      if (Math.abs(rounded - target) < 0.08) return label
    }
  }

  return String(rounded).replace('.', ',')
}

/** Quantite adaptee au nombre de convives (base = portions de la recette). */
export function getScaledIngredientQuantityLabel(
  ing: Ingredient,
  recipeServings: number,
  targetServings: number,
): string | null {
  const base = getIngredientParts(ing)
  if (!base.quantityLabel) return null

  const clean = sanitizeIngredient(ing)
  const parsed = parseQuantity(clean.quantity)
  if (parsed == null) return base.quantityLabel

  const baseServings = recipeServings > 0 ? recipeServings : 1
  const guests = targetServings > 0 ? targetServings : 1
  const scaled = parsed * (guests / baseServings)
  const quantity = formatScaledQuantity(scaled)

  if (clean.unit) return `${quantity} ${clean.unit}`.replace(/\s+/g, ' ').trim()
  return quantity
}

export function formatIngredientLine(ing: Ingredient): string {
  const { name, quantityLabel } = getIngredientParts(ing)
  if (!quantityLabel) return name
  return `${name} — ${quantityLabel}`
}

export function sanitizeRecipe(recipe: Recipe, fallbackId: string): Recipe {
  const mealTypes = recipe.mealTypes?.length
    ? [...new Set(recipe.mealTypes.map((type) => normalizeMealType(type)))]
    : undefined

  return {
    ...recipe,
    id: recipe.id?.trim() || fallbackId,
    name: cleanRecipeText(recipe.name?.trim() || 'Recette sans nom'),
    servings: Number(recipe.servings) > 0 ? Number(recipe.servings) : 1,
    prepMinutes: Number(recipe.prepMinutes) > 0 ? Number(recipe.prepMinutes) : 20,
    ingredients: (recipe.ingredients ?? []).slice(0, 12).map(sanitizeIngredient),
    steps: normalizeRecipeSteps(recipe.steps ?? []).slice(0, 12),
    tags: (recipe.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
    source: recipe.source?.trim() || undefined,
    sourceUrl: recipe.sourceUrl?.trim() || undefined,
    mealTypes,
    seasons: recipe.seasons?.map((s) => s.toLowerCase().trim()).filter(Boolean),
  }
}

function findRecipeByName(name: string, pool: Recipe[]): Recipe | null {
  const key = normalizeKey(name)
  if (!key) return null

  const byExact = new Map(pool.map((recipe) => [normalizeKey(recipe.name), recipe]))
  if (byExact.has(key)) return byExact.get(key)!

  const fuzzy = pool.find((recipe) => {
    const recipeKey = normalizeKey(recipe.name)
    return recipeKey.includes(key) || key.includes(recipeKey)
  })
  if (fuzzy) return fuzzy

  const words = key.split(/\s+/).filter((word) => word.length > 3)
  if (!words.length) return null

  let best: Recipe | null = null
  let bestScore = 0
  for (const recipe of pool) {
    const recipeKey = normalizeKey(recipe.name)
    let score = 0
    for (const word of words) {
      if (recipeKey.includes(word)) score += 1
    }
    if (score > bestScore) {
      bestScore = score
      best = recipe
    }
  }
  return bestScore >= 2 ? best : null
}

export function resolveMealRecipe(
  recipeId: string | undefined,
  recipeName: string | undefined,
  library: Recipe[],
  promptPool?: Recipe[],
): Recipe | null {
  const namePool = promptPool?.length ? promptPool : library
  const byId = new Map(library.map((recipe) => [recipe.id, recipe]))

  const id = recipeId?.trim() || ''
  const name = recipeName?.trim() || ''

  if (id && /^#?\s*\d+$/.test(id) && promptPool?.length) {
    const index = Number.parseInt(id.replace(/[^\d]/g, ''), 10) - 1
    if (index >= 0 && index < promptPool.length) {
      return byId.get(promptPool[index].id) ?? promptPool[index]
    }
  }

  if (id && byId.has(id)) return byId.get(id)!

  if (id) {
    const partial = library.find(
      (recipe) =>
        recipe.id === id ||
        recipe.id.endsWith(id) ||
        id.endsWith(recipe.id) ||
        recipe.id.includes(id),
    )
    if (partial) return partial

    const idAsName = findRecipeByName(id, namePool)
    if (idAsName) return idAsName
  }

  if (name) {
    const match = findRecipeByName(name, namePool)
    if (match) return match
  }

  return null
}

export function normalizeMeal(meal: Partial<MealSlot>, library: Recipe[], promptPool?: Recipe[]): MealSlot | null {
  const day = normalizeDayName(meal.day)
  if (!day) return null

  const recipe = resolveMealRecipe(meal.recipeId, meal.recipeName, library, promptPool)
  if (!recipe) return null

  return {
    day,
    mealType: normalizeMealType(meal.mealType),
    recipeId: recipe.id,
    recipeName: recipe.name,
  }
}

export function sortMeals(meals: MealSlot[]): MealSlot[] {
  return [...meals].sort((a, b) => {
    const dayDiff = DAYS.indexOf(a.day) - DAYS.indexOf(b.day)
    if (dayDiff !== 0) return dayDiff
    return MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType)
  })
}

export function uniqueRecipesForMenu(
  meals: MealSlot[],
  recipesById: Map<string, Recipe>,
): Recipe[] {
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  const result: Recipe[] = []

  for (const meal of meals) {
    if (meal.isLightMeal) continue
    const recipe = recipesById.get(meal.recipeId)
    if (!recipe) continue
    const nameKey = normalizeKey(recipe.name)
    if (seenIds.has(recipe.id) || seenNames.has(nameKey)) continue
    seenIds.add(recipe.id)
    seenNames.add(nameKey)
    result.push(recipe)
  }

  return result
}
