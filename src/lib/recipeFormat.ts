import type { Ingredient, MealSlot, Recipe } from '../types'
import { DAYS } from '../types'

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
  const match = DAYS.find((day) => normalizeKey(day) === normalizeKey(value))
  return match ?? null
}

function normalizeUnit(unit: string): string {
  const key = normalizeKey(unit)
  return UNIT_ALIASES[key] ?? unit.trim()
}

export function sanitizeIngredient(ing: Ingredient): Ingredient {
  const name = ing.name?.trim() ?? ''
  let quantity = String(ing.quantity ?? '').trim()
  let unit = String(ing.unit ?? '').trim()

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

export function formatIngredientLine(ing: Ingredient): string {
  const clean = sanitizeIngredient(ing)
  if (!clean.quantity && !clean.unit) return clean.name
  if (!clean.unit) return `${clean.name} — ${clean.quantity}`
  return `${clean.name} — ${clean.quantity} ${clean.unit}`.replace(/\s+/g, ' ').trim()
}

export function sanitizeRecipe(recipe: Recipe, fallbackId: string): Recipe {
  return {
    ...recipe,
    id: recipe.id?.trim() || fallbackId,
    name: recipe.name?.trim() || 'Recette sans nom',
    servings: Number(recipe.servings) > 0 ? Number(recipe.servings) : 1,
    prepMinutes: Number(recipe.prepMinutes) > 0 ? Number(recipe.prepMinutes) : 20,
    batchCookingNotes: recipe.batchCookingNotes?.trim() ?? '',
    ingredients: (recipe.ingredients ?? []).slice(0, 8).map(sanitizeIngredient),
    steps: (recipe.steps ?? [])
      .map((step) => step.trim())
      .filter(Boolean)
      .slice(0, 5),
    tags: recipe.tags ?? [],
  }
}

export function normalizeMeal(meal: MealSlot, recipeNameById: Map<string, string>): MealSlot | null {
  const day = normalizeDayName(meal.day)
  if (!day) return null

  const recipeId = meal.recipeId?.trim() || ''
  const recipeName = meal.recipeName?.trim() || recipeNameById.get(recipeId) || ''

  if (!recipeId || !recipeName) return null

  return {
    day,
    mealType: normalizeMealType(meal.mealType),
    recipeId,
    recipeName,
    isBatchCooking: Boolean(meal.isBatchCooking),
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
