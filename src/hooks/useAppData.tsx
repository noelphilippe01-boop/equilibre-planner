import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AppData } from '../types'
import { defaultAppData, defaultMealPreferences, defaultProfile, defaultSettings } from '../types'
import { getEquilibre, isElectronApp } from '../lib/equilibre'
import { normalizeGuestCounts } from '../lib/guestCounts'
import { loadRecipeLibrary, RECIPE_LIBRARY_VERSION } from '../lib/recipeLibrary'

function normalizeLoadedData(loaded: Partial<AppData>): AppData {
  const settingsVersion = loaded.settings?.recipeLibraryVersion
  const libraryReset = (settingsVersion ?? 0) < RECIPE_LIBRARY_VERSION
  const recipes = loadRecipeLibrary(loaded.recipes, settingsVersion)

  return {
    ...defaultAppData,
    ...loaded,
    profile: {
      ...defaultProfile,
      ...loaded.profile,
      fullMealType: loaded.profile?.fullMealType ?? defaultProfile.fullMealType,
      mealPreferences: {
        ...defaultMealPreferences,
        ...loaded.profile?.mealPreferences,
      },
    },
    settings: {
      ...defaultSettings,
      ...loaded.settings,
      recipeLibraryVersion: RECIPE_LIBRARY_VERSION,
    },
    menuGuestCounts: normalizeGuestCounts(loaded.menuGuestCounts),
    recipes,
    weeklyMenus: libraryReset
      ? []
      : (loaded.weeklyMenus ?? []).map((menu) => ({
          ...menu,
          guestsByDay: normalizeGuestCounts(menu.guestsByDay),
        })),
  }
}

interface AppContextValue {
  data: AppData
  loading: boolean
  save: (next: AppData) => Promise<void>
  update: (patch: Partial<AppData>) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(defaultAppData)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isElectronApp()) {
      setData(normalizeLoadedData(defaultAppData))
      setLoading(false)
      return
    }
    getEquilibre()
      .getData()
      .then((loaded) => {
        const next = normalizeLoadedData(loaded)
        setData(next)
        void getEquilibre().saveData(next)
      })
      .catch(() => setData(normalizeLoadedData(defaultAppData)))
      .finally(() => setLoading(false))
  }, [])

  const save = async (next: AppData) => {
    setData(next)
    await getEquilibre().saveData(next)
  }

  const update = async (patch: Partial<AppData>) => {
    const next = { ...data, ...patch }
    await save(next)
  }

  return (
    <AppContext.Provider value={{ data, loading, save, update }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppData() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppData must be used within AppProvider')
  return ctx
}
