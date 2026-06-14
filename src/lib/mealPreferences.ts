import type { MealPreferences } from '../types'

export function formatMealPreferencesForPrompt(preferences: MealPreferences): string {
  const line = (label: string, values: string[]) =>
    `- ${label}: ${values.length ? values.join(', ') : 'aucune preference'}`

  return [
    line('Petit-dejeuner', preferences.breakfast),
    line('Dejeuner', preferences.lunch),
    line('Diner', preferences.dinner),
  ].join('\n')
}
