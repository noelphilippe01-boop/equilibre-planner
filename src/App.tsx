import { NavLink, Route, Routes } from 'react-router-dom'
import { isElectronApp } from './lib/equilibre'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import Recipes from './pages/Recipes'
import Menus from './pages/Menus'
import Shopping from './pages/Shopping'
import Activities from './pages/Activities'
import CheckInPage from './pages/CheckInPage'
import Settings from './pages/Settings'
import RouteErrorBoundary from './components/RouteErrorBoundary'

const nav = [
  { to: '/', label: 'Accueil' },
  { to: '/profil', label: 'Profil sante' },
  { to: '/recettes', label: 'Recettes' },
  { to: '/menus', label: 'Menus' },
  { to: '/courses', label: 'Courses' },
  { to: '/activites', label: 'Activites' },
  { to: '/suivi', label: 'Suivi' },
  { to: '/parametres', label: 'Parametres' },
]

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">🌿</span>
          <div>
            <strong>Equilibre</strong>
            <small>Menus & activites</small>
          </div>
        </div>
        <nav>
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        {!isElectronApp() && (
          <div className="card" style={{ marginBottom: 16, borderColor: 'var(--danger)' }}>
            <strong>Mode navigateur detecte</strong>
            <p style={{ margin: '8px 0 0' }}>
              Fermez cet onglet et utilisez la fenetre <strong>Equilibre Planner</strong> lancee via{' '}
              <code>npm run electron:dev</code>.
            </p>
          </div>
        )}
        <RouteErrorBoundary>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/profil" element={<Profile />} />
            <Route path="/recettes" element={<Recipes />} />
            <Route path="/menus" element={<Menus />} />
            <Route path="/courses" element={<Shopping />} />
            <Route path="/activites" element={<Activities />} />
            <Route path="/suivi" element={<CheckInPage />} />
            <Route path="/parametres" element={<Settings />} />
          </Routes>
        </RouteErrorBoundary>
      </main>
    </div>
  )
}
