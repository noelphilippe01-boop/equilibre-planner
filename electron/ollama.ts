export interface OllamaSettings {
  ollamaUrl: string
  ollamaModel: string
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
        num_predict: 8192,
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
): Promise<unknown> {
  const baseUrl = normalizeOllamaUrl(settings.ollamaUrl)
  const model = settings.ollamaModel.trim()
  if (!model) {
    throw new Error('Modele Ollama non configure. Renseignez-le dans Parametres.')
  }

  const attempts = [
    { temperature: 0.4, suffix: '' },
    {
      temperature: 0.2,
      suffix:
        '\n\nIMPORTANT: JSON compact uniquement. Pas de texte hors JSON. Maximum 8 recettes, 5 ingredients et 3 etapes par recette.',
    },
  ]

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
      )
      return parseJsonResponse(content)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Erreur IA inconnue')
    }
  }

  throw lastError ?? new Error('Generation IA echouee')
}
