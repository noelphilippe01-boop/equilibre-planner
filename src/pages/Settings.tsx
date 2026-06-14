import { useEffect, useState } from 'react'
import { useAppData } from '../hooks/useAppData'
import { getEquilibre } from '../lib/equilibre'
import { getPlanningWeekLabel } from '../lib/week'
import type { AppSettings } from '../types'
import { DAYS, defaultSettings } from '../types'

export default function Settings() {
  const { data, update, loading } = useAppData()
  const [settings, setSettings] = useState<AppSettings>(data.settings)
  const [saved, setSaved] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!loading) setSettings({ ...defaultSettings, ...data.settings })
  }, [data.settings, loading])

  if (loading) return <div className="loading">Chargement...</div>

  const refreshModels = async () => {
    setChecking(true)
    setStatus(null)
    try {
      const list = await getEquilibre().listOllamaModels(settings.ollamaUrl)
      setModels(list)
      setStatus(`${list.length} modele(s) detecte(s)`)
    } catch (e) {
      setModels([])
      setStatus(e instanceof Error ? e.message : 'Erreur de connexion')
    } finally {
      setChecking(false)
    }
  }

  const handleSave = async () => {
    await update({ settings })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <>
      <header className="page-header">
        <h1>Parametres</h1>
        <p>Configuration de l&apos;IA locale via Ollama.</p>
      </header>

      <div className="card">
        <h2>Ollama (IA locale, gratuite)</h2>
        <p style={{ color: 'var(--muted)' }}>
          L&apos;application communique avec Ollama sur votre PC. Aucune cle API ni paiement requis.
          Internet n&apos;est necessaire que pour telecharger un modele la premiere fois.
        </p>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <label>
            URL Ollama
            <input
              value={settings.ollamaUrl}
              onChange={(e) => setSettings({ ...settings, ollamaUrl: e.target.value })}
              placeholder="http://localhost:11434"
            />
          </label>

          <label>
            Modele
            <input
              list="ollama-models"
              value={settings.ollamaModel}
              onChange={(e) => setSettings({ ...settings, ollamaModel: e.target.value })}
              placeholder="llama3.2"
            />
            <datalist id="ollama-models">
              {models.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          </label>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={refreshModels} disabled={checking}>
            {checking ? 'Verification...' : 'Verifier la connexion'}
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Enregistrer
          </button>
          {saved && <span style={{ color: 'var(--accent)' }}>Parametres enregistres</span>}
        </div>
        {status && <p style={{ marginTop: 12, color: status.includes('detecte') ? 'var(--accent)' : 'var(--danger)' }}>{status}</p>}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Semaine de planning</h2>
        <p style={{ color: 'var(--muted)' }}>
          Definit la semaine cible pour les menus et les activites (semaine suivante).
        </p>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="grid grid-2">
            <label>
              Jour de debut de semaine
              <select
                value={settings.weekStartDay}
                onChange={(e) => setSettings({ ...settings, weekStartDay: e.target.value })}
              >
                {DAYS.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Jour de fin de semaine
              <select
                value={settings.weekEndDay}
                onChange={(e) => setSettings({ ...settings, weekEndDay: e.target.value })}
              >
                {DAYS.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="field-hint">
            Prochaine semaine planifiee : {getPlanningWeekLabel(settings)}
          </p>
        </div>

        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleSave}>
          Enregistrer
        </button>
        {saved && <span style={{ marginLeft: 12, color: 'var(--accent)' }}>Parametres enregistres</span>}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Installation Ollama</h2>
        <ol>
          <li>Telechargez Ollama sur <a href="https://ollama.com/download" target="_blank" rel="noreferrer">ollama.com/download</a>.</li>
          <li>Installez et lancez l&apos;application Ollama (elle tourne en arriere-plan).</li>
          <li>Dans un terminal, telechargez un modele : <code>ollama pull llama3.2</code></li>
          <li>Cliquez sur <strong>Verifier la connexion</strong> ci-dessus, puis enregistrez.</li>
        </ol>
        <p style={{ color: 'var(--muted)' }}>
          Modeles conseilles : <code>llama3.2</code>, <code>mistral</code>, <code>gemma2</code> (environ 2 a 5 Go chacun).
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Donnees locales</h2>
        <p>
          Vos profils, menus, recettes et suivis sont enregistres dans le dossier utilisateur Electron
          de l&apos;application (fichier <code>equilibre-data.json</code>).
        </p>
      </div>
    </>
  )
}
