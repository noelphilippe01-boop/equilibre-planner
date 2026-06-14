/**
 * Extrait le calendrier fruits/legumes (PDF belge) en JSON mois par mois.
 * Usage: node scripts/import-season-pdf.mjs [chemin.pdf] [sortie.json]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { PDFParse } from 'pdf-parse'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const MONTH_ALIASES = {
  janvier: 1,
  jan: 1,
  fevrier: 2,
  fev: 2,
  fevr: 2,
  mars: 3,
  mar: 3,
  avril: 4,
  avr: 4,
  mai: 5,
  juin: 6,
  jun: 6,
  juillet: 7,
  juil: 7,
  jul: 7,
  aout: 8,
  août: 8,
  aug: 8,
  septembre: 9,
  sept: 9,
  sep: 9,
  octobre: 10,
  oct: 10,
  novembre: 11,
  nov: 11,
  decembre: 12,
  décembre: 12,
  dec: 12,
  déc: 12,
}

const SEASON_BLOCKS = [
  { season: 'printemps', months: [3, 4, 5] },
  { season: 'ete', months: [6, 7, 8] },
  { season: 'automne', months: [9, 10, 11] },
  { season: 'hiver', months: [12, 1, 2] },
]

function normalizeKey(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function normalizeName(value) {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (!cleaned) return cleaned
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase()
}

function isConservation(token) {
  return normalizeKey(token).includes('conservation')
}

function splitCells(line) {
  return line
    .split(/\t+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function parseMonthToken(token) {
  return MONTH_ALIASES[normalizeKey(token)] ?? null
}

function isValidProduceName(name) {
  const key = normalizeKey(name)
  if (key.length < 2 || key.length > 35) return false
  if (/[\d=(),]/.test(name)) return false
  if (key.includes('kg') || key.includes('co2') || key.includes('pommes')) return false
  if (name.split(/\s+/).length > 4) return false
  return true
}

function shouldSkipLine(line) {
  const lower = normalizeKey(line)
  if (!lower) return true
  if (lower.includes('de saison')) return true
  if (lower.startsWith('quest-ce que la conservation')) return true
  if (lower.startsWith('a noter')) return true
  if (lower.startsWith('a titre')) return true
  if (lower.startsWith('preferez')) return true
  if (lower.startsWith('avertissement')) return true
  if (lower.startsWith('credits photographiques')) return true
  if (lower.startsWith('-- ')) return true
  if (lower.startsWith('en effet')) return true
  if (lower.startsWith('vous cherchez')) return true
  if (lower.includes('co2')) return true
  if (lower.includes('kg de')) return true
  if (lower.includes('importee')) return true
  if (lower.startsWith('avoir ')) return true
  if (/^=/.test(line.trim())) return true
  if (lower.startsWith('fruits et legumes')) return true
  if (lower.startsWith('cest le stockage')) return true
  if (lower.startsWith('conservation ne concerne')) return true
  if (/^\d+\s*kg/.test(lower)) return true
  return false
}

function detectKind(line) {
  const key = normalizeKey(line)
  if (key.startsWith('fruits')) return 'fruit'
  if (key.startsWith('legumes') || key.startsWith('légumes')) return 'legume'
  return null
}

export function parseSeasonCalendarText(text, source = 'import') {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const items = new Map()
  let currentKind = 'legume'
  let activeMonths = [3, 4, 5]

  const ensureItem = (name, kind) => {
    const key = normalizeKey(name)
    if (!items.has(key)) {
      items.set(key, {
        id: key,
        name: normalizeName(name),
        kind,
        months: {},
      })
    }
    return items.get(key)
  }

  const setMonth = (item, month, mode) => {
    if (!month) return
    const existing = item.months[month] ?? []
    if (!existing.includes(mode)) existing.push(mode)
    item.months[month] = existing
  }

  for (const line of lines) {
    if (shouldSkipLine(line)) continue
    const lower = normalizeKey(line)

    for (const block of SEASON_BLOCKS) {
      if (lower === block.season || lower.includes(`saison ${block.season}`)) {
        activeMonths = block.months
      }
    }

    const kind = detectKind(line)
    if (kind) {
      currentKind = kind
      const monthTokens = splitCells(line).slice(1)
      const parsedMonths = monthTokens.map(parseMonthToken).filter(Boolean)
      if (parsedMonths.length === 3) activeMonths = parsedMonths
      continue
    }

    const cells = splitCells(line)
    if (!cells.length) continue

    const markers = []
    let nameParts = []

    for (const cell of cells.slice(1)) {
      if (isConservation(cell)) markers.push('conservation')
      else if (parseMonthToken(cell)) continue
      else nameParts.push(cell)
    }

    if (!markers.length && cells.length === 1) {
      nameParts = [cells[0]]
    } else if (!nameParts.length) {
      nameParts = [cells[0]]
    }

    const name = nameParts.join(' ').trim()
    if (!isValidProduceName(name)) continue

    const item = ensureItem(name, currentKind)

    if (markers.length === 0) {
      for (const month of activeMonths) setMonth(item, month, 'fresh')
      continue
    }

    for (let index = 0; index < markers.length && index < activeMonths.length; index++) {
      setMonth(item, activeMonths[index], markers[index])
    }
  }

  return {
    source,
    region: 'Belgique et regions limitrophes',
    importedAt: new Date().toISOString(),
    items: [...items.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
  }
}

async function main() {
  const input =
    process.argv[2] ??
    'C:\\Users\\Philippe\\Desktop\\calendrier_saison_fr_def_part_fr.pdf'
  const output =
    process.argv[3] ??
    path.resolve(__dirname, '../src/data/season-calendar-be.json')

  if (!fs.existsSync(input)) {
    console.error(`Fichier introuvable: ${input}`)
    process.exit(1)
  }

  const buffer = fs.readFileSync(input)
  const parser = new PDFParse({ data: buffer })
  const parsed = await parser.getText()
  await parser.destroy()
  const calendar = parseSeasonCalendarText(parsed.text, path.basename(input))

  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(calendar, null, 2), 'utf-8')

  console.log(`Calendrier importe: ${calendar.items.length} produits -> ${output}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
