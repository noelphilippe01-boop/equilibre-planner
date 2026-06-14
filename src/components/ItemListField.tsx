import { useEffect, useState } from 'react'

interface ItemListFieldProps {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  examples?: readonly string[]
}

function normalizeItems(values: string[]): string[] {
  return values.length ? [...values] : ['']
}

function toStoredValues(items: string[]): string[] {
  return items.map((s) => s.trim()).filter(Boolean)
}

function isSameItem(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export default function ItemListField({
  label,
  values,
  onChange,
  placeholder,
  examples = [],
}: ItemListFieldProps) {
  const [items, setItems] = useState(() => normalizeItems(values))
  const [showExamples, setShowExamples] = useState(false)

  useEffect(() => {
    setItems((current) => {
      const stored = toStoredValues(current)
      if (stored.join('\u0001') === values.join('\u0001')) return current
      return normalizeItems(values)
    })
  }, [values])

  const commit = (next: string[]) => {
    setItems(next)
    onChange(toStoredValues(next))
  }

  const updateItem = (index: number, text: string) => {
    const next = [...items]
    next[index] = text
    commit(next)
  }

  const addItem = () => {
    setItems([...items, ''])
  }

  const removeItem = (index: number) => {
    const next = items.filter((_, i) => i !== index)
    commit(next.length ? next : [''])
  }

  const addExample = (example: string) => {
    const stored = toStoredValues(items)
    if (stored.some((item) => isSameItem(item, example))) return

    const emptyIndex = items.findIndex((item) => !item.trim())
    if (emptyIndex >= 0) {
      const next = [...items]
      next[emptyIndex] = example
      commit(next)
      return
    }

    commit([...items, example])
  }

  const stored = toStoredValues(items)

  return (
    <div className="item-list-field">
      <div className="item-list-header">
        <span className="item-list-label">{label}</span>
        <div className="item-list-actions">
          {examples.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary item-list-action"
              onClick={() => setShowExamples((open) => !open)}
              aria-expanded={showExamples}
            >
              Exemples
            </button>
          )}
          <button type="button" className="btn btn-secondary item-list-action" onClick={addItem}>
            + Ajouter
          </button>
        </div>
      </div>

      {showExamples && examples.length > 0 && (
        <div className="item-list-examples">
          {examples.map((example) => {
            const selected = stored.some((item) => isSameItem(item, example))
            return (
              <button
                key={example}
                type="button"
                className={`example-chip${selected ? ' example-chip-selected' : ''}`}
                onClick={() => addExample(example)}
                disabled={selected}
              >
                {example}
              </button>
            )
          })}
        </div>
      )}

      <div className="item-list-rows">
        {items.map((item, index) => (
          <div key={index} className="item-list-row">
            <input
              value={item}
              onChange={(e) => updateItem(index, e.target.value)}
              placeholder={placeholder}
            />
            <button
              type="button"
              className="btn btn-secondary item-list-remove"
              onClick={() => removeItem(index)}
              disabled={items.length === 1 && !item.trim()}
              aria-label="Supprimer"
              title="Supprimer"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
