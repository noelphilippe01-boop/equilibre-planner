import type { AppData, HealthProfile, MealPreferences, MealSlot, Recipe, WeeklyMenu, WeeklyActivityPlan, WeekGuestCounts } from '../types'
import { defaultMealPreferences, getCurrentSeason } from '../types'
import { formatGuestCountsForPrompt, getActiveFullMealDays, normalizeGuestCounts } from './guestCounts'
import { formatMealPreferencesForPrompt } from './mealPreferences'
import {
  formatRecipesForPrompt,
  generateFallbackWeeklyMenu,
  prepareRecipesForMenuPrompt,
  resolveMenuRecipes,
  createMenuGenerationSeed,
  pickFallbackFullMealsForDays,
} from './recipeLibrary'
import {
  expandMenuToDailyStructure,
  filterFullMealsFromAi,
  getMenuStructure,
  isLightMealId,
} from './menuStructure'
import { normalizeMeal, sanitizeRecipe, sortMeals, normalizeDayName } from './recipeFormat'
import { MEAL_LABELS } from '../types'
import { formatSeasonProduceForPrompt } from './seasonCalendar'
import { getPlanningWeekLabel } from './week'

export function buildMenuPrompt(
  data: AppData,
  generationSeed = createMenuGenerationSeed(),
): {
  system: string
  user: string
  promptRecipes: AppData['recipes']
  generationSeed: string
} {
  const profile = data.profile
  const recentCheckIns = data.checkIns.slice(-5)
  const guestCounts = normalizeGuestCounts(data.menuGuestCounts)
  const menuStructure = getMenuStructure(profile)
  const activeDays = getActiveFullMealDays(guestCounts, menuStructure.fullMealType)
  const activeDayCount = activeDays.length
  const mealPreferences: MealPreferences = {
    ...defaultMealPreferences,
    ...data.profile.mealPreferences,
  }
  const season = getCurrentSeason()
  const seasonProduce = formatSeasonProduceForPrompt()
  const { promptRecipes, totalAvailable } = prepareRecipesForMenuPrompt(
    data.recipes,
    season,
    profile.allergies,
    generationSeed,
  )
  const libraryBlock = formatRecipesForPrompt(promptRecipes, {
    compact: totalAvailable > promptRecipes.length,
  })
  const libraryIntro =
    totalAvailable > promptRecipes.length
      ? `${promptRecipes.length} recettes proposees (echantillon aleatoire sur ${totalAvailable} disponibles)`
      : `${promptRecipes.length} disponibles`

  const fullMealLabel = MEAL_LABELS[menuStructure.fullMealType]

  return {
    system: `Tu es un nutritionniste francais expert en alimentation equilibree et de saison.
Reponds UNIQUEMENT en JSON valide avec cette structure MINIMALE:
{
  "meals": [
    {
      "day": "Lundi|Mardi|...|Dimanche",
      "mealType": "${menuStructure.fullMealType}",
      "recipeId": "#N",
      "recipeName": "string optionnel"
    }
  ]
}
REGLES BIBLIOTHEQUE (PRIORITAIRES):
- Utilise UNIQUEMENT les recettes de la bibliotheque fournie
- recipeId = numero #N de la liste (ex. #12) OU id exact (ex. web-xxx)
- Ne renvoie PAS de tableau "recipes" (inutile, les recettes sont deja en bibliotheque)
- Une recette differente par jour (ne pas reutiliser la meme recette sur plusieurs jours)
- Ne genere PAS petit-dejeuner ni ${MEAL_LABELS[menuStructure.lightMealType].toLowerCase()} (repas legers geres automatiquement)
REGLES JSON:
- Exactement ${activeDayCount} entrees dans "meals": 1 ${fullMealLabel.toLowerCase()} par jour actif (${activeDays.join(', ') || 'aucun'})
- Ne genere AUCUN repas complet pour un creneau a 0 personne (voir nombre de personnes par creneau)
- mealType OBLIGATOIRE: "${menuStructure.fullMealType}" pour chaque repas
- Jours en francais: Lundi, Mardi, Mercredi, Jeudi, Vendredi, Samedi, Dimanche
- Pas de commentaire hors JSON`,
    user: `Genere un menu hebdomadaire equilibre pour la ${getPlanningWeekLabel(data.settings)}.
Saison: ${season}
${seasonProduce}
Profil:
- Nom: ${profile.name || 'Utilisateur'}
- Age: ${profile.age ?? 'non renseigne'}
- Poids: ${profile.weightKg ?? 'non renseigne'} kg
- Taille: ${profile.heightCm ?? 'non renseigne'} cm
- Niveau d'activite: ${profile.activityLevel}
- Conditions de sante: ${profile.healthConditions.join(', ') || 'aucune'}
- Allergies: ${profile.allergies.join(', ') || 'aucune'}
- Preferences alimentaires: ${profile.dietaryPreferences.join(', ') || 'aucune'}
Structure des repas:
${formatMealPreferencesForPrompt(mealPreferences, profile)}
- Objectifs: ${profile.goals.join(', ') || 'bien-etre general'}
- Notes: ${profile.notes || 'aucune'}
Derniers ressentis (suivi):
${recentCheckIns.length ? recentCheckIns.map((c) => `- ${c.date}: energie ${c.energy}/5, humeur ${c.mood}/5, douleur ${c.painLevel}/5, notes: ${c.notes}`).join('\n') : 'Aucun suivi recent'}
Nombre de personnes par creneau (matin, midi, soir):
${formatGuestCountsForPrompt(guestCounts)}
BIBLIOTHEQUE DE RECETTES (${libraryIntro} — pioche UNIQUEMENT ici pour les ${activeDayCount} ${fullMealLabel.toLowerCase()}s):
${libraryBlock}
Jours a planifier (exactement ${activeDayCount} repas, 1 par jour): ${activeDays.join(', ')}
Exemple de format attendu:
{"meals":[${activeDays.slice(0, 2).map((day, i) => `{"day":"${day}","recipeId":"#${i + 1}"}`).join(',')}, ...]}
Compose ${activeDayCount} ${fullMealLabel.toLowerCase()}s en selectionnant parmi ces recettes. Varie les repas sur la semaine.`,
    promptRecipes,
    generationSeed,
  }
}

