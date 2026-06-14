export interface OllamaSettings {
  ollamaUrl: string
  ollamaModel: string
  ollamaVisionModel?: string
}

export function normalizeOllamaUrl(url: string): string {
  return url.trim().replace(/\/$/, '')
}

function extractJsonCandidate(content: string): string {
  const trimmed = content.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
}

function repairTruncatedJson(text: string): string {
  let candidate = text.trim().replace(/,\s*([}\]])/g, '$1')

  for (let i = 0; i < 12; i++) {
    try {
      JSON.parse(candidate)
      return candidate
    } catch {
      candidate = candidate.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"{}[\]]*$/, '')
      candidate = candidate.replace(/,\s*\{[^}]*$/, '')
      candidate = candidate.replace(/,\s*\[[^\]]*$/, '')
      candidate = candidate.replace(/,\s*$/, '')

      const openBrackets =
        (candidate.match(/\[/g) ?? []).length - (candidate.match(/\]/g) ?? []).length
      const openBraces =
        (candidate.match(/\{/g) ?? []).length - (candidate.match(/\}/g) ?? []).length

      if (openBrackets <= 0 && openBraces <= 0) break
      candidate += ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces))
    }
  }

  return candidate
}

export function parseJsonResponse(content: string): unknown {
  const candidate = extractJsonCandidate(content)

  try {
    return JSON.parse(candidate)
  } catch {
    try {
      return JSON.parse(repairTruncatedJson(candidate))
    } catch {
      throw new Error(
        'Reponse IA incomplete ou invalide. Reessayez la generation, ou passez a un modele plus capable (llama3.2, mistral).',
      )
    }
  }
}

export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const url = `${normalizeOllamaUrl(baseUrl)}/api/tags`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Ollama inaccessible (${response.status}). Lancez Ollama sur votre PC.`)
  }
  const json = (await response.json()) as { models?: Array<{ name: string }> }
  return (json.models ?? []).map((m) => m.name).sort((a, b) => a.localeCompare(b, 'fr'))
}

async function requestOllamaChat(
  baseUrl: string,
  model: string,
  payload: { system: string; user: string },
  temperature: number,
  numPredict = 8192,
): Promise<string> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: payload.system },
        { role: 'user', content: payload.user },
      ],
      stream: false,
      format: 'json',
      options: {
        temperature,
        num_predict: numPredict,
      },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    if (response.status === 404 || err.includes('not found')) {
      throw new Error(`Modele "${model}" introuvable. Installez-le avec: ollama pull ${model}`)
    }
    throw new Error(`Erreur Ollama (${response.status}): ${err}`)
  }

  const json = (await response.json()) as { message?: { content?: string } }
  const content = json.message?.content
  if (!content) throw new Error('Reponse Ollama vide')
  return content
}

export async function generateWithOllama(
  settings: OllamaSettings,
  payload: { system: string; user: string },
  options?: { temperatures?: [number, number]; mode?: 'menu' | 'default' },
): Promise<unknown> {
  const baseUrl = normalizeOllamaUrl(settings.ollamaUrl)
  const model = settings.ollamaModel.trim()
  if (!model) {
    throw new Error('Modele Ollama non configure. Renseignez-le dans Parametres.')
  }

  const [primaryTemp, retryTemp] = options?.temperatures ?? [0.4, 0.2]
  const menuRetrySuffix =
    '\n\nIMPORTANT: JSON MINIMAL uniquement:\n{"meals":[{"day":"Lundi","recipeId":"#1","recipeName":"Nom exact"}]}\n- Un objet par jour actif, jours en francais (Lundi...Dimanche)\n- recipeId = #N (numero dans la bibliotheque) OU id web-xxx\n- Pas de tableau "recipes"'
  const attempts =
    options?.mode === 'menu'
      ? [
          { temperature: primaryTemp, suffix: '' },
          { temperature: retryTemp, suffix: menuRetrySuffix },
        ]
      : [
          { temperature: primaryTemp, suffix: '' },
          {
            temperature: retryTemp,
            suffix:
              '\n\nIMPORTANT: JSON compact uniquement. Pas de texte hors JSON. Maximum 8 recettes, 5 ingredients et 3 etapes par recette.',
          },
        ]

  const menuNumPredict = 2048
  let lastError: Error | null = null

  for (const attempt of attempts) {
    try {
      const content = await requestOllamaChat(
        baseUrl,
        model,
        {
          system: payload.system,
          user: payload.user + attempt.suffix,
        },
        attempt.temperature,
        options?.mode === 'menu' ? menuNumPredict : 8192,
      )
      return parseJsonResponse(content)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Erreur IA inconnue')
    }
  }

  throw lastError ?? new Error('Generation IA echouee')
}

const RECIPE_VISION_SYSTEM = `Tu es un assistant culinaire francais expert en OCR et lecture de recettes.
Analyse l'image (page de livre, capture d'ecran, scan, note manuscrite) et extrais TOUTES les recettes visibles.
Reponds UNIQUEMENT en JSON valide:
{
  "recipes": [
    {
      "id": "slug-court-unique",
      "name": "string",
      "servings": number,
      "prepMinutes": number,
      "ingredients": [{ "name": "string", "quantity": "string", "unit": "string" }],
      "steps": ["string"],
      "tags": ["string"],
      "mealTypes": ["breakfast"|"lunch"|"dinner"],
      "seasons": ["printemps"|"ete"|"automne"|"hiver"],
      "source": "string"
    }
  ]
}
REGLES:
- Decrypte le texte manuscrit ou imprime du mieux possible; indique les doutes avec "?"
- quantity = nombre seulement, unit = unite FR courte (g, ml, pc, c. a s.)
- Si une info manque: servings=2, prepMinutes=20
- id en minuscules sans accents (ex: soupe-potiron-maison)
- Une image peut contenir plusieurs recettes
- Pas de texte hors JSON`

export async function extractRecipesFromImage(
  settings: OllamaSettings,
  imagesBase64: string[],
  options?: { sourceHint?: string; singleRecipe?: boolean },
): Promise<unknown> {
  const images = imagesBase64.filter(Boolean)
  if (images.length === 0) {
    throw new Error('Aucune image a analyser.')
  }

  const baseUrl = normalizeOllamaUrl(settings.ollamaUrl)
  const model =
    settings.ollamaVisionModel?.trim() ||
    settings.ollamaModel.trim()
  if (!model) {
    throw new Error('Modele vision non configure. Renseignez-le dans Parametres.')
  }

  const hint = options?.sourceHint?.trim()
  const singleRecipe = options?.singleRecipe ?? images.length > 1

  const userText = [
    singleRecipe
      ? `Les ${images.length} image(s) fournie(s) appartiennent a LA MEME recette (pages suivantes, ingredients sur une page et etapes sur une autre, etc.). Fusionne tout en UNE seule recette dans "recipes" (exactement 1 element).`
      : images.length > 1
        ? `Analyse les ${images.length} images. Chaque image peut contenir une ou plusieurs recettes distinctes.`
        : 'Extrais les recettes visibles dans cette image.',
    hint ? `Source indiquee par l'utilisateur: ${hint}` : '',
    'Inclus source dans chaque recette si visible (livre, site, page).',
  ]
    .filter(Boolean)
    .join('\n')

  const systemPrompt = singleRecipe
    ? `${RECIPE_VISION_SYSTEM}\nIMPORTANT: Mode multi-pages — retourne exactement 1 recette fusionnee.`
    : RECIPE_VISION_SYSTEM

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText, images },
      ],
      stream: false,
      format: 'json',
      options: {
        temperature: 0.1,
        num_predict: 8192,
      },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    if (response.status === 404 || err.includes('not found')) {
      throw new Error(
        `Modele vision "${model}" introuvable. Installez-le: ollama pull ${model}`,
      )
    }
    if (err.includes('image') || err.includes('vision')) {
      throw new Error(
        `Le modele "${model}" ne supporte pas les images. Utilisez llama3.2-vision, llava ou moondream dans Parametres.`,
      )
    }
    throw new Error(`Erreur Ollama (${response.status}): ${err}`)
  }

  const json = (await response.json()) as { message?: { content?: string } }
  const content = json.message?.content
  if (!content) throw new Error('Reponse Ollama vide')
  return parseJsonResponse(content)
}

