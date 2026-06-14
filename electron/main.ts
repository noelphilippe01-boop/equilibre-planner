import { ipcMain, app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import type { AppData } from '../src/types/index.js'
import { defaultAppData } from './defaults.js'
import { generateWithOllama, listOllamaModels } from './ollama.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const isDev = !app.isPackaged
const DATA_FILE = path.join(app.getPath('userData'), 'equilibre-data.json')

function loadData(): AppData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<AppData>
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
        },
        settings: { ...defaultAppData.settings, ...parsed.settings },
        menuGuestCounts: { ...defaultAppData.menuGuestCounts, ...parsed.menuGuestCounts },
      }
    }
  } catch {
    // ignore corrupt file
  }
  return structuredClone(defaultAppData)
}

function saveData(data: AppData): void {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

let store = loadData()

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Equilibre Planner',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
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

  ipcMain.handle('ai:generate', async (_event, payload: { system: string; user: string }) => {
    try {
      return await generateWithOllama(store.settings, payload)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur IA inconnue'
      throw new Error(message)
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