export function buildActivityPrompt(data: AppData): { system: string; user: string } {
  const profile = data.profile
  const recentCheckIns = data.checkIns.slice(-5)

  return {
    system: `Tu es un coach sportif francais adapte aux contraintes de sante.
Reponds UNIQUEMENT en JSON valide:
{
  "sessions": [
    {
      "id": "string-unique",
      "day": "Lundi|Mardi|...|Dimanche",
      "type": "string",
      "durationMinutes": number,
      "intensity": "low|moderate|high",
      "description": "string",
      "completed": false
    }
  ]
}
Propose 4 a 6 seances par semaine, progressives et securisees.`,
    user: `Genere un planning d'activites physiques pour la ${getPlanningWeekLabel(data.settings)}.
Profil:
- Age: ${profile.age ?? 'non renseigne'}
- Poids: ${profile.weightKg ?? 'non renseigne'} kg
- Niveau d'activite habituel: ${profile.activityLevel}
- Conditions de sante: ${profile.healthConditions.join(', ') || 'aucune'}
- Objectifs: ${profile.goals.join(', ') || 'forme generale'}
- Notes sante: ${profile.notes || 'aucune'}
Derniers ressentis:
${recentCheckIns.length ? recentCheckIns.map((c) => `- ${c.date}: energie ${c.energy}/5, douleur ${c.painLevel}/5, sommeil ${c.sleepHours ?? '?'}h, notes: ${c.notes}`).join('\n') : 'Aucun suivi recent'}
Adapte l'intensite au ressenti recent. Inclus recuperation active.`,
  }
}

