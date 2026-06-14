import { useState } from 'react'
import { useAppData } from '../hooks/useAppData'
import { isElectronApp, requireEquilibreApi } from '../lib/equilibre'
import { mergeRecipes, parseRecipeList } from '../lib/recipeLibrary'
import IngredientList from './IngredientList'
import { formatStepForDisplay } from '../lib/recipeFormat'
import type { Recipe } from '../types'
import { MEAL_LABELS } from '../types'

interface RecipeUrlImportProps {
  onImported?: (count: number, method: 'schema' | 'ai') => void
}

export default function RecipeUrlImport({ onImported }: RecipeUrlImportProps) {
  const { data, update } = useAppData()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<Recipe[] | null>(null)
  const [importMethod, setImportMethod] = useState<'schema' | 'ai' | null>(null)

  const handleFetch = async () => {
    const trimmed = url.trim()
    if (!trimmed) {
      setError('Collez l\'URL d\'une fiche recette.')
      return
    }
    if (!isElectronApp()) {
      setError('Disponible uniquement dans l\'application Equilibre Planner (Electron).')
      return
    }

    setLoading(true)
    setError(null)
    setExtracted(null)
    setImportMethod(null)

    try {
      const result = await requireEquilibreApi('importRecipeFromUrl')({ url: trimmed })
      const recipes = parseRecipeList(result.recipes)
      if (!recipes.length) throw new Error('Aucune recette extraite de cette page.')
      setExtracted(recipes)
      setImportMethod(result.method)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import echoue')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!extracted?.length) return
    const merged = mergeRecipes(data.recipes, extracted)
    await update({ recipes: merged })
    onImported?.(extracted.length, importMethod ?? 'schema')
    setUrl('')
    setExtracted(null)
    setImportMethod(null)
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>Importer depuis une URL</h2>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Collez le lien d&apos;une fiche recette (Les Commis, Marmiton, blog…). Extraction
        automatique si le site est structure, sinon analyse par IA locale.
      </p>

      <label>
        URL de la recette
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.lescommis.com/recettes/..."
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleFetch()
          }}
        />
      </label>

      <div className="recipe-import-actions" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void handleFetch()}
          disabled={loading || !url.trim()}
        >
          {loading ? 'Chargement…' : 'Recuperer la recette'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void handleConfirm()}
          disabled={loading || !extracted?.length}
        >
          Ajouter{' '}
          {extracted?.length === 1
            ? 'la recette a la bibliotheque'
            : extracted?.length
              ? `${extracted.length} recettes a la bibliotheque`
              : 'a la bibliotheque'}
        </button>
        {extracted && (
          <button type="button" className="btn btn-secondary" onClick={() => setExtracted(null)}>
            Annuler
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {extracted && extracted.length > 0 && (
        <div className="recipe-extract-preview">
          <h3>
            {extracted.length === 1 ? '1 recette recuperee' : `${extracted.length} recettes recuperees`}
          </h3>
          <p className="field-hint">
            Methode :{' '}
            {importMethod === 'schema'
              ? 'donnees structurees du site (rapide, fiable)'
              : 'analyse IA du texte de la page'}
            {' '}— verifiez avant d&apos;ajouter.
          </p>
          <div className="recipe-list">
            {extracted.map((recipe) => (
              <article key={recipe.id} className="recipe-card">
                <div className="recipe-card-body" style={{ borderTop: 'none', paddingTop: 14 }}>
                  <strong>{recipe.name}</strong>
                  <p className="field-hint">
                    {recipe.servings} pers · {recipe.prepMinutes} min
                    {recipe.source ? ` · ${recipe.source}` : ''}
                  </p>
                  {recipe.sourceUrl && (
                    <p className="field-hint">
                      <a href={recipe.sourceUrl} target="_blank" rel="noreferrer">
                        {recipe.sourceUrl}
                      </a>
                    </p>
                  )}
                  {recipe.mealTypes?.length ? (
                    <div className="tag-list" style={{ marginBottom: 8 }}>
                      {recipe.mealTypes.map((type) => (
                        <span key={type} className="tag">{MEAL_LABELS[type]}</span>
                      ))}
                    </div>
                  ) : null}
                  <strong>Ingredients</strong>
                  <IngredientList ingredients={recipe.ingredients ?? []} />
                  {(recipe.steps ?? []).length > 0 && (
                    <>
                      <strong>Etapes</strong>
                      <ol>
                        {(recipe.steps ?? []).map((step, i) => (
                          <li key={i} className="recipe-step">{formatStepForDisplay(step)}</li>
                        ))}
                      </ol>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
