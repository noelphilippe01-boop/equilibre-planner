import type { Recipe, RecipeMealType, WeeklyMenu, MealSlot, HealthProfile } from '../types/index.js'
import { DAYS, getCurrentSeason, MEAL_LABELS } from '../types/index.js'
import { isMealSlotActive, type WeekGuestCounts } from './guestCounts.js'
import { expandMenuToDailyStructure, getMenuStructure } from './menuStructure.js'
import { sanitizeRecipe } from './recipeFormat.js'

/** Max recettes envoyees au prompt menu (Ollama sature au-dela). */
export const MAX_MENU_PROMPT_RECIPES = 120

/** Incrementer pour vider la bibliotheque existante (migration one-shot). */
export const RECIPE_LIBRARY_VERSION = 2

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function normalizeRecipes(recipes: Recipe[]): Recipe[] {
  return recipes.map((recipe, index) =>
    sanitizeRecipe(recipe, recipe.id?.trim() || `recipe-${index + 1}`),
  )
}

export function loadRecipeLibrary(
  recipes: Recipe[] | undefined,
  settingsVersion: number | undefined,
): Recipe[] {
  if ((settingsVersion ?? 0) < RECIPE_LIBRARY_VERSION) return []
  return normalizeRecipes(recipes ?? [])
}