function normalizeRawMeal(raw: unknown): Partial<MealSlot> | null {
  if (!raw || typeof raw !== 'object') return null
  const meal = raw as Record<string, unknown>
  const day = meal.day ?? meal.jour ?? meal.Jour
  const mealType = meal.mealType ?? meal.meal_type ?? meal.creneau ?? meal.type
  const recipeId = meal.recipeId ?? meal.recipe_id ?? meal.recetteId ?? meal.id_recette
  const recipeName = meal.recipeName ?? meal.recipe_name ?? meal.name ?? meal.nom ?? meal.recette
  const fallbackId = meal.id

  if (!day && !recipeId && !recipeName) return null

  return {
    day: typeof day === 'string' ? day : undefined,
    mealType:
      typeof mealType === 'string'
        ? (mealType as MealSlot['mealType'])
        : undefined,
    recipeId:
      recipeId != null
        ? String(recipeId)
        : typeof fallbackId === 'string' &&
            (fallbackId.startsWith('web-') || fallbackId.startsWith('#') || /^#?\d+$/.test(fallbackId))
          ? fallbackId
          : undefined,
    recipeName: typeof recipeName === 'string' ? recipeName : undefined,
  }
}

function collectMealCandidates(raw: unknown, found: Partial<MealSlot>[], depth = 0): void {
  if (raw == null || depth > 6) return

  if (Array.isArray(raw)) {
    for (const item of raw) collectMealCandidates(item, found, depth + 1)
    return
  }

  if (typeof raw !== 'object') return

  const normalized = normalizeRawMeal(raw)
  if (normalized?.day && (normalized.recipeId || normalized.recipeName)) {
    found.push(normalized)
    return
  }

  for (const value of Object.values(raw as Record<string, unknown>)) {
    collectMealCandidates(value, found, depth + 1)
  }
}

function extractMealsFromAiResponse(raw: unknown): Partial<MealSlot>[] {
  const collected: Partial<MealSlot>[] = []
  collectMealCandidates(raw, collected)

  const byDay = new Map<string, Partial<MealSlot>>()
  for (const meal of collected) {
    const day = normalizeDayName(meal.day)
    if (!day || byDay.has(day)) continue
    byDay.set(day, meal)
  }

  return [...byDay.values()]
}

function normalizeMenuMeal(
  meal: Partial<MealSlot>,
  library: Recipe[],
  promptPool: Recipe[],
  fullMealType: 'lunch' | 'dinner',
): MealSlot | null {
  return normalizeMeal(
    { ...meal, mealType: fullMealType },
    library,
    promptPool,
  )
}

export function parseMenuResponse(
  raw: unknown,
  weekStart: string,
  guestsByDay: WeekGuestCounts,
  libraryRecipes: AppData['recipes'],
  options?: { promptRecipes?: AppData['recipes']; profile?: HealthProfile; generationSeed?: string },
): {
  recipes: AppData['recipes']
  menu: WeeklyMenu
  usedFallback: boolean
  aiMealCount: number
  fallbackFilledCount: number
} {
  const parsed = raw as { recipes?: AppData['recipes'] }
  const promptPool = options?.promptRecipes ?? libraryRecipes
  const profile = options?.profile
  const shuffleSeed = options?.generationSeed ?? weekStart
  const menuStructure = profile ? getMenuStructure(profile) : null
  const normalizedGuests = normalizeGuestCounts(guestsByDay)
  const activeDays = menuStructure
    ? getActiveFullMealDays(normalizedGuests, menuStructure.fullMealType)
    : []

  let normalizedFullMeals = sortMeals(
    extractMealsFromAiResponse(raw)
      .map((meal) =>
        menuStructure
          ? normalizeMenuMeal(meal, libraryRecipes, promptPool, menuStructure.fullMealType)
          : normalizeMeal(meal, libraryRecipes, promptPool),
      )
      .filter((meal): meal is NonNullable<typeof meal> => meal !== null)
      .filter((meal) => activeDays.includes(meal.day)),
  )

  if (menuStructure) {
    normalizedFullMeals = filterFullMealsFromAi(
      normalizedFullMeals,
      menuStructure.fullMealType,
      activeDays,
    )
  }

  const aiMealCount = normalizedFullMeals.length
  let fallbackFilledCount = 0
  let usedFallback = false

  if (
    normalizedFullMeals.length < activeDays.length &&
    promptPool.length > 0 &&
    profile &&
    menuStructure &&
    activeDays.length > 0
  ) {
    const coveredDays = new Set(normalizedFullMeals.map((meal) => meal.day))
    const missingDays = activeDays.filter((day) => !coveredDays.has(day))
    const usedIds = new Set(normalizedFullMeals.map((meal) => meal.recipeId))

    const filled = pickFallbackFullMealsForDays(
      promptPool,
      missingDays,
      menuStructure.fullMealType,
      usedIds,
      `${shuffleSeed}:fill`,
    )
    fallbackFilledCount = filled.length
    normalizedFullMeals = sortMeals(
      filterFullMealsFromAi(
        [...normalizedFullMeals, ...filled],
        menuStructure.fullMealType,
        activeDays,
      ),
    )
    usedFallback = aiMealCount === 0 || fallbackFilledCount > 0
  }

  if (
    normalizedFullMeals.length < activeDays.length &&
    promptPool.length > 0 &&
    profile &&
    menuStructure &&
    activeDays.length > 0
  ) {
    const fallbackMenu = generateFallbackWeeklyMenu(
      promptPool,
      weekStart,
      normalizedGuests,
      profile,
      shuffleSeed,
    )
    normalizedFullMeals = filterFullMealsFromAi(
      fallbackMenu.meals,
      menuStructure.fullMealType,
      activeDays,
    )
    fallbackFilledCount = activeDays.length - aiMealCount
    usedFallback = true
  }

  const meals = profile
    ? expandMenuToDailyStructure(
        normalizedFullMeals,
        profile,
        normalizedGuests,
        libraryRecipes,
        shuffleSeed,
      )
    : normalizedFullMeals

  const mealRecipeIds = meals
    .map((meal) => meal.recipeId)
    .filter((id) => !isLightMealId(id))
  const aiRecipes = (parsed.recipes ?? []).map((recipe, index) =>
    sanitizeRecipe(recipe, `r${index + 1}`),
  )

  const recipes = resolveMenuRecipes(libraryRecipes, aiRecipes, mealRecipeIds)

  const menu: WeeklyMenu = {
    id: crypto.randomUUID(),
    weekStart,
    season: getCurrentSeason(),
    meals,
    guestsByDay: normalizedGuests,
    createdAt: new Date().toISOString(),
  }

  return { recipes, menu, usedFallback, aiMealCount, fallbackFilledCount }
}

export function parseActivityResponse(raw: unknown, weekStart: string): WeeklyActivityPlan {
  const parsed = raw as { sessions?: WeeklyActivityPlan['sessions'] }
  return {
    id: crypto.randomUUID(),
    weekStart,
    sessions: parsed.sessions ?? [],
    createdAt: new Date().toISOString(),
  }
}

export function profileSummary(p: HealthProfile): string {
  const parts = [
    p.name && `Bonjour ${p.name}`,
    p.age && `${p.age} ans`,
    p.healthConditions.length ? `${p.healthConditions.length} condition(s) suivie(s)` : null,
  ].filter(Boolean)
  return parts.join(' · ') || 'Completez votre profil sante'
}