const RECIPE_PAGE_SYSTEM = `Tu es un assistant culinaire francais. On te donne le texte d'une page web de recette.
Extrais UNE recette en JSON valide:
{
  "recipes": [
    {
      "id": "slug-court",
      "name": "string",
      "servings": number,
      "prepMinutes": number,
      "ingredients": [{ "name": "string", "quantity": "string", "unit": "string" }],
      "steps": ["string"],
      "tags": ["string"],
      "mealTypes": ["breakfast"|"lunch"|"dinner"],
      "source": "string"
    }
  ]
}
REGLES: exactement 1 recette, quantity=nombre seul, unit=unite FR courte, pas de texte hors JSON.`

export async function extractRecipesFromPageText(
  settings: OllamaSettings,
  pageText: string,
  pageUrl: string,
  pageTitle?: string,
): Promise<unknown> {
  const baseUrl = normalizeOllamaUrl(settings.ollamaUrl)
  const model = settings.ollamaModel.trim()
  if (!model) throw new Error('Modele Ollama non configure.')

  let hostname = 'Web'
  try {
    hostname = new URL(pageUrl).hostname.replace(/^www\./, '')
  } catch {
    // ignore
  }

  const userText = [
    `URL: ${pageUrl}`,
    pageTitle ? `Titre page: ${pageTitle}` : '',
    `Source a indiquer: ${hostname}`,
    'Texte de la page:',
    pageText,
  ]
    .filter(Boolean)
    .join('\n\n')

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: RECIPE_PAGE_SYSTEM },
        { role: 'user', content: userText },
      ],
      stream: false,
      format: 'json',
      options: { temperature: 0.2, num_predict: 8192 },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Erreur Ollama (${response.status}): ${err}`)
  }

  const json = (await response.json()) as { message?: { content?: string } }
  const content = json.message?.content
  if (!content) throw new Error('Reponse Ollama vide')
  return parseJsonResponse(content)
}
