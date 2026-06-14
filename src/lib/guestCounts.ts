import { DAYS } from '../types'

export type DayGuestCounts = Record<string, number>

export const DEFAULT_GUEST_COUNT = 1
export const MAX_GUEST_COUNT = 20

export function createDefaultGuestCounts(): DayGuestCounts {
  return Object.fromEntries(DAYS.map((day) => [day, DEFAULT_GUEST_COUNT]))
}

export function normalizeGuestCounts(counts?: Partial<DayGuestCounts>): DayGuestCounts {
  const defaults = createDefaultGuestCounts()
  if (!counts) return defaults

  const normalized = { ...defaults }
  for (const day of DAYS) {
    const value = counts[day]
    if (typeof value === 'number' && value >= 1) {
      normalized[day] = Math.min(MAX_GUEST_COUNT, Math.round(value))
    }
  }
  return normalized
}

export function clampGuestCount(value: number): number {
  return Math.min(MAX_GUEST_COUNT, Math.max(1, Math.round(value) || DEFAULT_GUEST_COUNT))
}

export function applyGuestCountToAll(count: number): DayGuestCounts {
  const clamped = clampGuestCount(count)
  return Object.fromEntries(DAYS.map((day) => [day, clamped]))
}

export function formatGuestCountsForPrompt(counts: DayGuestCounts): string {
  return DAYS.map((day) => `- ${day}: ${counts[day]} personne(s)`).join('\n')
}
