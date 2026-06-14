import type { AppData, HealthProfile, MealSlot, Recipe, WeeklyMenu } from '../types'
import { getCurrentSeason, MEAL_LABELS } from '../types'
import { getMealGuestCount, normalizeGuestCounts } from './guestCounts'
import { filterLightMealCandidates, pickLightMealRecipe } from './lightMealRecipes'
import { formatMealPreferencesForPrompt } from './mealPreferences'
import { getMenuStructure, isLightMealId } from './menuStructure'
import { normalizeMeal, resolveMealRecipe } from './recipeFormat'
import { formatSeasonProduceForPrompt } from './seasonCalendar'
import {
  formatRecipesForPrompt,
  prepareRecipesForMenuPrompt,
  recipeSupportsMeal,
  selectRecipesForMenu,
} from './recipeLibrary'

export interface MealSubstitutionTarget {
  day: string
  mealType: MealSlot['mealType']
}

function isLightMealSlot(profile: HealthProfile, mealType: MealSlot['mealType']): boolean {
  const structure = getMenuStructure(profile)
  return mealType === 'breakfast' || mealType === structure.lightMealType
}

function getCurrentMeal(menu: WeeklyMenu, target: MealSubstitutionTarget): MealSlot | undefined {
  return menu.meals.find((meal) => meal.day === target.day && meal.mealType === target.mealType)
}

function getUsedRecipeIds(menu: WeeklyMenu, exclude?: MealSubstitutionTarget): Set<string> {
  const ids = new Set<string>()
  for (const meal of menu.meals) {
    if (exclude && meal.day === exclude.day && meal.mealType === exclude.mealType) continue
    if (isLightMealId(meal.recipeId)) continue
    ids.add(meal.recipeId)
  }
  return ids
}

function filterSubstitutionPool(
  recipes: Recipe[],
  profile: HealthProfile,
  mealType: MealSlot['mealType'],
  isLight: boolean,
  excludeIds: Set<string>,
  currentRecipeId?: string,
): Recipe[] {
  const preferences =
    mealType === 'breakfast' || mealType === 'lunch' || mealType === 'dinner'
      ? profile.mealPreferences[mealType]
      : []

  const season = getCurrentSeason()
  const safe = selectRecipesForMenu(recipes, season, profile.allergies)

  let pool = safe.filter((recipe) => {
    if (excludeIds.has(recipe.id)) return false
    if (currentRecipeId && recipe.id === currentRecipeId) return false
    return recipeSupportsMeal(recipe, mealType)
  })

  if (isLight) {
    pool = filterLightMealCandidates(pool, mealType, preferences)
  }

  return pool
}

