import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '../hooks/useAppData'
import { isElectronApp, requireEquilibreApi } from '../lib/equilibre'
import { isImageFile, prepareImageForOllama, readImageFromClipboard } from '../lib/imageUtils'
import { mergeRecipes, parseRecipeList } from '../lib/recipeLibrary'
import IngredientList from './IngredientList'
import { formatStepForDisplay } from '../lib/recipeFormat'
import type { Recipe } from '../types'
import { MEAL_LABELS } from '../types'

const MAX_IMAGES = 8

interface PendingImage {
  id: string
  previewUrl: string
  base64: string
}

interface RecipeImageImportProps {
  onImported?: (count: number) => void
}

export default function RecipeImageImport({ onImported }: RecipeImageImportProps) {
  const { data, update } = useAppData()
  const [images, setImages] = useState<PendingImage[]>([])
  const [singleRecipeMode, setSingleRecipeMode] = useState(false)
  const [sourceHint, setSourceHint] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted] = useState<Recipe[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imagesRef = useRef<PendingImage[]>([])
  imagesRef.current = images

  const revokeAll = useCallback((items: PendingImage[]) => {
    for (const item of items) URL.revokeObjectURL(item.previewUrl)
  }, [])

  const clearAll = useCallback(() => {
    setImages((prev) => {
      revokeAll(prev)
      return []
    })
    setExtracted(null)
    setError(null)
    setSingleRecipeMode(false)
  }, [revokeAll])

  const appendFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(isImageFile)
    if (!imageFiles.length) {
      setError('Format non supporte. Utilisez JPG, PNG ou WebP.')
      return
    }

    const remaining = MAX_IMAGES - imagesRef.current.length
    if (remaining <= 0) {
      setError(`Maximum ${MAX_IMAGES} images par import.`)
      return
    }

    const batch = imageFiles.slice(0, remaining)
    if (imageFiles.length > remaining) {
      setError(`Seules ${remaining} image(s) ajoutee(s) (max ${MAX_IMAGES}).`)
    }

    setError(null)
    setExtracted(null)

    const added: PendingImage[] = []
    for (const file of batch) {
      try {
        const base64 = await prepareImageForOllama(file)
        added.push({
          id: crypto.randomUUID(),
          previewUrl: URL.createObjectURL(file),
          base64,
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur de lecture image')
        break
      }
    }

    if (!added.length) return

    setImages((prev) => {
      const next = [...prev, ...added]
      if (next.length > 1) setSingleRecipeMode(true)
      return next
    })
  }, [])

  const removeImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((img) => img.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      const next = prev.filter((img) => img.id !== id)
      if (next.length <= 1) setSingleRecipeMode(false)
      return next
    })
    setExtracted(null)
  }

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('textarea, input:not([type=file])')) return

      void readImageFromClipboard(event.clipboardData).then((file) => {
        if (file) {
          event.preventDefault()
          void appendFiles([file])
        }
      })
    }

    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [appendFiles])

  useEffect(() => {
    return () => {
      for (const item of imagesRef.current) URL.revokeObjectURL(item.previewUrl)
    }
  }, [])

  const handleExtract = async () => {
    if (!images.length) return
    if (!isElectronApp()) {
      setError('Disponible uniquement dans l\'application Equilibre Planner (Electron).')
      return
    }

    setExtracting(true)
    setError(null)
    setExtracted(null)
    try {
      const raw = await requireEquilibreApi('extractRecipesFromImage')({
        imagesBase64: images.map((img) => img.base64),
        sourceHint: sourceHint.trim() || undefined,
        singleRecipe: singleRecipeMode,
      })
      let recipes = parseRecipeList(raw)
      if (singleRecipeMode && recipes.length > 1) {
        recipes = [recipes[0]]
      }
      setExtracted(recipes)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extraction echouee')
    } finally {
      setExtracting(false)
    }
  }

  const handleConfirmImport = async () => {
    if (!extracted?.length) return
    const merged = mergeRecipes(data.recipes, extracted)
    await update({ recipes: merged })
    onImported?.(extracted.length)
    clearAll()
    setSourceHint('')
  }

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    void appendFiles([...event.dataTransfer.files])
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>Importer depuis une image</h2>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Page de livre, capture, scan ou note manuscrite. Ajoutez plusieurs images si la recette
        s&apos;etend sur plusieurs pages (ingredients + etapes). Coller :{' '}
        <kbd>Ctrl</kbd>+<kbd>V</kbd> · Max {MAX_IMAGES} images.
      </p>

      <label style={{ marginBottom: 12 }}>
        Source (optionnel)
        <input
          value={sourceHint}
          onChange={(e) => setSourceHint(e.target.value)}
          placeholder="Ex. Mon livre p. 42-43, carnet mamie…"
        />
      </label>

      <label className="checkbox-row" style={{ borderBottom: 'none', marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={singleRecipeMode}
          onChange={(e) => setSingleRecipeMode(e.target.checked)}
          disabled={images.length === 0}
        />
        <span>
          Ces images = <strong>une seule recette</strong> (fusionner ingredients et etapes)
        </span>
      </label>

      <div
        className={`recipe-image-dropzone ${dragOver ? 'recipe-image-dropzone-active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {images.length === 0 ? (
          <p className="empty">
            Glissez des images ici, collez une capture ou choisissez un fichier
          </p>
        ) : (
          <div className="recipe-image-grid">
            {images.map((img, index) => (
              <figure key={img.id} className="recipe-image-thumb">
                <img src={img.previewUrl} alt={`Page ${index + 1}`} />
                <figcaption>
                  <span>Page {index + 1}</span>
                  <button
                    type="button"
                    className="recipe-image-remove"
                    onClick={() => removeImage(img.id)}
                    title="Retirer cette image"
                  >
                    ×
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>

      <div className="recipe-import-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => imageInputRef.current?.click()}
          disabled={images.length >= MAX_IMAGES}
        >
          {images.length ? 'Ajouter une image…' : 'Choisir une image…'}
        </button>
        {images.length > 0 && (
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleExtract()}
              disabled={extracting}
            >
              {extracting
                ? 'Analyse en cours…'
                : singleRecipeMode
                  ? `Analyser ${images.length} image(s) → 1 recette`
                  : `Analyser ${images.length} image(s)`}
            </button>
            <button type="button" className="btn btn-secondary" onClick={clearAll}>
              Tout effacer
            </button>
          </>
        )}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            const files = e.target.files ? [...e.target.files] : []
            if (files.length) void appendFiles(files)
            e.target.value = ''
          }}
        />
      </div>

      <p className="field-hint" style={{ marginTop: 8 }}>
        Modele vision : <Link to="/parametres">Parametres</Link> (
        <code>llama3.2-vision</code>, <code>llava</code>, <code>moondream</code>).
      </p>

      {error && <p className="error">{error}</p>}

      {extracted && extracted.length > 0 && (
        <div className="recipe-extract-preview">
          <h3>
            {extracted.length === 1
              ? '1 recette detectee'
              : `${extracted.length} recettes detectees`}
          </h3>
          <p className="field-hint">Verifiez le resultat avant d&apos;ajouter a la bibliotheque.</p>
          <div className="recipe-list">
            {extracted.map((recipe) => (
              <article key={recipe.id} className="recipe-card">
                <div className="recipe-card-body" style={{ borderTop: 'none', paddingTop: 14 }}>
                  <strong>{recipe.name}</strong>
                  <p className="field-hint">
                    {recipe.servings} pers · {recipe.prepMinutes} min
                    {recipe.source ? ` · ${recipe.source}` : ''}
                  </p>
                  {recipe.mealTypes?.length ? (
                    <div className="tag-list" style={{ marginBottom: 8 }}>
                      {recipe.mealTypes.map((type) => (
                        <span key={type} className="tag">{MEAL_LABELS[type]}</span>
                      ))}
                    </div>
                  ) : null}
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
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 12 }}
            onClick={() => void handleConfirmImport()}
          >
            Ajouter {extracted.length} recette(s) a la bibliotheque
          </button>
        </div>
      )}
    </div>
  )
}
