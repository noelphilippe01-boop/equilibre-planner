import { useEffect, useMemo, useState } from 'react'
import { useAppData } from '../hooks/useAppData'
import GuestCountEditor from '../components/GuestCountEditor'
import { buildMenuPrompt, parseMenuResponse } from '../lib/ai'
import { getEquilibre } from '../lib/equilibre'
import { normalizeGuestCounts } from '../lib/guestCounts'
import { formatIngredientLine, uniqueRecipesForMenu } from '../lib/recipeFormat'
import { getPlanningWeekLabel, getPlanningWeekStart } from '../lib/week'
import { DAYS, MEAL_LABELS } from '../types'

const MEAL_ORDER: Array<keyof typeof MEAL_LABELS> = ['breakfast', 'lunch', 'dinner', 'snack']

export default function Menus() {
  const { data, save, update, loading } = useAppData()
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guestCounts, setGuestCounts] = useState(() => normalizeGuestCounts(data.menuGuestCounts))
  const weekStart = getPlanningWeekStart(data.settings)
  const weekLabel = getPlanningWeekLabel(data.settings)

  useEffect(() => {
    if (!loading) setGuestCounts(normalizeGuestCounts(data.menuGuestCounts))
  }, [data.menuGuestCounts, loading])

  const currentMenu = data.weeklyMenus.find((m) => m.weekStart === weekStart)
  const recipesById = useMemo(() => new Map(data.recipes.map((r) => [r.id, r])), [data.recipes])

  const mealsByDay = useMemo(() => {
    const map = new Map<string, NonNullable<typeof currentMenu>['meals']>()
    for (const day of DAYS) map.set(day, [])
    currentMenu?.meals.forEach((meal) => {
      map.get(meal.day)?.push(meal)
    })
    for (const day of DAYS) {
      const meals = map.get(day) ?? []
      meals.sort(
        (a, b) => MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType),
      )
    }
    return map
  }, [currentMenu])

  const menuRecipes = useMemo(() => {
    if (!currentMenu) return []
    return uniqueRecipesForMenu(currentMenu.meals, recipesById)
  }, [currentMenu, recipesById])

  const handleGuestCountsChange = (next: ReturnType<typeof normalizeGuestCounts>) => {
    setGuestCounts(next)
    void update({ menuGuestCounts: next })
  }

  const generateMenu = async () => {
    setGenerating(true)
    setError(null)
    try {
      const counts = normalizeGuestCounts(guestCounts)
      const prompt = buildMenuPrompt({ ...data, menuGuestCounts: counts })
      const raw = await getEquilibre().generateAI(prompt)
      const { recipes, menu } = parseMenuResponse(raw, weekStart, counts)

      if (menu.meals.length === 0) {
        throw new Error('Menu vide ou illisible. Reessayez la generation.')
      }

      const mergedRecipes = [...data.recipes]
      for (const recipe of recipes) {
        const idx = mergedRecipes.findIndex((r) => r.id === recipe.id)
        if (idx >= 0) mergedRecipes[idx] = recipe
        else mergedRecipes.push(recipe)
      }

      const otherMenus = data.weeklyMenus.filter((m) => m.weekStart !== weekStart)
      await save({
        ...data,
        menuGuestCounts: counts,
        recipes: mergedRecipes,
        weeklyMenus: [menu, ...otherMenus],
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <div className="loading">Chargement...</div>

  return (
    <>
      <header className="page-header">
        <h1>Menus de la semaine</h1>
        <p>{weekLabel} · Batch cooking et produits de saison</p>
      </header>

      <GuestCountEditor counts={guestCounts} onChange={handleGuestCountsChange} />

      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={generateMenu} disabled={generating}>
          {generating ? 'Generation en cours...' : 'Generer le menu avec IA'}
        </button>
        <p className="field-hint" style={{ marginTop: 10 }}>
          La generation peut prendre quelques minutes.
        </p>
        {error && <p className="error">{error}</p>}
      </div>

      {!currentMenu ? (
        <div className="card">
          <p className="empty">Aucun menu pour cette semaine. Generez-en un a partir de votre profil.</p>
        </div>
      ) : (
        <div className="grid grid-2">
          <div className="card">
            <h2>Planning des repas</h2>
            <div className="meal-grid">
              {DAYS.map((day) => (
                <div key={day} className="meal-day">
                  <strong>
                    {day}
                    {(currentMenu.guestsByDay?.[day] ?? guestCounts[day]) > 0 && (
                      <span className="guest-badge">
                        {currentMenu.guestsByDay?.[day] ?? guestCounts[day]} pers.
                      </span>
                    )}
                  </strong>
                  {(mealsByDay.get(day) ?? []).length === 0 && (
                    <p className="empty" style={{ margin: '6px 0 0' }}>Aucun repas planifie</p>
                  )}
                  {(mealsByDay.get(day) ?? []).map((meal, i) => (
                    <div key={i} className="meal-row">
                      <span>{MEAL_LABELS[meal.mealType]}</span>
                      <span>
                        {meal.recipeName}
                        {meal.isBatchCooking && <span className="badge">Batch</span>}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>Recettes ({menuRecipes.length})</h2>
            {menuRecipes.map((recipe) => (
                <div key={recipe.id} style={{ marginBottom: 20 }}>
                  <h3>{recipe.name}</h3>
                  <p>
                    {recipe.servings} portions · {recipe.prepMinutes} min
                  </p>
                  {recipe.batchCookingNotes && <p><em>{recipe.batchCookingNotes}</em></p>}
                  <strong>Ingredients</strong>
                  <ul>
                    {recipe.ingredients.map((ing, i) => (
                      <li key={i}>{formatIngredientLine(ing)}</li>
                    ))}
                  </ul>
                  <strong>Etapes</strong>
                  <ol>
                    {recipe.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  )
}
