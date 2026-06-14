import { DAYS, type DayMealGuestCounts, type WeekGuestCounts } from '../types/index.js'

export type { DayMealGuestCounts, WeekGuestCounts }

/** @deprecated Alias historique */
export type DayGuestCounts = WeekGuestCounts

export const MEAL_GUEST_PERIODS = ['breakfast', 'lunch', 'dinner'] as const
export type MealGuestPeriod = (typeof MEAL_GUEST_PERIODS)[number]

export const MEAL_GUEST_PERIOD_LABELS: Record<MealGuestPeriod, string> = {
  breakfast: 'Matin',
  lunch: 'Midi',
  dinner: 'Soir',
}

export const MIN_GUEST_COUNT = 0
export const DEFAULT_GUEST_COUNT = 1
export const MAX_GUEST_COUNT = 20

export function createDefaultDayMealGuestCounts(): DayMealGuestCounts {
  return {
    breakfast: DEFAULT_GUEST_COUNT,
    lunch: DEFAULT_GUEST_COUNT,
    dinner: DEFAULT_GUEST_COUNT,
  }
}

export function createDefaultGuestCounts(): WeekGuestCounts {
  return Object.fromEntries(DAYS.map((day) => [day, createDefaultDayMealGuestCounts()]))
}

export function clampGuestCount(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_GUEST_COUNT
  return Math.min(MAX_GUEST_COUNT, Math.max(MIN_GUEST_COUNT, Math.round(value)))
}

export function normalizeDayMealGuestCounts(value: unknown): DayMealGuestCounts {
  if (typeof value === 'number') {
    const count = clampGuestCount(value)
    return { breakfast: count, lunch: count, dinner: count }
  }

  if (value && typeof value === 'object') {
    const obj = value as Partial<DayMealGuestCounts>
    return {
      breakfast: clampGuestCount(
        typeof obj.breakfast === 'number' ? obj.breakfast : DEFAULT_GUEST_COUNT,
      ),
      lunch: clampGuestCount(typeof obj.lunch === 'number' ? obj.lunch : DEFAULT_GUEST_COUNT),
      dinner: clampGuestCount(typeof obj.dinner === 'number' ? obj.dinner : DEFAULT_GUEST_COUNT),
    }
  }

  return createDefaultDayMealGuestCounts()
}

export function normalizeGuestCounts(
  counts?: Partial<WeekGuestCounts> | Record<string, number>,
): WeekGuestCounts {
  const defaults = createDefaultGuestCounts()
  if (!counts) return defaults

  const normalized = { ...defaults }
  for (const day of DAYS) {
    if (day in counts) {
      normalized[day] = normalizeDayMealGuestCounts(counts[day as keyof typeof counts])
    }
  }
  return normalized
}

export function applyGuestCountToAll(count: number): WeekGuestCounts {
  const clamped = clampGuestCount(count)
  const dayCounts = {
    breakfast: clamped,
    lunch: clamped,
    dinner: clamped,
  }
  return Object.fromEntries(DAYS.map((day) => [day, { ...dayCounts }]))
}

export function getMealGuestCount(
  counts: WeekGuestCounts,
  day: string,
  period: MealGuestPeriod,
): number {
  return counts[day]?.[period] ?? DEFAULT_GUEST_COUNT
}

export function isMealSlotActive(
  counts: WeekGuestCounts,
  day: string,
  period: MealGuestPeriod,
): boolean {
  return getMealGuestCount(counts, day, period) > 0
}

export function isDayFullyInactive(counts: WeekGuestCounts, day: string): boolean {
  return MEAL_GUEST_PERIODS.every((period) => !isMealSlotActive(counts, day, period))
}

export function getActiveFullMealDays(
  counts: WeekGuestCounts,
  fullMealType: 'lunch' | 'dinner',
): string[] {
  return DAYS.filter((day) => isMealSlotActive(counts, day, fullMealType))
}

export function hasAnyActiveMeals(counts: WeekGuestCounts): boolean {
  return DAYS.some((day) => MEAL_GUEST_PERIODS.some((period) => isMealSlotActive(counts, day, period)))
}

export function formatGuestCountsForPrompt(counts: WeekGuestCounts): string {
  return DAYS.map((day) => {
    const dayCounts = counts[day]
    const parts = MEAL_GUEST_PERIODS.map((period) => {
      const count = dayCounts[period]
      const label = MEAL_GUEST_PERIOD_LABELS[period].toLowerCase()
      if (count === 0) return `${label} 0 (aucun repas)`
      return `${label} ${count}`
    })
    return `- ${day}: ${parts.join(', ')}`
  }).join('\n')
}
