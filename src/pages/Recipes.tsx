import { useMemo, useState } from 'react'
import { useAppData } from '../hooks/useAppData'
import { exportRecipesJson } from '../lib/recipeLibrary'
import IngredientList from '../components/IngredientList'
import RecipeImageImport from '../components/RecipeImageImport'
import RecipeSiteImport from '../components/RecipeSiteImport'
import RecipeUrlImport from '../components/RecipeUrlImport'
import { formatStepForDisplay } from '../lib/recipeFormat'
import type { Recipe, RecipeMealType } from '../types'
import { MEAL_LABELS } from '../types'

type MealFilter = 'all' | RecipeMealType

const MEAL_FILTER_OPTIONS: { value: MealFilter; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'breakfast', label: 'Petit-dejeuner' },
  { value: 'lunch', label: 'Dejeuner' },
  { value: 'dinner', label: 'Diner' },
]

export default function Recipes() {
  const { data, update, loading } = useAppData()
  const [search, setSearch] = useState('')
  const [mealFilter, setMealFilter] = useState<MealFilter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data.recipes ?? []).filter((recipe) => {
      if (mealFilter !== 'all' && !recipe.mealTypes?.includes(mealFilter)) return false
      if (!query) return true
      const haystack = [
        recipe.name,
        recipe.source ?? '',
        ...(recipe.tags ?? []),
        ...(recipe.ingredients ?? []).map((i) => i.name),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [data.recipes, mealFilter, search])

  if (loading) return <div className="loading">Chargement...</div>

  const handleExport = () => {
    const blob = new Blob([exportRecipesJson(data.recipes)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'equilibre-recettes.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleDelete = async (recipe: Recipe) => {
    if (!confirm(`Supprimer « ${recipe.name} » de la bibliotheque ?`)) return
    await update({ recipes: data.recipes.filter((r) => r.id !== recipe.id) })
    if (expandedId === recipe.id) setExpandedId(null)
  }

  const handleClearLibrary = async () => {
    if (!confirm('Vider toute la bibliotheque ? Les menus existants seront aussi supprimes.')) return
    await update({ recipes: [], weeklyMenus: [] })
    setExpandedId(null)
    setImportSuccess(null)
  }

  return (
    <>
      <header className="page-header">
        <h1>Bibliotheque de recettes</h1>
        <p>
          {data.recipes.length === 0
            ? 'Bibliotheque vide — importez vos recettes (site, URL, image) pour commencer.'
            : `${data.recipes.length} recette(s) importee(s). L'IA composera les menus a partir de cette bibliotheque.`}
        </p>
        {data.recipes.length > 0 && (
          <div className="recipe-import-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-secondary" type="button" onClick={handleExport}>
              Exporter la bibliotheque
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => void handleClearLibrary()}>
              Vider la bibliotheque
            </button>
          </div>
        )}
      </header>

      <RecipeSiteImport onImported={(summary) => setImportSuccess(summary)} />

      <RecipeUrlImport
        onImported={(count, method) =>
          setImportSuccess(
            `${count} recette(s) ajoutee(s) depuis l'URL (${method === 'schema' ? 'extraction directe' : 'IA'}).`,
          )
        }
      />

      <RecipeImageImport
        onImported={(count) =>
          setImportSuccess(`${count} recette(s) ajoutee(s) depuis l'image.`)
        }
      />

      {importSuccess && (
        <p className="field-hint" style={{ color: 'var(--accent)', marginBottom: 16 }}>
          {importSuccess}
        </p>
      )}

      <div className="card">
        <div className="recipe-library-toolbar">
          <input
            type="search"
            placeholder="Rechercher une recette…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="tag-list">
            {MEAL_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`example-chip ${mealFilter === option.value ? 'example-chip-selected' : ''}`}
                onClick={() => setMealFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="empty">
            {data.recipes.length === 0
              ? 'Aucune recette. Importez une image ci-dessus.'
              : 'Aucune recette ne correspond a votre recherche.'}
          </p>
        ) : (
          <div className="recipe-list">
            {filtered.map((recipe) => (
              <article key={recipe.id} className="recipe-card">
                <button
                  type="button"
                  className="recipe-card-header"
                  onClick={() => setExpandedId(expandedId === recipe.id ? null : recipe.id)}
                >
                  <div>
                    <strong>{recipe.name}</strong>
                    <p className="field-hint">
                      {recipe.servings} pers · {recipe.prepMinutes} min
                      {recipe.source ? ` · ${recipe.source}` : ''}
                    </p>
                  </div>
                  <div className="tag-list">
                    {recipe.mealTypes?.map((type) => (
                      <span key={type} className="tag">{MEAL_LABELS[type]}</span>
                    ))}
                    {(recipe.tags ?? []).slice(0, 3).map((tag) => (
                      <span key={tag} className="tag">{tag}</span>
                    ))}
                  </div>
                </button>

                {expandedId === recipe.id && (
                  <div className="recipe-card-body">
                    {recipe.seasons?.length ? (
                      <p className="field-hint">Saisons : {recipe.seasons.join(', ')}</p>
                    ) : null}
                    <strong>Ingredients</strong>
                    <IngredientList
                      ingredients={recipe.ingredients ?? []}
                      recipeServings={recipe.servings}
                    />
                    <strong>Etapes</strong>
                    <ol>
                      {(recipe.steps ?? []).map((step, i) => (
                        <li key={i} className="recipe-step">{formatStepForDisplay(step)}</li>
                      ))}
                    </ol>
                    {recipe.sourceUrl && (
                      <p className="field-hint">
                        Source : <a href={recipe.sourceUrl} target="_blank" rel="noreferrer">{recipe.sourceUrl}</a>
                      </p>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary recipe-delete-btn"
                      onClick={() => void handleDelete(recipe)}
                    >
                      Supprimer
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
