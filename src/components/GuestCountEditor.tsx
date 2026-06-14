import { DAYS } from '../types'
import {
  applyGuestCountToAll,
  clampGuestCount,
  MEAL_GUEST_PERIOD_LABELS,
  MEAL_GUEST_PERIODS,
  type MealGuestPeriod,
  MIN_GUEST_COUNT,
  type WeekGuestCounts,
} from '../lib/guestCounts'

interface GuestCountEditorProps {
  counts: WeekGuestCounts
  onChange: (counts: WeekGuestCounts) => void
}

const QUICK_COUNTS = [1, 2, 3, 4]

export default function GuestCountEditor({ counts, onChange }: GuestCountEditorProps) {
  const setMealCount = (day: string, period: MealGuestPeriod, raw: string) => {
    const parsed = raw === '' ? MIN_GUEST_COUNT : Number(raw)
    onChange({
      ...counts,
      [day]: {
        ...counts[day],
        [period]: clampGuestCount(parsed),
      },
    })
  }

  return (
    <div className="card guest-count-card">
      <h2>Nombre de personnes</h2>
      <p className="field-hint">
        Par creneau (matin, midi, soir) avant la generation du menu. Mettez 0 pour ne rien prevoir
        a ce moment (ex. 1 0 1 = absent le midi).
      </p>

      <div className="guest-quick-actions">
        {QUICK_COUNTS.map((count) => (
          <button
            key={count}
            type="button"
            className="btn btn-secondary guest-quick-btn"
            onClick={() => onChange(applyGuestCountToAll(count))}
          >
            {count} pour tous
          </button>
        ))}
      </div>

      <div className="guest-count-matrix-wrap">
        <table className="guest-count-matrix">
          <thead>
            <tr>
              <th className="guest-count-matrix-corner" scope="col" aria-hidden="true" />
              {DAYS.map((day) => (
                <th key={day} scope="col" className="guest-count-matrix-day">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MEAL_GUEST_PERIODS.map((period) => (
              <tr key={period}>
                <th scope="row" className="guest-count-matrix-period">
                  {MEAL_GUEST_PERIOD_LABELS[period]}
                </th>
                {DAYS.map((day) => (
                  <td key={`${day}-${period}`}>
                    <input
                      type="number"
                      className="guest-count-matrix-input"
                      min={MIN_GUEST_COUNT}
                      max={20}
                      value={counts[day][period]}
                      onChange={(e) => setMealCount(day, period, e.target.value)}
                      aria-label={`${MEAL_GUEST_PERIOD_LABELS[period]} ${day}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
