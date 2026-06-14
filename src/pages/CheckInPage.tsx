import { useState } from 'react'
import { useAppData } from '../hooks/useAppData'
import type { CheckIn } from '../types'

export default function CheckInPage() {
  const { data, save, loading } = useAppData()
  const [form, setForm] = useState<Omit<CheckIn, 'id'>>({
    date: new Date().toISOString().slice(0, 10),
    energy: 3,
    mood: 3,
    sleepHours: null,
    painLevel: 0,
    notes: '',
    weightKg: data.profile.weightKg,
  })
  const [saved, setSaved] = useState(false)

  if (loading) return <div className="loading">Chargement...</div>

  const submit = async () => {
    const entry: CheckIn = { ...form, id: crypto.randomUUID() }
    await save({
      ...data,
      checkIns: [...data.checkIns, entry],
      profile: form.weightKg ? { ...data.profile, weightKg: form.weightKg } : data.profile,
    })
    setSaved(true)
    setForm({
      ...form,
      notes: '',
      date: new Date().toISOString().slice(0, 10),
    })
    setTimeout(() => setSaved(false), 2000)
  }

  const recent = [...data.checkIns].reverse().slice(0, 10)

  return (
    <>
      <header className="page-header">
        <h1>Suivi regulier</h1>
        <p>Votre ressenti affine les menus et activites des prochaines semaines.</p>
      </header>

      <div className="grid grid-2">
        <div className="card">
          <h2>Nouveau ressenti</h2>
          <div className="form-grid">
            <label>
              Date
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>

            <label>
              Energie (1 = faible, 5 = excellente)
              <input
                type="range"
                min={1}
                max={5}
                value={form.energy}
                onChange={(e) => setForm({ ...form, energy: Number(e.target.value) as CheckIn['energy'] })}
              />
              {form.energy}/5
            </label>

            <label>
              Humeur (1 = basse, 5 = excellente)
              <input
                type="range"
                min={1}
                max={5}
                value={form.mood}
                onChange={(e) => setForm({ ...form, mood: Number(e.target.value) as CheckIn['mood'] })}
              />
              {form.mood}/5
            </label>

            <label>
              Douleur / inconfort (0 = aucun, 5 = eleve)
              <input
                type="range"
                min={0}
                max={5}
                value={form.painLevel}
                onChange={(e) => setForm({ ...form, painLevel: Number(e.target.value) as CheckIn['painLevel'] })}
              />
              {form.painLevel}/5
            </label>

            <label>
              Heures de sommeil
              <input
                type="number"
                step="0.5"
                value={form.sleepHours ?? ''}
                onChange={(e) =>
                  setForm({ ...form, sleepHours: e.target.value ? Number(e.target.value) : null })
                }
              />
            </label>

            <label>
              Poids (kg)
              <input
                type="number"
                value={form.weightKg ?? ''}
                onChange={(e) =>
                  setForm({ ...form, weightKg: e.target.value ? Number(e.target.value) : null })
                }
              />
            </label>

            <label>
              Notes libres
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Digestion, stress, blessure, envie particuliere..."
              />
            </label>
          </div>

          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={submit}>
            Enregistrer
          </button>
          {saved && <span style={{ marginLeft: 12, color: 'var(--accent)' }}>Suivi enregistre</span>}
        </div>

        <div className="card">
          <h2>Historique recent</h2>
          {!recent.length ? (
            <p className="empty">Aucun suivi pour le moment.</p>
          ) : (
            recent.map((entry) => (
              <div key={entry.id} style={{ borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
                <strong>{entry.date}</strong>
                <p>
                  Energie {entry.energy}/5 · Humeur {entry.mood}/5 · Douleur {entry.painLevel}/5
                  {entry.sleepHours != null && ` · Sommeil ${entry.sleepHours}h`}
                </p>
                {entry.notes && <p><em>{entry.notes}</em></p>}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
