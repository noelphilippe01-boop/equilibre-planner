import { DAYS, type HealthProfile, type MealSlot, type Recipe, type WeekGuestCounts } from '../types/index.js'
import { MEAL_LABELS, getCurrentSeason } from '../types/index.js'
import { isMealSlotActive, type MealGuestPeriod } from './guestCounts.js'
import { pickLightMealRecipe } from './lightMealRecipes.js'
import { sortMeals } from './recipeFormat.js'

export const LIGHT_MEAL_ID_PREFIX = 'light-meal:'

export interface MenuStructure {
  fullMealType: 'lunch' | 'dinner'
  lightMealType: 'lunch' | 'dinner'
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function isLightMealId(recipeId: string): boolean {
  return recipeId.startsWith(LIGHT_MEAL_ID_PREFIX)
}

export function getMenuStructure(profile: HealthProfile): MenuStructure {
  const fullMealType = profile.fullMealType ?? 'dinner'
  return {
    fullMealType,
    lightMealType: fullMealType === 'lunch' ? 'dinner' : 'lunch',
  }
}

function defaultLightMealLabel(mealType: 'breakfast' | 'lunch' | 'dinner'): string {
  if (mealType === 'breakfast') return 'Tartines ou equivalent leger'
  if (mealType === 'lunch') return 'Salade, sandwich ou soupe legere'
  return 'Soupe, salade ou plat leger'
}

export function buildLightMealLabel(
  mealType: 'breakfast' | 'lunch' | 'dinner',
  preferences: string[],
): string {
  const cleaned = preferences.map((item) => item.trim()).filter(Boolean)
  if (!cleaned.length) return defaultLightMealLabel(mealType)
  return cleaned.slice(0, 3).join(', ')
}

export function createLightMeal(
  day: string,
  mealType: 'breakfast' | 'lunch' | 'dinner',
  preferences: string[],
  libraryRecipes?: Recipe[],
  usedIds?: Set<string>,
  seed?: string,
  allergies: string[] = [],
): MealSlot {
  if (libraryRecipes?.length && usedIds && seed) {
    const recipe = pickLightMealRecipe(
      libraryRecipes,
      mealType,
      preferences,
      usedIds,
      `${seed}:${day}:${mealType}`,
      getCurrentSeason(),
      allergies,
    )
    if (recipe) {
      usedIds.add(recipe.id)
      return {
        day,
        mealType,
        recipeId: recipe.id,
        recipeName: recipe.name,
        isLightMeal: true,
      }
    }
  }

  return {
    day,
    mealType,
    recipeId: `${LIGHT_MEAL_ID_PREFIX}${mealType}:${normalizeKey(day)}`,
    recipeName: buildLightMealLabel(mealType, preferences),
    isLightMeal: true,
  }
}

export function expandMenuToDailyStructure(
  fullMeals: MealSlot[],
  profile: HealthProfile,
  guestsByDay?: WeekGuestCounts,
  libraryRecipes?: Recipe[],
  seed = 'menu-light',
): MealSlot[] {
  const structure = getMenuStructure(profile)
  const fullByDay = new Map(
    fullMeals
      .filter((meal) => meal.mealType === structure.fullMealType && !meal.isLightMeal)
      .map((meal) => [meal.day, meal]),
  )
  const usedLightIds = new Set<string>()
  const allergies = profile.allergies ?? []

  const meals: MealSlot[] = []
  for (const day of DAYS) {
    const isActive = (period: MealGuestPeriod) =>
      !guestsByDay || isMealSlotActive(guestsByDay, day, period)

    if (isActive('breakfast')) {
      meals.push(
        createLightMeal(
          day,
          'breakfast',
          profile.mealPreferences.breakfast,
          libraryRecipes,
          usedLightIds,
          seed,
          allergies,
        ),
      )
    }

    for (const mealType of ['lunch', 'dinner'] as const) {
      if (!isActive(mealType)) continue

      if (mealType === structure.fullMealType) {
        const full = fullByDay.get(day)
        if (!full) continue
        meals.push({
          ...full,
          day,
          mealType,
          isLightMeal: false,
        })
      } else {
        meals.push(
          createLightMeal(
            day,
            mealType,
            profile.mealPreferences[mealType],
            libraryRecipes,
            usedLightIds,
            seed,
            allergies,
          ),
        )
      }
    }
  }

  return sortMeals(meals)
}

export function formatMenuStructureForPrompt(profile: HealthProfile): string {
  const structure = getMenuStructure(profile)
  const fullLabel = MEAL_LABELS[structure.fullMealType]
  const lightLabel = MEAL_LABELS[structure.lightMealType]

  return [
    `- 1 seul repas complet par jour: ${fullLabel} (recette bibliotheque, 7 repas sur la semaine)`,
    `- Petit-dejeuner: LEGER — recette bibliotheque si disponible (tartines, soupes, salades…), sinon ${buildLightMealLabel('breakfast', profile.mealPreferences.breakfast)}`,
    `- ${lightLabel}: LEGER — recette bibliotheque si disponible, sinon ${buildLightMealLabel(structure.lightMealType, profile.mealPreferences[structure.lightMealType])}`,
    '- Varie les recettes: une recette differente chaque jour pour le repas complet',
  ].join('\n')
}

export function filterFullMealsFromAi(
  meals: MealSlot[],
  fullMealType: 'lunch' | 'dinner',
  days: string[] = DAYS,
): MealSlot[] {
  const byDay = new Map<string, MealSlot>()

  for (const meal of meals) {
    if (meal.isLightMeal || isLightMealId(meal.recipeId)) continue
    if (meal.mealType !== fullMealType) continue
    if (!DAYS.includes(meal.day)) continue
    byDay.set(meal.day, { ...meal, mealType: fullMealType, isLightMeal: false })
  }

  return days.map((day) => byDay.get(day)).filter((meal): meal is MealSlot => meal != null)
}
