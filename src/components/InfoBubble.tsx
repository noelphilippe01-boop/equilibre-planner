import { useId, useState, type ReactNode } from 'react'

export default function InfoBubble({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <span className={`info-bubble${open ? ' info-bubble--open' : ''}`}>
      <button
        type="button"
        className="info-bubble-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) {
            setOpen(false)
          }
        }}
      >
        i
      </button>
      <span id={panelId} className="info-bubble-panel" role="tooltip">
        <strong className="info-bubble-title">{label}</strong>
        {children}
      </span>
    </span>
  )
}
