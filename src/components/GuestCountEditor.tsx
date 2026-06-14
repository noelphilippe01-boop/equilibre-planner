import { DAYS } from '../types'
import {
  applyGuestCountToAll,
  clampGuestCount,
  type DayGuestCounts,
  DEFAULT_GUEST_COUNT,
} from '../lib/guestCounts'

interface GuestCountEditorProps {
  counts: DayGuestCounts
  onChange: (counts: DayGuestCounts) => void
}

const QUICK_COUNTS = [1, 2, 3, 4]

export default function GuestCountEditor({ counts, onChange }: GuestCountEditorProps) {
  const setDayCount = (day: string, raw: string) => {
    const parsed = raw === '' ? DEFAULT_GUEST_COUNT : Number(raw)
    onChange({ ...counts, [day]: clampGuestCount(parsed) })
  }

  return (
    <div className="card guest-count-card">
      <h2>Nombre de personnes</h2>
      <p className="field-hint">Par jour, avant la generation du menu (quantites adaptees).</p>

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

      <div className="guest-count-grid">
        {DAYS.map((day) => (
          <label key={day} className="guest-count-day">
            <span>{day}</span>
            <input
              type="number"
              min={1}
              max={20}
              value={counts[day]}
              onChange={(e) => setDayCount(day, e.target.value)}
            />
          </label>
        ))}
      </div>
    </div>
  )
}
