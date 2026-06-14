import type { AppData } from './types'

declare global {
  interface Window {
    equilibre: {
      getData: () => Promise<AppData>
      saveData: (data: AppData) => Promise<boolean>
      generateAI: (payload: { system: string; user: string }) => Promise<unknown>
      listOllamaModels: (baseUrl?: string) => Promise<string[]>
    }
  }
}

export {}
