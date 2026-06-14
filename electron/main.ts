import { ipcMain, app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import type { AppData } from '../src/types/index.js'
import { defaultAppData } from './defaults.js'
import { generateWithOllama, extractRecipesFromImage, listOllamaModels } from './ollama.js'
import { importRecipeFromUrl } from './fetchRecipeFromUrl.js'
import { estimateSiteImport, importRecipesFromSite } from './siteRecipeImport.js'
import { loadRecipeLibrary, RECIPE_LIBRARY_VERSION } from '../src/lib/recipeLibrary.js'

function mergeLoadedData(parsed: Partial<AppData>): AppData {
  const settingsVersion = parsed.settings?.recipeLibraryVersion
  const libraryReset = (settingsVersion ?? 0) < RECIPE_LIBRARY_VERSION
  const recipes = loadRecipeLibrary(parsed.recipes, settingsVersion)

  return {
    ...defaultAppData,
    ...parsed,
    profile: {
      ...defaultAppData.profile,
      ...parsed.profile,
      mealPreferences: {
        ...defaultAppData.profile.mealPreferences,
        ...parsed.profile?.mealPreferences,
      },
      fullMealType: parsed.profile?.fullMealType ?? defaultAppData.profile.fullMealType,
    },
    settings: {
      ...defaultAppData.settings,
      ...parsed.settings,
      recipeLibraryVersion: RECIPE_LIBRARY_VERSION,
    },
    menuGuestCounts: { ...defaultAppData.menuGuestCounts, ...parsed.menuGuestCounts },
    recipes,
    weeklyMenus: libraryReset ? [] : (parsed.weeklyMenus ?? []),
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const isDev = !app.isPackaged
const DATA_FILE = path.join(app.getPath('userData'), 'equilibre-data.json')

function loadData(): AppData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<AppData>
      return mergeLoadedData(parsed)
    }
  } catch {
    // ignore corrupt file
  }
  return mergeLoadedData({})
}

function saveData(data: AppData): void {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

let store = loadData()
let siteImportAbort: AbortController | null = null

function getPreloadPath(): string {
  const sourcePreload = path.resolve(__dirname, '../../electron/preload.cjs')
  const bundledPreload = path.join(__dirname, 'preload.cjs')
  if (fs.existsSync(sourcePreload)) return sourcePreload
  return bundledPreload
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Equilibre Planner',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('data:get', () => store)
  ipcMain.handle('data:save', (_event, data: AppData) => {
    store = data
    saveData(data)
    return true
  })

  ipcMain.handle('ollama:listModels', async (_event, baseUrl?: string) => {
    const url = baseUrl ?? store.settings.ollamaUrl
    return listOllamaModels(url)
  })

  ipcMain.handle(
    'ai:generate',
    async (
      _event,
      payload: { system: string; user: string; temperatures?: [number, number]; mode?: 'menu' | 'default' },
    ) => {
    try {
      const result = await generateWithOllama(store.settings, payload, {
        temperatures: payload.temperatures,
        mode: payload.mode,
      })
      if (payload.mode === 'menu') {
        try {
          fs.writeFileSync(
            path.join(app.getPath('userData'), 'last-menu-ai.json'),
            JSON.stringify(result, null, 2),
            'utf-8',
          )
        } catch {
          // ignore debug write errors
        }
      }
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur IA inconnue'
      throw new Error(message)
    }
  })

  ipcMain.handle(
    'ai:extractRecipesFromImage',
    async (
      _event,
      payload: { imagesBase64: string[]; sourceHint?: string; singleRecipe?: boolean },
    ) => {
      try {
        return await extractRecipesFromImage(store.settings, payload.imagesBase64, {
          sourceHint: payload.sourceHint,
          singleRecipe: payload.singleRecipe,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erreur IA inconnue'
        throw new Error(message)
      }
    },
  )

  ipcMain.handle('recipe:importFromUrl', async (_event, payload: { url: string }) => {
    try {
      return await importRecipeFromUrl(store.settings, payload.url)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import URL echoue'
      throw new Error(message)
    }
  })

  ipcMain.handle(
    'recipe:estimateSiteImport',
    async (
      event,
      payload: { startUrl: string; maxRecipes?: number; useAiFallback?: boolean },
    ) => {
      siteImportAbort = new AbortController()
      try {
        return await estimateSiteImport(payload.startUrl, {
          maxRecipes: payload.maxRecipes,
          useAiFallback: payload.useAiFallback ?? false,
          signal: siteImportAbort.signal,
          onProgress: (progress) => {
            event.sender.send('recipe:siteImportProgress', progress)
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Estimation echouee'
        throw new Error(message)
      } finally {
        siteImportAbort = null
      }
    },
  )

  ipcMain.handle(
    'recipe:importFromSite',
    async (
      event,
      payload: { startUrl: string; maxRecipes?: number; useAiFallback?: boolean },
    ) => {
      siteImportAbort = new AbortController()
      try {
        return await importRecipesFromSite(store.settings, payload.startUrl, {
          maxRecipes: payload.maxRecipes,
          useAiFallback: payload.useAiFallback ?? false,
          signal: siteImportAbort.signal,
          onProgress: (progress) => {
            event.sender.send('recipe:siteImportProgress', progress)
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Import site echoue'
        throw new Error(message)
      } finally {
        siteImportAbort = null
      }
    },
  )

  ipcMain.handle('recipe:cancelSiteImport', () => {
    siteImportAbort?.abort()
    return true
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