export function mergeRecipes(existing: Recipe[], incoming: Recipe[]): Recipe[] {
  const map = new Map(normalizeRecipes(existing).map((recipe) => [recipe.id, recipe]))
  for (const recipe of incoming) {
    const clean = sanitizeRecipe(recipe, recipe.id || crypto.randomUUID())
    map.set(clean.id, clean)
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

export function parseRecipeList(raw: unknown): Recipe[] {
  const list = Array.isArray(raw)
    ? raw
    : (raw as { recipes?: unknown }).recipes

  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('Aucune recette detectee.')
  }

  return list.map((item, index) => {
    const recipe = item as Recipe
    const id = recipe.id?.trim() || `import-${Date.now()}-${index + 1}`
    return sanitizeRecipe({ ...recipe, id }, id)
  })
}

function recipeMatchesAllergies(recipe: Recipe, allergies: string[]): boolean {
  if (!allergies.length) return true
  const haystack = normalizeKey(
    [
      recipe.name,
      ...(recipe.ingredients ?? []).map((i) => i.name),
      ...(recipe.tags ?? []),
    ].join(' '),
  )
  return !allergies.some((allergy) => {
    const key = normalizeKey(allergy)
    return key.length > 2 && haystack.includes(key)
  })
}

function recipeMatchesSeason(recipe: Recipe, season: string): boolean {
  if (!recipe.seasons?.length) return true
  return recipe.seasons.includes(season)
}

/** Filtre la bibliotheque pour le prompt (allergies, saison). */
export function selectRecipesForMenu(
  recipes: Recipe[],
  season: string,
  allergies: string[],
): Recipe[] {
  const safe = recipes.filter(
    (recipe) => recipeMatchesAllergies(recipe, allergies) && recipeMatchesSeason(recipe, season),
  )
  return safe.length > 0 ? safe : recipes.filter((recipe) => recipeMatchesAllergies(recipe, allergies))
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

/** Seed unique par tentative de generation (echantillon recettes + repas legers). */
export function createMenuGenerationSeed(): string {
  return crypto.randomUUID()
}

function recipeSupportsMeal(recipe: Recipe, mealType: RecipeMealType): boolean {
  if (!recipe.mealTypes?.length) return true
  return recipe.mealTypes.includes(mealType)
}

export { recipeSupportsMeal }

function pickRecipes(
  pool: Recipe[],
  count: number,
  used: Set<string>,
): Recipe[] {
  const picked: Recipe[] = []
  for (const recipe of pool) {
    if (picked.length >= count) break
    if (used.has(recipe.id)) continue
    used.add(recipe.id)
    picked.push(recipe)
  }
  return picked
}

/** Echantillon equilibre pour le prompt IA quand la bibliotheque est volumineuse. */
export function prepareRecipesForMenuPrompt(
  recipes: Recipe[],
  season: string,
  allergies: string[],
  seed: string,
): { promptRecipes: Recipe[]; totalAvailable: number } {
  const filtered = selectRecipesForMenu(recipes, season, allergies)
  if (filtered.length <= MAX_MENU_PROMPT_RECIPES) {
    return {
      promptRecipes: seededShuffle(filtered, seed),
      totalAvailable: filtered.length,
    }
  }

  const shuffled = seededShuffle(filtered, seed)
  const breakfast = shuffled.filter((recipe) => recipeSupportsMeal(recipe, 'breakfast'))
  const lunch = shuffled.filter((recipe) => recipeSupportsMeal(recipe, 'lunch'))
  const dinner = shuffled.filter((recipe) => recipeSupportsMeal(recipe, 'dinner'))
  const quota = Math.floor(MAX_MENU_PROMPT_RECIPES / 3)
  const used = new Set<string>()

  const selected = [
    ...pickRecipes(breakfast.length ? breakfast : shuffled, quota, used),
    ...pickRecipes(lunch.length ? lunch : shuffled, quota, used),
    ...pickRecipes(dinner.length ? dinner : shuffled, quota, used),
  ]

  for (const recipe of shuffled) {
    if (selected.length >= MAX_MENU_PROMPT_RECIPES) break
    if (used.has(recipe.id)) continue
    used.add(recipe.id)
    selected.push(recipe)
  }

  return { promptRecipes: selected, totalAvailable: filtered.length }
}

/** Repas complets de secours pour des jours precis (ex. jours non couverts par l'IA). */
export function pickFallbackFullMealsForDays(
  pool: Recipe[],
  days: string[],
  fullMealType: RecipeMealType,
  usedIds: Set<string>,
  shuffleSeed: string,
): MealSlot[] {
  if (!pool.length || !days.length) return []

  const shuffled = seededShuffle(pool, shuffleSeed)
  let cursor = 0
  const picked: MealSlot[] = []

  for (const day of days) {
    let recipe: Recipe | null = null
    for (let offset = 0; offset < shuffled.length; offset++) {
      const candidate = shuffled[(cursor + offset) % shuffled.length]
      if (usedIds.has(candidate.id)) continue
      if (!recipeSupportsMeal(candidate, fullMealType)) continue
      recipe = candidate
      cursor = (cursor + offset + 1) % shuffled.length
      break
    }
    if (!recipe) {
      for (const candidate of shuffled) {
        if (usedIds.has(candidate.id)) continue
        recipe = candidate
        break
      }
    }
    if (!recipe) break

    usedIds.add(recipe.id)
    picked.push({
      day,
      mealType: fullMealType,
      recipeId: recipe.id,
      recipeName: recipe.name,
      isLightMeal: false,
    })
  }

  return picked
}

/** Menu hebdomadaire local si la reponse IA est vide ou illisible. */
export function generateFallbackWeeklyMenu(
  pool: Recipe[],
  weekStart: string,
  guestsByDay: WeekGuestCounts,
  profile: HealthProfile,
  shuffleSeed = weekStart,
): WeeklyMenu {
  if (pool.length === 0) {
    throw new Error('Bibliotheque vide.')
  }

  const structure = getMenuStructure(profile)
  const shuffled = seededShuffle(pool, shuffleSeed)
  let cursor = 0

  const pick = (mealType: RecipeMealType): Recipe => {
    for (let offset = 0; offset < shuffled.length; offset++) {
      const recipe = shuffled[(cursor + offset) % shuffled.length]
      if (recipeSupportsMeal(recipe, mealType)) {
        cursor = (cursor + offset + 1) % shuffled.length
        return recipe
      }
    }
    const recipe = shuffled[cursor % shuffled.length]
    cursor += 1
    return recipe
  }

  const fullMeals: MealSlot[] = []
  for (const day of DAYS) {
    if (!isMealSlotActive(guestsByDay, day, structure.fullMealType)) continue

    const recipe = pick(structure.fullMealType)
    fullMeals.push({
      day,
      mealType: structure.fullMealType,
      recipeId: recipe.id,
      recipeName: recipe.name,
      isLightMeal: false,
    })
  }

  return {
    id: crypto.randomUUID(),
    weekStart,
    season: getCurrentSeason(),
    meals: expandMenuToDailyStructure(fullMeals, profile, guestsByDay, pool, shuffleSeed),
    guestsByDay,
    createdAt: new Date().toISOString(),
  }
}

function formatMealTypes(recipe: Recipe): string {
  if (!recipe.mealTypes?.length) return 'tous repas'
  return recipe.mealTypes.map((type) => MEAL_LABELS[type]).join(', ')
}

function formatIngredientsCompact(recipe: Recipe): string {
  return recipe.ingredients
    .map((ing) => `${ing.name} ${ing.quantity}${ing.unit ? ` ${ing.unit}` : ''}`.trim())
    .join('; ')
}

/** Format compact pour le prompt IA. */
export function formatRecipesForPrompt(
  recipes: Recipe[],
  options?: { compact?: boolean },
): string {
  if (!recipes.length) return 'Aucune recette en bibliotheque.'

  if (options?.compact) {
    return recipes
      .map(
        (recipe, index) =>
          `- #${index + 1} id: ${recipe.id} | ${recipe.name} | repas: ${formatMealTypes(recipe)} | ${recipe.prepMinutes} min`,
      )
      .join('\n')
  }

  return recipes
    .map((recipe) => {
      const tags = (recipe.tags ?? []).length
        ? ` | tags: ${(recipe.tags ?? []).join(', ')}`
        : ''
      return [
        `- id: ${recipe.id}`,
        `  nom: ${recipe.name}`,
        `  repas: ${formatMealTypes(recipe)}`,
        `  ${recipe.servings} pers, ${recipe.prepMinutes} min${tags}`,
        `  ingredients: ${formatIngredientsCompact(recipe)}`,
      ].join('\n')
    })
    .join('\n')
}

/** Resout les recettes du menu a partir de la bibliotheque + ajustements IA. */
export function resolveMenuRecipes(
  library: Recipe[],
  aiRecipes: Recipe[],
  mealRecipeIds: string[],
): Recipe[] {
  const libraryById = new Map(library.map((recipe) => [recipe.id, recipe]))
  const aiById = new Map(aiRecipes.map((recipe) => [recipe.id, recipe]))
  const usedIds = [...new Set(mealRecipeIds.filter(Boolean))]

  return usedIds
    .map((id) => {
      const base = libraryById.get(id)
      const adjusted = aiById.get(id)

      if (base && adjusted) {
        return sanitizeRecipe(
          {
            ...base,
            servings: adjusted.servings > 0 ? adjusted.servings : base.servings,
            ingredients: adjusted.ingredients?.length ? adjusted.ingredients : base.ingredients,
          },
          id,
        )
      }

      if (base) return base
      if (adjusted) return sanitizeRecipe(adjusted, id)
      return null
    })
    .filter((recipe): recipe is Recipe => recipe !== null)
}

export function exportRecipesJson(recipes: Recipe[]): string {
  return JSON.stringify(recipes, null, 2)
}
