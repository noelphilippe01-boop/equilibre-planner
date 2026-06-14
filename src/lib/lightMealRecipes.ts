import type { Recipe, RecipeMealType } from '../types/index.js'
import { selectRecipesForMenu } from './recipeLibrary.js'

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const LIGHT_MEAL_KEYWORDS = [
  'soupe',
  'potage',
  'veloute',
  'gaspacho',
  'bouillon',
  'minestrone',
  'salade',
  'salad',
  'tartine',
  'toast',
  'bruschetta',
  'sandwich',
  'wrap',
  'panini',
  'croque',
  'smoothie',
  'yaourt',
  'yogourt',
  'cereale',
  'porridge',
  'granola',
  'muesli',
  'baba ganoush',
  'houmous',
  'hummus',
]

const PREFERENCE_KEYWORDS: Record<string, string[]> = {
  tartines: ['tartine', 'toast', 'brioche', 'pain'],
  cereales: ['cereale', 'muesli', 'granola', 'porridge'],
  yaourt: ['yaourt', 'yogourt', 'fromage blanc'],
  fruits: ['fruit', 'compote', 'smoothie'],
  oeufs: ['oeuf', 'omelette'],
  smoothie: ['smoothie'],
  salades: ['salade', 'crudite', 'mesclun'],
  soupes: ['soupe', 'potage', 'veloute', 'gaspacho', 'minestrone'],
  sandwich: ['sandwich', 'wrap', 'panini', 'club', 'croque'],
  'plat unique': ['bowl', 'wok', 'poke'],
}

function recipeHaystack(recipe: Recipe): string {
  return normalizeKey(
    [recipe.name, ...(recipe.tags ?? []), ...(recipe.ingredients ?? []).map((i) => i.name)].join(
      ' ',
    ),
  )
}

function recipeSupportsMeal(recipe: Recipe, mealType: RecipeMealType): boolean {
  if (!recipe.mealTypes?.length) return true
  return recipe.mealTypes.includes(mealType)
}

export function recipeLooksLikeLightMeal(recipe: Recipe): boolean {
  const haystack = recipeHaystack(recipe)
  if (haystack.includes('leger') || haystack.includes('light')) return true
  return LIGHT_MEAL_KEYWORDS.some((keyword) => haystack.includes(keyword))
}

function preferenceIsSkip(preference: string): boolean {
  const key = normalizeKey(preference)
  return key.includes('rien') || key.includes('tres leger')
}

export function recipeMatchesLightPreference(recipe: Recipe, preference: string): boolean {
  if (preferenceIsSkip(preference)) return false
  const haystack = recipeHaystack(recipe)
  const key = normalizeKey(preference)
  const mapped = PREFERENCE_KEYWORDS[key] ?? [key]
  return mapped.some((keyword) => keyword.length > 2 && haystack.includes(keyword))
}

export function filterLightMealCandidates(
  recipes: Recipe[],
  mealType: RecipeMealType,
  preferences: string[],
): Recipe[] {
  const activePrefs = preferences.map((item) => item.trim()).filter(Boolean).filter((item) => !preferenceIsSkip(item))

  const lightForMeal = recipes.filter(
    (recipe) => recipeSupportsMeal(recipe, mealType) && recipeLooksLikeLightMeal(recipe),
  )

  if (!activePrefs.length) return lightForMeal

  const matched = lightForMeal.filter((recipe) =>
    activePrefs.some((pref) => recipeMatchesLightPreference(recipe, pref)),
  )
  return matched.length > 0 ? matched : lightForMeal
}

function hashSeed(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  const arr = [...items]
  let state = hashSeed(seed)
  const rand = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 0x100000000
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function pickLightMealRecipe(
  libraryRecipes: Recipe[],
  mealType: RecipeMealType,
  preferences: string[],
  usedIds: Set<string>,
  seed: string,
  season: string,
  allergies: string[],
): Recipe | null {
  const pool = selectRecipesForMenu(libraryRecipes, season, allergies)
  const candidates = filterLightMealCandidates(pool, mealType, preferences)
  if (!candidates.length) return null

  const shuffled = seededShuffle(candidates, seed)
  for (const recipe of shuffled) {
    if (!usedIds.has(recipe.id)) return recipe
  }
  return shuffled[0] ?? null
}
