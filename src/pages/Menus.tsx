import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '../hooks/useAppData'
import GuestCountEditor from '../components/GuestCountEditor'
import IngredientList from '../components/IngredientList'
import { buildMenuPrompt, parseMenuResponse } from '../lib/ai'
import { getEquilibre } from '../lib/equilibre'
import ButtonSpinner from '../components/ButtonSpinner'
import { useGenerationSpinnerState } from '../hooks/useGenerationSpinnerState'
import { hasAnyActiveMeals, getMealGuestCount, isDayFullyInactive, normalizeGuestCounts } from '../lib/guestCounts'
import {
  buildMealSubstitutionPrompt,
  parseMealSubstitutionResponse,
  replaceMealInMenu,
} from '../lib/mealSubstitution'
import { formatMenuPageSubtitle } from '../lib/mealPreferences'
import { isLightMealId } from '../lib/menuStructure'
import { formatStepForDisplay, resolveMealRecipe } from '../lib/recipeFormat'
import { getPlanningWeekStart } from '../lib/week'
import { DAYS, MEAL_LABELS } from '../types'

const MEAL_ORDER: Array<keyof typeof MEAL_LABELS> = ['breakfast', 'lunch', 'dinner', 'snack']

function AccordionChevron({ expanded }: { expanded: boolean }) {
  return (
    <span className="menu-meal-accordion-chevron" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="14" height="14" focusable="false">
        {expanded ? (
          <line
            x1="6"
            y1="12"
            x2="18"
            y2="12"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
          />
        ) : (
          <>
            <line
              x1="12"
              y1="6"
              x2="12"
              y2="18"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
            />
            <line
              x1="6"
              y1="12"
              x2="18"
              y2="12"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
    </span>
  )
}

export default function Menus() {
  const { data, save, update, loading } = useAppData()
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menuInfo, setMenuInfo] = useState<string | null>(null)
  const [guestCounts, setGuestCounts] = useState(() => normalizeGuestCounts(data.menuGuestCounts))
  const [selectedDay, setSelectedDay] = useState(DAYS[0])
  const [expandedMealKey, setExpandedMealKey] = useState<string | null>(null)
  const [substituteNotes, setSubstituteNotes] = useState('')
  const [substitutePanelKey, setSubstitutePanelKey] = useState<string | null>(null)
  const [substitutingKey, setSubstitutingKey] = useState<string | null>(null)
  const weekStart = getPlanningWeekStart(data.settings)
  const generationSpinner = useGenerationSpinnerState(generating, data.settings.ollamaUrl)
  const pageSubtitle = useMemo(
    () => formatMenuPageSubtitle(data.profile, data.settings),
    [data.profile, data.settings],
  )

  useEffect(() => {
    if (!loading) setGuestCounts(normalizeGuestCounts(data.menuGuestCounts))
  }, [data.menuGuestCounts, loading])

  const currentMenu = data.weeklyMenus.find((m) => m.weekStart === weekStart)

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

  useEffect(() => {
    setExpandedMealKey(null)
    setSubstitutePanelKey(null)
    setSubstituteNotes('')
  }, [selectedDay])

  useEffect(() => {
    if (!currentMenu) return
    const selectedMeals = mealsByDay.get(selectedDay) ?? []
    if (selectedMeals.length > 0) return
    const firstWithMeals = DAYS.find((day) => (mealsByDay.get(day) ?? []).length > 0)
    if (firstWithMeals) setSelectedDay(firstWithMeals)
  }, [currentMenu, mealsByDay, selectedDay])

  const selectedDayMeals = mealsByDay.get(selectedDay) ?? []
  const menuGuests = useMemo(
    () => normalizeGuestCounts(currentMenu?.guestsByDay ?? guestCounts),
    [currentMenu?.guestsByDay, guestCounts],
  )

  const handleGuestCountsChange = (next: ReturnType<typeof normalizeGuestCounts>) => {
    setGuestCounts(next)
    void update({ menuGuestCounts: next })
  }

  const handleSubstituteMeal = async (day: string, meal: (typeof selectedDayMeals)[number]) => {
    if (!currentMenu || data.recipes.length === 0) {
      setError('Bibliotheque vide. Importez des recettes avant de substituer.')
      return
    }

    const mealKey = meal.mealType
    setSubstitutingKey(`${day}:${mealKey}`)
    setError(null)
    setMenuInfo(null)

    try {
      const target = { day, mealType: meal.mealType }
      const prompt = buildMealSubstitutionPrompt({
        data,
        menu: currentMenu,
        target,
        userNotes: substituteNotes,
      })

      const raw = await getEquilibre().generateAI({
        system: prompt.system,
        user: prompt.user,
      })

      const result = parseMealSubstitutionResponse(
        raw,
        target,
        currentMenu,
        data.recipes,
        data.profile,
        prompt.promptRecipes,
      )

      if (!result) {
        throw new Error('Aucune alternative compatible dans la bibliotheque.')
      }

      const updatedMenu = replaceMealInMenu(currentMenu, result.meal)
      const otherMenus = data.weeklyMenus.filter((m) => m.weekStart !== weekStart)
      await save({
        ...data,
        weeklyMenus: [updatedMenu, ...otherMenus],
      })

      setSubstituteNotes('')
      setSubstitutePanelKey(null)
      setMenuInfo(
        result.usedFallback
          ? `« ${result.meal.recipeName} » propose automatiquement (reponse IA illisible).`
          : `Repas remplace par « ${result.meal.recipeName} ».`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSubstitutingKey(null)
    }
  }

  const generateMenu = async () => {
    if (data.recipes.length === 0) {
      setError('Bibliotheque vide. Ajoutez des recettes dans l\'onglet Recettes.')
      return
    }
    const counts = normalizeGuestCounts(guestCounts)
    if (!hasAnyActiveMeals(counts)) {
      setError('Au moins un creneau (matin, midi ou soir) doit avoir au moins 1 personne.')
      return
    }
    setGenerating(true)
    setError(null)
    setMenuInfo(null)
    try {
      const prompt = buildMenuPrompt({ ...data, menuGuestCounts: counts })
      const raw = await getEquilibre().generateAI({
        system: prompt.system,
        user: prompt.user,
        temperatures: [0.55, 0.35],
        mode: 'menu',
      })
      const { recipes, menu, usedFallback, aiMealCount, fallbackFilledCount } = parseMenuResponse(
        raw,
        weekStart,
        counts,
        data.recipes,
        {
          promptRecipes: prompt.promptRecipes,
          profile: data.profile,
          generationSeed: prompt.generationSeed,
        },
      )

      if (menu.meals.filter((meal) => !meal.isLightMeal).length === 0) {
        throw new Error('Impossible de composer un menu. Verifiez Ollama dans Parametres.')
      }

      if (usedFallback) {
        if (aiMealCount === 0) {
          setMenuInfo(
            'Menu compose automatiquement (reponse IA illisible). Relancez ou verifiez le modele Ollama dans Parametres.',
          )
        } else if (fallbackFilledCount > 0) {
          setMenuInfo(
            `${aiMealCount} repas choisis par l'IA, ${fallbackFilledCount} complete(s) automatiquement.`,
          )
        }
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
        <p>{pageSubtitle}</p>
      </header>

      <GuestCountEditor counts={guestCounts} onChange={handleGuestCountsChange} />

      <div style={{ marginBottom: 16 }}>
        <button
          className="btn btn-primary btn-with-spinner"
          onClick={generateMenu}
          disabled={generating || data.recipes.length === 0}
          aria-busy={generating}
        >
          <span>{generating ? 'Generation en cours...' : 'Generer le menu avec IA'}</span>
          <ButtonSpinner state={generationSpinner} />
        </button>
        <p className="field-hint" style={{ marginTop: 10 }}>
          La generation peut prendre quelques minutes. Importez des recettes dans{' '}
          <Link to="/recettes">Recettes</Link> avant de generer un menu
          {data.recipes.length > 0 && (
            <>
              {' '}
              ({data.recipes.length} recette(s) en bibliotheque
              {data.recipes.length > 120 ? ', l\'IA en echantillonne ~120 par semaine' : ''})
            </>
          )}
          .
        </p>
        {error && <p className="error">{error}</p>}
        {menuInfo && !error && (
          <p className="field-hint" style={{ color: 'var(--accent)', marginTop: 10 }}>
            {menuInfo}
          </p>
        )}
      </div>

      {!currentMenu ? (
        <div className="card">
          <p className="empty">Aucun menu pour cette semaine. Generez-en un a partir de votre profil.</p>
        </div>
      ) : (
        <div className="grid grid-2">
          <div className="card">
            <h2>Planning des repas</h2>
            <p className="field-hint" style={{ marginBottom: 12 }}>
              Cliquez sur un jour pour voir le detail des recettes. Cliquez sur un repas (+) pour
              afficher ingredients et etapes.
            </p>
            <div className="meal-grid">
              {DAYS.map((day) => {
                const dayInactive = isDayFullyInactive(menuGuests, day)
                const dayMeals = mealsByDay.get(day) ?? []
                const isSelected = selectedDay === day
                return (
                <button
                  key={day}
                  type="button"
                  className={`meal-day${isSelected ? ' meal-day--selected' : ''}`}
                  onClick={() => setSelectedDay(day)}
                >
                  <strong>
                    {day}
                    {dayInactive && (
                      <span className="guest-badge guest-badge-off">Jour libre</span>
                    )}
                  </strong>
                  {dayMeals.length === 0 && (
                    <p className="empty" style={{ margin: '6px 0 0' }}>
                      {dayInactive ? 'Aucun repas prevu' : 'Aucun repas planifie'}
                    </p>
                  )}
                  {dayMeals.map((meal, i) => {
                    const period = meal.mealType as 'breakfast' | 'lunch' | 'dinner'
                    const mealGuests =
                      period === 'breakfast' || period === 'lunch' || period === 'dinner'
                        ? getMealGuestCount(menuGuests, day, period)
                        : null
                    return (
                    <div key={i} className="meal-row">
                      <span>{MEAL_LABELS[meal.mealType]}</span>
                      <span>
                        {meal.recipeName}
                        {meal.isLightMeal && <span className="badge">Leger</span>}
                        {mealGuests != null && (
                          <span className="guest-badge">{mealGuests} pers.</span>
                        )}
                      </span>
                    </div>
                  )})}
                </button>
              )})}
            </div>
          </div>

          <div className="card">
            <h2>{selectedDay}</h2>
            {selectedDayMeals.length === 0 ? (
              <p className="empty">Aucun repas prevu pour ce jour.</p>
            ) : (
              <div className="menu-meal-list">
              {selectedDayMeals.map((meal) => {
                const mealKey = meal.mealType
                const isExpanded = expandedMealKey === mealKey
                const recipe = isLightMealId(meal.recipeId)
                  ? null
                  : resolveMealRecipe(meal.recipeId, meal.recipeName, data.recipes)
                const period = meal.mealType as 'breakfast' | 'lunch' | 'dinner'
                const mealGuests =
                  period === 'breakfast' || period === 'lunch' || period === 'dinner'
                    ? getMealGuestCount(menuGuests, selectedDay, period)
                    : null

                const mealPanelKey = `${selectedDay}:${mealKey}`
                const isSubstituteOpen = substitutePanelKey === mealPanelKey

                return (
                  <article key={mealKey} className="recipe-card menu-meal-accordion">
                    <button
                      type="button"
                      className="recipe-card-header menu-meal-accordion-header"
                      onClick={() => {
                        if (isExpanded) setSubstitutePanelKey(null)
                        setExpandedMealKey(isExpanded ? null : mealKey)
                      }}
                      aria-expanded={isExpanded}
                    >
                      <div>
                        <div className="menu-meal-accordion-title">
                          <strong>{MEAL_LABELS[meal.mealType]}</strong>
                          {meal.isLightMeal && <span className="badge">Leger</span>}
                          {mealGuests != null && (
                            <span className="guest-badge">{mealGuests} pers.</span>
                          )}
                        </div>
                        <p className="menu-day-recipe-name">{meal.recipeName}</p>
                        {recipe && (
                          <p className="field-hint">
                            {recipe.servings} portions · {recipe.prepMinutes} min
                          </p>
                        )}
                      </div>
                      <AccordionChevron expanded={isExpanded} />
                    </button>

                    {isExpanded && (
                      <div className="recipe-card-body">
                        {!isSubstituteOpen ? (
                          <button
                            type="button"
                            className="btn btn-secondary meal-substitute-toggle"
                            onClick={(event) => {
                              event.stopPropagation()
                              if (substitutePanelKey !== mealPanelKey) setSubstituteNotes('')
                              setSubstitutePanelKey(mealPanelKey)
                            }}
                          >
                            Substituer ce repas
                          </button>
                        ) : (
                          <div
                            className="meal-substitute-panel"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <strong>Substituer ce repas</strong>
                            <p className="field-hint">
                              Decrivez ce que vous prefereriez : l&apos;IA choisira une autre recette
                              dans la bibliotheque.
                            </p>
                            <textarea
                              value={substituteNotes}
                              onChange={(event) => setSubstituteNotes(event.target.value)}
                              placeholder="Ex. plutot une soupe legere, sans pates, plus rapide, vegetarien..."
                              rows={3}
                            />
                            <div className="meal-substitute-actions">
                              <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={
                                  substitutingKey === mealPanelKey ||
                                  generating ||
                                  data.recipes.length === 0
                                }
                                onClick={() => void handleSubstituteMeal(selectedDay, meal)}
                              >
                                {substitutingKey === mealPanelKey
                                  ? 'Recherche en cours...'
                                  : 'Proposer une alternative'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={substitutingKey === mealPanelKey}
                                onClick={() => {
                                  setSubstitutePanelKey(null)
                                  setSubstituteNotes('')
                                }}
                              >
                                Annuler
                              </button>
                            </div>
                          </div>
                        )}

                        {recipe ? (
                          <div className="menu-meal-recipe-detail">
                            <strong>Ingredients</strong>
                            <IngredientList
                              ingredients={recipe.ingredients}
                              recipeServings={recipe.servings}
                              guestCount={mealGuests ?? undefined}
                            />
                            <strong>Etapes</strong>
                            <ol>
                              {(recipe.steps ?? []).map((step, j) => (
                                <li key={j} className="recipe-step">
                                  {formatStepForDisplay(step)}
                                </li>
                              ))}
                            </ol>
                          </div>
                        ) : (
                          !isSubstituteOpen && (
                            <p className="field-hint">Repas leger sans recette detaillee.</p>
                          )
                        )}
                      </div>
                    )}
                  </article>
                )
              })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