function summarizeOtherMeals(menu: WeeklyMenu, target: MealSubstitutionTarget): string {
  const lines = menu.meals
    .filter((meal) => !(meal.day === target.day && meal.mealType === target.mealType))
    .map((meal) => `- ${meal.day} ${MEAL_LABELS[meal.mealType]}: ${meal.recipeName}`)
  return lines.length ? lines.join('\n') : 'Aucun autre repas planifie.'
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

export function pickFallbackMealSubstitution(
  libraryRecipes: Recipe[],
  menu: WeeklyMenu,
  target: MealSubstitutionTarget,
  profile: HealthProfile,
): MealSlot | null {
  const current = getCurrentMeal(menu, target)
  if (!current) return null

  const isLight = isLightMealSlot(profile, target.mealType)
  const excludeIds = getUsedRecipeIds(menu, target)
  const pool = filterSubstitutionPool(
    libraryRecipes,
    profile,
    target.mealType,
    isLight,
    excludeIds,
    isLightMealId(current.recipeId) ? undefined : current.recipeId,
  )

  if (!pool.length) return null

  if (isLight) {
    const usedIds = new Set(excludeIds)
    if (!isLightMealId(current.recipeId)) usedIds.add(current.recipeId)
    const recipe = pickLightMealRecipe(
      pool,
      target.mealType,
      profile.mealPreferences[target.mealType as 'breakfast' | 'lunch' | 'dinner'] ?? [],
      usedIds,
      `${menu.weekStart}:${target.day}:${target.mealType}:sub`,
      getCurrentSeason(),
      profile.allergies,
    )
    if (!recipe) return null
    return {
      day: target.day,
      mealType: target.mealType,
      recipeId: recipe.id,
      recipeName: recipe.name,
      isLightMeal: true,
    }
  }

  const recipe = seededShuffle(pool, `${menu.weekStart}:${target.day}:${target.mealType}`)[0]
  return {
    day: target.day,
    mealType: target.mealType,
    recipeId: recipe.id,
    recipeName: recipe.name,
    isLightMeal: false,
  }
}

function extractSubstitutionMeal(raw: unknown): Partial<MealSlot> | null {
  if (!raw || typeof raw !== 'object') return null
  const parsed = raw as {
    meal?: Partial<MealSlot>
    meals?: Partial<MealSlot>[]
    recipeId?: string
    recipeName?: string
  }
  if (parsed.meal) return parsed.meal
  if (Array.isArray(parsed.meals) && parsed.meals[0]) return parsed.meals[0]
  if (parsed.recipeId || parsed.recipeName) {
    return { recipeId: parsed.recipeId, recipeName: parsed.recipeName }
  }
  return null
}

export function parseMealSubstitutionResponse(
  raw: unknown,
  target: MealSubstitutionTarget,
  menu: WeeklyMenu,
  libraryRecipes: Recipe[],
  profile: HealthProfile,
  promptRecipes: Recipe[],
): { meal: MealSlot; usedFallback: boolean } | null {
  const current = getCurrentMeal(menu, target)
  if (!current) return null

  const isLight = isLightMealSlot(profile, target.mealType)
  const excludeIds = getUsedRecipeIds(menu, target)
  const mealRaw = extractSubstitutionMeal(raw)
  let usedFallback = false

  let normalized =
    mealRaw &&
    normalizeMeal(
      { ...mealRaw, day: target.day, mealType: target.mealType },
      libraryRecipes,
      promptRecipes,
    )

  if (normalized) {
    const duplicate = excludeIds.has(normalized.recipeId)
    const sameAsCurrent =
      !isLightMealId(current.recipeId) && normalized.recipeId === current.recipeId
    if (duplicate || sameAsCurrent) normalized = null
  }

  if (!normalized) {
    normalized = pickFallbackMealSubstitution(libraryRecipes, menu, target, profile)
    usedFallback = true
  }

  if (!normalized) return null

  return {
    meal: {
      ...normalized,
      day: target.day,
      mealType: target.mealType,
      isLightMeal: isLight,
    },
    usedFallback,
  }
}

export function replaceMealInMenu(menu: WeeklyMenu, replacement: MealSlot): WeeklyMenu {
  return {
    ...menu,
    meals: menu.meals.map((meal) =>
      meal.day === replacement.day && meal.mealType === replacement.mealType ? replacement : meal,
    ),
  }
}

export function buildMealSubstitutionPrompt(params: {
  data: AppData
  menu: WeeklyMenu
  target: MealSubstitutionTarget
  userNotes?: string
}): { system: string; user: string; promptRecipes: Recipe[] } {
  const { data, menu, target, userNotes } = params
  const profile = data.profile
  const current = getCurrentMeal(menu, target)!
  const isLight = isLightMealSlot(profile, target.mealType)
  const guestCounts = normalizeGuestCounts(menu.guestsByDay ?? data.menuGuestCounts)
  const mealGuests = getMealGuestCount(
    guestCounts,
    target.day,
    target.mealType as 'breakfast' | 'lunch' | 'dinner',
  )
  const excludeIds = getUsedRecipeIds(menu, target)
  const season = getCurrentSeason()

  const { promptRecipes: sampled } = prepareRecipesForMenuPrompt(
    data.recipes,
    season,
    profile.allergies,
    `${menu.weekStart}:${target.day}:${target.mealType}`,
  )

  const promptRecipes = filterSubstitutionPool(
    sampled,
    profile,
    target.mealType,
    isLight,
    excludeIds,
    isLightMealId(current.recipeId) ? undefined : current.recipeId,
  )

  const libraryBlock = formatRecipesForPrompt(promptRecipes, { compact: promptRecipes.length > 40 })
  const currentRecipe = resolveMealRecipe(current.recipeId, current.recipeName, data.recipes)

  return {
    system: `Tu es un nutritionniste francais. L'utilisateur souhaite REMPLACER un seul repas du menu.
Reponds UNIQUEMENT en JSON valide:
{
  "meal": {
    "recipeId": "string",
    "recipeName": "string"
  }
}
REGLES:
- Choisis UNE recette DIFFERENTE de "${current.recipeName}" dans la bibliotheque ci-dessous
- recipeId = id exact de la bibliotheque (ou #N)
- Ne reutilise PAS une recette deja presente ailleurs dans la semaine (voir menu actuel)
- Repas ${isLight ? 'LEGER' : 'COMPLET'} — type: ${target.mealType}
- Ne invente pas de nouvelle recette ni de nouvel id
- Pas de commentaire hors JSON`,
    user: `Substituer le repas suivant:
- Jour: ${target.day}
- Creneau: ${MEAL_LABELS[target.mealType]}
- Personnes: ${mealGuests}
- Recette actuelle a remplacer: ${current.recipeName}${
      currentRecipe ? ` (${currentRecipe.prepMinutes} min, ${currentRecipe.servings} pers.)` : ''
    }
${userNotes?.trim() ? `\nPreferences pour le remplacement:\n${userNotes.trim()}` : ''}

Profil:
- Allergies: ${profile.allergies.join(', ') || 'aucune'}
- Preferences alimentaires: ${profile.dietaryPreferences.join(', ') || 'aucune'}
${formatMealPreferencesForPrompt(profile.mealPreferences, profile)}

${formatSeasonProduceForPrompt()}

Autres repas de la semaine (ne pas dupliquer ces recettes):
${summarizeOtherMeals(menu, target)}

BIBLIOTHEQUE (${promptRecipes.length} recettes candidates — choisis UNIQUEMENT ici):
${libraryBlock}`,
    promptRecipes,
  }
}
