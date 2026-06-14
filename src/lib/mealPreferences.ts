import type { HealthProfile, MealPreferences } from '../types'
import { formatMenuStructureForPrompt } from './menuStructure'
import { getPlanningWeekLabel, type WeekConfig } from './week'

function cleanList(values: string[]): string[] {
  return values.map((item) => item.trim()).filter(Boolean)
}

/** Resume court des preferences alimentaires pour l'en-tete Menus. */
export function formatMenuPreferenceSummary(profile: HealthProfile): string {
  return cleanList(profile.dietaryPreferences).join(' · ')
}

export function formatMenuPageSubtitle(
  profile: HealthProfile,
  settings?: Partial<WeekConfig>,
  date = new Date(),
): string {
  const weekLabel = getPlanningWeekLabel(settings, date)
  const preferences = formatMenuPreferenceSummary(profile)
  return preferences ? `${weekLabel} · ${preferences}` : weekLabel
}

export function formatMealPreferencesForPrompt(
  preferences: MealPreferences,
  profile?: HealthProfile,
): string {
  const line = (label: string, values: string[]) =>
    `- ${label}: ${values.length ? values.join(', ') : 'aucune preference'}`

  const preferenceLines = [
    line('Petit-dejeuner', preferences.breakfast),
    line('Dejeuner', preferences.lunch),
    line('Diner', preferences.dinner),
  ].join('\n')

  if (!profile) return preferenceLines

  return `${formatMenuStructureForPrompt(profile)}

Preferences detaillees:
${preferenceLines}`
}
