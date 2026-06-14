import { useMemo, useState } from 'react'
import { useAppData } from '../hooks/useAppData'
import { buildShoppingList, getCurrentMenu } from '../lib/shopping'
import { getPlanningWeekLabel, getPlanningWeekStart } from '../lib/week'
import type { ShoppingItem } from '../types'

export default function Shopping() {
  const { data, loading } = useAppData()
  const weekStart = getPlanningWeekStart(data.settings)
  const weekLabel = getPlanningWeekLabel(data.settings)
  const menu = getCurrentMenu(data, weekStart)

  const items = useMemo(() => {
    if (!menu) return [] as ShoppingItem[]
    return buildShoppingList(menu, data.recipes)
  }, [menu, data.recipes])

  const [checked, setChecked] = useState<Record<string, boolean>>({})

  if (loading) return <div className="loading">Chargement...</div>

  const toggle = async (name: string) => {
    const next = { ...checked, [name]: !checked[name] }
    setChecked(next)
  }

  const exportList = () => {
    const text = items
      .map((item) => `- [${checked[item.name] ? 'x' : ' '}] ${item.name} — ${item.quantity} ${item.unit}`)
      .join('\n')
    navigator.clipboard.writeText(text)
  }

  return (
    <>
      <header className="page-header">
        <h1>Liste de courses</h1>
        <p>Generee automatiquement a partir du menu de la {weekLabel.toLowerCase()}</p>
      </header>

      {!menu ? (
        <div className="card">
          <p className="empty">Generez d&apos;abord un menu dans l&apos;onglet Menus.</p>
        </div>
      ) : (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <strong>{items.length} ingredients</strong>
            <button className="btn btn-secondary" onClick={exportList}>
              Copier la liste
            </button>
          </div>

          {items.map((item) => (
            <label key={item.name} className="checkbox-row">
              <input
                type="checkbox"
                checked={!!checked[item.name]}
                onChange={() => toggle(item.name)}
              />
              <span>
                {item.name} — {item.quantity} {item.unit}
              </span>
            </label>
          ))}
        </div>
      )}
    </>
  )
}
