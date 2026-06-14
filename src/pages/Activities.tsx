import { useMemo, useState } from 'react'
import { useAppData } from '../hooks/useAppData'
import { buildActivityPrompt, parseActivityResponse } from '../lib/ai'
import { getEquilibre } from '../lib/equilibre'
import { getPlanningWeekLabel, getPlanningWeekStart } from '../lib/week'
import { DAYS } from '../types'

export default function Activities() {
  const { data, save, loading } = useAppData()
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const weekStart = getPlanningWeekStart(data.settings)
  const weekLabel = getPlanningWeekLabel(data.settings)

  const plan = data.activityPlans.find((p) => p.weekStart === weekStart)

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, NonNullable<typeof plan>['sessions']>()
    for (const day of DAYS) map.set(day, [])
    plan?.sessions.forEach((session) => {
      map.get(session.day)?.push(session)
    })
    return map
  }, [plan])

  const generatePlan = async () => {
    setGenerating(true)
    setError(null)
    try {
      const prompt = buildActivityPrompt(data)
      const raw = await getEquilibre().generateAI(prompt)
      const newPlan = parseActivityResponse(raw, weekStart)
      const otherPlans = data.activityPlans.filter((p) => p.weekStart !== weekStart)
      await save({
        ...data,
        activityPlans: [newPlan, ...otherPlans],
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setGenerating(false)
    }
  }

  const toggleSession = async (sessionId: string) => {
    if (!plan) return
    const sessions = plan.sessions.map((s) =>
      s.id === sessionId ? { ...s, completed: !s.completed } : s,
    )
    const otherPlans = data.activityPlans.filter((p) => p.weekStart !== weekStart)
    await save({
      ...data,
      activityPlans: [{ ...plan, sessions }, ...otherPlans],
    })
  }

  if (loading) return <div className="loading">Chargement...</div>

  return (
    <>
      <header className="page-header">
        <h1>Planning d&apos;activites</h1>
        <p>{weekLabel} · Adapte a votre profil et a votre ressenti</p>
      </header>

      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={generatePlan} disabled={generating}>
          {generating ? 'Generation en cours...' : 'Generer le planning avec IA'}
        </button>
        {error && <p className="error">{error}</p>}
      </div>

      {!plan ? (
        <div className="card">
          <p className="empty">Aucun planning pour cette semaine.</p>
        </div>
      ) : (
        <div className="card">
          <h2>Seances de la semaine</h2>
          {DAYS.map((day) => {
            const sessions = sessionsByDay.get(day) ?? []
            if (!sessions.length) return null
            return (
              <div key={day} className="meal-day">
                <strong>{day}</strong>
                {sessions.map((session) => (
                  <label key={session.id} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={session.completed}
                      onChange={() => toggleSession(session.id)}
                    />
                    <span>
                      <strong>{session.type}</strong> · {session.durationMinutes} min ·{' '}
                      {session.intensity} — {session.description}
                    </span>
                  </label>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
