import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AppData } from '../types'
import { defaultAppData } from '../types'
import { getEquilibre, isElectronApp } from '../lib/equilibre'

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
      setLoading(false)
      return
    }
    getEquilibre()
      .getData()
      .then(setData)
      .catch(() => setData(defaultAppData))
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
