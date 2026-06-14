export type SpinnerState = 'idle' | 'busy' | 'warning'

interface ButtonSpinnerProps {
  state: SpinnerState
}

export default function ButtonSpinner({ state }: ButtonSpinnerProps) {
  if (state === 'idle') return null

  return (
    <span
      className={`btn-spinner btn-spinner--${state}`}
      aria-hidden="true"
      title={state === 'warning' ? 'Connexion Ollama incertaine' : undefined}
    />
  )
}
