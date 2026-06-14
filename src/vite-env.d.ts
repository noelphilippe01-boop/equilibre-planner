import type { AppData } from './types'

declare global {
  interface Window {
    equilibre: {
      getData: () => Promise<AppData>
      saveData: (data: AppData) => Promise<boolean>
      generateAI: (payload: {
        system: string
        user: string
        temperatures?: [number, number]
        mode?: 'menu' | 'default'
      }) => Promise<unknown>
      extractRecipesFromImage: (payload: {
        imagesBase64: string[]
        sourceHint?: string
        singleRecipe?: boolean
      }) => Promise<unknown>
      importRecipeFromUrl: (payload: { url: string }) => Promise<{
        method: 'schema' | 'ai'
        recipes: unknown
      }>
      estimateSiteImport: (payload: {
        startUrl: string
        maxRecipes?: number
        useAiFallback?: boolean
      }) => Promise<{
        discovered: number
        discoverSeconds: number
        estimatedImportSeconds: number
        estimatedTotalSeconds: number
      }>
      importRecipesFromSite: (payload: {
        startUrl: string
        maxRecipes?: number // 0 or omitted = no limit
        useAiFallback?: boolean
      }) => Promise<{
        recipes: import('./types').Recipe[]
        discovered: number
        imported: number
        skipped: number
        failed: string[]
        usedAi: number
      }>
      cancelSiteImport: () => Promise<boolean>
      onSiteImportProgress: (
        callback: (progress: {
          phase: 'discover' | 'import'
          current: number
          total: number
          message: string
          recipeName?: string
        }) => void,
      ) => () => void
      listOllamaModels: (baseUrl?: string) => Promise<string[]>
    }
  }
}

export {}
