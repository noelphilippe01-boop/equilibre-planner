import type { AppData, HealthProfile, MealPreferences, WeeklyMenu, WeeklyActivityPlan } from '../types'
import { defaultMealPreferences, getCurrentSeason } from '../types'
import { formatGuestCountsForPrompt, normalizeGuestCounts } from './guestCounts'
import { formatMealPreferencesForPrompt } from './mealPreferences'
import { normalizeMeal, sanitizeRecipe, sortMeals } from './recipeFormat'
import { getPlanningWeekLabel } from './week'

export function buildMenuPrompt(data: AppData): { system: string; user: string } {
  const profile = data.profile
  const recentCheckIns = data.checkIns.slice(-5)
  const guestCounts = normalizeGuestCounts(data.menuGuestCounts)
  const mealPreferences: MealPreferences = {
    ...defaultMealPreferences,
    ...data.profile.mealPreferences,
  }

  return {
    system: `Tu es un nutritionniste francais expert en batch cooking et alimentation de saison.
Reponds UNIQUEMENT en JSON valide avec cette structure:
{
  "recipes": [
    {
      "id": "string-unique",
      "name": "string",
      "servings": number,
      "prepMinutes": number,
      "batchCookingNotes": "string",
      "ingredients": [{ "name": "string", "quantity": "string", "unit": "string" }],
      "steps": ["string"],
      "tags": ["string"]
    }
  ],
  "meals": [
    {
      "day": "Lundi|Mardi|...|Dimanche",
      "mealType": "breakfast|lunch|dinner|snack",
      "recipeId": "string",
      "recipeName": "string",
      "isBatchCooking": boolean
    }
  ]
}
Priorise les produits de saison, equilibre macro/micro, batch cooking le dimanche quand pertinent.
REGLES STRICTES pour un JSON valide et compact:
- Maximum 8 recettes uniques (ids: r1, r2, ...), reutilisees sur plusieurs jours
- Maximum 5 ingredients par recette, quantites courtes
- quantity = nombre seulement (ex: "200"), unit = unite courte FR (ex: "g", "ml", "pc", "c. a s.") — jamais repeter l'unite dans quantity
- mealType OBLIGATOIRE: breakfast, lunch ou dinner pour chaque repas
- Maximum 3 etapes courtes par recette (1 phrase chacune, pas "Achat des legumes")
- batchCookingNotes: 1 phrase maximum
- Exactement 21 repas: petit-dejeuner, dejeuner et diner pour chaque jour (Lundi a Dimanche)
- Pas de commentaire hors JSON`,
    user: `Genere un menu hebdomadaire equilibre pour la ${getPlanningWeekLabel(data.settings)}.
Saison: ${getCurrentSeason()}
Profil:
- Nom: ${profile.name || 'Utilisateur'}
- Age: ${profile.age ?? 'non renseigne'}
- Poids: ${profile.weightKg ?? 'non renseigne'} kg
- Taille: ${profile.heightCm ?? 'non renseigne'} cm
- Niveau d'activite: ${profile.activityLevel}
- Conditions de sante: ${profile.healthConditions.join(', ') || 'aucune'}
- Allergies: ${profile.allergies.join(', ') || 'aucune'}
- Preferences alimentaires: ${profile.dietaryPreferences.join(', ') || 'aucune'}
- Preferences par repas:
${formatMealPreferencesForPrompt(mealPreferences)}
- Objectifs: ${profile.goals.join(', ') || 'bien-etre general'}
- Notes: ${profile.notes || 'aucune'}
Derniers ressentis (suivi):
${recentCheckIns.length ? recentCheckIns.map((c) => `- ${c.date}: energie ${c.energy}/5, humeur ${c.mood}/5, douleur ${c.painLevel}/5, notes: ${c.notes}`).join('\n') : 'Aucun suivi recent'}
Nombre de personnes par jour:
${formatGuestCountsForPrompt(guestCounts)}
Adapte les quantites de chaque recette (servings et ingredients) au nombre de personnes du jour concerne.
Respecte strictement les preferences par repas (ex: tartines le matin, salades le midi, rien = repas tres leger ou absent).
Genere un menu COMPACT: reutilise les recettes, etapes breves, pas de repetition inutile.`,
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

export function parseMenuResponse(
  raw: unknown,
  weekStart: string,
  guestsByDay: Record<string, number>,
): {
  recipes: AppData['recipes']
  menu: WeeklyMenu
} {
  const parsed = raw as {
    recipes?: AppData['recipes']
    meals?: WeeklyMenu['meals']
  }

  const recipes = (parsed.recipes ?? []).map((recipe, index) =>
    sanitizeRecipe(recipe, `r${index + 1}`),
  )

  const recipeNameById = new Map(recipes.map((recipe) => [recipe.id, recipe.name]))

  const meals = sortMeals(
    (parsed.meals ?? [])
      .map((meal) => normalizeMeal(meal, recipeNameById))
      .filter((meal): meal is NonNullable<typeof meal> => meal !== null),
  )

  const menu: WeeklyMenu = {
    id: crypto.randomUUID(),
    weekStart,
    season: getCurrentSeason(),
    meals,
    guestsByDay,
    createdAt: new Date().toISOString(),
  }

  return { recipes, menu }
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
