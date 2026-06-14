import { useEffect, useState } from 'react'
import { getEquilibre } from '../lib/equilibre'
import type { SpinnerState } from '../components/ButtonSpinner'

/** Pendant une generation IA, verifie qu'Ollama repond encore (spinner vert vs orange). */
export function useGenerationSpinnerState(active: boolean, ollamaUrl: string): SpinnerState {
  const [health, setHealth] = useState<'busy' | 'warning'>('busy')

  useEffect(() => {
    if (!active) return

    setHealth('busy')
    let cancelled = false

    const pingOllama = async () => {
      try {
        await getEquilibre().listOllamaModels(ollamaUrl)
        if (!cancelled) setHealth('busy')
      } catch {
        if (!cancelled) setHealth('warning')
      }
    }

    void pingOllama()
    const interval = setInterval(pingOllama, 6000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [active, ollamaUrl])

  return active ? health : 'idle'
}
