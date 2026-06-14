import { Link } from 'react-router-dom'
import { useAppData } from '../hooks/useAppData'
import { profileSummary } from '../lib/ai'
import { getCurrentMenu } from '../lib/shopping'
import { getCurrentSeason } from '../types'
import { summarizeProduceForMonth } from '../lib/seasonCalendar'
import { getPlanningWeekStart } from '../lib/week'

export default function Dashboard() {
  const { data, loading } = useAppData()
  const weekStart = getPlanningWeekStart(data.settings)
  const menu = getCurrentMenu(data, weekStart)
  const plan = data.activityPlans.find((p) => p.weekStart === weekStart)
  const lastCheckIn = data.checkIns.at(-1)
  const produce = summarizeProduceForMonth()

  if (loading) return <div className="loading">Chargement...</div>

  return (
    <>
      <header className="page-header">
        <h1>Tableau de bord</h1>
        <p>
          {profileSummary(data.profile)} · Saison : {getCurrentSeason()} · {produce.monthName}
        </p>
      </header>

      <div className="grid grid-3">
        <div className="card">
          <h3>Menu de la semaine</h3>
          <div className="stat-value">{menu ? menu.meals.length : 0}</div>
          <p>{menu ? `${menu.meals.length} repas planifies` : 'Aucun menu genere'}</p>
          <Link to="/menus" className="btn btn-secondary" style={{ marginTop: 12, display: 'inline-block' }}>
            Voir les menus
          </Link>
        </div>

        <div className="card">
          <h3>Activites</h3>
          <div className="stat-value">{plan?.sessions.length ?? 0}</div>
          <p>
            {plan
              ? `${plan.sessions.filter((s) => s.completed).length}/${plan.sessions.length} seances faites`
              : 'Aucun planning genere'}
          </p>
          <Link to="/activites" className="btn btn-secondary" style={{ marginTop: 12, display: 'inline-block' }}>
            Voir le planning
          </Link>
        </div>

        <div className="card">
          <h3>Dernier suivi</h3>
          {lastCheckIn ? (
            <>
              <div className="stat-value">{lastCheckIn.energy}/5</div>
              <p>Energie · humeur {lastCheckIn.mood}/5 · {lastCheckIn.date}</p>
            </>
          ) : (
            <p className="empty">Aucun ressenti enregistre</p>
          )}
          <Link to="/suivi" className="btn btn-secondary" style={{ marginTop: 12, display: 'inline-block' }}>
            Ajouter un suivi
          </Link>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Produits de saison — {produce.monthName}</h2>
        <p className="field-hint">
          Calendrier belge ({produce.freshCount} frais, {produce.conservationCount} en conservation)
        </p>
        <div className="grid grid-2" style={{ marginTop: 12 }}>
          <div>
            <h3>Fruits frais</h3>
            <p>{produce.fresh.fruits.length ? produce.fresh.fruits.join(', ') : 'Aucun ce mois-ci'}</p>
          </div>
          <div>
            <h3>Legumes frais</h3>
            <p>{produce.fresh.legumes.length ? produce.fresh.legumes.join(', ') : 'Aucun ce mois-ci'}</p>
          </div>
        </div>
        {(produce.conservation.fruits.length > 0 || produce.conservation.legumes.length > 0) && (
          <details style={{ marginTop: 12 }}>
            <summary>Conservation ({produce.conservationCount})</summary>
            <p style={{ marginTop: 8 }}>
              {[
                ...produce.conservation.fruits,
                ...produce.conservation.legumes,
              ].join(', ')}
            </p>
          </details>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Pour commencer</h2>
        <ol>
          <li>Renseignez votre <Link to="/profil">profil sante</Link> (allergies, objectifs, contraintes).</li>
          <li>Installez <Link to="/parametres">Ollama</Link> et telechargez un modele (ex. llama3.2).</li>
          <li>Generez un menu equilibre et un planning d&apos;activites adaptatif.</li>
          <li>Notez regulierement votre ressenti pour affiner les recommandations.</li>
        </ol>
      </div>
    </>
  )
}
