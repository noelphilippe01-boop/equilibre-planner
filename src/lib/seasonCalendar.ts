import calendarData from '../data/season-calendar-be.json'
import { getCurrentSeason } from '../types'

export type ProduceAvailability = 'fresh' | 'conservation'
export type ProduceKind = 'fruit' | 'legume'

export interface SeasonCalendarItem {
  id: string
  name: string
  kind: ProduceKind
  months: Record<string, ProduceAvailability[]>
}

export interface SeasonCalendar {
  source: string
  region: string
  importedAt: string
  items: SeasonCalendarItem[]
}

export const belgianSeasonCalendar = calendarData as SeasonCalendar

export const MONTH_NAMES = [
  'janvier',
  'fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'aout',
  'septembre',
  'octobre',
  'novembre',
  'decembre',
] as const

export function getCurrentMonth(): number {
  return new Date().getMonth() + 1
}

export function getMonthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? ''
}

export interface ProduceForMonth {
  fresh: { fruits: string[]; legumes: string[] }
  conservation: { fruits: string[]; legumes: string[] }
}

export function getProduceForMonth(
  month: number,
  calendar: SeasonCalendar = belgianSeasonCalendar,
  options?: { includeConservation?: boolean },
): ProduceForMonth {
  const includeConservation = options?.includeConservation ?? true
  const result: ProduceForMonth = {
    fresh: { fruits: [], legumes: [] },
    conservation: { fruits: [], legumes: [] },
  }
  const monthKey = String(month)

  for (const item of calendar.items) {
    const modes = item.months[monthKey]
    if (!modes?.length) continue
    const bucket = item.kind === 'fruit' ? 'fruits' : 'legumes'
    if (modes.includes('fresh')) result.fresh[bucket].push(item.name)
    if (includeConservation && modes.includes('conservation')) {
      result.conservation[bucket].push(item.name)
    }
  }

  for (const key of ['fruits', 'legumes'] as const) {
    result.fresh[key].sort((a, b) => a.localeCompare(b, 'fr'))
    result.conservation[key].sort((a, b) => a.localeCompare(b, 'fr'))
  }

  return result
}

function formatProduceList(label: string, fruits: string[], legumes: string[]): string[] {
  const lines: string[] = []
  if (fruits.length) lines.push(`- ${label} fruits: ${fruits.join(', ')}`)
  if (legumes.length) lines.push(`- ${label} legumes: ${legumes.join(', ')}`)
  return lines
}

export function formatSeasonProduceForPrompt(
  month?: number,
  calendar: SeasonCalendar = belgianSeasonCalendar,
): string {
  const m = month ?? getCurrentMonth()
  const produce = getProduceForMonth(m, calendar)
  const monthLabel = getMonthName(m)
  const season = getCurrentSeason()
  const lines = [
    `Calendrier belge (${calendar.region}) — ${monthLabel} (saison ${season}):`,
    ...formatProduceList('Frais', produce.fresh.fruits, produce.fresh.legumes),
    ...formatProduceList('Conservation', produce.conservation.fruits, produce.conservation.legumes),
  ]
  lines.push('- Privilegier ces produits locaux dans les recettes choisies.')
  return lines.join('\n')
}

export function summarizeProduceForMonth(month?: number): {
  month: number
  monthName: string
  season: string
  freshCount: number
  conservationCount: number
  fresh: ProduceForMonth['fresh']
  conservation: ProduceForMonth['conservation']
} {
  const m = month ?? getCurrentMonth()
  const produce = getProduceForMonth(m)
  const freshCount = produce.fresh.fruits.length + produce.fresh.legumes.length
  const conservationCount =
    produce.conservation.fruits.length + produce.conservation.legumes.length

  return {
    month: m,
    monthName: getMonthName(m),
    season: getCurrentSeason(),
    freshCount,
    conservationCount,
    fresh: produce.fresh,
    conservation: produce.conservation,
  }
}
