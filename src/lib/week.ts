import type { AppSettings } from '../types'

export const DEFAULT_WEEK_START_DAY = 'Lundi'
export const DEFAULT_WEEK_END_DAY = 'Dimanche'

const DAY_NAME_TO_JS: Record<string, number> = {
  Dimanche: 0,
  Lundi: 1,
  Mardi: 2,
  Mercredi: 3,
  Jeudi: 4,
  Vendredi: 5,
  Samedi: 6,
}

export type WeekConfig = Pick<AppSettings, 'weekStartDay' | 'weekEndDay'>

export function resolveWeekConfig(settings?: Partial<WeekConfig>): WeekConfig {
  return {
    weekStartDay: settings?.weekStartDay ?? DEFAULT_WEEK_START_DAY,
    weekEndDay: settings?.weekEndDay ?? DEFAULT_WEEK_END_DAY,
  }
}

function toIsoDateLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseIsoLocal(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function dayNameToJs(dayName: string): number {
  return DAY_NAME_TO_JS[dayName] ?? DAY_NAME_TO_JS[DEFAULT_WEEK_START_DAY]
}

export function formatDateFr(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

export function getWeekStartDate(
  date = new Date(),
  weekStartDay = DEFAULT_WEEK_START_DAY,
): string {
  const startJs = dayNameToJs(weekStartDay)
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  let diff = d.getDay() - startJs
  if (diff < 0) diff += 7
  d.setDate(d.getDate() - diff)
  return toIsoDateLocal(d)
}

export function getNextWeekStartDate(
  date = new Date(),
  weekStartDay = DEFAULT_WEEK_START_DAY,
): string {
  const start = parseIsoLocal(getWeekStartDate(date, weekStartDay))
  start.setDate(start.getDate() + 7)
  return toIsoDateLocal(start)
}

export function getWeekEndDate(
  weekStartIso: string,
  weekStartDay: string,
  weekEndDay: string,
): string {
  const startJs = dayNameToJs(weekStartDay)
  const endJs = dayNameToJs(weekEndDay)
  let offset = endJs - startJs
  if (offset < 0) offset += 7
  const end = parseIsoLocal(weekStartIso)
  end.setDate(end.getDate() + offset)
  return toIsoDateLocal(end)
}

export function formatWeekRangeLabel(
  weekStartIso: string,
  weekStartDay: string,
  weekEndDay: string,
): string {
  const endIso = getWeekEndDate(weekStartIso, weekStartDay, weekEndDay)
  return `Semaine du ${weekStartDay.toLowerCase()} ${formatDateFr(weekStartIso)} au ${weekEndDay.toLowerCase()} ${formatDateFr(endIso)}`
}

export function getPlanningWeekStart(settings?: Partial<WeekConfig>, date = new Date()): string {
  const config = resolveWeekConfig(settings)
  return getNextWeekStartDate(date, config.weekStartDay)
}

export function getPlanningWeekLabel(settings?: Partial<WeekConfig>, date = new Date()): string {
  const config = resolveWeekConfig(settings)
  const weekStart = getNextWeekStartDate(date, config.weekStartDay)
  return formatWeekRangeLabel(weekStart, config.weekStartDay, config.weekEndDay)
}
