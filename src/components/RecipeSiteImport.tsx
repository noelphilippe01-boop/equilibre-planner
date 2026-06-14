import { useEffect, useState } from 'react'
import { useAppData } from '../hooks/useAppData'
import { isElectronApp, requireEquilibreApi } from '../lib/equilibre'
import { mergeRecipes } from '../lib/recipeLibrary'
import { listImportedSites } from '../lib/importedSites'
import InfoBubble from './InfoBubble'

type SiteImportEstimate = {
  discovered: number
  discoverSeconds: number
  estimatedImportSeconds: number
  estimatedTotalSeconds: number
}

type PendingImport = {
  estimate: SiteImportEstimate
  startUrl: string
  maxRecipes: number
  limitEnabled: boolean
  useAiFallback: boolean
}

function formatImportDuration(seconds: number): string {
  if (seconds < 45) return 'moins d\'une minute'
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `environ ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem > 0 ? `environ ${hours} h ${rem} min` : `environ ${hours} h`
}

export default function RecipeSiteImport({
  onImported,
}: {
  onImported?: (summary: string) => void
}) {
  const { data, update } = useAppData()
  const [startUrl, setStartUrl] = useState('')
  const [limitEnabled, setLimitEnabled] = useState(false)
  const [maxRecipes, setMaxRecipes] = useState(200)
  const [useAiFallback, setUseAiFallback] = useState(false)
  const [running, setRunning] = useState(false)
  const [estimating, setEstimating] = useState(false)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [progressPct, setProgressPct] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isElectronApp()) return
    const unsubscribe = requireEquilibreApi('onSiteImportProgress')((event) => {
      setProgress(
        event.recipeName && event.phase === 'import'
          ? `${event.message} — ${event.recipeName}`
          : event.message,
      )
      if (event.total > 0) {
        setProgressPct(Math.round((event.current / event.total) * 100))
      } else if (event.phase === 'discover') {
        setProgressPct(0)
      }
    })
    return unsubscribe
  }, [])

  const handleCancel = () => {
    if (!isElectronApp()) return
    void requireEquilibreApi('cancelSiteImport')()
    setProgress('Annulation…')
    if (estimating) {
      setEstimating(false)
    }
  }

  const handleEstimate = async () => {
    const trimmed = startUrl.trim()
    if (!trimmed) {
      setError('Indiquez l\'URL du site ou d\'une liste de recettes.')
      return
    }
    if (!isElectronApp()) {
      setError('Disponible uniquement dans l\'application Equilibre Planner (Electron).')
      return
    }

    setEstimating(true)
    setRunning(false)
    setPendingImport(null)
    setError(null)
    setProgress('Recherche des recettes…')
    setProgressPct(0)

    try {
      const estimate = await requireEquilibreApi('estimateSiteImport')({
        startUrl: trimmed,
        maxRecipes: limitEnabled ? maxRecipes : 0,
        useAiFallback,
      })

      setPendingImport({
        estimate,
        startUrl: trimmed,
        maxRecipes,
        limitEnabled,
        useAiFallback,
      })
      setProgress(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Estimation echouee')
      setProgress(null)
      setProgressPct(0)
    } finally {
      setEstimating(false)
    }
  }

  const handleConfirmImport = async () => {
    if (!pendingImport) return

    setRunning(true)
    setError(null)
    setProgress('Demarrage…')
    setProgressPct(0)

    try {
      const result = await requireEquilibreApi('importRecipesFromSite')({
        startUrl: pendingImport.startUrl,
        maxRecipes: pendingImport.limitEnabled ? pendingImport.maxRecipes : 0,
        useAiFallback: pendingImport.useAiFallback,
      })

      if (!result.recipes.length) {
        throw new Error('Aucune recette importee.')
      }

      const merged = mergeRecipes(data.recipes, result.recipes)
      await update({ recipes: merged })

      const summary = `${result.imported} recette(s) importee(s) sur ${result.discovered} trouvee(s)` +
        (result.skipped ? ` (${result.skipped} ignoree(s))` : '') +
        (result.usedAi ? ` — ${result.usedAi} via IA` : ' — extraction directe')

      onImported?.(summary)
      setPendingImport(null)
      setProgress(summary)
      setProgressPct(100)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import site echoue')
      setProgress(null)
      setProgressPct(0)
    } finally {
      setRunning(false)
    }
  }

  const busy = running || estimating
  const importedSites = listImportedSites(data.recipes ?? [])

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title-row">
        <h2>Importer tout un site</h2>
        <InfoBubble label="Sites importes dans la bibliotheque">
          {importedSites.length === 0 ? (
            <p className="field-hint">Aucun site importe pour l&apos;instant.</p>
          ) : (
            <ul className="info-bubble-list">
              {importedSites.map((site) => (
                <li key={site.id}>
                  <span className="info-bubble-site-name">{site.name}</span>
                  <span className="info-bubble-site-meta">
                    {site.count} recette{site.count > 1 ? 's' : ''}
                    {site.listingUrl ? (
                      <>
                        {' '}
                        ·{' '}
                        <a href={site.listingUrl} target="_blank" rel="noreferrer">
                          {site.listingUrl.replace(/^https?:\/\//, '')}
                        </a>
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </InfoBubble>
      </div>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Collez l&apos;URL d&apos;une liste de recettes (ex. Les Commis). L&apos;app parcourt le
        sitemap et les pages, puis importe en lot — <strong>sans limite par defaut</strong>, sans IA
        (rapide).
      </p>

      <div className="form-grid">
        <label>
          URL du site ou liste de recettes
          <input
            type="url"
            value={startUrl}
            onChange={(e) => setStartUrl(e.target.value)}
            placeholder="https://www.lescommis.com/recettes/"
            disabled={busy}
          />
        </label>
      </div>

      <label className="checkbox-row" style={{ borderBottom: 'none', marginTop: 12 }}>
        <input
          type="checkbox"
          checked={limitEnabled}
          onChange={(e) => setLimitEnabled(e.target.checked)}
          disabled={busy}
        />
        <span>Limiter le nombre de recettes importees</span>
      </label>

      {limitEnabled && (
        <label style={{ display: 'block', marginTop: 8 }}>
          Nombre max de recettes
          <input
            type="number"
            min={1}
            value={maxRecipes}
            onChange={(e) => setMaxRecipes(Math.max(1, Number(e.target.value) || 1))}
            disabled={busy}
          />
        </label>
      )}

      <label className="checkbox-row" style={{ borderBottom: 'none', marginTop: 12 }}>
        <input
          type="checkbox"
          checked={useAiFallback}
          onChange={(e) => setUseAiFallback(e.target.checked)}
          disabled={busy}
        />
        <span>
          Repli IA si une page n&apos;a pas de donnees structurees{' '}
          <em>(beaucoup plus lent)</em>
        </span>
      </label>

      {pendingImport && !running && !estimating && (
        <div className="site-import-confirm">
          <p className="site-import-confirm-title">
            {pendingImport.limitEnabled
              ? `${pendingImport.estimate.discovered} recette(s) trouvee(s) (limite : ${pendingImport.maxRecipes})`
              : `${pendingImport.estimate.discovered} recette(s) trouvee(s)`}
          </p>
          <p className="field-hint">
            Duree estimee : {formatImportDuration(pendingImport.estimate.estimatedImportSeconds)}{' '}
            ({formatImportDuration(pendingImport.estimate.estimatedTotalSeconds)} au total)
            {pendingImport.useAiFallback ? ' — avec repli IA' : ' — extraction directe'}.
          </p>
          <p className="field-hint">Les recettes deja presentes seront mises a jour.</p>
          <div className="recipe-import-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" onClick={() => void handleConfirmImport()}>
              Lancer l&apos;import
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPendingImport(null)}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {!pendingImport && (
        <div className="recipe-import-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleEstimate()}
            disabled={busy || !startUrl.trim()}
          >
            {estimating ? 'Estimation…' : running ? 'Import en cours…' : 'Importer le site'}
          </button>
          {busy && (
            <button type="button" className="btn btn-secondary" onClick={handleCancel}>
              Annuler
            </button>
          )}
        </div>
      )}

      {busy && (
        <div className="site-import-progress" style={{ marginTop: 12 }}>
          <div className={`site-import-progress-bar${estimating ? ' site-import-progress-bar--busy' : ''}`}>
            <div
              className="site-import-progress-fill"
              style={{ width: running && progressPct > 0 ? `${progressPct}%` : undefined }}
            />
          </div>
          {progress && <p className="field-hint">{progress}</p>}
        </div>
      )}

      {!busy && !pendingImport && progress && !error && (
        <p className="field-hint" style={{ color: 'var(--accent)', marginTop: 12 }}>
          {progress}
        </p>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  )
}
