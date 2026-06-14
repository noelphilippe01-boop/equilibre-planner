import { useEffect, useState } from 'react'
import { useAppData } from '../hooks/useAppData'
import ItemListField from '../components/ItemListField'
import { PROFILE_EXAMPLES } from '../lib/profileExamples'
import type { HealthProfile } from '../types'
import { ACTIVITY_LEVEL_LABELS, defaultMealPreferences, defaultProfile } from '../types'

function mergeProfile(profile: HealthProfile): HealthProfile {
  return {
    ...defaultProfile,
    ...profile,
    mealPreferences: {
      ...defaultMealPreferences,
      ...profile.mealPreferences,
    },
  }
}

export default function Profile() {
  const { data, update, loading } = useAppData()
  const [profile, setProfile] = useState<HealthProfile>(() => mergeProfile(data.profile))
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!loading) setProfile(mergeProfile(data.profile))
  }, [data.profile, loading])

  if (loading) return <div className="loading">Chargement...</div>

  const handleSave = async () => {
    await update({ profile })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <>
      <header className="page-header">
        <h1>Profil sante</h1>
        <p>Ces informations guident la generation des menus et des activites.</p>
      </header>

      <div className="card">
        <div className="form-grid">
          <label>
            Prenom / nom
            <input
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            />
          </label>

          <div className="grid grid-3">
            <label>
              Age
              <input
                type="number"
                value={profile.age ?? ''}
                onChange={(e) =>
                  setProfile({ ...profile, age: e.target.value ? Number(e.target.value) : null })
                }
              />
            </label>
            <label>
              Poids (kg)
              <input
                type="number"
                value={profile.weightKg ?? ''}
                onChange={(e) =>
                  setProfile({ ...profile, weightKg: e.target.value ? Number(e.target.value) : null })
                }
              />
            </label>
            <label>
              Taille (cm)
              <input
                type="number"
                value={profile.heightCm ?? ''}
                onChange={(e) =>
                  setProfile({ ...profile, heightCm: e.target.value ? Number(e.target.value) : null })
                }
              />
            </label>
          </div>

          <label>
            Niveau d&apos;activite habituel
            <select
              value={profile.activityLevel}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  activityLevel: e.target.value as HealthProfile['activityLevel'],
                })
              }
            >
              {Object.entries(ACTIVITY_LEVEL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <ItemListField
            label="Conditions de sante"
            values={profile.healthConditions}
            onChange={(healthConditions) => setProfile({ ...profile, healthConditions })}
            placeholder="ex: hypertension"
            examples={PROFILE_EXAMPLES.healthConditions}
          />

          <ItemListField
            label="Allergies et intolerances"
            values={profile.allergies}
            onChange={(allergies) => setProfile({ ...profile, allergies })}
            placeholder="ex: gluten"
            examples={PROFILE_EXAMPLES.allergies}
          />

          <ItemListField
            label="Preferences alimentaires"
            values={profile.dietaryPreferences}
            onChange={(dietaryPreferences) => setProfile({ ...profile, dietaryPreferences })}
            placeholder="ex: vegetarien"
            examples={PROFILE_EXAMPLES.dietaryPreferences}
          />

          <div className="meal-preferences-section">
            <h2>Preferences par repas</h2>
            <p className="field-hint">Guide la generation des menus (petit-dejeuner, dejeuner, diner).</p>

            <ItemListField
              label="Petit-dejeuner"
              values={profile.mealPreferences.breakfast}
              onChange={(breakfast) =>
                setProfile({
                  ...profile,
                  mealPreferences: { ...profile.mealPreferences, breakfast },
                })
              }
              placeholder="ex: tartines"
              examples={PROFILE_EXAMPLES.breakfast}
            />

            <ItemListField
              label="Dejeuner"
              values={profile.mealPreferences.lunch}
              onChange={(lunch) =>
                setProfile({
                  ...profile,
                  mealPreferences: { ...profile.mealPreferences, lunch },
                })
              }
              placeholder="ex: salades"
              examples={PROFILE_EXAMPLES.lunch}
            />

            <ItemListField
              label="Diner"
              values={profile.mealPreferences.dinner}
              onChange={(dinner) =>
                setProfile({
                  ...profile,
                  mealPreferences: { ...profile.mealPreferences, dinner },
                })
              }
              placeholder="ex: soupes"
              examples={PROFILE_EXAMPLES.dinner}
            />
          </div>

          <ItemListField
            label="Objectifs"
            values={profile.goals}
            onChange={(goals) => setProfile({ ...profile, goals })}
            placeholder="ex: plus d'energie"
            examples={PROFILE_EXAMPLES.goals}
          />

          <label>
            Notes complementaires
            <textarea
              value={profile.notes}
              onChange={(e) => setProfile({ ...profile, notes: e.target.value })}
              placeholder="Blessures, medicaments, horaires de travail, contraintes..."
            />
          </label>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={handleSave}>
            Enregistrer le profil
          </button>
          {saved && <span style={{ color: 'var(--accent)' }}>Profil enregistre</span>}
        </div>
      </div>
    </>
  )
}
